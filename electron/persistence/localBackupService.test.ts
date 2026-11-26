import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import Database, { type Database as SqliteDatabase } from 'better-sqlite3';
import { applyMigrations, CURRENT_SCHEMA_VERSION } from './schemaMigrations.js';
import { inspectAndEnsureDatabaseIdentity } from './databaseIdentity.js';
import { getLocalBackupDatabasePath, isSharedSqliteBackupFileName } from './localBackups.js';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseLockManager } from './databaseLockManager.js';

const testPaths = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({
  app: {
    getPath: () => testPaths.userData,
  },
}));

vi.mock('./databasePreferences.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./databasePreferences.js')>();
  return {
    ...actual,
    readDatabasePreferences: vi.fn(async () => ({
      customDirectoryPath: null,
      secondaryBackupDirectoryPath: null,
      dailyLocalBackupEnabled: false,
      dailyLocalBackupDirectoryPath: null,
      dailyLocalBackupRetentionDays: 7,
      updatesDirectoryPath: null,
      expectedDatabaseUuid: null,
    })),
  };
});

import {
  createLocalBackupService,
  type DatabaseLockInfo,
  type DatabaseStatus,
  type LocalBackupServiceDependencies,
} from './localBackupService.js';

let templateDir: string;
let templatePath: string;
let identity: ReturnType<typeof inspectAndEnsureDatabaseIdentity>['identity'];
beforeAll(() => {
  templateDir = mkdtempSync(path.join(tmpdir(), 'traccion-backup-schema-'));
  templatePath = path.join(templateDir, 'schema.sqlite');
  const db = new Database(templatePath);
  try { applyMigrations(db); } finally { db.close(); }
  identity = inspectAndEnsureDatabaseIdentity(templatePath, { allowLegacyBootstrap: true }).identity;
});
afterAll(() => rmSync(templateDir, { recursive: true, force: true }));

function activeStatus(databasePath: string): DatabaseStatus {
  return {
    ready: true,
    engine: 'better-sqlite3',
    phase: 'active',
    path: databasePath,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    databaseUuid: identity.databaseUuid, applicationId: identity.applicationId, environment: identity.environment,
    isDefaultPath: false,
    lockPath: `${databasePath}.lock`,
  };
}

function buildDependencies(
  databasePath: string,
  acquireLock?: LocalBackupServiceDependencies['acquireLock'],
): LocalBackupServiceDependencies {
  const lock: DatabaseLockInfo = {
    ownerId: 'test-owner',
    username: 'test-user',
    hostname: 'test-host',
    pid: 123,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    getDatabase: () => ({ backup: (destination: string) => copyFile(databasePath, destination) }) as unknown as SqliteDatabase,
    getStatus: () => activeStatus(databasePath),
    acquireLock: acquireLock ?? (async () => lock),
    releaseLock: async () => undefined,
    getLockPath: (value) => `${value}.lock`,
    startDatabaseLockHeartbeat: () => ({}) as ReturnType<typeof setInterval>,
    isLockContentionError: (error) => error instanceof Error && error.message === 'LOCKED',
    readAllPersistedRecords: () => [{ key: 'test', value: 'value', updatedAt: new Date().toISOString() }],
    migrateLocalStorageSnapshot: async () => activeStatus(databasePath),
    withDatabaseOperationLock: async (_databasePath, operation) => operation(),
    backupExistingDatabase: async () => undefined,
    closeDatabaseAndReleaseLock: async () => undefined,
    activateDatabase: async () => activeStatus(databasePath),
  };
}

describe('localBackupService - cierre sin backup redundante', () => {
  let rootDir: string;
  let databasePath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(path.join(tmpdir(), 'traccion-local-backup-test-'));
    testPaths.userData = path.join(rootDir, 'user-data');
    databasePath = path.join(rootDir, 'traccion.sqlite');
    copyFileSync(templatePath, databasePath);
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('deniega reinicio cuando hay una copia pendiente y lo permite después de completarla', async () => {
    const service = createLocalBackupService(buildDependencies(databasePath));
    expect(service.getRestartSafetySnapshot()).toEqual({
      activeBackupOperations: 0, queuedBackupOperations: 0, pendingBackupRevisions: 0,
    });
    service.enqueueLocalBackup('save:test');
    expect(service.getRestartSafetySnapshot().pendingBackupRevisions).toBe(1);
    await service.flushPendingLocalBackup();
    expect(service.getRestartSafetySnapshot()).toEqual({
      activeBackupOperations: 0, queuedBackupOperations: 0, pendingBackupRevisions: 0,
    });
  });

  it('detecta un backup ejecutándose fuera de la cola IPC y conserva el bloqueo hasta liberarlo', async () => {
    let release!: (value: DatabaseLockInfo) => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const lock = new Promise<DatabaseLockInfo>((resolve) => { release = resolve; });
    const acquireLock = vi.fn(() => {
      signalStarted();
      return lock;
    });
    const service = createLocalBackupService(buildDependencies(databasePath, acquireLock));
    service.enqueueLocalBackup('save:test');
    const flushing = service.flushPendingLocalBackup();
    await started;
    expect(service.getRestartSafetySnapshot().activeBackupOperations).toBe(1);
    expect(service.getRestartSafetySnapshot().pendingBackupRevisions).toBe(1);
    release({
      ownerId: 'test-owner', username: 'test-user', hostname: 'test-host',
      pid: 123, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    await flushing;
    expect(service.getRestartSafetySnapshot().activeBackupOperations).toBe(0);
    expect(service.getRestartSafetySnapshot().pendingBackupRevisions).toBe(0);
  });

  it('no crea backup de cierre si la sesión no ha modificado nada', async () => {
    const service = createLocalBackupService(buildDependencies(databasePath));

    const metrics = await service.createShutdownLocalBackup();

    expect(metrics).toEqual({ totalMs: 0, prepareMs: 0, jsonMs: 0, localSqliteMs: 0, sharedSqliteMs: 0, dailySqliteMs: 0 });
    expect(() => readdirSync(path.join(testPaths.userData, 'sqlite-local-backup', 'shutdown'))).toThrow();
  });

  it('no repite el backup al cerrar si una copia viva ya contiene la última revisión', async () => {
    const service = createLocalBackupService(buildDependencies(databasePath));
    service.enqueueLocalBackup('save:test');
    await service.flushPendingLocalBackup();

    const metrics = await service.createShutdownLocalBackup();

    expect(metrics.totalMs).toBe(0);
    expect(() => readdirSync(path.join(testPaths.userData, 'sqlite-local-backup', 'shutdown'))).toThrow();
  });

  it('sí crea backup de cierre si se cierra dentro del debounce tras guardar', async () => {
    const service = createLocalBackupService(buildDependencies(databasePath));
    service.enqueueLocalBackup('save:test');

    await service.createShutdownLocalBackup();

    const shutdownDir = path.join(testPaths.userData, 'sqlite-local-backup', 'shutdown');
    const names = readdirSync(shutdownDir);
    expect(names.some((name) => name.endsWith('.sqlite'))).toBe(true);
    expect(names.some((name) => name.endsWith('.json'))).toBe(true);
  });

  it('reintenta al cerrar si el backup vivo no pudo adquirir el lock', async () => {
    let attempts = 0;
    const acquireLock = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('LOCKED');
      return {
        ownerId: 'test-owner', username: 'test-user', hostname: 'test-host', pid: 123,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      } satisfies DatabaseLockInfo;
    });
    const service = createLocalBackupService(buildDependencies(databasePath, acquireLock));
    service.enqueueLocalBackup('save:test');
    await service.flushPendingLocalBackup();

    await service.createShutdownLocalBackup();

    expect(acquireLock).toHaveBeenCalledTimes(2);
    const shutdownDir = path.join(testPaths.userData, 'sqlite-local-backup', 'shutdown');
    expect(readdirSync(shutdownDir).some((name) => name.endsWith('.sqlite'))).toBe(true);
  });

  it('espera un backup vivo ya iniciado y evita duplicarlo al cerrar', async () => {
    vi.useFakeTimers();
    let releaseLockAttempt: (() => void) | null = null;
    let signalAcquireStarted: (() => void) | null = null;
    const acquireStarted = new Promise<void>((resolve) => {
      signalAcquireStarted = resolve;
    });
    const firstLock = new Promise<DatabaseLockInfo>((resolve) => {
      releaseLockAttempt = () => resolve({
        ownerId: 'test-owner', username: 'test-user', hostname: 'test-host', pid: 123,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    });
    const acquireLock = vi.fn(async () => {
      signalAcquireStarted?.();
      return firstLock;
    });
    const service = createLocalBackupService(buildDependencies(databasePath, acquireLock));
    service.enqueueLocalBackup('save:test');

    // Disparamos únicamente la ventana periódica. El cierre se solicita inmediatamente
    // después, mientras la copia viva sigue bloqueada en acquireLock(). En vez de
    // depender del orden interno de microtareas de Vitest, esperamos una señal
    // emitida por la propia dependencia cuando la copia ha empezado realmente.
    vi.advanceTimersByTime(15 * 60 * 1000);
    const shutdownPromise = service.createShutdownLocalBackup();
    await acquireStarted;
    expect(acquireLock).toHaveBeenCalledTimes(1);

    (releaseLockAttempt as unknown as () => void)();
    const metrics = await shutdownPromise;

    expect(metrics.totalMs).toBe(0);
    expect(acquireLock).toHaveBeenCalledTimes(1);
    expect(() => readdirSync(path.join(testPaths.userData, 'sqlite-local-backup', 'shutdown'))).toThrow();
  });

  it('no inicia copias durante los guardados sucesivos y agrupa en una ventana de 15 minutos', async () => {
    vi.useFakeTimers();
    const acquireLock = vi.fn(buildDependencies(databasePath).acquireLock);
    const service = createLocalBackupService(buildDependencies(databasePath, acquireLock));

    service.enqueueLocalBackup('save:task_records');
    vi.advanceTimersByTime(5 * 60 * 1000);
    service.enqueueLocalBackup('save:task_records');
    vi.advanceTimersByTime(5 * 60 * 1000);
    service.enqueueLocalBackup('save:task_records');
    expect(acquireLock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5 * 60 * 1000);
    // Esperar a que finalicen las tareas asíncronas disparadas por el timer.
    await service.flushPendingLocalBackup();
    expect(acquireLock).toHaveBeenCalledTimes(1);
  });

  it('dos equipos no duplican el backup si SQLite sigue en la misma revisión', async () => {
    const firstAcquire = vi.fn(buildDependencies(databasePath).acquireLock);
    const secondAcquire = vi.fn(buildDependencies(databasePath).acquireLock);
    const first = createLocalBackupService(buildDependencies(databasePath, firstAcquire));
    const second = createLocalBackupService(buildDependencies(databasePath, secondAcquire));

    first.enqueueLocalBackup('save:task_records');
    await first.flushPendingLocalBackup();
    const backupDirectory = path.join(testPaths.userData, 'sqlite-local-backup');
    const previousBackup = readdirSync(backupDirectory);

    second.enqueueLocalBackup('save:task_records');
    await second.flushPendingLocalBackup();

    expect(firstAcquire).toHaveBeenCalledTimes(1);
    // La segunda instancia toma el lock para verificar la huella y lo
    // libera, pero no hace otra copia física si no hubo escrituras nuevas.
    expect(secondAcquire).toHaveBeenCalledTimes(1);
    expect(readdirSync(backupDirectory)).toEqual(previousBackup);

    const changed = new Database(databasePath);
    try { changed.exec('CREATE TABLE backup_test_revision (id INTEGER)'); } finally { changed.close(); }
    second.enqueueLocalBackup('save:task_records');
    await second.flushPendingLocalBackup();
    expect(secondAcquire).toHaveBeenCalledTimes(2);
  });

  it.each(['vivo', 'cierre'] as const)(
    'PR8B: el backup %s no puede solaparse con una escritura exclusiva local',
    async (kind) => {
      const manager = createDatabaseLockManager({ getOwnerId: () => 'test-pr8b' });
      const events: string[] = [];
      let signalBackupInnerAcquire!: () => void;
      let finishBackupInnerAcquire!: () => void;
      const backupInnerAcquireStarted = new Promise<void>((resolve) => {
        signalBackupInnerAcquire = resolve;
      });
      const holdBackup = new Promise<void>((resolve) => {
        finishBackupInnerAcquire = resolve;
      });
      const original = buildDependencies(databasePath);
      const service = createLocalBackupService({
        ...original,
        withDatabaseOperationLock: (file, operation, waitMs) =>
          manager.withDatabaseOperationLock(file, operation, waitMs),
        acquireLock: async () => {
          events.push('backup-inicia');
          signalBackupInnerAcquire();
          await holdBackup;
          return original.acquireLock(databasePath);
        },
        releaseLock: async () => { events.push('backup-libera'); },
      });
      service.enqueueLocalBackup('save:pr8b');
      const backupPromise = kind === 'vivo'
        ? service.flushPendingLocalBackup()
        : service.createShutdownLocalBackup().then(() => undefined);

      await backupInnerAcquireStarted;
      let writeCompleted = false;
      const concurrentWrite = manager.withDatabaseOperationLock(databasePath, async () => {
        events.push('escritura-entra');
        writeCompleted = true;
      });

      // No depender de timers: esperar microtareas garantiza que la segunda
      // operación haya solicitado el lock antes de liberar el respaldo.
      await Promise.resolve();
      await Promise.resolve();
      expect(writeCompleted).toBe(false);
      expect(events).toEqual(['backup-inicia']);

      finishBackupInnerAcquire();
      await Promise.all([backupPromise, concurrentWrite]);
      expect(events).toEqual(['backup-inicia', 'backup-libera', 'escritura-entra']);
    },
  );

  it('no confirma un backup manual que no consigue el bloqueo', async () => {
    const service = createLocalBackupService(buildDependencies(databasePath, async () => { throw new Error('LOCKED'); }));
    await expect(service.createManualLocalBackup()).rejects.toThrow('confirmar la copia SQLite manual');
  });

  it('conserva la copia válida y no propaga una instantánea fallida o inválida', async () => {
    const initial = createLocalBackupService(buildDependencies(databasePath));
    await initial.createManualLocalBackup();
    const live = getLocalBackupDatabasePath();
    const previous = readFileSync(live);
    const shared = readdirSync(rootDir).filter(isSharedSqliteBackupFileName);
    const dependencies = buildDependencies(databasePath);
    const backup = vi.fn(async (destination: string) => { writeFileSync(destination, 'incompleta'); });
    const failed = createLocalBackupService({ ...dependencies, getDatabase: () => ({ backup }) as unknown as SqliteDatabase });
    await expect(failed.createManualLocalBackup()).rejects.toThrow('confirmar la copia SQLite manual');
    expect(readFileSync(live)).toEqual(previous);
    expect(readdirSync(rootDir).filter(isSharedSqliteBackupFileName)).toEqual(shared);
    expect(readdirSync(path.dirname(live)).some(name => name.endsWith('.pending'))).toBe(false);
    failed.enqueueLocalBackup('save:test');
    await expect(failed.createShutdownLocalBackup()).rejects.toThrow();
    expect(failed.getRestartSafetySnapshot().pendingBackupRevisions).toBe(1);
    expect(readdirSync(rootDir).filter(isSharedSqliteBackupFileName)).toEqual(shared);
    await failed.flushPendingLocalBackup();
  });

});

import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createDatabaseLockManager } from './databaseLockManager.js';
import { createSqliteIndependentActivityTracker, sqliteIndependentActivityTracker } from '../sqliteIndependentActivityTracker.js';

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

function activeStatus(databasePath: string): DatabaseStatus {
  return {
    ready: true,
    engine: 'better-sqlite3',
    phase: 'active',
    path: databasePath,
    schemaVersion: 1,
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
    // Test double of the Online Backup API: the real backup implementation
    // is verified separately with SQLite; these tests exercise scheduling,
    // deduplication and shutdown coordination, not SQLite file semantics.
    getDatabase: () => ({
      backup: async (destination: string) => {
        const { copyFile } = await import('node:fs/promises');
        await copyFile(databasePath, destination);
      },
    }) as Database,
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

describe('PR492B · admisión completa de lista, poda y restauración', () => {
  it('no consulta ni poda respaldos durante la cesión congelada', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'traccion-pr492b-list-'));
    testPaths.userData = dir;
    const service = createLocalBackupService(buildDependencies(path.join(dir, 'shared.sqlite')));
    const ticket = sqliteIndependentActivityTracker.beginFreeze();
    try {
      await expect(service.listLocalBackups()).rejects.toThrow('suspendida');
      expect(sqliteIndependentActivityTracker.snapshot()).toMatchObject({active:0,frozen:true});
    } finally {
      sqliteIndependentActivityTracker.abortFreeze(ticket);
      rmSync(dir,{recursive:true,force:true});
    }
  });

  it('no admite restauraciones ni sus prebackups mientras la barrera esté congelada', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'traccion-pr492b-restore-'));
    testPaths.userData = dir;
    const service = createLocalBackupService(buildDependencies(path.join(dir, 'shared.sqlite')));
    const ticket = sqliteIndependentActivityTracker.beginFreeze();
    try {
      await expect(service.restoreLocalBackup('no-valid-backup.sqlite')).rejects.toThrow('suspendida');
      await expect(service.createManualLocalBackup()).rejects.toThrow('suspendida');
      expect(sqliteIndependentActivityTracker.snapshot()).toMatchObject({active:0,frozen:true});
    } finally {
      sqliteIndependentActivityTracker.abortFreeze(ticket);
      rmSync(dir,{recursive:true,force:true});
    }
  });

  it('mantiene la reserva hasta finalizar realmente el trabajo de la restauración', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'traccion-pr492b-drain-'));
    testPaths.userData = dir;
    const tracker = createSqliteIndependentActivityTracker();
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release=resolve; });
    const deps = buildDependencies(path.join(dir,'shared.sqlite'));
    deps.trackActivity = (label, operation) =>
      tracker.run(label, async () => { await hold; return operation(); });
    const service = createLocalBackupService(deps);
    const restoring = service.restoreLocalBackup('invalid.sqlite');
    const ticket = tracker.beginFreeze();
    let drained = false;
    const drain = tracker.waitForDrain(ticket).then(() => { drained = true; });
    try {
      await Promise.resolve();
      expect(tracker.snapshot()).toMatchObject({active:1,frozen:true});
      expect(drained).toBe(false);
    } finally {
      release();
      await restoring;
      await drain;
      tracker.abortFreeze(ticket);
      rmSync(dir,{recursive:true,force:true});
    }
    expect(drained).toBe(true);
  });
});

describe('PR492A · admisión obligatoria de backups sin inyector legacy', () => {
  it('deniega el backup manual cuando el freeze global ya está activo', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'traccion-pr492a-backup-'));
    const databasePath = path.join(dir, 'shared.sqlite');
    testPaths.userData = dir;
    const dependencies = buildDependencies(databasePath);
    // A deliberately legacy caller without trackActivity MUST NOT bypass
    // the main-process SQLite handoff barrier.
    expect(dependencies.trackActivity).toBeUndefined();
    const service = createLocalBackupService(dependencies);
    const ticket = sqliteIndependentActivityTracker.beginFreeze();
    try {
      await expect(service.createManualLocalBackup()).rejects.toThrow('suspendida');
      expect(sqliteIndependentActivityTracker.snapshot()).toMatchObject({
        active: 0, frozen: true,
      });
    } finally {
      sqliteIndependentActivityTracker.abortFreeze(ticket);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preserva el tracker inyectado, sin reemplazarlo por la reserva global', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'traccion-pr492a-injected-'));
    const databasePath = path.join(dir, 'shared.sqlite');
    testPaths.userData = dir;
    const tracker = createSqliteIndependentActivityTracker();
    const dependencies = buildDependencies(databasePath);
    dependencies.trackActivity = (label, operation) => tracker.run(label, operation);
    const service = createLocalBackupService(dependencies);
    const ticket = tracker.beginFreeze();
    try {
      await expect(service.createManualLocalBackup()).rejects.toThrow('suspendida');
      expect(tracker.snapshot()).toMatchObject({active:0, frozen:true});
    } finally {
      tracker.abortFreeze(ticket);
      rmSync(dir, { recursive:true, force:true });
    }
  });
});

describe('localBackupService - cierre sin backup redundante', () => {
  let rootDir: string;
  let databasePath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(path.join(tmpdir(), 'traccion-local-backup-test-'));
    testPaths.userData = path.join(rootDir, 'user-data');
    databasePath = path.join(rootDir, 'traccion.sqlite');
    writeFileSync(databasePath, 'sqlite-test-data', { encoding: 'utf8', flag: 'w' });
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('PR503: un backup nativo fallido no se publica en SMB desde una copia anterior', async () => {
    const dependencies = buildDependencies(databasePath);
    dependencies.getDatabase = () => ({
      backup: async () => { throw new Error('native backup failed'); },
    }) as Database;
    const service = createLocalBackupService(dependencies);
    service.enqueueLocalBackup('save:pr503');
    await service.flushPendingLocalBackup();

    const { existsSync } = await import('node:fs');
    const backupDir = path.join(testPaths.userData, 'sqlite-local-backup');
    expect(existsSync(path.join(backupDir, 'traccion-local-backup.sqlite'))).toBe(false);
    expect(existsSync(`${databasePath}.backup-coordination.json`)).toBe(false);
    const shared = readdirSync(rootDir).filter((name) => /^traccion-backup-.*\.sqlite$/.test(name));
    expect(shared).toEqual([]);
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

    writeFileSync(databasePath, 'sqlite-test-data-updated');
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


  it.each(['vivo', 'cierre'] as const)(
    'PR469: la copia %s reserva la admisión antes de adquirir SMB y se drena al finalizar',
    async (kind) => {
      const tracker = createSqliteIndependentActivityTracker();
      let release!: () => void;
      let notify!: () => void;
      const started = new Promise<void>(resolve => { notify = resolve; });
      const gate = new Promise<void>(resolve => { release = resolve; });
      const original = buildDependencies(databasePath);
      const service = createLocalBackupService({
        ...original,
        trackActivity: (label, operation) => tracker.run(label, operation),
        acquireLock: async () => {
          notify();
          await gate;
          return original.acquireLock(databasePath);
        },
      });
      service.enqueueLocalBackup('save:pr469');
      const job = kind === 'vivo'
        ? service.flushPendingLocalBackup().then(() => undefined)
        : service.createShutdownLocalBackup().then(() => undefined);
      await started;
      expect(tracker.snapshot().labels).toContain(
        kind === 'vivo' ? 'sqlite:backup-live-full' : 'sqlite:backup-shutdown-full',
      );
      const ticket = tracker.beginFreeze();
      try {
        let drained = false;
        const drain = tracker.waitForDrain(ticket).then(() => { drained = true; });
        await Promise.resolve();
        expect(drained).toBe(false);
        await expect(tracker.run('sqlite:new-foreign-backup', async () => undefined))
          .rejects.toThrow('suspendida');
        release();
        await job;
        await drain;
        expect(drained).toBe(true);
        expect(tracker.snapshot().active).toBe(0);
      } finally {
        tracker.abortFreeze(ticket);
      }
    },
  );


  it('PR474: la pausa de handoff cancela el timer pero conserva revision y motivo pendientes', async () => {
    vi.useFakeTimers();
    const acquire = vi.fn(buildDependencies(databasePath).acquireLock);
    const service = createLocalBackupService(buildDependencies(databasePath, acquire));
    service.enqueueLocalBackup('save:pr474');
    expect(service.getActivitySnapshot()).toMatchObject({
      timerScheduled: true, pendingReason: true, pendingRevision: true,
    });
    service.pauseSchedulingForHandoff();
    expect(service.getActivitySnapshot()).toMatchObject({
      timerScheduled: false, pendingReason: true, pendingRevision: true,
    });
    vi.advanceTimersByTime(16 * 60 * 1000);
    await Promise.resolve();
    expect(acquire).not.toHaveBeenCalled();
    // Los guardados iniciados tras pausar no se pierden ni programan nuevos timers.
    service.enqueueLocalBackup('save:concurrent');
    expect(service.getActivitySnapshot()).toMatchObject({
      timerScheduled: false, pendingReason: true, pendingRevision: true,
    });
    service.resumeSchedulingAfterAbortedHandoff();
    expect(service.getActivitySnapshot().timerScheduled).toBe(true);
    await service.flushPendingLocalBackup();
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(service.getActivitySnapshot()).toMatchObject({
      timerScheduled: false, pendingReason: false, pendingRevision: false,
    });
  });

  it('PR474: un flush sin lock SMB conserva el motivo y permite reintentar tras abortar handoff', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const original = buildDependencies(databasePath);
    const acquire = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('LOCKED');
      return original.acquireLock(databasePath);
    });
    const service = createLocalBackupService(buildDependencies(databasePath, acquire));
    service.enqueueLocalBackup('save:pr474-retry');
    service.pauseSchedulingForHandoff();
    await service.flushPendingLocalBackup();
    expect(attempts).toBe(1);
    expect(service.getActivitySnapshot()).toMatchObject({
      timerScheduled: false, pendingReason: true, pendingRevision: true,
    });
    service.resumeSchedulingAfterAbortedHandoff();
    expect(service.getActivitySnapshot().timerScheduled).toBe(true);
    await service.flushPendingLocalBackup();
    expect(attempts).toBe(2);
    expect(service.getActivitySnapshot()).toMatchObject({
      timerScheduled: false, pendingReason: false, pendingRevision: false,
    });
  });

});

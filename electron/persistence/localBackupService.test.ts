import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'better-sqlite3';

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
    getDatabase: () => ({}) as Database,
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
    writeFileSync(databasePath, 'sqlite-test-data', { encoding: 'utf8', flag: 'w' });
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(rootDir, { recursive: true, force: true });
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
    const firstLock = new Promise<DatabaseLockInfo>((resolve) => {
      releaseLockAttempt = () => resolve({
        ownerId: 'test-owner', username: 'test-user', hostname: 'test-host', pid: 123,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    });
    const acquireLock = vi.fn(async () => firstLock);
    const service = createLocalBackupService(buildDependencies(databasePath, acquireLock));
    service.enqueueLocalBackup('save:test');

    // Ejecuta explícitamente el debounce. Avanzar exactamente 5.000 ms dejaba
    // esta aserción dependiendo del orden de microtareas de Vitest: en CI el
    // callback podía haberse disparado sin que el .then de localBackupQueue
    // hubiera llegado todavía a acquireLock().
    await vi.runOnlyPendingTimersAsync();
    expect(acquireLock).toHaveBeenCalledTimes(1);

    const shutdownPromise = service.createShutdownLocalBackup();

    releaseLockAttempt?.();
    const metrics = await shutdownPromise;

    expect(metrics.totalMs).toBe(0);
    expect(acquireLock).toHaveBeenCalledTimes(1);
    expect(() => readdirSync(path.join(testPaths.userData, 'sqlite-local-backup', 'shutdown'))).toThrow();
  });
});

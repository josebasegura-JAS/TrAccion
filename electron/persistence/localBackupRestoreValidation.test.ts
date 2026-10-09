import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'better-sqlite3';

const testPaths = vi.hoisted(() => ({ userData: '', sharedDirectory: '' }));

vi.mock('electron', () => ({
  app: {
    getPath: () => testPaths.userData,
  },
}));

vi.mock('./databasePreferences.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./databasePreferences.js')>();
  return {
    ...actual,
    getConfiguredDatabaseDirectory: vi.fn(async () => ({
      directoryPath: testPaths.sharedDirectory,
      isDefaultPath: false,
    })),
    readDatabasePreferences: vi.fn(async () => ({
      customDirectoryPath: testPaths.sharedDirectory,
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
import { getLocalBackupDirectory, LOCAL_BACKUP_DATABASE_FILE_NAME } from './localBackups.js';
import { getDatabasePathForDirectory } from './databasePreferences.js';

function activeStatus(databasePath: string): DatabaseStatus {
  return {
    ready: true,
    engine: 'better-sqlite3',
    phase: 'active',
    path: databasePath,
    schemaVersion: 19,
    isDefaultPath: false,
    lockPath: `${databasePath}.lock`,
  };
}

describe('localBackupService - validación previa de restauración SQLite', () => {
  let rootDir: string;
  let targetDatabasePath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(path.join(tmpdir(), 'traccion-restore-validation-'));
    testPaths.userData = path.join(rootDir, 'user-data');
    testPaths.sharedDirectory = path.join(rootDir, 'shared');
    mkdirSync(testPaths.sharedDirectory, { recursive: true });
    targetDatabasePath = getDatabasePathForDirectory(testPaths.sharedDirectory);
    writeFileSync(targetDatabasePath, 'BASE-ACTIVA-INTOCADA', 'utf8');
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('rechaza el backup inválido antes del lock y no toca la base activa', async () => {
    const backupDirectory = getLocalBackupDirectory();
    mkdirSync(backupDirectory, { recursive: true });
    writeFileSync(
      path.join(backupDirectory, LOCAL_BACKUP_DATABASE_FILE_NAME),
      'NO-ES-UNA-SQLITE',
      'utf8',
    );

    const lock: DatabaseLockInfo = {
      ownerId: 'test-owner',
      username: 'test-user',
      hostname: 'test-host',
      pid: 123,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const withDatabaseOperationLock = vi.fn(async <T>(_path: string, operation: () => Promise<T>) => operation());
    const backupExistingDatabase = vi.fn(async () => undefined);
    const closeDatabaseAndReleaseLock = vi.fn(async () => undefined);
    const activateDatabase = vi.fn(async () => activeStatus(targetDatabasePath));

    const dependencies: LocalBackupServiceDependencies = {
      getDatabase: () => ({}) as Database,
      getStatus: () => activeStatus(targetDatabasePath),
      acquireLock: async () => lock,
      releaseLock: async () => undefined,
      getLockPath: (value) => `${value}.lock`,
      startDatabaseLockHeartbeat: () => ({}) as ReturnType<typeof setInterval>,
      isLockContentionError: () => false,
      readAllPersistedRecords: () => [],
      migrateLocalStorageSnapshot: async () => activeStatus(targetDatabasePath),
      withDatabaseOperationLock,
      backupExistingDatabase,
      closeDatabaseAndReleaseLock,
      activateDatabase,
    };

    const service = createLocalBackupService(dependencies);
    const result = await service.restoreLocalBackup(LOCAL_BACKUP_DATABASE_FILE_NAME);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/respaldo SQLite/i);
    expect(withDatabaseOperationLock).not.toHaveBeenCalled();
    expect(backupExistingDatabase).not.toHaveBeenCalled();
    expect(closeDatabaseAndReleaseLock).not.toHaveBeenCalled();
    expect(activateDatabase).not.toHaveBeenCalled();
    expect(readFileSync(targetDatabasePath, 'utf8')).toBe('BASE-ACTIVA-INTOCADA');
  });
});

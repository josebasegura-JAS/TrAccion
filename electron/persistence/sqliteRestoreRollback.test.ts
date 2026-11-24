import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'better-sqlite3';
import { restoreValidatedSqliteBackup, type RestoreDatabaseStatus } from './sqliteRestoreRollback.js';

const tempDirectories: string[] = [];

function tempDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'traccion-restore-rollback-'));
  tempDirectories.push(directory);
  return directory;
}

function status(databasePath: string, ready: boolean, phase: RestoreDatabaseStatus['phase'], message?: string): RestoreDatabaseStatus {
  return { ready, phase, path: databasePath, message };
}

afterEach(() => {
  while (tempDirectories.length) {
    rmSync(tempDirectories.pop()!, { recursive: true, force: true });
  }
});

describe('restoreValidatedSqliteBackup', () => {
  it('repone la base anterior y la reactiva si falla la activación del respaldo', async () => {
    const directory = tempDirectory();
    const targetDatabasePath = path.join(directory, 'traccion.sqlite');
    const backupPath = path.join(directory, 'backup.sqlite');
    writeFileSync(targetDatabasePath, 'BASE-ORIGINAL', 'utf8');
    writeFileSync(backupPath, 'BASE-RESPALDO', 'utf8');

    let currentStatus = status(targetDatabasePath, false, 'fallback');
    const activateDatabase = vi
      .fn()
      .mockImplementationOnce(async () => {
        currentStatus = status(targetDatabasePath, false, 'error', 'activación simulada fallida');
        throw new Error('activación simulada fallida');
      })
      .mockImplementationOnce(async () => {
        currentStatus = status(targetDatabasePath, true, 'active');
        return currentStatus;
      });

    const result = await restoreValidatedSqliteBackup({
      backupPath,
      targetDatabasePath,
      directoryPath: directory,
      isDefaultPath: false,
      currentStatus,
      dependencies: {
        getDatabase: () => null as Database | null,
        getStatus: () => currentStatus,
        withDatabaseOperationLock: async <T>(_databasePath: string, operation: () => Promise<T>) => operation(),
        backupExistingDatabase: async () => undefined,
        closeDatabaseAndReleaseLock: async () => undefined,
        activateDatabase,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/recuperado automáticamente la base anterior/i);
    expect(readFileSync(targetDatabasePath, 'utf8')).toBe('BASE-ORIGINAL');
    expect(activateDatabase).toHaveBeenCalledTimes(2);
    expect(result.rollbackSnapshotPath).toBeNull();
  });

  it('conserva la copia de recuperación si también falla el rollback', async () => {
    const directory = tempDirectory();
    const targetDatabasePath = path.join(directory, 'traccion.sqlite');
    const backupPath = path.join(directory, 'backup.sqlite');
    writeFileSync(targetDatabasePath, 'BASE-ORIGINAL', 'utf8');
    writeFileSync(backupPath, 'BASE-RESPALDO', 'utf8');

    let currentStatus = status(targetDatabasePath, false, 'fallback');
    const activateDatabase = vi.fn(async () => {
      currentStatus = status(targetDatabasePath, false, 'error', 'activación fallida');
      throw new Error('activación fallida');
    });
    let lockCalls = 0;

    const result = await restoreValidatedSqliteBackup({
      backupPath,
      targetDatabasePath,
      directoryPath: directory,
      isDefaultPath: false,
      currentStatus,
      dependencies: {
        getDatabase: () => null as Database | null,
        getStatus: () => currentStatus,
        withDatabaseOperationLock: async <T>(_databasePath: string, operation: () => Promise<T>) => {
          lockCalls += 1;
          if (lockCalls === 2) {
            throw new Error('lock de rollback no disponible');
          }
          return operation();
        },
        backupExistingDatabase: async () => undefined,
        closeDatabaseAndReleaseLock: async () => undefined,
        activateDatabase,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/se conserva la copia de recuperación/i);
    expect(result.rollbackSnapshotPath).toBeTruthy();
    expect(result.rollbackSnapshotPath && readFileSync(result.rollbackSnapshotPath, 'utf8')).toBe('BASE-ORIGINAL');
  });
  it('restaura correctamente y elimina sidecars y snapshot temporal', async () => {
    const directory = tempDirectory();
    const targetDatabasePath = path.join(directory, 'traccion.sqlite');
    const backupPath = path.join(directory, 'backup.sqlite');
    writeFileSync(targetDatabasePath, 'BASE-ORIGINAL');
    writeFileSync(backupPath, 'BASE-RESPALDO');
    writeFileSync(targetDatabasePath + '-wal', 'old');
    writeFileSync(targetDatabasePath + '-shm', 'old');
    const initial = status(targetDatabasePath, false, 'fallback');
    const active = status(targetDatabasePath, true, 'active');
    const close = vi.fn(async () => undefined);
    const result = await restoreValidatedSqliteBackup({
      backupPath, targetDatabasePath, directoryPath: directory, isDefaultPath: false, currentStatus: initial,
      dependencies: {
        getDatabase: () => null,
        getStatus: () => active,
        withDatabaseOperationLock: async <T>(_databasePath: string, operation: () => Promise<T>) => operation(),
        backupExistingDatabase: async () => undefined,
        closeDatabaseAndReleaseLock: close,
        activateDatabase: async () => active,
      },
    });
    expect(result.ok).toBe(true);
    expect(result.status).toEqual(active);
    expect(result.rollbackSnapshotPath).toBeNull();
    expect(readFileSync(targetDatabasePath, 'utf8')).toBe('BASE-RESPALDO');
    expect(existsSync(targetDatabasePath + '-wal')).toBe(false);
    expect(existsSync(targetDatabasePath + '-shm')).toBe(false);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('conserva la base original si no se obtiene el lock de restauración', async () => {
    const directory = tempDirectory();
    const targetDatabasePath = path.join(directory, 'traccion.sqlite');
    const backupPath = path.join(directory, 'backup.sqlite');
    writeFileSync(targetDatabasePath, 'BASE-ORIGINAL');
    writeFileSync(backupPath, 'BASE-RESPALDO');
    const initial = status(targetDatabasePath, false, 'locked');
    const close = vi.fn(async () => undefined);
    const activate = vi.fn(async () => initial);
    const result = await restoreValidatedSqliteBackup({
      backupPath, targetDatabasePath, directoryPath: directory, isDefaultPath: false, currentStatus: initial,
      dependencies: {
        getDatabase: () => null,
        getStatus: () => initial,
        withDatabaseOperationLock: async () => { throw new Error('lock ocupado'); },
        backupExistingDatabase: async () => undefined,
        closeDatabaseAndReleaseLock: close,
        activateDatabase: activate,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(initial);
    expect(result.rollbackSnapshotPath).toBeNull();
    expect(readFileSync(targetDatabasePath, 'utf8')).toBe('BASE-ORIGINAL');
    expect(close).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it('recupera la base original si desaparece el archivo de respaldo antes de copiar', async () => {
    const directory = tempDirectory();
    const targetDatabasePath = path.join(directory, 'traccion.sqlite');
    const backupPath = path.join(directory, 'missing.sqlite');
    writeFileSync(targetDatabasePath, 'BASE-ORIGINAL');
    const initial = status(targetDatabasePath, false, 'fallback');
    const active = status(targetDatabasePath, true, 'active');
    const activate = vi.fn(async () => active);
    const result = await restoreValidatedSqliteBackup({
      backupPath, targetDatabasePath, directoryPath: directory, isDefaultPath: false, currentStatus: initial,
      dependencies: {
        getDatabase: () => null,
        getStatus: () => active,
        withDatabaseOperationLock: async <T>(_databasePath: string, operation: () => Promise<T>) => operation(),
        backupExistingDatabase: async () => undefined,
        closeDatabaseAndReleaseLock: async () => undefined,
        activateDatabase: activate,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.rollbackSnapshotPath).toBeNull();
    expect(readFileSync(targetDatabasePath, 'utf8')).toBe('BASE-ORIGINAL');
    expect(activate).toHaveBeenCalledTimes(1);
  });

});

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
});

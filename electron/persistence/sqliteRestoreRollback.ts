import { copyFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { Database } from 'better-sqlite3';
import { backupSqliteDatabase, backupTimestampForFileName } from './localBackups.js';

export interface RestoreDatabaseStatus {
  ready: boolean;
  phase: 'prepared' | 'active' | 'fallback' | 'error' | 'locked';
  path: string;
  message?: string;
}

export interface SqliteRestoreRollbackDependencies<TStatus extends RestoreDatabaseStatus> {
  getDatabase: () => Database | null;
  getStatus: () => TStatus;
  withDatabaseOperationLock: <T>(databasePath: string, operation: () => Promise<T>, waitMs?: number) => Promise<T>;
  backupExistingDatabase: (databasePath: string) => Promise<void>;
  closeDatabaseAndReleaseLock: () => Promise<void>;
  activateDatabase: (directoryPath: string, isDefaultPath: boolean, seedFromDatabasePath: string | null) => Promise<TStatus>;
}

export interface RestoreValidatedSqliteBackupOptions<TStatus extends RestoreDatabaseStatus> {
  backupPath: string;
  targetDatabasePath: string;
  directoryPath: string;
  isDefaultPath: boolean;
  currentStatus: TStatus;
  dependencies: SqliteRestoreRollbackDependencies<TStatus>;
}

export interface RestoreValidatedSqliteBackupResult<TStatus extends RestoreDatabaseStatus> {
  ok: boolean;
  status: TStatus;
  message: string;
  rollbackSnapshotPath: string | null;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function clearSqliteSidecars(databasePath: string): Promise<void> {
  await unlink(`${databasePath}-wal`).catch(() => undefined);
  await unlink(`${databasePath}-shm`).catch(() => undefined);
}

export async function restoreValidatedSqliteBackup<TStatus extends RestoreDatabaseStatus>(
  options: RestoreValidatedSqliteBackupOptions<TStatus>,
): Promise<RestoreValidatedSqliteBackupResult<TStatus>> {
  const {
    backupPath,
    targetDatabasePath,
    directoryPath,
    isDefaultPath,
    currentStatus,
    dependencies,
  } = options;

  await mkdir(path.dirname(targetDatabasePath), { recursive: true });

  const rollbackSnapshotPath = `${targetDatabasePath}.restore-rollback-${backupTimestampForFileName()}.sqlite`;
  let rollbackSnapshotCreated = false;
  let rollbackAlreadyCopiedIntoPlace = false;

  const restoreRollbackFile = async (): Promise<void> => {
    await dependencies.closeDatabaseAndReleaseLock();
    await clearSqliteSidecars(targetDatabasePath);
    await copyFile(rollbackSnapshotPath, targetDatabasePath);
    rollbackAlreadyCopiedIntoPlace = true;
  };

  const rollbackAndReactivate = async (primaryError: unknown): Promise<RestoreValidatedSqliteBackupResult<TStatus>> => {
    const primaryMessage = errorMessage(primaryError, 'No se ha podido restaurar el respaldo SQLite.');

    if (!rollbackSnapshotCreated) {
      return {
        ok: false,
        status: dependencies.getStatus(),
        message: primaryMessage,
        rollbackSnapshotPath: null,
      };
    }

    try {
      if (!rollbackAlreadyCopiedIntoPlace) {
        await dependencies.withDatabaseOperationLock(targetDatabasePath, restoreRollbackFile);
      }

      const rollbackStatus = await dependencies.activateDatabase(directoryPath, isDefaultPath, null);
      if (!rollbackStatus.ready || rollbackStatus.phase !== 'active') {
        throw new Error(rollbackStatus.message ?? 'La base anterior no ha podido reactivarse tras el rollback.');
      }

      await unlink(rollbackSnapshotPath).catch(() => undefined);
      return {
        ok: false,
        status: rollbackStatus,
        message: `${primaryMessage} Se ha recuperado automáticamente la base anterior.`,
        rollbackSnapshotPath: null,
      };
    } catch (rollbackError) {
      const rollbackMessage = errorMessage(
        rollbackError,
        'También ha fallado la recuperación automática de la base anterior.',
      );
      return {
        ok: false,
        status: dependencies.getStatus(),
        message:
          `${primaryMessage} ${rollbackMessage} ` +
          `Se conserva la copia de recuperación en ${rollbackSnapshotPath}.`,
        rollbackSnapshotPath,
      };
    }
  };

  try {
    await dependencies.withDatabaseOperationLock(targetDatabasePath, async () => {
      const activeDatabase = dependencies.getDatabase();
      const canUseConsistentSqliteBackup =
        currentStatus.ready &&
        currentStatus.phase === 'active' &&
        currentStatus.path === targetDatabasePath &&
        activeDatabase !== null;

      if (canUseConsistentSqliteBackup) {
        await backupSqliteDatabase(activeDatabase, currentStatus.path, rollbackSnapshotPath);
      } else {
        await copyFile(targetDatabasePath, rollbackSnapshotPath);
      }
      rollbackSnapshotCreated = true;

      if (currentStatus.ready) {
        await dependencies.backupExistingDatabase(currentStatus.path);
      }

      await dependencies.closeDatabaseAndReleaseLock();
      await clearSqliteSidecars(targetDatabasePath);

      try {
        await copyFile(backupPath, targetDatabasePath);
      } catch (error) {
        await restoreRollbackFile();
        throw error;
      }
    });

    const nextStatus = await dependencies.activateDatabase(directoryPath, isDefaultPath, null);
    if (!nextStatus.ready || nextStatus.phase !== 'active') {
      throw new Error(nextStatus.message ?? 'La copia SQLite se sustituyó, pero no ha podido activarse.');
    }

    await unlink(rollbackSnapshotPath).catch(() => undefined);
    return {
      ok: true,
      status: nextStatus,
      message: 'Copia SQLite restaurada. Reinicia o recarga la app para aplicar los datos recuperados.',
      rollbackSnapshotPath: null,
    };
  } catch (error) {
    return rollbackAndReactivate(error);
  }
}

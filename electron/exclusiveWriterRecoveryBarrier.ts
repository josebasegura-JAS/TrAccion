/**
 * PR501 — exclusively supervised SMB window for receipt reconciliation.
 * Uses the existing distributed database lock manager; does NOT trust its
 * stale-lock TTL as proof that an orphaned writer has exited.
 *
 * The caller must first prove prior writer termination independently.
 * This primitive does not enable the production writer or reopen main.
 */
import type { DatabaseLockManager, DatabaseLockInfo } from './persistence/databaseLockManager.js';

type RecoveryLockManager = Pick<DatabaseLockManager,
  'acquireLock' | 'getLockPath' | 'readLock' | 'releaseLock' |
  'startDatabaseLockHeartbeat' | 'pauseDatabaseLockHeartbeat' |
  'assertDatabaseWritesAllowed'>;

export interface ExclusiveWriterRecoveryBarrierOptions {
  manager: RecoveryLockManager;
  databasePath: string;
  /** Must establish there is no local main handle or auxiliary SQLite I/O. */
  assertLocalSqliteInactive: () => Promise<void>;
}

export function createExclusiveWriterRecoveryBarrier(
  options: ExclusiveWriterRecoveryBarrierOptions,
) {
  let busy = false;
  return async function withExclusiveRecoveryBarrier<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    if (busy || !options.databasePath.trim()) {
      throw new Error('Barrera de recuperación SQLite ocupada o sin base válida.');
    }
    busy = true;
    let owner: DatabaseLockInfo | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    const lockPath = options.manager.getLockPath(options.databasePath);
    const assertOwned = async (): Promise<void> => {
      if (!owner) throw new Error('Barrera SMB sin propietario registrado.');
      options.manager.assertDatabaseWritesAllowed();
      const actual = await options.manager.readLock(lockPath);
      if (!actual || actual.ownerId !== owner.ownerId ||
          actual.pid !== owner.pid || actual.hostname !== owner.hostname ||
          actual.createdAt !== owner.createdAt) {
        throw new Error('Propietario SMB de recuperación perdido o cambiado.');
      }
      options.manager.assertDatabaseWritesAllowed();
    };
    try {
      await options.assertLocalSqliteInactive();
      options.manager.assertDatabaseWritesAllowed();
      owner = await options.manager.acquireLock(options.databasePath);
      heartbeat = options.manager.startDatabaseLockHeartbeat(lockPath, owner);
      await assertOwned();
      await options.assertLocalSqliteInactive();
      const result = await operation();
      // Do not report successful reconciliation if network/lease failed.
      await assertOwned();
      await options.assertLocalSqliteInactive();
      return result;
    } finally {
      try {
        if (heartbeat) await options.manager.pauseDatabaseLockHeartbeat(heartbeat);
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        try {
          if (owner) await options.manager.releaseLock(lockPath, owner);
        } finally {
          busy = false;
        }
      }
    }
  };
}

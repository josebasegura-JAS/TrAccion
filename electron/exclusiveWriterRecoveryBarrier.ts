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
  let poisoned = false;
  return async function withExclusiveRecoveryBarrier<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    if (busy || poisoned || !options.databasePath.trim()) {
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
    let result!: T;
    let failure: unknown;
    let failed = false;
    try {
      await options.assertLocalSqliteInactive();
      options.manager.assertDatabaseWritesAllowed();
      owner = await options.manager.acquireLock(options.databasePath);
      heartbeat = options.manager.startDatabaseLockHeartbeat(lockPath, owner);
      await assertOwned();
      await options.assertLocalSqliteInactive();
      result = await operation();
      // Do not report successful reconciliation if network/lease failed.
      await assertOwned();
      await options.assertLocalSqliteInactive();
    } catch (error) {
      failed = true;
      failure = error;
      poisoned = true;
    }
    // Cleanup must attempt to release the lease even if heartbeat suspension
    // fails. A cleanup failure poisons the barrier; it must never make an
    // uncertain recovery look successful or mask the original error.
    let heartbeatStopped = heartbeat === null;
    try {
      if (heartbeat) await options.manager.pauseDatabaseLockHeartbeat(heartbeat);
      heartbeatStopped = true;
    } catch (error) {
      // A failed pause may leave a heartbeat operation in flight. Releasing
      // its SMB lock now could race an in-flight write to owner.json.
      // Retain the lock and quarantine instead of pretending cleanup worked.
      poisoned = true;
      if (!failed) { failed = true; failure = error; }
    } finally {
      if (heartbeat) clearInterval(heartbeat);
    }
    try {
      if (owner && heartbeatStopped) await options.manager.releaseLock(lockPath, owner);
    } catch (error) {
      poisoned = true;
      if (!failed) { failed = true; failure = error; }
    } finally {
      busy = false;
    }
    if (failed) throw failure;
    return result;
  };
}

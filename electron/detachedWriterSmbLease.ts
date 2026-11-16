/**
 * The detached SQLite writer must use the very same .lockdir protocol as
 * Electron/main. One SMB lease is acquired before dispatching each write.
 *
 * It does NOT authorize a production handoff by itself.
 */
import type { DatabaseLockManager } from './persistence/databaseLockManager.js';

export async function withDetachedSqliteSmbLease<T>(
  manager: Pick<DatabaseLockManager,
    'getLockPath' | 'acquireLock' | 'releaseLock' |
    'readLock' | 'startDatabaseLockHeartbeat' | 'pauseDatabaseLockHeartbeat' |
    'assertDatabaseWritesAllowed'>,
  databasePath: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  if (!databasePath.trim()) throw new Error('Ruta SQLite de escritura aislada vacía.');
  // No invoke SQLite callbacks without a verified .lockdir.
  const lock = await manager.acquireLock(databasePath);
  const lockPath = manager.getLockPath(databasePath);
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let failure: unknown;
  let succeeded = false;
  let value!: T;
  try {
    heartbeat = manager.startDatabaseLockHeartbeat(lockPath, lock);
    const current = await manager.readLock(lockPath);
    if (!current ||
        current.ownerId !== lock.ownerId ||
        current.pid !== lock.pid ||
        current.createdAt !== lock.createdAt) {
      throw new Error('Propietario SMB no verificable antes de escribir; operación cancelada.');
    }
    manager.assertDatabaseWritesAllowed();
    value = await operation();
    manager.assertDatabaseWritesAllowed();
    succeeded = true;
  } catch (error) {
    failure = error;
  } finally {
    if (heartbeat) {
      // No release while an in-flight heartbeat may still be writing owner.json.
      try {
        await manager.pauseDatabaseLockHeartbeat(heartbeat);
      } catch (error) {
        failure ??= error;
        succeeded = false;
      } finally {
        clearInterval(heartbeat);
      }
    }
    try {
      await manager.releaseLock(lockPath, lock);
    } catch (error) {
      // An uncertain release means ownership is not proved free.
      failure ??= error;
      succeeded = false;
    }
  }
  if (failure !== undefined) throw failure;
  if (!succeeded) throw new Error('No se ha confirmado el fin del lease SMB del escritor aislado.');
  return value;
}

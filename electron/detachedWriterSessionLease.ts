/**
 * PR480. Per-device detached-writer session reservation (NOT the database's
 * cross-device operation lock). A global lifetime .lockdir would starve other
 * TrAcción clients, so short writes still use the ordinary .lockdir.
 *
 * This is a non-production primitive; no writer handoff is wired here.
 */
import { createHash } from 'node:crypto';
import type { DatabaseLockManager, DatabaseLockInfo } from './persistence/databaseLockManager.js';

type Manager = Pick<DatabaseLockManager,
  'acquireLock' | 'getLockPath' | 'readLock' | 'releaseLock' |
  'startDatabaseLockHeartbeat' | 'pauseDatabaseLockHeartbeat' |
  'assertDatabaseWritesAllowed'>;

export interface DetachedWriterSessionLease {
  readonly owner: DatabaseLockInfo;
  readonly lockPath: string;
  assertOwned(): Promise<void>;
  close(): Promise<void>;
}

/** Stable scope shared by all processes of ONE workstation/installation. */
export function detachedWriterSessionLockKey(databasePath: string, deviceScope: string): string {
  if (!databasePath.trim() || !deviceScope.trim()) {
    throw new Error('La reserva de sesión requiere SQLite e identidad estable del equipo.');
  }
  const digest = createHash('sha256').update(deviceScope, 'utf8').digest('hex').slice(0, 24);
  return `${databasePath}.writer-session.${digest}`;
}

export async function acquireDetachedWriterSessionLease(
  manager: Manager,
  databasePath: string,
  deviceScope: string,
): Promise<DetachedWriterSessionLease> {
  const key = detachedWriterSessionLockKey(databasePath, deviceScope);
  const owner = await manager.acquireLock(key);
  const lockPath = manager.getLockPath(key);
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let state: 'active' | 'closing' | 'closed' | 'poisoned' = 'active';

  const verify = async (): Promise<void> => {
    if (state !== 'active') throw new Error('Reserva de sesión SQLite inactiva o incierta.');
    try {
      manager.assertDatabaseWritesAllowed();
      const actual = await manager.readLock(lockPath);
      if (!actual || actual.ownerId !== owner.ownerId ||
          actual.pid !== owner.pid || actual.hostname !== owner.hostname ||
          actual.createdAt !== owner.createdAt) {
        throw new Error('La reserva de sesión del worker ha perdido propietario SMB.');
      }
      manager.assertDatabaseWritesAllowed();
    } catch (error) {
      state = 'poisoned'; // never accept new work after uncertain ownership
      throw error;
    }
  };

  try {
    heartbeat = manager.startDatabaseLockHeartbeat(lockPath, owner);
    await verify();
  } catch (error) {
    if (heartbeat) {
      try { await manager.pauseDatabaseLockHeartbeat(heartbeat); }
      catch { /* Never consider a failed heartbeat pause a safe release. */ }
      clearInterval(heartbeat);
    }
    // A failed proof may mean another owner exists. A manager's releaseLock
    // checks its original owner before removal and fails closed on ambiguity.
    try { await manager.releaseLock(lockPath, owner); }
    catch { /* Preserve the original failure. */ }
    throw error;
  }

  let closing: Promise<void> | null = null;
  return {
    owner: { ...owner },
    lockPath,
    assertOwned: verify,
    close(): Promise<void> {
      if (closing) return closing;
      state = 'closing'; // synchronous: no new verification can start
      closing = (async () => {
        try {
          if (heartbeat) {
            await manager.pauseDatabaseLockHeartbeat(heartbeat);
            clearInterval(heartbeat);
          }
          await manager.releaseLock(lockPath, owner);
          state = 'closed';
        } catch (error) {
          state = 'poisoned';
          throw error;
        }
      })();
      return closing;
    },
  };
}

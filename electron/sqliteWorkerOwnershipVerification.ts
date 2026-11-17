/**
 * PR479: independent SMB ownership verification for a future writer handoff.
 * This checks the actual .lockdir on the shared filesystem, not an IPC claim.
 * It does NOT acquire ownership and is NOT a continuous lease guarantee.
 */
import type { DatabaseLockManager, DatabaseLockInfo } from './persistence/databaseLockManager.js';
import { detachedWriterSessionLockKey } from './detachedWriterSessionLease.js';

export type SqliteWorkerLockProof = Pick<DatabaseLockInfo,
  'ownerId' | 'hostname' | 'pid' | 'createdAt'>;

export async function verifyDetachedWorkerSmbOwner(
  manager: Pick<DatabaseLockManager, 'getLockPath' | 'readLock' | 'assertDatabaseWritesAllowed'>,
  databasePath: string,
  expected: SqliteWorkerLockProof,
): Promise<void> {
  if (!databasePath.trim() || !expected.ownerId.startsWith('detached-writer:') ||
      !expected.hostname.trim() || !Number.isSafeInteger(expected.pid) || expected.pid <= 0 ||
      !expected.createdAt.trim()) {
    throw new Error('Prueba de titularidad SQLite auxiliar incompleta.');
  }
  manager.assertDatabaseWritesAllowed();
  const actual = await manager.readLock(manager.getLockPath(databasePath));
  if (!actual || actual.ownerId !== expected.ownerId || actual.pid !== expected.pid ||
      actual.hostname !== expected.hostname || actual.createdAt !== expected.createdAt) {
    throw new Error('No se puede demostrar propiedad exclusiva del worker en SMB.');
  }
  manager.assertDatabaseWritesAllowed();
}

/**
 * PR480. The handoff verifier must check the long-lived per-device session
 * reservation, not the short-lived global lock that is free between writes.
 */
export async function verifyDetachedWorkerSmbSessionOwner(
  manager: Pick<DatabaseLockManager, 'getLockPath' | 'readLock' | 'assertDatabaseWritesAllowed'>,
  databasePath: string,
  deviceScope: string,
  expected: SqliteWorkerLockProof,
): Promise<void> {
  await verifyDetachedWorkerSmbOwner(
    manager, detachedWriterSessionLockKey(databasePath, deviceScope), expected,
  );
}

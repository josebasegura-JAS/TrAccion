import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseLockManager } from './persistence/databaseLockManager.js';
import {
  acquireDetachedWriterSessionLease, detachedWriterSessionLockKey,
} from './detachedWriterSessionLease.js';
import { withDetachedSqliteSmbLease } from './detachedWriterSmbLease.js';

const dirs: string[] = [];
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'traccion-session-480-'));
  dirs.push(dir);
  const db = path.join(dir, 'traccion.sqlite');
  const manager = createDatabaseLockManager({ getOwnerId: () => 'detached-writer:unit:1' });
  const other = createDatabaseLockManager({ getOwnerId: () => 'detached-writer:unit:2' });
  return { db, manager, other };
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('PR480 · session lock scoped per device', () => {
  it('maintains session owner while normal SQLite lock remains free for other workstations', async () => {
    const { db, manager, other } = fixture();
    const session = await acquireDetachedWriterSessionLease(manager, db, 'workstation-A');
    try {
      await session.assertOwned();
      expect(await manager.readLock(session.lockPath)).toMatchObject({ ownerId: session.owner.ownerId });
      expect(await other.readLock(other.getLockPath(db))).toBeNull();
      await expect(withDetachedSqliteSmbLease(other, db, () => 'second-workstation-write'))
        .resolves.toBe('second-workstation-write');
      await session.assertOwned();
    } finally {
      await session.close();
    }
    expect(await manager.readLock(session.lockPath)).toBeNull();
    await expect(session.assertOwned()).rejects.toThrow('inactiva');
  });

  it('blocks a second writer with the same device scope', async () => {
    const { db, manager, other } = fixture();
    const session = await acquireDetachedWriterSessionLease(manager, db, 'workstation-A');
    try {
      // Use a short lock wait to avoid an unnecessary CI delay.
      const impatient = { ...other, acquireLock: (key: string) => other.acquireLock(key, 70) };
      await expect(acquireDetachedWriterSessionLease(impatient, db, 'workstation-A'))
        .rejects.toThrow();
      expect(await manager.readLock(session.lockPath)).not.toBeNull();
    } finally {
      await session.close();
    }
  });

  it('denies new work when the SMB owner changes', async () => {
    const { db, manager } = fixture();
    let corruptNextRead = false;
    const injected = {
      ...manager,
      readLock: async (lockPath: string) => {
        const owner = await manager.readLock(lockPath);
        return corruptNextRead && owner ? { ...owner, pid: owner.pid + 1 } : owner;
      },
    };
    const session = await acquireDetachedWriterSessionLease(injected, db, 'workstation-A');
    try {
      corruptNextRead = true;
      await expect(session.assertOwned()).rejects.toThrow('perdido propietario');
      corruptNextRead = false;
      await expect(session.assertOwned()).rejects.toThrow('inactiva');
    } finally {
      await session.close();
    }
  });

  it('derives distinct session keys without exposing the device scope in filenames', () => {
    const first = detachedWriterSessionLockKey('X:/db.sqlite', 'workstation-A');
    expect(first).toBe(detachedWriterSessionLockKey('X:/db.sqlite', 'workstation-A'));
    expect(first).not.toBe(detachedWriterSessionLockKey('X:/db.sqlite', 'workstation-B'));
    expect(first).not.toContain('workstation-A');
    expect(() => detachedWriterSessionLockKey('', 'A')).toThrow();
  });
});

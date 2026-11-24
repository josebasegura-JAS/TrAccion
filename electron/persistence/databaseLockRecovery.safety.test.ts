import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { releaseExpiredDatabaseLockSafely, forceReleaseDatabaseLockWithRecovery } from './databaseLockRecovery.js';
import type { DatabaseLockInfo } from './sqliteLockLifecycle.js';

const expired: DatabaseLockInfo = {
  ownerId: 'owner-a', username: 'test', hostname: 'test-pc', pid: 123,
  createdAt: '2000-01-01T00:00:00Z', updatedAt: '2000-01-01T00:00:00Z',
};
const ownerPath = (lockPath: string) => path.join(lockPath, 'owner.json');

describe('recuperación segura de bloqueos SQLite', () => {
  let root: string;
  let lockPath: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'traccion-lock-safety-'));
    lockPath = path.join(root, 'test.sqlite.lockdir');
    await mkdir(lockPath);
    await writeFile(ownerPath(lockPath), JSON.stringify(expired));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('elimina únicamente el propietario caducado y estable', async () => {
    const result = await releaseExpiredDatabaseLockSafely(lockPath, expired, async () => expired, ownerPath, () => true);
    expect(result.released).toBe(true);
    expect(await readdir(root)).toEqual([]);
  });

  it('no toca un propietario que sigue vigente', async () => {
    const readLock = vi.fn(async () => expired);
    const result = await releaseExpiredDatabaseLockSafely(lockPath, expired, readLock, ownerPath, () => false);
    expect(result.released).toBe(false);
    expect(readLock).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(ownerPath(lockPath), 'utf8'))).toEqual(expired);
  });

  it('no borra el lock si cambia el propietario antes de reservarlo', async () => {
    const replacement = { ...expired, ownerId: 'owner-b' };
    await writeFile(ownerPath(lockPath), JSON.stringify(replacement));
    const result = await releaseExpiredDatabaseLockSafely(lockPath, expired, async () => replacement, ownerPath, () => true);
    expect(result.released).toBe(false);
    expect(JSON.parse(await readFile(ownerPath(lockPath), 'utf8'))).toEqual(replacement);
  });

  it('restaura el propietario capturado si cambia entre lectura y rename', async () => {
    const replacement = { ...expired, ownerId: 'owner-b' };
    const result = await releaseExpiredDatabaseLockSafely(lockPath, expired, async () => {
      await writeFile(ownerPath(lockPath), JSON.stringify(replacement));
      return expired;
    }, ownerPath, () => true);
    expect(result.released).toBe(false);
    expect(JSON.parse(await readFile(ownerPath(lockPath), 'utf8'))).toEqual(replacement);
    expect(await readdir(lockPath)).toEqual(['owner.json']);
  });

  it('no declara éxito si existen archivos adicionales en el directorio', async () => {
    await writeFile(path.join(lockPath, 'other-owner-marker'), 'preserve');
    const result = await releaseExpiredDatabaseLockSafely(lockPath, expired, async () => expired, ownerPath, () => true);
    expect(result.released).toBe(false);
    expect(await readFile(path.join(lockPath, 'other-owner-marker'), 'utf8')).toBe('preserve');
  });

  it('no activa la base si la lectura del propietario falla', async () => {
    const status = { lockPath, message: 'bloqueada' };
    const activateDatabase = vi.fn(async () => status);
    const setStatus = vi.fn();
    const result = await forceReleaseDatabaseLockWithRecovery({
      getStatus: () => status, readLock: async () => { throw new Error('E/S'); },
      getLockInfoPath: ownerPath, isLockStale: () => true, isDatabaseActive: () => false,
      getConfiguredDirectory: async () => ({ directoryPath: root, isDefaultPath: false }),
      activateDatabase, setStatus, errorMessage: String,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(status);
    expect(activateDatabase).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(ownerPath(lockPath), 'utf8'))).toEqual(expired);
  });
});

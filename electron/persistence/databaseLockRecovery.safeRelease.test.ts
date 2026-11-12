import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { rename, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forceReleaseDatabaseLockWithRecovery } from './databaseLockRecovery.js';
import type { DatabaseLockInfo } from './sqliteLockLifecycle.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename), unlink: vi.fn(actual.unlink) };
});

describe('PR7B · liberación manual SQLite fail-closed', () => {
  let root: string;
  let lockPath: string;
  let ownerPath: string;
  const oldDate = () => new Date(Date.now() - 90_000).toISOString();
  const nowDate = () => new Date().toISOString();
  const owner = (ownerId: string, updatedAt: string): DatabaseLockInfo => ({
    ownerId, username: ownerId, hostname: ownerId, pid: 123,
    createdAt: oldDate(), updatedAt,
  });
  let first: DatabaseLockInfo;
  const status = () => ({ lockPath, message: 'Base bloqueada' });
  const stale = (lock: DatabaseLockInfo) => Date.now() - Date.parse(lock.updatedAt) > 30_000;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'traccion-manual-lock-'));
    lockPath = path.join(root, 'db.sqlite.lockdir');
    ownerPath = path.join(lockPath, 'owner.json');
    mkdirSync(lockPath);
    first = owner('equipo-antiguo', oldDate());
    writeFileSync(ownerPath, JSON.stringify(first), 'utf8');
    vi.mocked(rename).mockImplementation(async (from, to) => { renameSync(from, to); });
    vi.mocked(unlink).mockImplementation(async (target) => {
      await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
        .then((fs) => fs.unlink(target));
    });
  });
  afterEach(() => {
    vi.mocked(rename).mockReset();
    vi.mocked(unlink).mockReset();
    rmSync(root, { recursive: true, force: true });
  });

  function deps() {
    const activateDatabase = vi.fn(async () => status());
    return {
      getStatus: status,
      readLock: vi.fn(async () => JSON.parse(readFileSync(ownerPath, 'utf8')) as DatabaseLockInfo),
      getLockInfoPath: () => ownerPath,
      isLockStale: stale,
      isDatabaseActive: () => false,
      getConfiguredDirectory: async () => ({ directoryPath: root, isDefaultPath: false }),
      activateDatabase,
      setStatus: vi.fn(),
      errorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
    };
  }

  it('elimina un lock verdaderamente caducado y solo entonces intenta reconectar', async () => {
    const d = deps();
    const result = await forceReleaseDatabaseLockWithRecovery(d);
    expect(result.ok).toBe(true);
    expect(existsSync(lockPath)).toBe(false);
    expect(d.activateDatabase).toHaveBeenCalledTimes(1);
  });

  it('nunca elimina un lock vivo aunque se solicite la liberación manual', async () => {
    const recent = { ...first, updatedAt: nowDate() };
    writeFileSync(ownerPath, JSON.stringify(recent), 'utf8');
    const d = deps();
    const result = await forceReleaseDatabaseLockWithRecovery(d);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('No se libera');
    expect(existsSync(ownerPath)).toBe(true);
    expect(d.activateDatabase).not.toHaveBeenCalled();
  });

  it('preserva un nuevo propietario si aparece antes del rename', async () => {
    const replacement = { ...owner('nuevo-equipo', nowDate()), createdAt: nowDate() };
    let swapped = false;
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (!swapped && String(from) === ownerPath) {
        writeFileSync(ownerPath, JSON.stringify(replacement), 'utf8');
        swapped = true;
      }
      renameSync(from, to);
    });
    const d = deps();
    const result = await forceReleaseDatabaseLockWithRecovery(d);
    expect(swapped).toBe(true);
    expect(result.ok).toBe(false);
    expect(d.activateDatabase).not.toHaveBeenCalled();
    expect(existsSync(lockPath)).toBe(true);
    expect((JSON.parse(readFileSync(ownerPath, 'utf8')) as DatabaseLockInfo).ownerId).toBe('nuevo-equipo');
  });

  it('impide borrado si un heartbeat escribe owner.json después de renombrar', async () => {
    vi.mocked(rename).mockImplementation(async (from, to) => {
      renameSync(from, to);
      writeFileSync(ownerPath, JSON.stringify({ ...first, updatedAt: nowDate() }), 'utf8');
    });
    const d = deps();
    const result = await forceReleaseDatabaseLockWithRecovery(d);
    expect(result.ok).toBe(false);
    expect(existsSync(lockPath)).toBe(true);
    expect((JSON.parse(readFileSync(ownerPath, 'utf8')) as DatabaseLockInfo).updatedAt).not.toBe(first.updatedAt);
    expect(d.activateDatabase).not.toHaveBeenCalled();
  });

  it('si falla el borrado físico no anuncia éxito ni reabre SQLite', async () => {
    vi.mocked(unlink).mockRejectedValueOnce(Object.assign(new Error('SMB desconectado'), { code: 'EIO' }));
    const d = deps();
    const result = await forceReleaseDatabaseLockWithRecovery(d);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('No se libera');
    expect(existsSync(lockPath)).toBe(true);
    expect(d.activateDatabase).not.toHaveBeenCalled();
  });

  it('si el propietario cambia entre las dos lecturas no intenta renombrarlo', async () => {
    const d = deps();
    let reads = 0;
    const newer = { ...first, ownerId: 'nuevo', updatedAt: nowDate() };
    d.readLock.mockImplementation(async () => {
      reads += 1;
      return reads === 1 ? first : newer;
    });
    const result = await forceReleaseDatabaseLockWithRecovery(d);
    expect(result.ok).toBe(false);
    expect(rename).not.toHaveBeenCalled();
    expect(d.activateDatabase).not.toHaveBeenCalled();
  });
});

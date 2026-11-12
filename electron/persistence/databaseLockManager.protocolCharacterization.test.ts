import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDatabaseLockManager, type DatabaseLockInfo } from './databaseLockManager.js';

// Interceptar el borrado permite reproducir intercalados SMB sin carreras de
// temporización dependientes de la carga de CI ni requerir un servidor real.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, unlink: vi.fn(actual.unlink) };
});

describe('caracterización del protocolo .lockdir (sin SMB real)', () => {
  let directory: string;
  let dbPath: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'traccion-lock-protocol-'));
    dbPath = path.join(directory, 'traccion.sqlite');
    vi.mocked(unlink).mockImplementation(async (target) => { unlinkSync(target); });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(unlink).mockReset();
    rmSync(directory, { recursive: true, force: true });
  });

  function makeOwner(ownerId: string, updatedAt: string): DatabaseLockInfo {
    return {
      ownerId,
      username: ownerId,
      hostname: ownerId,
      pid: 9000,
      createdAt: updatedAt,
      updatedAt,
    };
  }

  it('rechaza la liberación por un propietario ajeno y preserva el lock vivo', async () => {
    const managerA = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    const managerB = createDatabaseLockManager({ getOwnerId: () => 'equipo-b' });
    const lock = await managerA.acquireLock(dbPath, 150);
    const lockPath = managerA.getLockPath(dbPath);
    try {
      await managerB.releaseLock(lockPath, { ...lock, ownerId: 'equipo-b' });
      expect((await managerA.readLock(lockPath))?.ownerId).toBe('equipo-a');
    } finally {
      await managerA.releaseLock(lockPath, lock);
    }
  });

  it('CARACTERIZACIÓN E1: la limpieza de un lock caducado puede borrar al nuevo propietario', async () => {
    const manager = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    const lockPath = manager.getLockPath(dbPath);
    const ownerPath = manager.getLockInfoPath(lockPath);
    const stale = makeOwner('equipo-viejo', new Date(Date.now() - 90_000).toISOString());
    const fresh = makeOwner('equipo-nuevo', new Date().toISOString());

    // Crear el lock caducado directamente, preservando un ownerId diferente.
    const { mkdirSync } = await import('node:fs');
    mkdirSync(lockPath);
    writeFileSync(ownerPath, JSON.stringify(stale), 'utf8');

    let concurrentReplacementObserved = false;
    vi.mocked(unlink).mockImplementation(async (target) => {
      if (String(target) === ownerPath && !concurrentReplacementObserved) {
        // Entre readLock(stale) y unlink(owner.json), otro equipo ha
        // sustituido los metadatos por los de su lock vivo.
        writeFileSync(ownerPath, JSON.stringify(fresh), 'utf8');
        concurrentReplacementObserved = true;
      }
      unlinkSync(target);
    });

    const acquired = await manager.acquireLock(dbPath, 300);
    expect(concurrentReplacementObserved).toBe(true);
    expect(acquired.ownerId).toBe('equipo-a');

    // Este resultado documenta una debilidad del protocolo ACTUAL, no la
    // garantiza como correcta. Una futura corrección debe invertir la prueba:
    // impedir que el nuevo propietario pierda el lock.
    expect(readFileSync(ownerPath, 'utf8')).toContain('equipo-a');
    await manager.releaseLock(lockPath, acquired);
  });

  it('CARACTERIZACIÓN E5: la reentrada propia no cuenta referencias de adquisición', async () => {
    const manager = createDatabaseLockManager({ getOwnerId: () => 'mismo-proceso' });
    const first = await manager.acquireLock(dbPath, 150);
    const second = await manager.acquireLock(dbPath, 150);
    const lockPath = manager.getLockPath(dbPath);
    expect(first.ownerId).toBe(second.ownerId);

    // Liberar el primer uso deja al segundo sin exclusividad. En las
    // operaciones IPC ordinarias la cola evita este intercalado, pero no se
    // ha verificado que todas las rutas externas tengan esa garantía.
    await manager.releaseLock(lockPath, first);
    expect(existsSync(lockPath)).toBe(false);
    await manager.releaseLock(lockPath, second);
  });

  it('CARACTERIZACIÓN E2: 25 s de adelanto local invalidan un heartbeat remoto de 10 s', () => {
    vi.useFakeTimers();
    const realNow = Date.now();
    const manager = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    const heartbeat = makeOwner('equipo-b', new Date(realNow - 10_000).toISOString());
    vi.setSystemTime(realNow + 25_000);
    expect(manager.isLockStale(heartbeat)).toBe(true);
  });

  it('un timestamp de heartbeat en el futuro no se considera caducado inmediatamente', () => {
    vi.useFakeTimers();
    const now = Date.now();
    const manager = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    const future = makeOwner('equipo-b', new Date(now + 60_000).toISOString());
    vi.setSystemTime(now);
    expect(manager.isLockStale(future)).toBe(false);
  });
});

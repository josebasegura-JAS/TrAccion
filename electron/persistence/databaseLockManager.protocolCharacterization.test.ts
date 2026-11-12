import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { rename, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDatabaseLockManager, type DatabaseLockInfo } from './databaseLockManager.js';

// Interceptar el borrado permite reproducir intercalados SMB sin carreras de
// temporización dependientes de la carga de CI ni requerir un servidor real.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, unlink: vi.fn(actual.unlink), rename: vi.fn(actual.rename) };
});

describe('caracterización del protocolo .lockdir (sin SMB real)', () => {
  let directory: string;
  let dbPath: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'traccion-lock-protocol-'));
    dbPath = path.join(directory, 'traccion.sqlite');
    vi.mocked(unlink).mockImplementation(async (target) => { unlinkSync(target); });
    vi.mocked(rename).mockImplementation(async (oldPath, newPath) => { renameSync(oldPath, newPath); });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(unlink).mockReset();
    vi.mocked(rename).mockReset();
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

  it('E1 regresión: preserva al nuevo propietario al recuperar un lock caducado', async () => {
    const manager = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    const lockPath = manager.getLockPath(dbPath);
    const ownerPath = manager.getLockInfoPath(lockPath);
    const stale = makeOwner('equipo-viejo', new Date(Date.now() - 90_000).toISOString());
    const fresh = makeOwner('equipo-nuevo', new Date().toISOString());

    const { mkdirSync } = await import('node:fs');
    mkdirSync(lockPath);
    writeFileSync(ownerPath, JSON.stringify(stale), 'utf8');

    let swapped = false;
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (String(from) === ownerPath && !swapped) {
        // El nuevo dueño aparece exactamente entre la comprobación previa y
        // el renombrado atómico; la lectura posterior debe salvar sus datos.
        writeFileSync(ownerPath, JSON.stringify(fresh), 'utf8');
        swapped = true;
      }
      renameSync(from, to);
    });

    await expect(manager.acquireLock(dbPath, 220)).rejects.toThrow();
    expect(swapped).toBe(true);
    expect((await manager.readLock(lockPath))?.ownerId).toBe('equipo-nuevo');
    expect(existsSync(lockPath)).toBe(true);
  });

  it('E1: recupera un lock realmente caducado y permite adquirirlo', async () => {
    const manager = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    const lockPath = manager.getLockPath(dbPath);
    const ownerPath = manager.getLockInfoPath(lockPath);
    const stale = makeOwner('equipo-antiguo', new Date(Date.now() - 90_000).toISOString());
    const { mkdirSync } = await import('node:fs');
    mkdirSync(lockPath);
    writeFileSync(ownerPath, JSON.stringify(stale), 'utf8');

    const acquired = await manager.acquireLock(dbPath, 300);
    expect(acquired.ownerId).toBe('equipo-a');
    await manager.releaseLock(lockPath, acquired);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('E1: preserva el heartbeat renovado durante el cambio de nombre', async () => {
    const manager = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    const lockPath = manager.getLockPath(dbPath);
    const ownerPath = manager.getLockInfoPath(lockPath);
    const stale = makeOwner('equipo-antiguo', new Date(Date.now() - 90_000).toISOString());
    const { mkdirSync } = await import('node:fs');
    mkdirSync(lockPath);
    writeFileSync(ownerPath, JSON.stringify(stale), 'utf8');

    let refreshed = false;
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (String(from) === ownerPath && !refreshed) {
        writeFileSync(ownerPath, JSON.stringify({ ...stale, updatedAt: new Date().toISOString() }), 'utf8');
        refreshed = true;
      }
      renameSync(from, to);
    });

    await expect(manager.acquireLock(dbPath, 220)).rejects.toThrow();
    expect(refreshed).toBe(true);
    expect((await manager.readLock(lockPath))?.ownerId).toBe('equipo-antiguo');
    expect(existsSync(lockPath)).toBe(true);
  });

  it('E5: conserva exclusividad hasta liberar todas las adquisiciones del mismo gestor', async () => {
    const manager = createDatabaseLockManager({ getOwnerId: () => 'mismo-proceso' });
    const first = await manager.acquireLock(dbPath, 150);
    const second = await manager.acquireLock(dbPath, 150);
    const lockPath = manager.getLockPath(dbPath);
    expect(first).not.toBe(second);
    expect(first.ownerId).toBe(second.ownerId);

    await manager.releaseLock(lockPath, first);
    expect(existsSync(lockPath)).toBe(true);
    expect((await manager.readLock(lockPath))?.ownerId).toBe('mismo-proceso');

    // Una liberación repetida de la misma adquisición no descuenta dos veces.
    await manager.releaseLock(lockPath, first);
    expect(existsSync(lockPath)).toBe(true);

    await manager.releaseLock(lockPath, second);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('E5: los gestores del mismo proceso comparten el recuento de adquisiciones', async () => {
    const firstManager = createDatabaseLockManager({ getOwnerId: () => 'mismo-proceso' });
    const secondManager = createDatabaseLockManager({ getOwnerId: () => 'mismo-proceso' });
    const first = await firstManager.acquireLock(dbPath, 150);
    const second = await secondManager.acquireLock(dbPath, 150);
    const lockPath = firstManager.getLockPath(dbPath);

    await firstManager.releaseLock(lockPath, first);
    expect(existsSync(lockPath)).toBe(true);
    await secondManager.releaseLock(lockPath, second);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('E5: un propietario distinto no puede entrar durante la reentrada', async () => {
    const firstManager = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    const other = createDatabaseLockManager({ getOwnerId: () => 'equipo-b' });
    const first = await firstManager.acquireLock(dbPath, 150);
    const second = await firstManager.acquireLock(dbPath, 150);
    const lockPath = firstManager.getLockPath(dbPath);
    try {
      await firstManager.releaseLock(lockPath, first);
      await expect(other.acquireLock(dbPath, 120)).rejects.toThrow();
      expect(existsSync(lockPath)).toBe(true);
    } finally {
      await firstManager.releaseLock(lockPath, second);
    }
    const acquiredByOther = await other.acquireLock(dbPath, 300);
    await other.releaseLock(lockPath, acquiredByOther);
  });

  it('PR7C: no borra un owner.json corrupto aunque el directorio parezca viejo', async () => {
    const { mkdirSync, utimesSync } = await import('node:fs');
    const manager = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    const lockPath = manager.getLockPath(dbPath);
    mkdirSync(lockPath);
    writeFileSync(manager.getLockInfoPath(lockPath), '{"ownerId":', 'utf8');
    const old = new Date(Date.now() - 90_000);
    utimesSync(lockPath, old, old);

    await expect(manager.acquireLock(dbPath, 110)).rejects.toThrow();
    expect(existsSync(lockPath)).toBe(true);
    expect(existsSync(manager.getLockInfoPath(lockPath))).toBe(true);
  });

  it('PR7C: liberación normal preserva otro propietario que aparece antes del rename', async () => {
    const manager = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    const held = await manager.acquireLock(dbPath, 150);
    const lockPath = manager.getLockPath(dbPath);
    const ownerPath = manager.getLockInfoPath(lockPath);
    const newer = { ...makeOwner('equipo-b', new Date().toISOString()), createdAt: new Date().toISOString() };
    let replaced = false;
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (!replaced && String(from) === ownerPath) {
        writeFileSync(ownerPath, JSON.stringify(newer), 'utf8');
        replaced = true;
      }
      renameSync(from, to);
    });
    await manager.releaseLock(lockPath, held);
    expect(replaced).toBe(true);
    expect((await manager.readLock(lockPath))?.ownerId).toBe('equipo-b');
    expect(existsSync(lockPath)).toBe(true);
  });

  it('PR7C: una adquisición local espera al último release físico antes de entrar', async () => {
    const manager = createDatabaseLockManager({ getOwnerId: () => 'mismo-proceso' });
    const held = await manager.acquireLock(dbPath, 200);
    const lockPath = manager.getLockPath(dbPath);
    const ownerPath = manager.getLockInfoPath(lockPath);
    let allowRename!: () => void;
    const gate = new Promise<void>((resolve) => { allowRename = resolve; });
    let renameStarted!: () => void;
    const started = new Promise<void>((resolve) => { renameStarted = resolve; });
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (String(from) === ownerPath) {
        renameStarted();
        await gate;
      }
      renameSync(from, to);
    });

    const releasing = manager.releaseLock(lockPath, held);
    await started;
    let acquired = false;
    const next = manager.acquireLock(dbPath, 600).then((value) => {
      acquired = true;
      return value;
    });
    await Promise.resolve();
    expect(acquired).toBe(false);

    allowRename();
    await releasing;
    const second = await next;
    expect(acquired).toBe(true);
    expect(existsSync(lockPath)).toBe(true);
    await manager.releaseLock(lockPath, second);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('PR7C: si el owner se renueva tras el rename, release no borra el directorio vivo', async () => {
    const manager = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    const held = await manager.acquireLock(dbPath, 200);
    const lockPath = manager.getLockPath(dbPath);
    const ownerPath = manager.getLockInfoPath(lockPath);
    const refreshed = { ...held, updatedAt: new Date(Date.now() + 1_000).toISOString() };
    vi.mocked(rename).mockImplementation(async (from, to) => {
      renameSync(from, to);
      if (String(from) === ownerPath) {
        writeFileSync(ownerPath, JSON.stringify(refreshed), 'utf8');
      }
    });
    await manager.releaseLock(lockPath, held);
    expect(existsSync(lockPath)).toBe(true);
    expect((await manager.readLock(lockPath))?.updatedAt).toBe(refreshed.updatedAt);
  });

  it('CARACTERIZACIÓN E2: 25 s de adelanto local invalidan un heartbeat remoto de 10 s', () => {
    vi.useFakeTimers();
    const realNow = Date.now();
    const manager = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    const heartbeat = makeOwner('equipo-b', new Date(realNow - 10_000).toISOString());
    vi.setSystemTime(realNow + 25_000);
    expect(manager.isLockStale(heartbeat)).toBe(true);
  });

  it('PR7D: límite exacto TTL sin adelanto de reloj y caducidad posterior', () => {
    vi.useFakeTimers();
    const base = new Date('2026-11-12T10:00:00.000Z');
    vi.setSystemTime(base);
    const manager = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    const remote = makeOwner('equipo-b', new Date(base.getTime() - 30_000).toISOString());
    expect(manager.isLockStale(remote)).toBe(false);
    vi.setSystemTime(new Date(base.getTime() + 1));
    expect(manager.isLockStale(remote)).toBe(true);
  });

  it('PR7D: documenta explícitamente que un adelanto local puede provocar caducidad prematura', () => {
    vi.useFakeTimers();
    const baseline = new Date('2026-11-12T10:00:00.000Z').getTime();
    vi.setSystemTime(baseline);
    const manager = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    // El heartbeat remoto tiene solo 11 s de antigüedad real.
    const remote = makeOwner('equipo-b', new Date(baseline - 11_000).toISOString());
    expect(manager.isLockStale(remote)).toBe(false);
    // Un puesto local adelantado 20 s lo considera de 31 s y caducado.
    vi.setSystemTime(baseline + 20_000);
    expect(manager.isLockStale(remote)).toBe(true);
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

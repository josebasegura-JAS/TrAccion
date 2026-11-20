import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDatabaseLockManager, EMPTY_LOCK_OBSERVATION_MS } from './databaseLockManager.js';

// Simula intercalados SMB sobre el punto exacto de E/S. No representa un
// servidor SMB real y no prueba garantías con handles Windows.
const hooks = vi.hoisted(() => ({
  beforeWrite: null as null | ((target: string) => Promise<void>),
  afterOpen: null as null | ((target: string) => Promise<void>),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
      if (hooks.beforeWrite) await hooks.beforeWrite(String(args[0]));
      return actual.writeFile(...args);
    },
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      if (hooks.afterOpen) await hooks.afterOpen(String(args[0]));
      return handle;
    },
  };
});

describe('PR526: propietario y renovación no sobrescribibles', () => {
  let directory: string;
  let databasePath: string;

  beforeEach(() => {
    hooks.beforeWrite = null;
    hooks.afterOpen = null;
    directory = mkdtempSync(path.join(tmpdir(), 'traccion-pr526-lock-'));
    databasePath = path.join(directory, 'traccion.sqlite');
  });

  afterEach(() => {
    vi.useRealTimers();
    hooks.beforeWrite = null;
    hooks.afterOpen = null;
    rmSync(directory, { recursive: true, force: true });
  });

  it('una escritura retrasada con wx nunca pisa al propietario del directorio recreado', async () => {
    let offset = 0;
    const a = createDatabaseLockManager({ getOwnerId: () => 'cliente-A' });
    const b = createDatabaseLockManager({
      getOwnerId: () => 'cliente-B',
      monotonicNowMs: () => performance.now() + offset,
    });
    const lockPath = a.getLockPath(databasePath);
    const ownerPath = a.getLockInfoPath(lockPath);
    let continueA!: () => void;
    const gate = new Promise<void>((resolve) => { continueA = resolve; });
    let announceA!: () => void;
    const writingA = new Promise<void>((resolve) => { announceA = resolve; });
    let intercepted = false;
    hooks.beforeWrite = async (target) => {
      if (!intercepted && target === ownerPath) {
        intercepted = true;
        announceA();
        await gate;
      }
    };
    // Capturar el rechazo inmediatamente evita unhandledRejection si B tarda.
    const attemptA = a.acquireLock(databasePath, 1_400).then(
      (lease) => ({ lease }),
      (error: unknown) => ({ error }),
    );
    await writingA;
    await expect(b.acquireLock(databasePath, 120)).rejects.toThrow('owner.json');
    offset = EMPTY_LOCK_OBSERVATION_MS + 200;
    const leaseB = await b.acquireLock(databasePath, 1_000);
    expect(leaseB.ownerId).toBe('cliente-B');

    // La escritura en espera de A despierta DESPUÉS de que B creó owner.json.
    continueA();
    const resultA = await attemptA;
    expect('error' in resultA).toBe(true);
    expect(JSON.parse(readFileSync(ownerPath, 'utf8')).ownerId).toBe('cliente-B');

    await b.releaseLock(lockPath, leaseB);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('un heartbeat atrasado opera sobre su handle original y no trunca owner.json ajeno', async () => {
    const a = createDatabaseLockManager({ getOwnerId: () => 'cliente-A' });
    const lockPath = a.getLockPath(databasePath);
    const ownerPath = a.getLockInfoPath(lockPath);
    const leaseA = await a.acquireLock(databasePath, 200);
    const ownerB = {
      ownerId: 'cliente-B',
      username: 'prueba',
      hostname: 'prueba',
      pid: 123456,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    let switched = false;
    hooks.afterOpen = async (target) => {
      if (target !== ownerPath || switched) return;
      switched = true;
      // El handle original de A ya está abierto. Simular la sustitución del
      // nombre justo antes del read/write de la renovación.
      renameSync(ownerPath, path.join(lockPath, 'owner.json.reclaim-simulado'));
      writeFileSync(ownerPath, JSON.stringify(ownerB), 'utf8');
    };

    vi.useFakeTimers();
    const timer = a.startDatabaseLockHeartbeat(lockPath, leaseA);
    try {
      await vi.advanceTimersByTimeAsync(10_100);
      expect(switched).toBe(true);
      expect(JSON.parse(readFileSync(ownerPath, 'utf8'))).toEqual(ownerB);
    } finally {
      clearInterval(timer);
      vi.useRealTimers();
      await a.releaseLock(lockPath, leaseA);
    }
  });
});

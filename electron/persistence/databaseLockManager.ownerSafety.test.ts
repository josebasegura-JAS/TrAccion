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

  it('un error de escritura posterior a mkdir nunca confirma la adquisición ni borra a ciegas', async () => {
    const manager = createDatabaseLockManager({ getOwnerId: () => 'cliente-A' });
    const lockPath = manager.getLockPath(databasePath);
    const ownerPath = manager.getLockInfoPath(lockPath);
    hooks.beforeWrite = async (target) => {
      if (target === ownerPath) throw new Error('fallo-SMB-simulado');
    };

    await expect(manager.acquireLock(databasePath, 130)).rejects.toThrow();
    expect(existsSync(lockPath)).toBe(true);
    expect(existsSync(ownerPath)).toBe(false);
    // La recuperación del directorio vacío requiere una observación estable
    // posterior; borrarlo inmediatamente podría interferir con otro cliente.
  });

  it('el heartbeat no modifica la identidad ajena incluso ante un rename concurrente', async () => {
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

    let notifyOpen!: () => void;
    const openAttempted = new Promise<void>((resolve) => { notifyOpen = resolve; });
    let renameRejected = false;
    let switched = false;
    hooks.afterOpen = async (target) => {
      if (target !== ownerPath || switched || renameRejected) return;
      // Señal determinista: esperar realmente a que el heartbeat abra el handle.
      // Windows puede rechazar el rename de un archivo abierto (EPERM/EACCES).
      try {
        renameSync(ownerPath, path.join(lockPath, 'owner.json.reclaim-simulado'));
        writeFileSync(ownerPath, JSON.stringify(ownerB), 'utf8');
        switched = true;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY') throw error;
        renameRejected = true;
      } finally {
        notifyOpen();
      }
    };

    // Simular solo los intervalos, no la E/S asíncrona real de fs/promises.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const timer = a.startDatabaseLockHeartbeat(lockPath, leaseA);
    try {
      await vi.advanceTimersByTimeAsync(10_100);
      await openAttempted;
      // Dejar finalizar el read/write/close del handle y sus continuaciones.
      await vi.waitFor(() => {
        const actual = JSON.parse(readFileSync(ownerPath, 'utf8'));
        if (switched) expect(actual).toEqual(ownerB);
        else {
          expect(renameRejected).toBe(true);
          expect(actual.ownerId).toBe('cliente-A');
        }
      });
    } finally {
      clearInterval(timer);
      vi.useRealTimers();
      await a.releaseLock(lockPath, leaseA);
    }
  });
});

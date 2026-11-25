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
  afterClose: null as null | ((target: string) => void),
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
      const target = String(args[0]);
      const originalClose = handle.close.bind(handle);
      handle.close = async () => {
        try { return await originalClose(); }
        finally { hooks.afterClose?.(target); }
      };
      if (hooks.afterOpen) await hooks.afterOpen(target);
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
    hooks.afterClose = null;
    directory = mkdtempSync(path.join(tmpdir(), 'traccion-pr526-lock-'));
    databasePath = path.join(directory, 'traccion.sqlite');
  });

  afterEach(() => {
    vi.useRealTimers();
    hooks.beforeWrite = null;
    hooks.afterOpen = null;
    hooks.afterClose = null;
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
    let notifyClosed!: () => void;
    const heartbeatFinished = new Promise<void>((resolve) => { notifyClosed = resolve; });
    hooks.afterClose = (target) => { if (target === ownerPath) notifyClosed(); };
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
      // Comprobar tras finalizar físicamente el handle, no antes del write.
      await heartbeatFinished;
      const actual = JSON.parse(readFileSync(ownerPath, 'utf8'));
      if (switched) expect(actual).toEqual(ownerB);
      else {
        expect(renameRejected).toBe(true);
        expect(actual.ownerId).toBe('cliente-A');
      }
    } finally {
      clearInterval(timer);
      vi.useRealTimers();
      await a.releaseLock(lockPath, leaseA);
    }
  });
  it('renueva el lock de una operación exclusiva larga y espera la renovación antes de liberar', async () => {
    const manager = createDatabaseLockManager({ getOwnerId: () => 'cliente-A' });
    const lockPath = manager.getLockPath(databasePath);
    const ownerPath = manager.getLockInfoPath(lockPath);
    let finishOperation!: () => void;
    const operationGate = new Promise<void>(resolve => { finishOperation = resolve; });
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    let continueHeartbeat!: () => void;
    const heartbeatGate = new Promise<void>(resolve => { continueHeartbeat = resolve; });
    let announceHeartbeat!: () => void;
    const heartbeatStarted = new Promise<void>(resolve => { announceHeartbeat = resolve; });
    hooks.afterOpen = async target => {
      if (target === ownerPath) {
        announceHeartbeat();
        await heartbeatGate;
      }
    };
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-11-25T07:00:00.000Z'));
    const operation = manager.withDatabaseOperationLock(databasePath, async () => {
      entered();
      await operationGate;
      return 'done';
    });
    try {
      await started;
      const initial = await manager.readLock(lockPath);
      await vi.advanceTimersByTimeAsync(10_100);
      await heartbeatStarted;
      finishOperation();
      // La operación ya terminó, pero el propietario aún no debe retirarse.
      await Promise.resolve();
      expect(existsSync(ownerPath)).toBe(true);
      expect((await manager.readLock(lockPath))?.updatedAt).toBe(initial?.updatedAt);
      continueHeartbeat();
      expect(await operation).toBe('done');
      expect(existsSync(lockPath)).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      finishOperation();
      continueHeartbeat();
      await operation;
    }
  }, 15_000);

  it('una operación asíncrona mantiene renovado el propietario más allá del TTL observado', async () => {
    let observed = 0;
    const manager = createDatabaseLockManager({ getOwnerId: () => 'cliente-A' });
    const observer = createDatabaseLockManager({
      getOwnerId: () => 'cliente-B', monotonicNowMs: () => observed,
    });
    const lockPath = manager.getLockPath(databasePath);
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-11-25T07:00:00.000Z'));
    const operation = manager.withDatabaseOperationLock(databasePath, async () => {
      entered();
      await gate;
    });
    try {
      await started;
      const initial = (await observer.readLock(lockPath))!;
      expect(observer.isLockStale(initial)).toBe(false);
      let closed!: () => void;
      const heartbeatClosed = new Promise<void>(resolve => { closed = resolve; });
      hooks.afterClose = () => closed();
      await vi.advanceTimersByTimeAsync(10_000);
      await heartbeatClosed;
      const current = (await observer.readLock(lockPath))!;
      expect(current.updatedAt).not.toBe(initial.updatedAt);
      // El observador llevaba más de un TTL sin ver el propietario. Al
      // detectar la renovación, debe reiniciar la observación y no retirarlo.
      observed = 40_000;
      expect(observer.isLockStale(current)).toBe(false);
      expect(observer.isLockStale(current)).toBe(false);
    } finally {
      finish();
      await operation;
    }
    expect(existsSync(lockPath)).toBe(false);
  }, 15_000);

});

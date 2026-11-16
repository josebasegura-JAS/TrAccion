import { describe, expect, it, vi } from 'vitest';
import { createSqliteIndependentActivityTracker } from './sqliteIndependentActivityTracker.js';
import { runGuardedSqliteLifecycle } from './sqliteLifecycleAdmission.js';

describe('PR472 · admisión completa de ciclos SQLite', () => {
  it('mantiene la reserva entre reintentos, aunque el lock de una tentativa ya se haya liberado', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    let releaseRetry!: () => void;
    let pendingRetry!: () => void;
    const retryStarted = new Promise<void>(resolve => { pendingRetry = resolve; });
    const holdRetry = new Promise<void>(resolve => { releaseRetry = resolve; });
    const steps: string[] = [];
    const running = runGuardedSqliteLifecycle(() => undefined, tracker, 'sqlite:safe-operation-full', async () => {
      await tracker.run('sqlite:shared-operation-lock', () => { steps.push('attempt-1'); });
      pendingRetry();
      await holdRetry; // simula el backoff fuera de withDatabaseOperationLock
      await tracker.run('sqlite:shared-operation-lock', () => { steps.push('attempt-2'); });
    });
    await retryStarted;
    expect(tracker.snapshot().labels).toContain('sqlite:safe-operation-full');
    expect(tracker.snapshot().labels).not.toContain('sqlite:shared-operation-lock');
    const ticket = tracker.beginFreeze();
    try {
      let drained = false;
      const drain = tracker.waitForDrain(ticket).then(() => { drained = true; });
      await Promise.resolve();
      expect(drained).toBe(false);
      await expect(runGuardedSqliteLifecycle(() => undefined, tracker, 'sqlite:new', () => 1))
        .rejects.toThrow('suspendida');
      releaseRetry();
      await running;
      await drain;
      expect(steps).toEqual(['attempt-1', 'attempt-2']);
      expect(drained).toBe(true);
    } finally {
      tracker.abortFreeze(ticket);
    }
  });

  it('el estado de la conexión se publica antes de liberar la reserva', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    let completeOpen!: () => void;
    const opened = new Promise<void>(resolve => { completeOpen = resolve; });
    let status = 'anterior';
    const running = runGuardedSqliteLifecycle(() => undefined, tracker, 'sqlite:activate', async () => {
      await opened;
      status = 'activo';
      expect(tracker.snapshot().labels).toContain('sqlite:activate');
    });
    const ticket = tracker.beginFreeze();
    try {
      let drained = false;
      const drain = tracker.waitForDrain(ticket).then(() => { drained = true; });
      await Promise.resolve();
      expect(drained).toBe(false);
      completeOpen();
      await running;
      await drain;
      expect(status).toBe('activo');
    } finally {
      tracker.abortFreeze(ticket);
    }
  });

  it('si el propietario main ya no está admitido no inicia siquiera la operación', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    const operation = vi.fn(() => 'resultado');
    expect(() => runGuardedSqliteLifecycle(() => { throw new Error('worker owns db'); },
      tracker, 'sqlite:invalid', operation)).toThrow('worker owns db');
    expect(operation).not.toHaveBeenCalled();
    expect(tracker.snapshot().active).toBe(0);
  });
});

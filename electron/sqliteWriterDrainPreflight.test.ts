import { describe, expect, it } from 'vitest';
import { createSqliteIndependentActivityTracker } from './sqliteIndependentActivityTracker.js';
import { createSqliteWriterDrainPreflight, type DrainBackupState } from './sqliteWriterDrainPreflight.js';
import type { SqliteQueueState } from './sqliteEngineOwnershipFence.js';

const idleQueue: SqliteQueueState = { queuedOperations: 0, runningOperation: null, timedOut: false };
const idleBackup: DrainBackupState = {
  timerScheduled: false, pendingReason: false, pendingRevision: false, workRunning: false,
};

describe('PR9D-5D · preflight antes de ceder el escritor SQLite', () => {
  it('espera a la E/S activa y no admite nueva E/S después de congelar', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    let done!: () => void;
    const existing = tracker.run('backup:SMB', () => new Promise<void>(resolve => { done = resolve; }));
    const gate = createSqliteWriterDrainPreflight(tracker, () => idleQueue, () => idleBackup);
    let ready = false;
    const result = gate.prepare().then(ticket => { ready = true; return ticket; });
    expect(tracker.snapshot()).toMatchObject({ active: 1, frozen: true });
    await expect(tracker.run('sqlite:late-write', () => 42)).rejects.toThrow('suspendida');
    await Promise.resolve();
    expect(ready).toBe(false);
    done();
    await existing;
    const ticket = await result;
    gate.assertPrepared(ticket);
    gate.abortBeforeClose(ticket);
    expect(tracker.snapshot().frozen).toBe(false);
  });

  it('una copia programada impide preparar la cesión y restaura admisión', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    const gate = createSqliteWriterDrainPreflight(
      tracker, () => idleQueue,
      () => ({ ...idleBackup, timerScheduled: true }),
    );
    await expect(gate.prepare()).rejects.toThrow('copias');
    expect(tracker.snapshot().frozen).toBe(false);
    expect(await tracker.run('backup:normal', () => 1)).toBe(1);
  });

  it('una operación en cola o timeout incierto bloquea el preflight', async () => {
    for (const queue of [
      { ...idleQueue, queuedOperations: 1 },
      { ...idleQueue, runningOperation: 'tasks:save-record' },
      { ...idleQueue, timedOut: true },
    ]) {
      const tracker = createSqliteIndependentActivityTracker();
      const gate = createSqliteWriterDrainPreflight(tracker, () => queue, () => idleBackup);
      await expect(gate.prepare()).rejects.toThrow('cola SQLite');
      expect(tracker.snapshot().frozen).toBe(false);
    }
  });

  it('un ticket anterior no valida una segunda congelación', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    const gate = createSqliteWriterDrainPreflight(tracker, () => idleQueue, () => idleBackup);
    const old = await gate.prepare();
    gate.abortBeforeClose(old);
    const current = await gate.prepare();
    expect(() => gate.assertPrepared(old)).toThrow('obsoleto');
    expect(() => gate.abortBeforeClose(old)).toThrow('obsoleto');
    gate.assertPrepared(current);
    gate.abortBeforeClose(current);
  });
});

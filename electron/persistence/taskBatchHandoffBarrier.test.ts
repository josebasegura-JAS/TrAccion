import { describe, expect, it } from 'vitest';
import { runTaskBatchUnderHandoffBarrier, saveTaskRecordsAtomically } from './taskBatchPersistence.js';
import { sqliteIndependentActivityTracker } from '../sqliteIndependentActivityTracker.js';

describe('PR468: escritura masiva autónoma de Tareas y cesión SQLite', () => {
  it('registra una operación independiente antes de su primer await y drena al finalizar de verdad', async () => {
    let release!: () => void;
    const running = runTaskBatchUnderHandoffBarrier(
      () => new Promise<string>(resolve => { release = () => resolve('terminada'); }),
    );
    expect(sqliteIndependentActivityTracker.snapshot().labels).toContain('sqlite:task-batch-autonomous');
    const ticket = sqliteIndependentActivityTracker.beginFreeze();
    try {
      let drained = false;
      const drain = sqliteIndependentActivityTracker.waitForDrain(ticket)
        .then(() => { drained = true; });
      await Promise.resolve();
      expect(drained).toBe(false);
      await expect(runTaskBatchUnderHandoffBarrier(async () => 'no admitida')).rejects.toThrow('suspendida');
      release();
      await expect(running).resolves.toBe('terminada');
      await drain;
      expect(drained).toBe(true);
      expect(sqliteIndependentActivityTracker.snapshot().labels).not.toContain('sqlite:task-batch-autonomous');
    } finally {
      sqliteIndependentActivityTracker.abortFreeze(ticket);
    }
  });

  it('no permite abrir una conexión independiente ni para lote vacío después del freeze', async () => {
    const ticket = sqliteIndependentActivityTracker.beginFreeze();
    try {
      await expect(saveTaskRecordsAtomically([])).rejects.toThrow('suspendida');
    } finally {
      sqliteIndependentActivityTracker.abortFreeze(ticket);
    }
  });

  it('libera la reserva tras un rechazo de la operación, nunca antes', async () => {
    await expect(runTaskBatchUnderHandoffBarrier(async () => {
      expect(sqliteIndependentActivityTracker.snapshot().labels)
        .toContain('sqlite:task-batch-autonomous');
      throw new Error('simulated IO');
    })).rejects.toThrow('simulated IO');
    expect(sqliteIndependentActivityTracker.snapshot().labels)
      .not.toContain('sqlite:task-batch-autonomous');
  });
});

import { describe, expect, it } from 'vitest';
import { createSqliteIndependentActivityTracker } from './sqliteIndependentActivityTracker.js';
import { createSqliteMaintenanceGate } from './sqliteMaintenanceGate.js';

function deferred() {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  return { pending, release };
}

describe('Mantenimiento SQLite · admisión, drenaje y exclusión local', () => {
  it('el freeze rechaza nuevos VACUUM, restores y auditorías sin ejecutar callbacks', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    let executions = 0;
    let locks = 0;
    const gate = createSqliteMaintenanceGate({
      track: (label, operation) => tracker.run(label, operation),
      withExclusiveLock: async (_path, operation) => { locks++; return operation(); },
    });
    const ticket = tracker.beginFreeze();
    await expect(gate.runExclusive('vacuum', 'Z:/traccion.sqlite', () => {
      executions++;
      return Promise.resolve('vacuum');
    })).rejects.toThrow('suspendida');
    await expect(gate.run('restore-backup', () => { executions++; }))
      .rejects.toThrow('suspendida');
    await expect(gate.run('integrity-audit', () => { executions++; }))
      .rejects.toThrow('suspendida');
    expect(executions).toBe(0);
    expect(locks).toBe(0);
    tracker.abortFreeze(ticket);
  });

  it('drena solo después de concluir realmente una restauración pendiente', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    const gate = createSqliteMaintenanceGate({
      track: (label, operation) => tracker.run(label, operation),
      withExclusiveLock: async (_path, operation) => operation(),
    });
    const blocker = deferred();
    const restored = gate.run('restore-backup', () => blocker.pending);
    expect(tracker.snapshot()).toMatchObject({ active: 1, frozen: false });
    expect(tracker.snapshot().labels).toContain('sqlite:maintenance:restore-backup');
    const ticket = tracker.beginFreeze();
    let drained = false;
    const drain = tracker.waitForDrain(ticket).then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);
    blocker.release();
    await restored;
    await drain;
    expect(drained).toBe(true);
    tracker.abortFreeze(ticket);
  });

  it('VACUUM espera exclusión local incluso si ya obtuvo admisión de actividad', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    const first = deferred();
    let lockTail: Promise<unknown> = Promise.resolve();
    const gate = createSqliteMaintenanceGate({
      track: (label, operation) => tracker.run(label, operation),
      withExclusiveLock: async <T>(_path: string, operation: () => Promise<T>): Promise<T> => {
        const previous = lockTail;
        let done!: () => void;
        lockTail = new Promise<void>(resolve => { done = resolve; });
        await previous;
        try { return await operation(); } finally { done(); }
      },
    });
    const events: string[] = [];
    const writing = gate.runExclusive('save', 'Z:/traccion.sqlite', async () => {
      events.push('write:start');
      await first.pending;
      events.push('write:end');
    });
    const vacuum = gate.runExclusive('vacuum', 'Z:/traccion.sqlite', async () => {
      events.push('vacuum:start');
      events.push('vacuum:end');
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(['write:start']);
    expect(tracker.snapshot().active).toBe(2);
    first.release();
    await Promise.all([writing, vacuum]);
    expect(events).toEqual(['write:start', 'write:end', 'vacuum:start', 'vacuum:end']);
    expect(tracker.snapshot().active).toBe(0);
  });

  it('fallos de backup no liberan prematuramente ni se convierten en éxito', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    const gate = createSqliteMaintenanceGate({
      track: (label, operation) => tracker.run(label, operation),
      withExclusiveLock: async (_path, operation) => operation(),
    });
    const blocker = deferred();
    const job = gate.run('manual-backup', async () => {
      await blocker.pending;
      throw new Error('SMB desconectada');
    });
    const ticket = tracker.beginFreeze();
    let drained = false;
    const drain = tracker.waitForDrain(ticket).then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);
    blocker.release();
    await expect(job).rejects.toThrow('SMB desconectada');
    await drain;
    expect(drained).toBe(true);
    tracker.abortFreeze(ticket);
  });

  it('rechaza nombre o ruta vacía antes de tocar SQLite', async () => {
    let called = false;
    const gate = createSqliteMaintenanceGate({
      track: async (_label, operation) => { called = true; return operation(); },
      withExclusiveLock: async (_path, operation) => operation(),
    });
    await expect(gate.run('', () => 'x')).rejects.toThrow('identificador');
    await expect(gate.runExclusive('vacuum', ' ', async () => 'x')).rejects.toThrow('ruta');
    expect(called).toBe(false);
  });
});

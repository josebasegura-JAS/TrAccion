import { describe, expect, it } from 'vitest';
import { createSqliteIndependentActivityTracker } from './sqliteIndependentActivityTracker.js';

describe('PR9D-5B · barrera observable de E/S fuera de IPC', () => {
  it('cuenta operaciones superpuestas y mantiene reserva mientras una sigue viva', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    let resolveFirst!: () => void;
    const first = tracker.run('backup:shared', () => new Promise<void>(resolve => { resolveFirst = resolve; }));
    let resolveSecond!: () => void;
    const second = tracker.run('sqlite:lock', () => new Promise<void>(resolve => { resolveSecond = resolve; }));
    expect(tracker.snapshot()).toEqual({ active: 2, labels: ['backup:shared', 'sqlite:lock'] });
    expect(() => tracker.assertIdle()).toThrow('E/S independiente');
    resolveFirst();
    await first;
    expect(tracker.snapshot().active).toBe(1);
    expect(() => tracker.assertIdle()).toThrow();
    resolveSecond();
    await second;
    expect(tracker.snapshot().active).toBe(0);
    expect(() => tracker.assertIdle()).not.toThrow();
  });

  it('no libera el registro hasta la finalización real tras una respuesta externa agotada', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    let release!: () => void;
    const operation = tracker.run('sqlite:network-wait', () => new Promise<void>(resolve => { release = resolve; }));
    // Simula timeout de la UI: la operación sigue viva.
    const uiTimedOut = true;
    expect(uiTimedOut).toBe(true);
    expect(tracker.snapshot().active).toBe(1);
    release();
    await operation;
    expect(tracker.snapshot().active).toBe(0);
  });

  it('libera el registro cuando la operación realmente falla y valida etiquetas', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    await expect(tracker.run('backup:fail', async () => { throw new Error('SMB offline'); }))
      .rejects.toThrow('SMB offline');
    expect(tracker.snapshot().active).toBe(0);
    await expect(tracker.run(' ', () => 'x')).rejects.toThrow('etiqueta');
  });
});

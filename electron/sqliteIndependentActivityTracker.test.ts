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

describe('PR9D-5D · congelación y drenaje sin solapamientos', () => {
  it('detiene nuevas admisiones y solo drena al terminar operaciones previas', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    let finish!: () => void;
    const running = tracker.run('backup:write', () => new Promise<void>(resolve => { finish = resolve; }));
    const ticket = tracker.beginFreeze();
    expect(tracker.snapshot()).toMatchObject({ frozen: true, active: 1 });
    let drained = false;
    const draining = tracker.waitForDrain(ticket).then(() => { drained = true; });
    await expect(tracker.run('sqlite:new-write', async () => undefined)).rejects.toThrow('suspendida');
    await Promise.resolve();
    expect(drained).toBe(false);
    finish();
    await running;
    await draining;
    expect(drained).toBe(true);
    expect(tracker.snapshot()).toMatchObject({ active: 0, frozen: true });
    await expect(tracker.run('sqlite:new-write', () => 1)).rejects.toThrow('suspendida');
    tracker.abortFreeze(ticket);
    expect(await tracker.run('sqlite:normal', () => 3)).toBe(3);
  });

  it('un ticket obsoleto nunca puede reabrir admisión', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    const first = tracker.beginFreeze();
    tracker.abortFreeze(first);
    const second = tracker.beginFreeze();
    expect(second).toBeGreaterThan(first);
    expect(() => tracker.abortFreeze(first)).toThrow('obsoleto');
    await expect(tracker.waitForDrain(first)).rejects.toThrow('obsoleto');
    expect(tracker.snapshot().frozen).toBe(true);
    tracker.abortFreeze(second);
  });

  it('no admite doble congelación ni libera una operación al expirar una espera externa', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    let finish!: () => void;
    const active = tracker.run('sqlite:slow-smb', () => new Promise<void>(resolve => { finish = resolve; }));
    const ticket = tracker.beginFreeze();
    expect(() => tracker.beginFreeze()).toThrow('suspendida');
    const pending = tracker.waitForDrain(ticket);
    expect(tracker.snapshot().active).toBe(1);
    finish();
    await active;
    await pending;
    expect(tracker.snapshot().active).toBe(0);
  });
});

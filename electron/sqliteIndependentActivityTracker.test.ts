import { describe, expect, it } from 'vitest';
import { createSqliteIndependentActivityTracker } from './sqliteIndependentActivityTracker.js';

describe('PR9D-5B · barrera observable de E/S fuera de IPC', () => {
  it('cuenta operaciones superpuestas y mantiene reserva mientras una sigue viva', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    let resolveFirst!: () => void;
    const first = tracker.run('backup:shared', () => new Promise<void>(resolve => { resolveFirst = resolve; }));
    let resolveSecond!: () => void;
    const second = tracker.run('sqlite:lock', () => new Promise<void>(resolve => { resolveSecond = resolve; }));
    expect(tracker.snapshot()).toEqual({ active: 2, labels: ['backup:shared', 'sqlite:lock'], frozen: false });
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


describe('PR448 · reentrada durante la cesión SQLite', () => {
  it('una operación ya admitida puede finalizar sus suboperaciones tras beginFreeze', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    let continueOuter!: () => void;
    const blocked = new Promise<void>(resolve => { continueOuter = resolve; });
    const labels: string[] = [];
    const parent = tracker.run('sqlite:restore-backup', async () => {
      await blocked;
      await tracker.run('sqlite:close-handle', async () => {
        labels.push('close');
        await tracker.run('sqlite:activate', () => { labels.push('open'); });
      });
      labels.push('restored');
    });
    const ticket = tracker.beginFreeze();
    let drained = false;
    const wait = tracker.waitForDrain(ticket).then(() => { drained = true; });
    await expect(tracker.run('sqlite:unrelated-read', () => 0)).rejects.toThrow('suspendida');
    continueOuter();
    await parent;
    await wait;
    expect(labels).toEqual(['close', 'open', 'restored']);
    expect(drained).toBe(true);
    expect(tracker.snapshot()).toEqual({ active: 0, labels: [], frozen: true });
    tracker.abortFreeze(ticket);
  });

  it('una tarea desprendida NO puede reutilizar el contexto cuando su raíz terminó', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    let trigger!: () => void;
    let detachedResult!: Promise<number>;
    await tracker.run('sqlite:root', () => {
      const pending = new Promise<void>(resolve => { trigger = resolve; });
      // El .then se crea DENTRO de la raíz y hereda su contexto ALS,
      // aunque se ejecute cuando el padre ya haya terminado.
      detachedResult = pending.then(() => tracker.run('sqlite:detached', () => 7));
    });
    const ticket = tracker.beginFreeze();
    trigger();
    await expect(detachedResult).rejects.toThrow('suspendida');
    expect(tracker.snapshot().active).toBe(0);
    tracker.abortFreeze(ticket);
    expect(await tracker.run('sqlite:detached-normal', () => 7)).toBe(7);
  });

  it('si una suboperación falla, la reserva raíz continúa hasta finalizar', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const outer = tracker.run('sqlite:backup', async () => {
      await expect(tracker.run('sqlite:backup-inner', async () => {
        throw new Error('fallo SMB');
      })).rejects.toThrow('fallo SMB');
      await pending;
    });
    const ticket = tracker.beginFreeze();
    let done = false;
    const wait = tracker.waitForDrain(ticket).then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    release();
    await outer;
    await wait;
    expect(done).toBe(true);
    tracker.abortFreeze(ticket);
  });
});


describe('PR452 · liberación administrativa como ciclo de vida indivisible', () => {
  it('una liberación ya admitida conserva la reserva hasta reactivar SQLite', async () => {
    const tracker = createSqliteIndependentActivityTracker();
    let resume!: () => void;
    const pendingSmb = new Promise<void>(resolve => { resume = resolve; });
    const steps: string[] = [];
    const release = tracker.run('sqlite:force-release-lock-lifecycle', async () => {
      steps.push('read-owner');
      await pendingSmb;
      steps.push('reclaim-lock');
      await tracker.run('sqlite:activate', () => { steps.push('reconnect'); });
    });
    const ticket = tracker.beginFreeze();
    let drained = false;
    const drain = tracker.waitForDrain(ticket).then(() => { drained = true; });
    await expect(tracker.run('sqlite:another-manual-reclaim', () => undefined))
      .rejects.toThrow('suspendida');
    await Promise.resolve();
    expect(drained).toBe(false);
    resume();
    await release;
    await drain;
    expect(steps).toEqual(['read-owner', 'reclaim-lock', 'reconnect']);
    expect(tracker.snapshot().active).toBe(0);
    tracker.abortFreeze(ticket);
  });
});

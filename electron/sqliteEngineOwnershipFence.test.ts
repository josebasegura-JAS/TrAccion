import { describe, expect, it } from 'vitest';
import { createSqliteEngineOwnershipFence, type SqliteQueueState } from './sqliteEngineOwnershipFence.js';

const idle: SqliteQueueState = { queuedOperations: 0, runningOperation: null, timedOut: false };

describe('PR9D-3 · propiedad exclusiva SQLite y cuarentena', () => {
  it('mantiene main por defecto, sin cambiar uso habitual', () => {
    const fence = createSqliteEngineOwnershipFence();
    expect(fence.snapshot()).toEqual({ owner: 'main', generation: 0 });
    expect(() => fence.assertMayEnterMain()).not.toThrow();
  });

  it('no inicia cesión con operación activa, pendiente o timeout incierto', () => {
    const fence = createSqliteEngineOwnershipFence();
    expect(() => fence.beginHandoff({ ...idle, runningOperation: 'tasks:save-record' })).toThrow();
    expect(() => fence.beginHandoff({ ...idle, queuedOperations: 1 })).toThrow();
    expect(() => fence.beginHandoff({ ...idle, timedOut: true })).toThrow();
    expect(fence.snapshot().owner).toBe('main');
  });

  it('bloquea nuevas entradas desde que comienza handoff, y exige cierre antes de worker', () => {
    const fence = createSqliteEngineOwnershipFence();
    const ticket = fence.beginHandoff(idle);
    expect(() => fence.assertMayEnterMain()).toThrow();
    expect(() => fence.confirmWorkerStarted(ticket)).toThrow();
    fence.confirmMainHandleClosed(ticket);
    expect(fence.snapshot().owner).toBe('main-closed');
    expect(() => fence.assertMayEnterMain()).toThrow();
    fence.confirmWorkerStarted(ticket);
    expect(fence.snapshot().owner).toBe('worker');
    expect(() => fence.assertMayEnterMain()).toThrow();
    expect(() => fence.beginHandoff(idle)).toThrow();
  });

  it('permite cancelar solo antes de cerrar el handle y nunca después', () => {
    const fence = createSqliteEngineOwnershipFence();
    const ticket = fence.beginHandoff(idle);
    fence.abortBeforeClose(ticket);
    expect(fence.snapshot().owner).toBe('main');
    const next = fence.beginHandoff(idle);
    expect(next).toBeGreaterThan(ticket);
    expect(() => fence.abortBeforeClose(ticket)).toThrow();
    fence.confirmMainHandleClosed(next);
    expect(() => fence.abortBeforeClose(next)).toThrow();
  });

  it('una respuesta tardía de una generación anterior no libera el motor', () => {
    const fence = createSqliteEngineOwnershipFence();
    const previous = fence.beginHandoff(idle);
    fence.abortBeforeClose(previous);
    const current = fence.beginHandoff(idle);
    fence.confirmMainHandleClosed(current);
    expect(() => fence.confirmWorkerStarted(previous)).toThrow();
    fence.confirmWorkerStarted(current);
    expect(() => fence.markWorkerExited(previous)).toThrow();
    expect(fence.snapshot().owner).toBe('worker');
  });

  it('una caída no confirmada jamás autoriza reapertura desde main', () => {
    const fence = createSqliteEngineOwnershipFence();
    const ticket = fence.beginHandoff(idle);
    fence.confirmMainHandleClosed(ticket);
    fence.confirmWorkerStarted(ticket);
    fence.markWorkerUncertain(ticket);
    expect(fence.snapshot().owner).toBe('quarantine');
    expect(() => fence.restoreMainAfterVerification(ticket, idle, true, true)).toThrow('salida');
    expect(() => fence.assertMayEnterMain()).toThrow();
    fence.markWorkerExited(ticket);
    expect(() => fence.restoreMainAfterVerification(ticket, idle, false, true)).toThrow();
    expect(() => fence.restoreMainAfterVerification(ticket, idle, true, false)).toThrow();
    expect(() => fence.restoreMainAfterVerification(ticket, { ...idle, queuedOperations: 1 }, true, true)).toThrow();
    fence.restoreMainAfterVerification(ticket, idle, true, true);
    expect(fence.snapshot().owner).toBe('main');
  });

  it('exit(0) del worker tampoco rehabilita por sí mismo escrituras', () => {
    const fence = createSqliteEngineOwnershipFence();
    const ticket = fence.beginHandoff(idle);
    fence.confirmMainHandleClosed(ticket);
    fence.confirmWorkerStarted(ticket);
    fence.markWorkerExited(ticket);
    expect(fence.snapshot().owner).toBe('quarantine');
    expect(() => fence.assertMayEnterMain()).toThrow();
  });
});

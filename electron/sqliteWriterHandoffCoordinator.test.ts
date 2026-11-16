import { describe, expect, it, vi } from 'vitest';
import { createSqliteEngineOwnershipFence, type SqliteQueueState } from './sqliteEngineOwnershipFence.js';
import { createSqliteWriterHandoffCoordinator } from './sqliteWriterHandoffCoordinator.js';
import { createSqliteIndependentActivityTracker } from './sqliteIndependentActivityTracker.js';

const idle: SqliteQueueState = { queuedOperations: 0, runningOperation: null, timedOut: false };

function fixture() {
  const fence = createSqliteEngineOwnershipFence();
  const independentActivity = createSqliteIndependentActivityTracker();
  const inspectQueue = vi.fn(() => idle);
  const assertNoIndependentSqliteActivity = vi.fn(async (): Promise<void> => undefined);
  const closeMainHandle = vi.fn(async () => undefined);
  const startWriter = vi.fn(async (generation: number) => ({ generation }));
  const coordinator = createSqliteWriterHandoffCoordinator(fence, {
    inspectQueue, assertNoIndependentSqliteActivity, closeMainHandle, startWriter, independentActivity,
  });
  return { fence, coordinator, independentActivity, inspectQueue, assertNoIndependentSqliteActivity, closeMainHandle, startWriter };
}

describe('PR9D-5A · cesión segura del propietario SQLite', () => {
  it('cierra main antes de iniciar worker; no permite usar main durante la cesión', async () => {
    const f = fixture();
    f.closeMainHandle.mockImplementation(async () => {
      expect(f.fence.snapshot().owner).toBe('draining');
      expect(() => f.fence.assertMayEnterMain()).toThrow();
    });
    f.startWriter.mockImplementation(async (generation) => {
      expect(f.closeMainHandle).toHaveBeenCalledTimes(1);
      expect(f.fence.snapshot().owner).toBe('main-closed');
      return { generation };
    });
    const generation = await f.coordinator.handoff();
    expect(generation).toBe(1);
    expect(f.fence.snapshot().owner).toBe('worker');
    expect(f.independentActivity.snapshot().frozen).toBe(true);
  });

  it('aborta sin cerrar cuando existen operaciones en cola', async () => {
    const f = fixture();
    f.inspectQueue.mockReturnValue({ ...idle, queuedOperations: 1 });
    await expect(f.coordinator.handoff()).rejects.toThrow('No se puede ceder');
    expect(f.closeMainHandle).not.toHaveBeenCalled();
    expect(f.fence.snapshot().owner).toBe('main');
  });

  it('recupera main si falla una comprobación PREVIA al cierre', async () => {
    const f = fixture();
    f.assertNoIndependentSqliteActivity.mockRejectedValue(new Error('Backup activo'));
    await expect(f.coordinator.handoff()).rejects.toThrow('Backup activo');
    expect(f.fence.snapshot().owner).toBe('main');
    expect(f.independentActivity.snapshot().frozen).toBe(false);
    expect(f.closeMainHandle).not.toHaveBeenCalled();
    expect(f.startWriter).not.toHaveBeenCalled();
  });

  it('congela nuevas E/S independientes y espera a que una lectura activa termine REALMENTE', async () => {
    const f = fixture();
    let release!: () => void;
    const pendingRead = new Promise<void>((resolve) => { release = resolve; });
    const reader = f.independentActivity.run('tokens:readonly-worker', () => pendingRead);
    const handoff = f.coordinator.handoff();

    expect(f.fence.snapshot().owner).toBe('draining');
    expect(f.independentActivity.snapshot()).toMatchObject({
      frozen: true,
      active: 1,
    });
    expect(f.closeMainHandle).not.toHaveBeenCalled();
    await expect(f.independentActivity.run('late:heartbeat', async () => undefined))
      .rejects.toThrow('suspendida');

    release();
    await reader;
    const generation = await handoff;
    expect(generation).toBe(1);
    expect(f.closeMainHandle).toHaveBeenCalledTimes(1);
    expect(f.independentActivity.snapshot().frozen).toBe(true);
  });

  it('mantiene freeze durante un preflight asíncrono y no acepta nuevos trabajos', async () => {
    const f = fixture();
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    f.assertNoIndependentSqliteActivity.mockImplementation(async () => pending);
    const handoff = f.coordinator.handoff();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.independentActivity.snapshot().frozen).toBe(true);
    await expect(f.independentActivity.run('backup:tardy', async () => undefined))
      .rejects.toThrow('suspendida');
    expect(f.startWriter).not.toHaveBeenCalled();
    release();
    await handoff;
    expect(f.startWriter).toHaveBeenCalledTimes(1);
  });

  it('si el cierre devuelve error queda bloqueado y NUNCA inicia worker', async () => {
    const f = fixture();
    f.closeMainHandle.mockRejectedValue(new Error('Cierre de SQLite incierto'));
    await expect(f.coordinator.handoff()).rejects.toThrow('Cierre de SQLite incierto');
    expect(f.fence.snapshot().owner).toBe('draining');
    expect(f.independentActivity.snapshot().frozen).toBe(true);
    expect(f.startWriter).not.toHaveBeenCalled();
    expect(() => f.fence.assertMayEnterMain()).toThrow();
  });

  it('si falla el arranque del hijo NO vuelve a main tras cerrar su handle', async () => {
    const f = fixture();
    f.startWriter.mockRejectedValue(new Error('Proceso no disponible'));
    await expect(f.coordinator.handoff()).rejects.toThrow('Proceso no disponible');
    expect(f.fence.snapshot().owner).toBe('main-closed');
    expect(f.independentActivity.snapshot().frozen).toBe(true);
    expect(() => f.fence.assertMayEnterMain()).toThrow();
    await expect(f.coordinator.handoff()).rejects.toThrow('ya está iniciada');
  });

  it('no acepta READY de una generación distinta', async () => {
    const f = fixture();
    f.startWriter.mockImplementation(async (generation) => ({ generation: generation + 1 }));
    await expect(f.coordinator.handoff()).rejects.toThrow('generación');
    expect(f.fence.snapshot().owner).toBe('main-closed');
  });

  it('no reabre hasta exit confirmado, identidad correcta y escrituras conciliadas', async () => {
    const f = fixture();
    const generation = await f.coordinator.handoff();
    f.coordinator.workerUncertain(generation);
    expect(() => f.coordinator.restoreMainAfterReconciliation(generation, true, true)).toThrow('salida');
    f.coordinator.workerExited(generation);
    expect(() => f.coordinator.restoreMainAfterReconciliation(generation, false, true)).toThrow();
    expect(() => f.coordinator.restoreMainAfterReconciliation(generation, true, false)).toThrow();
    f.coordinator.restoreMainAfterReconciliation(generation, true, true);
    expect(f.fence.snapshot().owner).toBe('main');
    expect(f.independentActivity.snapshot().frozen).toBe(false);
  });

  it('PR476: exit real no permite restaurar main si existe una escritura enviada sin conciliar', async () => {
    const f = fixture();
    const generation = await f.coordinator.handoff();
    f.coordinator.registerWriterOperation('save:pending', generation);
    f.coordinator.acknowledgeWriterOperation('save:pending', generation);
    f.coordinator.workerExited(generation);
    expect(f.fence.snapshot().owner).toBe('quarantine');
    expect(f.coordinator.pendingWriterOperationIds(generation)).toEqual(['save:pending']);
    expect(() => f.coordinator.restoreMainAfterReconciliation(generation, true, true))
      .toThrow('pendientes');
    expect(f.independentActivity.snapshot().frozen).toBe(true);
    f.coordinator.reconcileWriterOperation('save:pending', generation);
    expect(f.coordinator.pendingWriterOperationIds(generation)).toEqual([]);
    f.coordinator.restoreMainAfterReconciliation(generation, true, true);
    expect(f.fence.snapshot().owner).toBe('main');
    expect(f.independentActivity.snapshot().frozen).toBe(false);
  });

  it('PR476: kill solicitado no permite conciliar ni restaurar antes de exit', async () => {
    const f = fixture();
    const generation = await f.coordinator.handoff();
    f.coordinator.registerWriterOperation('save:uncertain', generation);
    f.coordinator.workerUncertain(generation);
    expect(f.coordinator.pendingWriterOperationIds(generation)).toEqual(['save:uncertain']);
    expect(() => f.coordinator.restoreMainAfterReconciliation(generation, true, true))
      .toThrow('pendientes');
    expect(() => f.coordinator.reconcileWriterOperation('save:uncertain', generation))
      .not.toThrow();
    expect(() => f.coordinator.restoreMainAfterReconciliation(generation, true, true))
      .toThrow('salida');
    expect(f.independentActivity.snapshot().frozen).toBe(true);
    f.coordinator.workerExited(generation);
    f.coordinator.restoreMainAfterReconciliation(generation, true, true);
  });

  it('PR476: evita registrar o reconocer escrituras de generación ajena', async () => {
    const f = fixture();
    const generation = await f.coordinator.handoff();
    expect(() => f.coordinator.registerWriterOperation('save:wrong', generation + 1))
      .toThrow('generación');
    expect(() => f.coordinator.acknowledgeWriterOperation('save:wrong', generation))
      .toThrow('desconocida');
    f.coordinator.registerWriterOperation('save:correct', generation);
    expect(() => f.coordinator.registerWriterOperation('save:correct', generation))
      .toThrow('duplicado');
    f.coordinator.workerUncertain(generation);
    expect(() => f.coordinator.registerWriterOperation('save:late', generation))
      .toThrow('generación');
    expect(() => f.coordinator.reconcileWriterOperation('save:correct', generation + 1))
      .toThrow('generación');
  });

  it('PR476: dos escrituras pendientes requieren conciliación individual', async () => {
    const f = fixture();
    const generation = await f.coordinator.handoff();
    f.coordinator.registerWriterOperation('save:first', generation);
    f.coordinator.registerWriterOperation('save:second', generation);
    f.coordinator.workerExited(generation);
    f.coordinator.reconcileWriterOperation('save:first', generation);
    expect(() => f.coordinator.restoreMainAfterReconciliation(generation, true, true))
      .toThrow('pendientes');
    expect(f.coordinator.pendingWriterOperationIds(generation)).toEqual(['save:second']);
    f.coordinator.reconcileWriterOperation('save:second', generation);
    f.coordinator.restoreMainAfterReconciliation(generation, true, true);
    expect(f.fence.snapshot().owner).toBe('main');
  });

});

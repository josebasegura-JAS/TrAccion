import { describe, expect, it, vi } from 'vitest';
import { createSqliteEngineOwnershipFence, type SqliteQueueState } from './sqliteEngineOwnershipFence.js';
import { createSqliteWriterHandoffCoordinator } from './sqliteWriterHandoffCoordinator.js';

const idle: SqliteQueueState = { queuedOperations: 0, runningOperation: null, timedOut: false };

function fixture() {
  const fence = createSqliteEngineOwnershipFence();
  const inspectQueue = vi.fn(() => idle);
  const assertNoIndependentSqliteActivity = vi.fn(async () => undefined);
  const closeMainHandle = vi.fn(async () => undefined);
  const startWriter = vi.fn(async (generation: number) => ({ generation }));
  const coordinator = createSqliteWriterHandoffCoordinator(fence, {
    inspectQueue, assertNoIndependentSqliteActivity, closeMainHandle, startWriter,
  });
  return { fence, coordinator, inspectQueue, assertNoIndependentSqliteActivity, closeMainHandle, startWriter };
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
    expect(f.closeMainHandle).not.toHaveBeenCalled();
    expect(f.startWriter).not.toHaveBeenCalled();
  });

  it('si el cierre devuelve error queda bloqueado y NUNCA inicia worker', async () => {
    const f = fixture();
    f.closeMainHandle.mockRejectedValue(new Error('Cierre de SQLite incierto'));
    await expect(f.coordinator.handoff()).rejects.toThrow('Cierre de SQLite incierto');
    expect(f.fence.snapshot().owner).toBe('draining');
    expect(f.startWriter).not.toHaveBeenCalled();
    expect(() => f.fence.assertMayEnterMain()).toThrow();
  });

  it('si falla el arranque del hijo NO vuelve a main tras cerrar su handle', async () => {
    const f = fixture();
    f.startWriter.mockRejectedValue(new Error('Proceso no disponible'));
    await expect(f.coordinator.handoff()).rejects.toThrow('Proceso no disponible');
    expect(f.fence.snapshot().owner).toBe('main-closed');
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
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueAuditEvent } from '../../../shared/audit/auditTrail';
import { type Task, type TaskDraft } from '../domain/task';
import { updateTaskWithConcurrencyCheck, removeTaskWithConcurrencyCheck, type TaskCrudState } from './taskCrud';
import { persistTaskDirectly, readTasksForStore } from './taskPersistence';
import { hasTaskSqliteRepository } from './taskSqliteRepository';
import { saveSharedArrayRecord } from '../../../services/sharedRecordPersistence';

vi.mock('../../../shared/audit/auditTrail', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../shared/audit/auditTrail')>();
  return { ...original, enqueueAuditEvent: vi.fn() };
});
vi.mock('./taskPersistence', () => ({
  persistTaskDirectly: vi.fn(),
  readTasksForStore: vi.fn(),
  TASKS_STORAGE_KEY: 'traccion.v1.tareas.tasks',
}));
vi.mock('./taskSqliteRepository', () => ({
  hasTaskSqliteRepository: vi.fn(),
  saveTasksToSqliteAtomically: vi.fn(),
}));
vi.mock('../../../services/sharedRecordPersistence', () => ({
  saveSharedArrayRecord: vi.fn(),
  saveNewSharedArrayRecord: vi.fn(),
}));

const task: Task = {
  id: 'task-audit-1', titulo: 'Antes', descripcion: 'Descripción', tipo: 'interna',
  fase: 'tarea', estado: 'pendiente', prioridad: 'media', fechaLimite: '',
  responsable: 'RRLL', origen: '', sindicato: '', observaciones: '', mail: '',
  documentLinks: [], sessionDocumentCode: '', sessionModule: '', sessionDate: '',
  seguimiento: [], createdAt: '2026-11-10T08:00:00.000Z',
  updatedAt: '2026-11-10T08:00:00.000Z', deletedAt: null, closedAt: null,
};

const updatedDraft: TaskDraft = {
  titulo: 'Después', descripcion: task.descripcion, tipo: task.tipo,
  fase: task.fase, estado: task.estado, prioridad: task.prioridad,
  fechaLimite: task.fechaLimite, responsable: task.responsable,
  origen: task.origen, sindicato: task.sindicato, observaciones: task.observaciones,
  mail: task.mail, documentLinks: task.documentLinks,
};

function buildState() {
  let current: TaskCrudState = { tasks: [task], selectedTaskId: task.id };
  const setState = (change: Partial<TaskCrudState> | ((state: TaskCrudState) => Partial<TaskCrudState>)) => {
    current = { ...current, ...(typeof change === 'function' ? change(current) : change) };
  };
  return { setState, getState: () => current };
}

describe('auditoría de Tareas después de confirmar el guardado', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(hasTaskSqliteRepository).mockReturnValue(true);
    vi.mocked(readTasksForStore).mockResolvedValue([task]);
  });

  it('no registra cambios cuando SQLite rechaza el guardado', async () => {
    vi.mocked(persistTaskDirectly).mockResolvedValue({ ok: false, message: 'Conflicto OCC' });
    const state = buildState();
    const result = await updateTaskWithConcurrencyCheck(task.id, updatedDraft, undefined, task.updatedAt, state.setState);
    expect(result.ok).toBe(false);
    expect(enqueueAuditEvent).not.toHaveBeenCalled();
    expect(state.getState().tasks[0].titulo).toBe('Antes');
  });

  it('no registra cambios cuando SQLite falla después de construir el borrador', async () => {
    vi.mocked(persistTaskDirectly).mockRejectedValue(new Error('SMB no disponible'));
    const result = await updateTaskWithConcurrencyCheck(task.id, updatedDraft, undefined, task.updatedAt, buildState().setState);
    expect(result.ok).toBe(false);
    expect(enqueueAuditEvent).not.toHaveBeenCalled();
  });

  it('registra exactamente una modificación tras confirmar el guardado directo', async () => {
    vi.mocked(persistTaskDirectly).mockResolvedValue({ ok: true, message: 'Guardado' });
    const state = buildState();
    const result = await updateTaskWithConcurrencyCheck(task.id, updatedDraft, undefined, task.updatedAt, state.setState);
    expect(result.ok).toBe(true);
    expect(state.getState().tasks[0].titulo).toBe('Después');
    expect(enqueueAuditEvent).toHaveBeenCalledTimes(1);
    expect(enqueueAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      module: 'tareas', entityId: task.id, action: 'updated',
    }));
  });

  it('la ruta de almacenamiento compartido tampoco audita si se rechaza la actualización', async () => {
    vi.mocked(hasTaskSqliteRepository).mockReturnValue(false);
    vi.mocked(saveSharedArrayRecord).mockImplementation(async (options) => {
      options.updateRecord(task as never);
      throw new Error('Conflicto de almacenamiento');
    });
    const result = await updateTaskWithConcurrencyCheck(task.id, updatedDraft, undefined, task.updatedAt, buildState().setState);
    expect(result.ok).toBe(false);
    expect(enqueueAuditEvent).not.toHaveBeenCalled();
  });

  it('la ruta compartida audita una sola vez después de confirmar la actualización', async () => {
    vi.mocked(hasTaskSqliteRepository).mockReturnValue(false);
    vi.mocked(saveSharedArrayRecord).mockImplementation(async (options) => {
      const updatedRecord = options.updateRecord(task as never);
      return { records: [updatedRecord], updatedRecord } as never;
    });
    const result = await updateTaskWithConcurrencyCheck(task.id, updatedDraft, undefined, task.updatedAt, buildState().setState);
    expect(result.ok).toBe(true);
    expect(enqueueAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('tampoco registra una eliminación fallida en la ruta compartida', async () => {
    vi.mocked(hasTaskSqliteRepository).mockReturnValue(false);
    vi.mocked(saveSharedArrayRecord).mockImplementation(async (options) => {
      options.updateRecord(task as never);
      throw new Error('Guardado rechazado');
    });
    const result = await removeTaskWithConcurrencyCheck(task.id, task.updatedAt, buildState().setState);
    expect(result.ok).toBe(false);
    expect(enqueueAuditEvent).not.toHaveBeenCalled();
  });
});

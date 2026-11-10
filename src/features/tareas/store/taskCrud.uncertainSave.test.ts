import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueAuditEvent } from '../../../shared/audit/auditTrail';
import type { Task, TaskDraft } from '../domain/task';
import { updateTaskWithConcurrencyCheck, type TaskCrudState } from './taskCrud';
import { persistTaskDirectly, readTasksForStore } from './taskPersistence';
import { hasTaskSqliteRepository } from './taskSqliteRepository';

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
  hasTaskSqliteRepository: vi.fn(() => true),
  saveTasksToSqliteAtomically: vi.fn(),
}));

const task: Task = {
  id: 'task-timeout', titulo: 'Antes', descripcion: '', tipo: 'interna',
  fase: 'tarea', estado: 'pendiente', prioridad: 'media', fechaLimite: '',
  responsable: '', origen: '', sindicato: '', observaciones: '', mail: '',
  documentLinks: [], sessionDocumentCode: '', sessionModule: '', sessionDate: '',
  seguimiento: [], createdAt: '2026-11-10T08:00:00.000Z',
  updatedAt: '2026-11-10T08:00:00.000Z', deletedAt: null, closedAt: null,
};
const draft: TaskDraft = {
  titulo: 'Después', descripcion: '', tipo: 'interna', fase: 'tarea',
  estado: 'pendiente', prioridad: 'media', fechaLimite: '', responsable: '',
  origen: '', sindicato: '', observaciones: '', mail: '', documentLinks: [],
};
function state() {
  let value: TaskCrudState = { tasks: [task], selectedTaskId: task.id };
  const set = (patch: Partial<TaskCrudState> | ((state: TaskCrudState) => Partial<TaskCrudState>)) => {
    value = { ...value, ...(typeof patch === 'function' ? patch(value) : patch) };
  };
  return { set, current: () => value };
}
const save = vi.mocked(persistTaskDirectly);
const read = vi.mocked(readTasksForStore);

describe('Tareas: resolver un guardado de resultado incierto sin reintento', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(hasTaskSqliteRepository).mockReturnValue(true);
    read.mockResolvedValue([task]);
  });

  it('verifica el guardado tardío mediante un ID propio y audita una sola vez', async () => {
    let attempted: Task | null = null;
    save.mockImplementation(async (value) => {
      attempted = value;
      return { ok: false, message: '[sqlite-ipc-queue] tasks:save-record-if-unchanged superó el límite de 12000 ms. El resultado es indeterminado; la operación puede seguir en curso.' };
    });
    const s = state();
    const first = await updateTaskWithConcurrencyCheck(task.id, draft, undefined, task.updatedAt, s.set);
    expect(first.ok).toBe(false);
    expect(enqueueAuditEvent).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(attempted).not.toBeNull();
    const actualSaved = attempted as Task | null;
    expect(actualSaved?.lastSaveAttemptId).toBeTruthy();

    read.mockResolvedValue([actualSaved as Task]);
    const second = await updateTaskWithConcurrencyCheck(task.id, draft, undefined, task.updatedAt, s.set);
    expect(second.ok).toBe(true);
    expect(second.message).toContain('confirmado');
    expect(save).toHaveBeenCalledTimes(1);
    expect(enqueueAuditEvent).toHaveBeenCalledTimes(1);
    expect(s.current().tasks[0].titulo).toBe('Después');
  });

  it('si SQLite aún no permite leer, mantiene el resultado incierto sin otro guardado', async () => {
    save.mockResolvedValueOnce({ ok: false, message: 'superó el límite de 12000 ms. El resultado es indeterminado' });
    const s = state();
    await updateTaskWithConcurrencyCheck(task.id, draft, undefined, task.updatedAt, s.set);
    read.mockRejectedValueOnce(new Error('Operación anterior todavía ejecutándose'));
    const second = await updateTaskWithConcurrencyCheck(task.id, draft, undefined, task.updatedAt, s.set);
    expect(second.ok).toBe(false);
    expect(second.message).toContain('sin poder verificarse');
    expect(save).toHaveBeenCalledTimes(1);
    expect(enqueueAuditEvent).not.toHaveBeenCalled();
  });

  it('si la escritura no se aplicó, informa sin reenviar el guardado', async () => {
    save.mockResolvedValueOnce({ ok: false, message: 'superó el límite de 12000 ms. El resultado es indeterminado' });
    const s = state();
    await updateTaskWithConcurrencyCheck(task.id, draft, undefined, task.updatedAt, s.set);
    const second = await updateTaskWithConcurrencyCheck(task.id, draft, undefined, task.updatedAt, s.set);
    expect(second.ok).toBe(false);
    expect(second.message).toContain('no figura en SQLite');
    expect(save).toHaveBeenCalledTimes(1);
    expect(enqueueAuditEvent).not.toHaveBeenCalled();
  });

  it('si otra versión sustituyó el registro, no atribuye su cambio al primer guardado', async () => {
    save.mockResolvedValueOnce({ ok: false, message: 'superó el límite de 12000 ms. El resultado es indeterminado' });
    const s = state();
    await updateTaskWithConcurrencyCheck(task.id, draft, undefined, task.updatedAt, s.set);
    read.mockResolvedValue([{ ...task, titulo: 'Edición ajena', updatedAt: '2026-11-10T09:00:00.000Z', lastSaveAttemptId: 'otro-intento' }]);
    const second = await updateTaskWithConcurrencyCheck(task.id, draft, undefined, task.updatedAt, s.set);
    expect(second.ok).toBe(false);
    expect(second.message).toContain('otra versión');
    expect(save).toHaveBeenCalledTimes(1);
    expect(enqueueAuditEvent).not.toHaveBeenCalled();
  });
});

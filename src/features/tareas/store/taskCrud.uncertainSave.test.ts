import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueAuditEvent } from '../../../shared/audit/auditTrail';
import type { Task, TaskDraft } from '../domain/task';
import { createTaskWithConcurrencyCheck, updateTaskWithConcurrencyCheck, type TaskCrudState } from './taskCrud';
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

let sequence = 0;
describe('Tareas: resolver un guardado de resultado incierto sin reintento', () => {
  beforeEach(() => {
    task.id = `task-timeout-${++sequence}`;
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

describe('Tareas: alta con ID estable y resultado incierto', () => {
  let createId: string;
  let createSequence = 0;
  const ownAttempt = () => ({ ...task, id: createId, titulo: draft.titulo, lastSaveAttemptId: createId });
  beforeEach(() => {
    createId = `task-create-stable-regression-${++createSequence}`;
    vi.resetAllMocks();
    vi.mocked(hasTaskSqliteRepository).mockReturnValue(true);
    read.mockResolvedValue([]);
  });

  it('tras timeout solo consulta SQLite: confirma el alta tardía sin otra escritura ni auditoría doble', async () => {
    let attempted: Task | undefined;
    save.mockImplementation(async (value) => {
      attempted = value;
      return { ok: false, message: 'superó el límite de 12000 ms. El resultado es indeterminado' };
    });
    const s = state();
    const first = await createTaskWithConcurrencyCheck(draft, undefined, s.set, createId);
    expect(first.ok).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(attempted).toMatchObject({ id: createId, lastSaveAttemptId: createId });
    read.mockResolvedValue([attempted!]);
    const second = await createTaskWithConcurrencyCheck(draft, undefined, s.set, createId);
    expect(second).toMatchObject({ ok: true, recordId: createId });
    expect(save).toHaveBeenCalledTimes(1);
    expect(enqueueAuditEvent).toHaveBeenCalledTimes(1);
    expect(s.current().tasks.some((entry) => entry.id === createId)).toBe(true);
  });

  it('si aún no puede verificar SQLite, conserva el alta pendiente sin escribir', async () => {
    save.mockRejectedValueOnce(new Error('El resultado es indeterminado; la operación puede seguir en curso.'));
    const s = state();
    const first = await createTaskWithConcurrencyCheck(draft, undefined, s.set, createId);
    expect(first.ok).toBe(false);
    read.mockRejectedValueOnce(new Error('SQLite no disponible'));
    const second = await createTaskWithConcurrencyCheck(draft, undefined, s.set, createId);
    expect(second.ok).toBe(false);
    expect(second.message).toContain('No se puede verificar');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('si el alta pendiente no figura en SQLite, no reenvía hasta una acción posterior explícita', async () => {
    save.mockResolvedValueOnce({ ok: false, message: 'El resultado es indeterminado; la operación puede seguir en curso.' })
      .mockResolvedValueOnce({ ok: true, message: 'Guardado confirmado.' });
    const s = state();
    await createTaskWithConcurrencyCheck(draft, undefined, s.set, createId);
    const check = await createTaskWithConcurrencyCheck(draft, undefined, s.set, createId);
    expect(check.ok).toBe(false);
    expect(check.message).toContain('no figura en SQLite');
    expect(save).toHaveBeenCalledTimes(1);
    const retry = await createTaskWithConcurrencyCheck(draft, undefined, s.set, createId);
    expect(retry.ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(vi.mocked(save).mock.calls[0][0].id).toBe(createId);
    expect(vi.mocked(save).mock.calls[1][0].id).toBe(createId);
    expect(enqueueAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('tras un alta confirmada, pulsar de nuevo por fallo posterior de Coordinación no duplica', async () => {
    save.mockResolvedValueOnce({ ok: true, message: 'Guardado confirmado.' });
    const s = state();
    const first = await createTaskWithConcurrencyCheck(draft, undefined, s.set, createId);
    expect(first.ok).toBe(true);
    const persisted = vi.mocked(save).mock.calls[0][0];
    read.mockResolvedValue([persisted]);
    const second = await createTaskWithConcurrencyCheck(draft, undefined, s.set, createId);
    expect(second).toMatchObject({ ok: true, recordId: createId });
    expect(save).toHaveBeenCalledTimes(1);
    expect(enqueueAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('no adopta como propia una tarea con ID coincidente pero marcador ajeno', async () => {
    read.mockResolvedValue([{ ...ownAttempt(), lastSaveAttemptId: 'another-client' }]);
    const s = state();
    const result = await createTaskWithConcurrencyCheck(draft, undefined, s.set, createId);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('otro origen');
    expect(save).not.toHaveBeenCalled();
  });
});

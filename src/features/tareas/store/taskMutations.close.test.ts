import { describe, expect, it } from 'vitest';
import { CLOSED_TASK_PHASE, type Task, type TaskDraft } from '../domain/task';
import { buildUpdatedTask } from './taskMutations';

const baseTask: Task = {
  id: 'task-1', titulo: 'Tarea de prueba', descripcion: '', tipo: 'interna', fase: 'tarea',
  estado: 'en curso', prioridad: 'media', fechaLimite: '', responsable: '', origen: '', sindicato: '',
  observaciones: '', mail: '', documentLinks: [], sessionDocumentCode: '', sessionModule: '', sessionDate: '',
  seguimiento: [], createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z',
  deletedAt: null, closedAt: null,
};

function draftFromTask(task: Task): TaskDraft {
  return {
    titulo: task.titulo, descripcion: task.descripcion, tipo: task.tipo, fase: task.fase, estado: task.estado,
    prioridad: task.prioridad, fechaLimite: task.fechaLimite, responsable: task.responsable, origen: task.origen,
    sindicato: task.sindicato, observaciones: task.observaciones, mail: task.mail, documentLinks: task.documentLinks,
  };
}

describe('cierre visual de tareas', () => {
  it('guarda estado y fase cerrados y fija closedAt', () => {
    const closedDraft = { ...draftFromTask(baseTask), estado: 'cerrada', fase: CLOSED_TASK_PHASE };
    const result = buildUpdatedTask(baseTask, closedDraft, undefined);
    expect(result.estado).toBe('cerrada');
    expect(result.fase).toBe(CLOSED_TASK_PHASE);
    expect(result.closedAt).not.toBeNull();
  });
});

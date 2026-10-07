import { describe, expect, it } from 'vitest';
import { CLOSED_TASK_PHASE, type Task, type TaskDraft } from '../domain/task';
import { buildUpdatedTask } from './taskMutations';

const baseTask: Task = {
  id: 'task-1', titulo: 'Tarea de prueba', descripcion: '', tipo: 'interna', fase: 'paritaria',
  estado: 'en curso', prioridad: 'media', fechaLimite: '', responsable: '', origen: '', sindicato: '',
  observaciones: '', mail: '', documentLinks: [], sessionDocumentCode: '', sessionModule: '', sessionDate: '',
  seguimiento: [], createdBy: 'Joseba', createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z',
  deletedAt: null, closedAt: null,
};

function draftFromTask(task: Task): TaskDraft {
  return {
    titulo: task.titulo, descripcion: task.descripcion, tipo: task.tipo, fase: task.fase, estado: task.estado,
    prioridad: task.prioridad, fechaLimite: task.fechaLimite, responsable: task.responsable, origen: task.origen,
    sindicato: task.sindicato, observaciones: task.observaciones, mail: task.mail, documentLinks: task.documentLinks,
  };
}

describe('cierre y reapertura de tareas', () => {
  it('guarda estado y fase cerrados, fija closedAt y recuerda la fase previa', () => {
    const closedDraft = { ...draftFromTask(baseTask), estado: 'cerrada', fase: CLOSED_TASK_PHASE };
    const result = buildUpdatedTask(baseTask, closedDraft, undefined);
    expect(result.estado).toBe('cerrada');
    expect(result.fase).toBe(CLOSED_TASK_PHASE);
    expect(result.phaseBeforeClose).toBe('paritaria');
    expect(result.closedAt).not.toBeNull();
  });

  it('al reabrir limpia el cierre y conserva el creador original', () => {
    const closedTask = buildUpdatedTask(
      baseTask,
      { ...draftFromTask(baseTask), estado: 'cerrada', fase: CLOSED_TASK_PHASE },
      undefined,
    );
    const reopened = buildUpdatedTask(
      closedTask,
      { ...draftFromTask(closedTask), estado: 'pendiente', fase: closedTask.phaseBeforeClose ?? 'tarea', createdBy: 'Otro usuario' },
      'Tarea reabierta.',
    );

    expect(reopened.estado).toBe('pendiente');
    expect(reopened.fase).toBe('paritaria');
    expect(reopened.phaseBeforeClose).toBeUndefined();
    expect(reopened.closedAt).toBeNull();
    expect(reopened.createdBy).toBe('Joseba');
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Task } from './task';
import {
  getUnseenTaskCreations,
  initializeTaskCreationNoticeBaseline,
  markTaskCreationIdsSeen,
  markTaskCreationsSeen,
} from './taskCreationNotifications';

function task(id: string, createdAt: string, title = id): Task {
  return {
    id,
    titulo: title,
    descripcion: '',
    tipo: 'interna',
    fase: 'tarea',
    estado: 'pendiente',
    prioridad: 'media',
    fechaLimite: '',
    responsable: '',
    origen: '',
    sindicato: '',
    observaciones: '',
    mail: '',
    documentLinks: [],
    sessionDocumentCode: '',
    sessionModule: '',
    sessionDate: '',
    seguimiento: [],
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    closedAt: null,
  };
}

describe('taskCreationNotifications', () => {
  beforeEach(() => window.localStorage.clear());

  it('toma una línea base y no avisa de tareas anteriores', () => {
    initializeTaskCreationNoticeBaseline('Joseba', '2026-10-06T18:00:00.000Z');
    expect(getUnseenTaskCreations([task('old', '2026-10-06T17:59:00.000Z')], 'Joseba')).toEqual([]);
  });

  it('avisa de tareas creadas después de la línea base y permite descartarlas', () => {
    initializeTaskCreationNoticeBaseline('Joseba', '2026-10-06T18:00:00.000Z');
    const created = task('new', '2026-10-06T18:01:00.000Z', 'Nueva negociación');
    expect(getUnseenTaskCreations([created], 'Joseba').map((item) => item.id)).toEqual(['new']);
    markTaskCreationsSeen('Joseba', [created]);
    expect(getUnseenTaskCreations([created], 'Joseba')).toEqual([]);
  });

  it('permite marcar como vista una tarea recién creada solo por su ID', () => {
    initializeTaskCreationNoticeBaseline('Joseba', '2026-10-06T18:00:00.000Z');
    const created = task('own-task', '2026-10-06T18:01:00.000Z');
    markTaskCreationIdsSeen('Joseba', ['own-task']);
    expect(getUnseenTaskCreations([created], 'Joseba')).toEqual([]);
  });

  it('mantiene el visto separado por usuario', () => {
    initializeTaskCreationNoticeBaseline('Joseba', '2026-10-06T18:00:00.000Z');
    initializeTaskCreationNoticeBaseline('Iker', '2026-10-06T18:00:00.000Z');
    const created = task('new', '2026-10-06T18:01:00.000Z');
    markTaskCreationsSeen('Joseba', [created]);
    expect(getUnseenTaskCreations([created], 'Joseba')).toEqual([]);
    expect(getUnseenTaskCreations([created], 'Iker')).toHaveLength(1);
  });
});

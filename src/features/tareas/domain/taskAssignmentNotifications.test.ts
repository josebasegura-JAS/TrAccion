import { beforeEach, describe, expect, it } from 'vitest';
import type { Task } from './task';
import { getUnseenTaskAssignments, getUnseenLinkedActionAssignments, markLinkedActionAssignmentsSeen } from './taskAssignmentNotifications';

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    titulo: 'Correo CIM mail con columna AGOSTO',
    descripcion: '',
    tipo: 'interna',
    fase: 'tarea',
    estado: 'pendiente',
    prioridad: 'media',
    fechaLimite: '',
    responsable: 'Joseba Segura',
    assignmentNoticeId: 'notice-1',
    assignmentNoticeAt: '2026-10-01T10:00:00.000Z',
    origen: '',
    sindicato: '',
    observaciones: '',
    mail: '',
    documentLinks: [],
    sessionDocumentCode: '',
    sessionModule: '',
    sessionDate: '',
    seguimiento: [],
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    deletedAt: null,
    closedAt: null,
    ...overrides,
  };
}

describe('taskAssignmentNotifications', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('no duplica un aviso si el store contiene dos snapshots de la misma tarea', () => {
    const olderSnapshot = buildTask({
      assignmentNoticeId: 'notice-old',
      assignmentNoticeAt: '2026-10-01T09:59:00.000Z',
      updatedAt: '2026-10-01T09:59:00.000Z',
    });
    const newestSnapshot = buildTask({
      assignmentNoticeId: 'notice-new',
      assignmentNoticeAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    });

    const result = getUnseenTaskAssignments(
      [olderSnapshot, newestSnapshot],
      'Joseba Segura',
      'jasegura',
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.assignmentNoticeId).toBe('notice-new');
  });

  it('no duplica un mismo assignmentNoticeId aunque llegue repetido', () => {
    const task = buildTask();
    const result = getUnseenTaskAssignments([task, { ...task }], 'Joseba Segura', 'jasegura');

    expect(result).toHaveLength(1);
  });
});

describe('linked quick-action notices', () => {
  beforeEach(() => window.localStorage.clear());
  const withAction = (assigned: string, completedAt?: string): Task => buildTask({
    seguimiento: [{
      id: 'followup-1', fechaHora: '2026-10-20T09:00:00.000Z', texto: 'Revisar',
      quickActions: [{ id: 'action-1', titulo: 'Trasladar a Dirección', createdAt: '2026-10-20T09:00:00.000Z', asignadaA: assigned, completedAt }],
    }],
  });

  it('notifica solo al usuario asignado y no duplica snapshots', () => {
    const task = withAction('acabrera');
    expect(getUnseenLinkedActionAssignments([task, { ...task }], 'ACABRERA')).toHaveLength(1);
    expect(getUnseenLinkedActionAssignments([task], 'ahueso')).toHaveLength(0);
  });

  it('conserva el visto por usuario y no notifica acciones completadas', () => {
    const task = withAction('ahueso');
    const notices = getUnseenLinkedActionAssignments([task], 'ahueso');
    markLinkedActionAssignmentsSeen('ahueso', notices);
    expect(getUnseenLinkedActionAssignments([task], 'ahueso')).toHaveLength(0);
    expect(getUnseenLinkedActionAssignments([withAction('ahueso', '2026-10-20T10:00:00.000Z')], 'ahueso')).toHaveLength(0);
  });
});

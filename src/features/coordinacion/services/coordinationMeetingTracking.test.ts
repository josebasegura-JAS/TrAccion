import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../tareas/domain/task';
import { useTaskStore } from '../../tareas/store/useTaskStore';
import type { CoordinationMeeting } from '../domain/coordinacion';
import {
  existingTrackingPointIds,
  pendingCoordinationTrackingCount,
  syncMeetingTracking,
} from './coordinationMeetingTracking';

function meeting(): CoordinationMeeting {
  return {
    id: 'meeting-1',
    title: 'Reunión semanal',
    area: 'direccion',
    date: '2026-10-08',
    status: 'open',
    points: [{
      id: 'point-1',
      origin: 'task',
      taskId: 'task-1',
      title: 'Revisar criterio',
      detail: '',
      result: 'Se acuerda revisar el criterio.',
      status: 'seguimiento',
      createdAt: '2026-10-08T07:00:00.000Z',
      updatedAt: '2026-10-08T07:10:00.000Z',
    }],
    createdAt: '2026-10-08T07:00:00.000Z',
    updatedAt: '2026-10-08T07:10:00.000Z',
    closedAt: null,
  };
}

function task(withTracking = false): Task {
  return {
    id: 'task-1',
    titulo: 'Revisar criterio',
    descripcion: '',
    tipo: 'interna',
    fase: 'tarea',
    estado: 'en curso',
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
    seguimiento: withTracking ? [{
      id: 'coordination:meeting-1:point-1',
      fechaHora: '2026-10-08T07:10:00.000Z',
      texto: 'Seguimiento anterior',
    }] : [],
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-08T07:10:00.000Z',
    deletedAt: null,
    closedAt: null,
  };
}

describe('coordinationMeetingTracking pending sync', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useTaskStore.setState({ tasks: [task()] });
  });

  it('conserva un fallo en cola y lo reintenta en el siguiente guardado de la reunión', async () => {
    const failedUpsert = vi.fn().mockResolvedValue({ ok: false, message: 'Conflicto temporal' });
    useTaskStore.setState({ upsertCoordinationTracking: failedUpsert });

    const first = await syncMeetingTracking(meeting(), ['point-1'], { allowStatusOnly: false });

    expect(first).toHaveLength(1);
    expect(pendingCoordinationTrackingCount()).toBe(1);

    const successfulUpsert = vi.fn().mockResolvedValue({ ok: true, message: 'Guardado' });
    useTaskStore.setState({ upsertCoordinationTracking: successfulUpsert });

    const retry = await syncMeetingTracking(meeting(), [], { allowStatusOnly: false });

    expect(retry).toEqual([]);
    expect(successfulUpsert).toHaveBeenCalledTimes(1);
    expect(pendingCoordinationTrackingCount()).toBe(0);
  });

  it('identifica solo puntos que ya tienen seguimiento para resincronizar metadatos de reunión', () => {
    useTaskStore.setState({ tasks: [task(true)] });

    expect(existingTrackingPointIds(meeting())).toEqual(['point-1']);

    useTaskStore.setState({ tasks: [task(false)] });
    expect(existingTrackingPointIds(meeting())).toEqual([]);
  });
});

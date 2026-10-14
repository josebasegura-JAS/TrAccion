import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../tareas/domain/task';
import { useTaskStore } from '../../tareas/store/useTaskStore';
import type { CoordinationMeeting } from '../domain/coordinacion';
import {
  pendingCoordinationTrackingCount,
  queueCoordinationTrackingRemoval,
  retryPendingCoordinationTracking,
  syncMeetingTracking,
} from './coordinationMeetingTracking';

function task(): Task {
  return {
    id: 'task-1',
    titulo: 'Tarea vinculada',
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
    seguimiento: [],
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-08T07:00:00.000Z',
    deletedAt: null,
    closedAt: null,
  };
}

function meeting(result = 'Acuerdo alcanzado'): CoordinationMeeting {
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
      title: 'Punto vinculado',
      detail: '',
      result,
      status: 'seguimiento',
      createdAt: '2026-10-08T07:00:00.000Z',
      updatedAt: '2026-10-08T07:10:00.000Z',
    }],
    createdAt: '2026-10-08T07:00:00.000Z',
    updatedAt: '2026-10-08T07:10:00.000Z',
    closedAt: null,
  };
}

const activeStatus = {
  ready: true,
  engine: 'better-sqlite3' as const,
  phase: 'active' as const,
  path: 'Z:/TrAccion/traccion.sqlite',
  schemaVersion: 1,
  isDefaultPath: false,
  lockPath: 'Z:/TrAccion/traccion.sqlite.lock',
};

describe('coordinationMeetingTracking hardening', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, writable: true, value: undefined });
    useTaskStore.setState({ tasks: [task()] });
  });

  it('no duplica el upsert cuando el mismo punto llega a la vez como pendiente y como modificado', async () => {
    useTaskStore.setState({
      upsertCoordinationTracking: vi.fn().mockResolvedValue({ ok: false, message: 'Fallo temporal' }),
    });
    await syncMeetingTracking(meeting(), ['point-1'], { allowStatusOnly: false });
    expect(pendingCoordinationTrackingCount()).toBe(1);

    const upsert = vi.fn().mockResolvedValue({ ok: true, message: 'Guardado' });
    useTaskStore.setState({ upsertCoordinationTracking: upsert });

    const failures = await syncMeetingTracking(meeting(), ['point-1'], { allowStatusOnly: false });

    expect(failures).toEqual([]);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(pendingCoordinationTrackingCount()).toBe(0);
  });

  it('limpia una entrada pendiente si el punto ya no existe en la reunión', async () => {
    useTaskStore.setState({
      upsertCoordinationTracking: vi.fn().mockResolvedValue({ ok: false, message: 'Fallo temporal' }),
    });
    await syncMeetingTracking(meeting(), ['point-1'], { allowStatusOnly: false });
    expect(pendingCoordinationTrackingCount()).toBe(1);

    const withoutPoint = { ...meeting(), points: [] };
    const upsert = vi.fn().mockResolvedValue({ ok: true, message: 'Guardado' });
    useTaskStore.setState({ upsertCoordinationTracking: upsert });

    const failures = await syncMeetingTracking(withoutPoint, [], { allowStatusOnly: false });

    expect(failures).toEqual([]);
    expect(upsert).not.toHaveBeenCalled();
    expect(pendingCoordinationTrackingCount()).toBe(0);
  });

  it('conserva allowStatusOnly en la cola y permite reintentar un seguimiento sin resultado', async () => {
    useTaskStore.setState({
      upsertCoordinationTracking: vi.fn().mockResolvedValue({ ok: false, message: 'Fallo temporal' }),
    });
    await syncMeetingTracking(meeting(''), ['point-1'], { allowStatusOnly: true });
    expect(pendingCoordinationTrackingCount()).toBe(1);

    const upsert = vi.fn().mockResolvedValue({ ok: true, message: 'Guardado' });
    useTaskStore.setState({ upsertCoordinationTracking: upsert });

    const failures = await retryPendingCoordinationTracking([meeting('')]);

    expect(failures).toEqual([]);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      trackingId: 'coordination:meeting-1:point-1',
      text: expect.stringContaining('Tratado · requiere seguimiento'),
    }));
    expect(pendingCoordinationTrackingCount()).toBe(0);
  });

  it('reintenta una operación pendiente para un punto que ya salió de la reunión', async () => {
    await queueCoordinationTrackingRemoval({
      meetingId: 'meeting-1',
      pointId: 'point-1',
      taskId: 'task-1',
      label: 'Coordinación · Reunión semanal · Dirección · 08/10/2026',
    });
    expect(pendingCoordinationTrackingCount()).toBe(1);

    const upsert = vi.fn().mockResolvedValue({ ok: true, message: 'Guardado' });
    useTaskStore.setState({ upsertCoordinationTracking: upsert });

    const failures = await retryPendingCoordinationTracking([meeting()]);

    expect(failures).toEqual([]);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      trackingId: 'coordination:meeting-1:point-1',
      text: '',
    }));
    expect(pendingCoordinationTrackingCount()).toBe(0);
  });

  it('limpia pendientes de reuniones eliminadas sin tocar Tareas', async () => {
    useTaskStore.setState({
      upsertCoordinationTracking: vi.fn().mockResolvedValue({ ok: false, message: 'Fallo temporal' }),
    });
    await syncMeetingTracking(meeting(), ['point-1'], { allowStatusOnly: false });
    expect(pendingCoordinationTrackingCount()).toBe(1);

    const upsert = vi.fn().mockResolvedValue({ ok: true, message: 'Guardado' });
    useTaskStore.setState({ upsertCoordinationTracking: upsert });

    const failures = await retryPendingCoordinationTracking([]);

    expect(failures).toEqual([]);
    expect(upsert).not.toHaveBeenCalled();
    expect(pendingCoordinationTrackingCount()).toBe(0);
  });

  it('permite que otro equipo recupere desde SQLite un pendiente creado en el primero', async () => {
    let sharedValue: string | null = null;
    let sharedUpdatedAt: string | null = null;
    let revision = 0;

    const getPersistedRecord = vi.fn(async () => ({
      status: activeStatus,
      record: sharedValue === null ? null : {
        key: 'traccion.v1.coordinacion.pendingTrackingQueue',
        value: sharedValue,
        createdAt: '2026-10-14T05:00:00.000Z',
        updatedAt: sharedUpdatedAt,
      },
    }));
    const saveLocalStorageRecordIfUnchanged = vi.fn(async (record: {
      value: string;
      expectedUpdatedAt: string | null;
    }) => {
      if (record.expectedUpdatedAt !== sharedUpdatedAt) {
        return {
          ok: false,
          status: activeStatus,
          currentUpdatedAt: sharedUpdatedAt,
          message: 'Los datos han cambiado mientras guardabas.',
        };
      }
      revision += 1;
      sharedValue = record.value;
      sharedUpdatedAt = `revision-${revision}`;
      return {
        ok: true,
        status: activeStatus,
        currentUpdatedAt: sharedUpdatedAt,
        message: 'Guardado.',
      };
    });
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      writable: true,
      value: { getPersistedRecord, saveLocalStorageRecordIfUnchanged },
    });

    useTaskStore.setState({
      upsertCoordinationTracking: vi.fn().mockResolvedValue({ ok: false, message: 'Fallo temporal' }),
    });
    const firstFailures = await syncMeetingTracking(meeting(), ['point-1'], { allowStatusOnly: false });
    expect(firstFailures).toHaveLength(1);
    expect(JSON.parse(sharedValue ?? '[]')).toHaveLength(1);

    window.localStorage.clear();
    const upsertFromSecondPc = vi.fn().mockResolvedValue({ ok: true, message: 'Guardado' });
    useTaskStore.setState({ tasks: [task()], upsertCoordinationTracking: upsertFromSecondPc });

    const secondFailures = await retryPendingCoordinationTracking([meeting()]);

    expect(secondFailures).toEqual([]);
    expect(upsertFromSecondPc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sharedValue ?? '[]')).toEqual([]);
  });
});

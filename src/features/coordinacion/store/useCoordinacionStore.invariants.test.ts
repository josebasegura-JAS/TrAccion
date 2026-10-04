import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoordinationMeeting, CoordinationState } from '../domain/coordinacion';
import { useCoordinacionStore } from './useCoordinacionStore';

function point(id = 'point-1') {
  return {
    id,
    origin: 'manual' as const,
    taskId: null,
    title: 'Punto manual',
    detail: '',
    result: '',
    status: 'pendiente' as const,
    createdAt: '2026-10-04T10:00:00.000Z',
    updatedAt: '2026-10-04T10:00:00.000Z',
  };
}

function meeting(status: CoordinationMeeting['status'] = 'open'): CoordinationMeeting {
  return {
    id: 'meeting-1',
    area: 'direccion',
    date: '2026-10-04',
    status,
    points: [point()],
    createdAt: '2026-10-04T10:00:00.000Z',
    updatedAt: '2026-10-04T10:00:00.000Z',
    closedAt: status === 'closed' ? '2026-10-04T11:00:00.000Z' : null,
  };
}

function setState(meetingValue: CoordinationMeeting): void {
  const state: CoordinationState = {
    meetings: [meetingValue],
    directionTaskIds: [],
    unionTaskIds: {},
    areaTaskIds: {},
  };
  useCoordinacionStore.setState(state);
}

describe('useCoordinacionStore invariants', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T12:00:00.000Z'));
    window.localStorage.clear();
  });

  it('rechaza añadir, editar y eliminar puntos de una reunión cerrada', async () => {
    setState(meeting('closed'));

    const addResult = await useCoordinacionStore.getState().addManualPoint('meeting-1', 'Nuevo punto');
    const updateResult = await useCoordinacionStore.getState().updatePoint('meeting-1', 'point-1', { result: 'Cambio' });
    const deleteResult = await useCoordinacionStore.getState().deleteManualPoint('meeting-1', 'point-1');

    expect(addResult.ok).toBe(false);
    expect(updateResult.ok).toBe(false);
    expect(deleteResult.ok).toBe(false);
    expect(addResult.message).toContain('cerrada');
    expect(useCoordinacionStore.getState().meetings[0]).toEqual(meeting('closed'));
  });

  it('rechaza ids inexistentes sin persistir cambios silenciosos', async () => {
    setState(meeting('open'));

    const missingMeeting = await useCoordinacionStore.getState().addManualPoint('missing', 'Nuevo punto');
    const missingPoint = await useCoordinacionStore.getState().updatePoint('meeting-1', 'missing', { result: 'Cambio' });
    const missingBatchPoint = await useCoordinacionStore.getState().saveMeetingPoints('meeting-1', [
      { pointId: 'missing', patch: { result: 'Cambio' } },
    ]);

    expect(missingMeeting).toMatchObject({ ok: false, message: 'No se ha encontrado la reunión.' });
    expect(missingPoint).toMatchObject({ ok: false, message: 'No se ha encontrado el punto.' });
    expect(missingBatchPoint.ok).toBe(false);
    expect(useCoordinacionStore.getState().meetings[0]).toEqual(meeting('open'));
  });

  it('cerrar dos veces es idempotente y conserva closedAt', async () => {
    setState(meeting('open'));

    const first = await useCoordinacionStore.getState().closeMeeting('meeting-1');
    expect(first.ok).toBe(true);
    const closedAt = useCoordinacionStore.getState().meetings[0].closedAt;
    expect(closedAt).toBe('2026-10-04T12:00:00.000Z');

    vi.setSystemTime(new Date('2026-10-04T13:00:00.000Z'));
    const second = await useCoordinacionStore.getState().closeMeeting('meeting-1');

    expect(second).toMatchObject({ ok: true, message: 'La reunión ya estaba cerrada.' });
    expect(useCoordinacionStore.getState().meetings[0].closedAt).toBe(closedAt);
  });
});

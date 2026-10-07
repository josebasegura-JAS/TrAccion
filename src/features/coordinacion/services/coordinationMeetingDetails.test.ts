import { describe, expect, it } from 'vitest';
import type { CoordinationMeeting, CoordinationState } from '../domain/coordinacion';
import { buildUpdatedMeetingDetailsState } from './coordinationMeetingDetails';

function meeting(status: CoordinationMeeting['status'] = 'open'): CoordinationMeeting {
  return {
    id: 'meeting-1',
    title: 'Título inicial',
    area: 'otras-areas',
    areaName: 'Operaciones',
    interlocutors: 'Ana',
    purpose: 'Objetivo inicial',
    date: '2026-10-07',
    status,
    points: [],
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
    closedAt: status === 'closed' ? '2026-10-07T09:00:00.000Z' : null,
  };
}

function state(item: CoordinationMeeting): CoordinationState {
  return {
    meetings: [item],
    directionTaskIds: ['task-1'],
    unionTaskIds: { ELA: ['task-2'] },
    areaTaskIds: { Operaciones: ['task-3'] },
  };
}

describe('buildUpdatedMeetingDetailsState', () => {
  it('actualiza título, fecha, participantes y objetivo sin tocar puntos ni colas', () => {
    const original = meeting();
    const current = state(original);
    const result = buildUpdatedMeetingDetailsState(current, original.id, {
      title: '  Nuevo título  ',
      date: '2026-10-10',
      interlocutors: '  Ana, Iker  ',
      purpose: '  Nuevo objetivo  ',
    }, '2026-10-07T10:00:00.000Z');

    expect(result.error).toBeNull();
    expect(result.state?.meetings[0]).toMatchObject({
      title: 'Nuevo título',
      date: '2026-10-10',
      interlocutors: 'Ana, Iker',
      purpose: 'Nuevo objetivo',
      updatedAt: '2026-10-07T10:00:00.000Z',
      points: [],
    });
    expect(result.state?.directionTaskIds).toEqual(current.directionTaskIds);
    expect(result.state?.unionTaskIds).toEqual(current.unionTaskIds);
    expect(result.state?.areaTaskIds).toEqual(current.areaTaskIds);
  });

  it('impide editar una reunión cerrada', () => {
    const current = state(meeting('closed'));
    const result = buildUpdatedMeetingDetailsState(current, 'meeting-1', {
      title: 'Cambio no permitido',
      date: '2026-10-10',
      interlocutors: '',
      purpose: '',
    });

    expect(result.state).toBeNull();
    expect(result.error).toContain('cerrada');
  });
});

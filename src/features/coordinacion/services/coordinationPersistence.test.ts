import { beforeEach, describe, expect, it } from 'vitest';
import type { CoordinationMeeting, CoordinationState } from '../domain/coordinacion';
import {
  COORDINATION_INDEX_STORAGE_KEY,
  LEGACY_COORDINATION_STORAGE_KEY,
  coordinationMeetingStorageKey,
  persistCoordinationState,
  readCoordinationState,
} from './coordinationPersistence';

function meeting(id: string, result = ''): CoordinationMeeting {
  return {
    id,
    title: `Reunión ${id}`,
    area: 'direccion',
    date: '2026-10-08',
    status: 'open',
    points: [{
      id: `${id}-point`,
      origin: 'manual',
      taskId: null,
      title: 'Punto',
      detail: '',
      result,
      status: 'pendiente',
      createdAt: '2026-10-08T06:00:00.000Z',
      updatedAt: '2026-10-08T06:00:00.000Z',
    }],
    createdAt: '2026-10-08T06:00:00.000Z',
    updatedAt: '2026-10-08T06:00:00.000Z',
    closedAt: null,
  };
}

function state(): CoordinationState {
  return {
    meetings: [meeting('meeting-a'), meeting('meeting-b')],
    directionTaskIds: ['task-1'],
    unionTaskIds: { ELA: ['task-2'] },
    areaTaskIds: {},
  };
}

describe('coordinationPersistence granular', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('lee el formato legado mientras todavía no existe índice granular', () => {
    const legacy = state();
    window.localStorage.setItem(LEGACY_COORDINATION_STORAGE_KEY, JSON.stringify(legacy));

    expect(readCoordinationState()).toEqual(legacy);
  });

  it('migra en la primera escritura a índice + un registro por reunión', async () => {
    const legacy = state();
    window.localStorage.setItem(LEGACY_COORDINATION_STORAGE_KEY, JSON.stringify(legacy));

    const result = await persistCoordinationState(legacy);

    expect(result.ok).toBe(true);
    const index = JSON.parse(window.localStorage.getItem(COORDINATION_INDEX_STORAGE_KEY) ?? '{}') as {
      meetingIds?: string[];
    };
    expect(index.meetingIds).toEqual(['meeting-a', 'meeting-b']);
    expect(window.localStorage.getItem(coordinationMeetingStorageKey('meeting-a'))).not.toBeNull();
    expect(window.localStorage.getItem(coordinationMeetingStorageKey('meeting-b'))).not.toBeNull();
    expect(readCoordinationState()).toEqual(legacy);
  });

  it('editar una reunión no reescribe ni altera la otra ni el índice', async () => {
    const initial = state();
    window.localStorage.setItem(LEGACY_COORDINATION_STORAGE_KEY, JSON.stringify(initial));
    await persistCoordinationState(initial);

    const indexBefore = window.localStorage.getItem(COORDINATION_INDEX_STORAGE_KEY);
    const meetingBBefore = window.localStorage.getItem(coordinationMeetingStorageKey('meeting-b'));
    const next: CoordinationState = {
      ...initial,
      meetings: initial.meetings.map((item) => item.id === 'meeting-a' ? {
        ...item,
        updatedAt: '2026-10-08T07:00:00.000Z',
        points: item.points.map((point) => ({
          ...point,
          result: 'Cambio solo en A',
          updatedAt: '2026-10-08T07:00:00.000Z',
        })),
      } : item),
    };

    const result = await persistCoordinationState(next);

    expect(result.ok).toBe(true);
    expect(window.localStorage.getItem(COORDINATION_INDEX_STORAGE_KEY)).toBe(indexBefore);
    expect(window.localStorage.getItem(coordinationMeetingStorageKey('meeting-b'))).toBe(meetingBBefore);
    expect(readCoordinationState().meetings.find((item) => item.id === 'meeting-a')?.points[0].result)
      .toBe('Cambio solo en A');
  });

  it('borrar una reunión la elimina del índice sin destruir físicamente su registro', async () => {
    const initial = state();
    window.localStorage.setItem(LEGACY_COORDINATION_STORAGE_KEY, JSON.stringify(initial));
    await persistCoordinationState(initial);
    const orphanBefore = window.localStorage.getItem(coordinationMeetingStorageKey('meeting-b'));

    const result = await persistCoordinationState({
      ...initial,
      meetings: initial.meetings.filter((item) => item.id !== 'meeting-b'),
    });

    expect(result.ok).toBe(true);
    expect(readCoordinationState().meetings.map((item) => item.id)).toEqual(['meeting-a']);
    expect(window.localStorage.getItem(coordinationMeetingStorageKey('meeting-b'))).toBe(orphanBefore);
  });
});

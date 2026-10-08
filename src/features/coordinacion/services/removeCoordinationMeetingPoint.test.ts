import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoordinationState } from '../domain/coordinacion';
import { COORDINATION_STORAGE_KEY, useCoordinacionStore } from '../store/useCoordinacionStore';
import {
  COORDINATION_INDEX_STORAGE_KEY,
  coordinationMeetingStorageKey,
  readCoordinationState,
} from './coordinationPersistence';
import { removeCoordinationMeetingPoint } from './removeCoordinationMeetingPoint';

vi.mock('../../../shared/export/coordinacionExcelBackup', () => ({
  syncCoordinacionExcelBackup: vi.fn(async () => ''),
}));

function coordinationState(): CoordinationState {
  return {
    meetings: [{
      id: 'meeting-1',
      title: 'Reunión Dirección',
      area: 'direccion',
      date: '2026-10-08',
      status: 'open',
      points: [{
        id: 'point-1',
        origin: 'manual',
        taskId: null,
        title: 'Punto a eliminar',
        detail: '',
        result: '',
        status: 'pendiente',
        createdAt: '2026-10-08T06:00:00.000Z',
        updatedAt: '2026-10-08T06:00:00.000Z',
      }],
      createdAt: '2026-10-08T06:00:00.000Z',
      updatedAt: '2026-10-08T06:00:00.000Z',
      closedAt: null,
    }],
    directionTaskIds: [],
    unionTaskIds: {},
    areaTaskIds: {},
  };
}

describe('removeCoordinationMeetingPoint — persistencia granular', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    useCoordinacionStore.setState({
      meetings: [],
      directionTaskIds: [],
      unionTaskIds: {},
      areaTaskIds: {},
    });
  });

  it('migra el snapshot legado y elimina el punto en el registro individual de su reunión', async () => {
    const state = coordinationState();
    window.localStorage.setItem(COORDINATION_STORAGE_KEY, JSON.stringify(state));
    useCoordinacionStore.setState(state);

    const result = await removeCoordinationMeetingPoint('point-1');

    expect(result.ok).toBe(true);
    expect(window.localStorage.getItem(COORDINATION_INDEX_STORAGE_KEY)).not.toBeNull();

    const storedMeeting = JSON.parse(
      window.localStorage.getItem(coordinationMeetingStorageKey('meeting-1')) ?? '{}',
    ) as CoordinationState['meetings'][number];
    expect(storedMeeting.points).toHaveLength(0);

    expect(readCoordinationState().meetings[0].points).toHaveLength(0);
    expect(useCoordinacionStore.getState().meetings[0].points).toHaveLength(0);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoordinationState } from '../domain/coordinacion';
import { COORDINATION_STORAGE_KEY, useCoordinacionStore } from '../store/useCoordinacionStore';
import { COORDINATION_INDEX_STORAGE_KEY } from './coordinationPersistence';
import { removeCoordinationMeetingPoint } from './removeCoordinationMeetingPoint';

vi.mock('../../../shared/export/coordinacionExcelBackup', () => ({
  syncCoordinacionExcelBackup: vi.fn(async () => ''),
}));

function stateWithPoint(): CoordinationState {
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

describe('removeCoordinationMeetingPoint hardening', () => {
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

  it('no modifica almacenamiento ni store si el punto ya no existe', async () => {
    const current = stateWithPoint();
    window.localStorage.setItem(COORDINATION_STORAGE_KEY, JSON.stringify(current));
    useCoordinacionStore.setState(current);

    const result = await removeCoordinationMeetingPoint('point-inexistente');

    expect(result.ok).toBe(false);
    expect(window.localStorage.getItem(COORDINATION_INDEX_STORAGE_KEY)).toBeNull();
    expect(useCoordinacionStore.getState().meetings[0].points).toHaveLength(1);
  });

  it('rechaza borrar un punto de una reunión cerrada sin iniciar la migración/escritura', async () => {
    const current = stateWithPoint();
    current.meetings[0].status = 'closed';
    current.meetings[0].closedAt = '2026-10-08T07:00:00.000Z';
    window.localStorage.setItem(COORDINATION_STORAGE_KEY, JSON.stringify(current));
    useCoordinacionStore.setState(current);

    const result = await removeCoordinationMeetingPoint('point-1');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('cerrada');
    expect(window.localStorage.getItem(COORDINATION_INDEX_STORAGE_KEY)).toBeNull();
    expect(useCoordinacionStore.getState().meetings[0].points).toHaveLength(1);
  });
});

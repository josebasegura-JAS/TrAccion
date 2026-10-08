import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SQLITE_RECORD_METADATA_KEY } from '../../../services/persistenceKeys';
import type { CoordinationState } from '../domain/coordinacion';
import { COORDINATION_STORAGE_KEY, useCoordinacionStore } from '../store/useCoordinacionStore';
import { removeCoordinationMeetingPoint } from './removeCoordinationMeetingPoint';

vi.mock('../../../shared/export/coordinacionExcelBackup', () => ({
  syncCoordinacionExcelBackup: vi.fn(async () => ''),
}));

const status = {
  ready: true,
  engine: 'better-sqlite3' as const,
  phase: 'active' as const,
  path: '/shared/traccion.sqlite',
  schemaVersion: 17,
  isDefaultPath: false,
  lockPath: '/shared/traccion.sqlite.lockdir',
};

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
    useCoordinacionStore.setState(stateWithPoint());
  });

  afterEach(() => {
    delete (window as { traccion?: unknown }).traccion;
  });

  it('no modifica cache, store ni metadata si SQLite rechaza el guardado optimista', async () => {
    const current = stateWithPoint();
    const previousUpdatedAt = '2026-10-08T06:05:00.000Z';
    const cachedBefore = JSON.stringify(current);

    window.localStorage.setItem(COORDINATION_STORAGE_KEY, cachedBefore);
    window.localStorage.setItem(SQLITE_RECORD_METADATA_KEY, JSON.stringify({
      [COORDINATION_STORAGE_KEY]: previousUpdatedAt,
    }));

    (window as { traccion?: unknown }).traccion = {
      getPersistedRecord: vi.fn(async () => ({
        status,
        record: {
          key: COORDINATION_STORAGE_KEY,
          value: JSON.stringify(current),
          updatedAt: previousUpdatedAt,
        },
      })),
      saveLocalStorageRecordIfUnchanged: vi.fn(async () => ({
        ok: false,
        status,
        currentUpdatedAt: '2026-10-08T06:06:00.000Z',
        message: 'Conflicto de versión',
      })),
    };

    const result = await removeCoordinationMeetingPoint('point-1');

    expect(result.ok).toBe(false);
    expect(window.localStorage.getItem(COORDINATION_STORAGE_KEY)).toBe(cachedBefore);
    expect(useCoordinacionStore.getState().meetings[0].points).toHaveLength(1);

    const metadata = JSON.parse(
      window.localStorage.getItem(SQLITE_RECORD_METADATA_KEY) ?? '{}',
    ) as Record<string, string | null>;
    expect(metadata[COORDINATION_STORAGE_KEY]).toBe(previousUpdatedAt);
  });

  it('rechaza borrar un punto de una reunión cerrada sin intentar escribir', async () => {
    const current = stateWithPoint();
    current.meetings[0].status = 'closed';
    current.meetings[0].closedAt = '2026-10-08T07:00:00.000Z';
    const saveIfUnchanged = vi.fn();

    (window as { traccion?: unknown }).traccion = {
      getPersistedRecord: vi.fn(async () => ({
        status,
        record: {
          key: COORDINATION_STORAGE_KEY,
          value: JSON.stringify(current),
          updatedAt: '2026-10-08T06:05:00.000Z',
        },
      })),
      saveLocalStorageRecordIfUnchanged: saveIfUnchanged,
    };

    const result = await removeCoordinationMeetingPoint('point-1');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('cerrada');
    expect(saveIfUnchanged).not.toHaveBeenCalled();
  });
});

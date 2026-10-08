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

describe('removeCoordinationMeetingPoint — metadata de concurrencia', () => {
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

  afterEach(() => {
    delete (window as { traccion?: unknown }).traccion;
  });

  it('registra el updatedAt confirmado por SQLite para que el siguiente guardado no use una versión obsoleta', async () => {
    const state = coordinationState();
    const previousUpdatedAt = '2026-10-08T06:05:00.000Z';
    const confirmedUpdatedAt = '2026-10-08T06:06:00.000Z';

    window.localStorage.setItem(SQLITE_RECORD_METADATA_KEY, JSON.stringify({
      [COORDINATION_STORAGE_KEY]: previousUpdatedAt,
      'traccion.v1.tareas.tasks': '2026-10-08T05:00:00.000Z',
    }));

    const saveIfUnchanged = vi.fn(async () => ({
      ok: true,
      status,
      currentUpdatedAt: confirmedUpdatedAt,
      message: 'Guardado.',
    }));

    (window as { traccion?: unknown }).traccion = {
      getPersistedRecord: vi.fn(async () => ({
        status,
        record: {
          key: COORDINATION_STORAGE_KEY,
          value: JSON.stringify(state),
          updatedAt: previousUpdatedAt,
        },
      })),
      saveLocalStorageRecordIfUnchanged: saveIfUnchanged,
    };

    const result = await removeCoordinationMeetingPoint('point-1');

    expect(result.ok).toBe(true);
    expect(saveIfUnchanged).toHaveBeenCalledWith(expect.objectContaining({
      key: COORDINATION_STORAGE_KEY,
      expectedUpdatedAt: previousUpdatedAt,
    }));

    const metadata = JSON.parse(
      window.localStorage.getItem(SQLITE_RECORD_METADATA_KEY) ?? '{}',
    ) as Record<string, string | null>;
    expect(metadata[COORDINATION_STORAGE_KEY]).toBe(confirmedUpdatedAt);
    expect(metadata['traccion.v1.tareas.tasks']).toBe('2026-10-08T05:00:00.000Z');

    const persisted = JSON.parse(
      window.localStorage.getItem(COORDINATION_STORAGE_KEY) ?? '{}',
    ) as CoordinationState;
    expect(persisted.meetings[0].points).toHaveLength(0);
  });
});

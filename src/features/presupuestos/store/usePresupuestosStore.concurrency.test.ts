import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePresupuestosStore } from './usePresupuestosStore';

const timestamp = '2026-06-17T08:00:00.000Z';

type SaveResult = {
  ok: boolean;
  status: ReturnType<typeof activeStatus>;
  currentUpdatedAt: string | null;
  message: string;
};

function activeStatus() {
  return { ready: true, phase: 'active' as const, message: 'SQLite activo' };
}

function emptyPresupuestosSnapshot(updatedAt: string | null = null) {
  return {
    status: activeStatus(),
    scenarios: [] as Array<{ id: string; value: string; updatedAt: string }>,
    manualItems: [] as Array<{ id: string; value: string; updatedAt: string }>,
    ticketGroups: [] as Array<{ id: string; value: string; updatedAt: string }>,
    actuals: [] as Array<{ id: string; value: string; updatedAt: string }>,
    ...(updatedAt ? {} : {}),
  };
}

describe('usePresupuestosStore concurrencia multiusuario', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    usePresupuestosStore.setState({
      scenarios: [],
      manualItems: [],
      ticketGroups: [],
      actuals: [],
      activeScenarioId: null,
      sqliteUpdatedAt: null,
    });
  });

  it('no confirma el cambio cuando otro usuario ha modificado los presupuestos entre tanto', async () => {
    const saver = vi.fn(async () => ({
      ok: false,
      status: activeStatus(),
      currentUpdatedAt: '2026-06-17T08:05:00.000Z',
      message: 'Los presupuestos han cambiado mientras guardabas. Recarga antes de continuar.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadPresupuestosRecords: vi.fn(async () => emptyPresupuestosSnapshot()),
        savePresupuestosSnapshotIfUnchanged: saver,
      },
    });

    const result = await usePresupuestosStore.getState().upsertScenario({
      name: 'Escenario 2026',
      year: 2026,
      ticketAmount: 11,
      notes: '',
    });

    expect(result.valid).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('han cambiado');
    expect(saver).toHaveBeenCalledTimes(1);
    expect(usePresupuestosStore.getState().scenarios).toHaveLength(0);
    expect(usePresupuestosStore.getState().activeScenarioId).toBeNull();
  });

  it('aplica el cambio local solo después de que SQLite confirme el guardado', async () => {
    const deferred: { resolve?: (value: SaveResult) => void } = {};
    const saver = vi.fn(
      () =>
        new Promise<SaveResult>((resolve) => {
          deferred.resolve = resolve;
        }),
    );

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadPresupuestosRecords: vi.fn(async () => emptyPresupuestosSnapshot()),
        savePresupuestosSnapshotIfUnchanged: saver,
      },
    });

    const pendingSave = usePresupuestosStore.getState().upsertScenario({
      name: 'Escenario 2026',
      year: 2026,
      ticketAmount: 11,
      notes: '',
    });

    await vi.waitFor(() => expect(saver).toHaveBeenCalledTimes(1));
    expect(usePresupuestosStore.getState().scenarios).toHaveLength(0);
    expect(usePresupuestosStore.getState().activeScenarioId).toBeNull();

    if (!deferred.resolve) throw new Error('El test no recibió el resolver del guardado SQLite.');
    deferred.resolve({
      ok: true,
      status: activeStatus(),
      currentUpdatedAt: '2026-06-17T08:10:00.000Z',
      message: 'Presupuestos guardados.',
    });

    const result = await pendingSave;
    expect(result.valid).toBe(true);
    expect(result.ok).toBe(true);
    expect(usePresupuestosStore.getState().scenarios).toHaveLength(1);
    expect(usePresupuestosStore.getState().activeScenarioId).toBe(result.id);
    expect(usePresupuestosStore.getState().sqliteUpdatedAt).toBe('2026-06-17T08:10:00.000Z');
  });

  it('reloadFromStorage no sustituye las colecciones ni la selección activa si el contenido no ha cambiado', async () => {
    const scenarioRecord = {
      id: 'scenario-1',
      value: JSON.stringify({
        id: 'scenario-1',
        name: 'Escenario existente',
        year: 2026,
        ticketAmount: 11,
        notes: '',
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      }),
      updatedAt: timestamp,
    };
    const loader = vi.fn(async () => ({
      ...emptyPresupuestosSnapshot(),
      scenarios: [scenarioRecord],
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadPresupuestosRecords: loader, savePresupuestosSnapshotIfUnchanged: vi.fn() },
    });

    usePresupuestosStore.getState().load();
    await vi.waitFor(() => expect(usePresupuestosStore.getState().scenarios).toHaveLength(1));

    usePresupuestosStore.getState().setActiveScenario('scenario-1');
    const scenariosBeforeReload = usePresupuestosStore.getState().scenarios;

    usePresupuestosStore.getState().reloadFromStorage();
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));

    expect(usePresupuestosStore.getState().scenarios).toBe(scenariosBeforeReload);
    expect(usePresupuestosStore.getState().activeScenarioId).toBe('scenario-1');
  });

  it('reloadFromStorage sí actualiza el estado cuando otro usuario añade un escenario nuevo', async () => {
    const existingScenarioRecord = {
      id: 'scenario-1',
      value: JSON.stringify({
        id: 'scenario-1',
        name: 'Escenario existente',
        year: 2026,
        ticketAmount: 11,
        notes: '',
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      }),
      updatedAt: timestamp,
    };
    const newScenarioRecord = {
      id: 'scenario-2',
      value: JSON.stringify({
        id: 'scenario-2',
        name: 'Escenario de otro usuario',
        year: 2026,
        ticketAmount: 12,
        notes: '',
        createdAt: '2026-06-17T09:00:00.000Z',
        updatedAt: '2026-06-17T09:00:00.000Z',
        deletedAt: null,
      }),
      updatedAt: '2026-06-17T09:00:00.000Z',
    };
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ ...emptyPresupuestosSnapshot(), scenarios: [existingScenarioRecord] })
      .mockResolvedValueOnce({
        ...emptyPresupuestosSnapshot(),
        scenarios: [existingScenarioRecord, newScenarioRecord],
      });

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadPresupuestosRecords: loader, savePresupuestosSnapshotIfUnchanged: vi.fn() },
    });

    usePresupuestosStore.getState().load();
    await vi.waitFor(() => expect(usePresupuestosStore.getState().scenarios).toHaveLength(1));

    usePresupuestosStore.getState().reloadFromStorage();
    await vi.waitFor(() => expect(usePresupuestosStore.getState().scenarios).toHaveLength(2));

    expect(usePresupuestosStore.getState().scenarios.map((item) => item.id).sort()).toEqual([
      'scenario-1',
      'scenario-2',
    ]);
  });
});
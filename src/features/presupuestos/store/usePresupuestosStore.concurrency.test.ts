import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePresupuestosStore } from './usePresupuestosStore';

const timestamp = '2026-06-17T08:00:00.000Z';

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

  it('no aplica el cambio local cuando otro usuario ha modificado los presupuestos entre tanto (expectedUpdatedAt obsoleto)', async () => {
    // El saver simula que otro usuario ha guardado un escenario justo antes:
    // el expectedUpdatedAt que envía este cliente ya no coincide con el
    // valor vigente, así que el guardado debe rechazarse y no debe crearse
    // el escenario localmente.
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

    const result = usePresupuestosStore.getState().upsertScenario({
      name: 'Escenario 2026',
      year: 2026,
      ticketAmount: 11,
      notes: '',
    });

    expect(result.valid).toBe(true);
    await vi.waitFor(() => expect(saver).toHaveBeenCalledTimes(1));

    // Como el saver ha rechazado el guardado, el escenario no debe haberse
    // confirmado en el estado del store (commitPresupuestosState no llama a
    // set() si el guardado falla).
    expect(usePresupuestosStore.getState().scenarios).toHaveLength(0);
  });

  it('aplica el cambio local cuando expectedUpdatedAt coincide con el valor vigente', async () => {
    const saver = vi.fn(async () => ({
      ok: true,
      status: activeStatus(),
      currentUpdatedAt: '2026-06-17T08:10:00.000Z',
      message: 'Presupuestos guardados.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadPresupuestosRecords: vi.fn(async () => emptyPresupuestosSnapshot()),
        savePresupuestosSnapshotIfUnchanged: saver,
      },
    });

    const result = usePresupuestosStore.getState().upsertScenario({
      name: 'Escenario 2026',
      year: 2026,
      ticketAmount: 11,
      notes: '',
    });

    expect(result.valid).toBe(true);
    await vi.waitFor(() => expect(usePresupuestosStore.getState().scenarios).toHaveLength(1));
    expect(saver).toHaveBeenCalledTimes(1);
    expect(usePresupuestosStore.getState().activeScenarioId).toBe(result.id);
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

    // Simulamos que el usuario tiene seleccionado manualmente este escenario.
    usePresupuestosStore.getState().setActiveScenario('scenario-1');
    const scenariosBeforeReload = usePresupuestosStore.getState().scenarios;

    // El polling detecta un cambio (por ejemplo, nuestra propia escritura en
    // otra pestaña), pero el contenido normalizado es idéntico al que ya
    // tenemos en memoria.
    usePresupuestosStore.getState().reloadFromStorage();
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));

    // La referencia debe mantenerse intacta y la selección activa no debe
    // haberse perdido.
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

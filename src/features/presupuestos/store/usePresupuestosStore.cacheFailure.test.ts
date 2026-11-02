import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePresupuestosStore } from './usePresupuestosStore';
import * as persistence from '../../../services/persistence';

describe('Presupuestos: SQLite confirmado frente a errores de caché', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    usePresupuestosStore.setState({ scenarios: [], manualItems: [], ticketGroups: [], actuals: [], activeScenarioId: null, sqliteUpdatedAt: null });
    vi.restoreAllMocks();
  });
  it('confirma SQLite aunque falle después la caché secundaria', async () => {
    const saver = vi.fn(async () => ({
      ok: true,
      status: { ready: true, phase: 'active' as const, message: 'SQLite activo' },
      currentUpdatedAt: 'v2',
      message: 'Presupuestos guardados.',
    }));
    Object.defineProperty(window, 'traccion', { configurable: true, value: {
      loadPresupuestosRecords: vi.fn(async () => ({ status: { ready: true, phase: 'active' }, scenarios: [], manualItems: [], ticketGroups: [], actuals: [] })),
      savePresupuestosSnapshotIfUnchanged: saver,
    } });
    vi.spyOn(persistence, 'writeJsonStorageAsync').mockResolvedValue({ ok: false, message: 'Caché inaccesible', updatedAt: null });
    const result = await usePresupuestosStore.getState().upsertScenario({
      name: 'Escenario seguro', year: 2026, ticketAmount: 14.57, notes: '',
    });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('caché local');
    expect(usePresupuestosStore.getState().scenarios).toHaveLength(1);
    expect(usePresupuestosStore.getState().sqliteUpdatedAt).toBe('v2');
    expect(saver).toHaveBeenCalledOnce();
  });
});

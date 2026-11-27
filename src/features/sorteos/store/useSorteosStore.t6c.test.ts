import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSorteosStore } from './useSorteosStore';
import { buildManualExclusion } from '../domain/sorteos';

const m = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), status: vi.fn(), cache: vi.fn(), read: vi.fn(), write: vi.fn(), busy: vi.fn(), clear: vi.fn() }));
vi.mock('../../../services/persistence', () => ({
  readStorageItem: m.read, writeStorageItem: m.write, writeRendererStorageCache: m.cache,
  publishPersistenceBusy: m.busy, clearPersistenceBusy: m.clear, waitForNextPaint: async () => undefined,
}));
vi.mock('../../../services/databaseStatus', () => ({ publishDatabaseStatus: m.status }));
vi.mock('../../../services/sharedRecordPersistence', () => ({ saveNewSharedArrayRecord: vi.fn() }));
const person = { empleado: '100', nombreApellidos: 'Persona ficticia', searchText: '100 persona ficticia' };
const stamp = '2026-01-01T00:00:00.000Z';
const exclusion = buildManualExclusion(person, 'e', stamp);
const active = { ready: true, phase: 'active' };
const snapshot = (exclusions = [exclusion]) => ({ status: active, draws: [], exclusions: exclusions.map(e => ({ id: e.id, value: JSON.stringify(e) })), drawsUpdatedAt: 'd1', exclusionsUpdatedAt: 'e1' });
const state = () => useSorteosStore.getState();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('traccion', { loadSorteosRecords: m.load, saveSorteosSnapshotIfUnchanged: m.save });
  m.load.mockResolvedValue(snapshot());
  m.save.mockResolvedValue({ ok: true, status: active });
  useSorteosStore.setState({ draws: [], exclusions: [exclusion], visibleDrawId: '', visibleResult: null });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('T6C: persistencia de Sorteos', () => {
  it('guarda exclusiones con ambos tokens de concurrencia', async () => {
    expect(await state().addExclusionWithConcurrencyCheck({ empleado: '200', nombreApellidos: 'Otra persona', searchText: '200 otra persona' })).toMatchObject({ ok: true });
    expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ expectedDrawsUpdatedAt: 'd1', expectedExclusionsUpdatedAt: 'e1', draws: [], exclusions: expect.arrayContaining([expect.objectContaining({ id: 'e' })]) }));
    expect(state().exclusions.map(e => e.empleado)).toEqual(['100', '200']);
  });
  it('no duplica una exclusión existente', async () => {
    expect(await state().addExclusionWithConcurrencyCheck(person)).toMatchObject({ ok: true });
    expect(state().exclusions).toEqual([exclusion]);
  });
  it('quita una exclusión únicamente tras confirmación', async () => {
    expect(await state().removeExclusionWithConcurrencyCheck('e')).toMatchObject({ ok: true });
    expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ exclusions: [], expectedExclusionsUpdatedAt: 'e1' }));
    expect(state().exclusions).toEqual([]);
  });
  it('conserva la lista cuando el guardado entra en conflicto', async () => {
    m.save.mockResolvedValue({ ok: false, status: active, message: 'conflicto' });
    expect(await state().removeExclusionWithConcurrencyCheck('e')).toEqual({ ok: false, message: 'conflicto' });
    expect(state().exclusions).toEqual([exclusion]);
    expect(m.clear).toHaveBeenCalledTimes(1);
  });
  it('no escribe si SQLite no está activa', async () => {
    m.load.mockResolvedValue({ ...snapshot(), status: { ready: false, phase: 'locked' } });
    expect(await state().removeExclusionWithConcurrencyCheck('e')).toMatchObject({ ok: false });
    expect(m.save).not.toHaveBeenCalled();
    expect(state().exclusions).toEqual([exclusion]);
  });
  it('reintenta un bloqueo temporal sin esperas reales', async () => {
    vi.useFakeTimers();
    m.load.mockRejectedValueOnce(new Error('SQLITE_BUSY'));
    const result = state().removeExclusionWithConcurrencyCheck('e');
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ ok: true });
    expect(m.load).toHaveBeenCalledTimes(2);
    expect(m.save).toHaveBeenCalledTimes(1);
  });
  it('no reintenta un error de transporte indeterminado', async () => {
    m.save.mockRejectedValue(new Error('timeout'));
    expect(await state().removeExclusionWithConcurrencyCheck('e')).toMatchObject({ ok: false });
    expect(m.save).toHaveBeenCalledTimes(1);
    expect(state().exclusions).toEqual([exclusion]);
  });
});

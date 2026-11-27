import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCriteriosRrllStore } from './useCriteriosRrllStore';
import { EMPTY_CRITERIO_RRLL_DRAFT } from '../domain/criterioRrll';

const m = vi.hoisted(() => ({ available: vi.fn(), load: vi.fn(), rows: vi.fn(), save: vi.fn(), batch: vi.fn(), remove: vi.fn(), cache: vi.fn(), read: vi.fn(), backup: vi.fn(), fallbackNew: vi.fn(), fallbackUpdate: vi.fn() }));
vi.mock('./criteriosRrllSqliteRepository', () => ({
  hasCriteriosRrllSqliteRepository: m.available, loadCriteriosRrllFromSqlite: m.load,
  loadCriteriosRrllRecordsFromSqlite: m.rows, saveCriterioRrllToSqlite: m.save,
  saveCriteriosRrllToSqlite: m.batch, deleteCriterioRrllInSqlite: m.remove,
}));
vi.mock('../../../services/persistence', () => ({ readStorageItem: m.read, writeRendererStorageCache: m.cache }));
vi.mock('../../../services/sharedRecordPersistence', () => ({ saveNewSharedArrayRecord: m.fallbackNew, saveSharedArrayRecord: m.fallbackUpdate }));
vi.mock('../services/criteriosRrllExcelBackup', () => ({ syncCriteriosRrllExcelBackup: m.backup }));
const stamp = '2026-01-01T00:00:00.000Z';
const draft = { ...EMPTY_CRITERIO_RRLL_DRAFT, tema: 'Jornada', criterio: 'Criterio ficticio' };
const record = { ...draft, id: 'a', createdAt: stamp, updatedAt: stamp, deletedAt: null };
const state = () => useCriteriosRrllStore.getState();
beforeEach(() => {
  vi.resetAllMocks();
  m.available.mockReturnValue(true);
  m.rows.mockResolvedValue(null);
  m.load.mockResolvedValue([record]);
  for (const mock of [m.save, m.batch, m.remove]) mock.mockResolvedValue({ ok: true, message: 'guardado' });
  useCriteriosRrllStore.setState({ criterios: [record], selectedCriterioId: 'a' });
});
describe('T6C: persistencia de criterios', () => {
  it('conserva la selección si el criterio sigue presente después de recargar', async () => {
    const other = { ...record, id: 'b' };
    m.load.mockResolvedValue([other, { ...record, observaciones: 'Cambio remoto' }]);
    await state().reloadFromStorage();
    expect(state().selectedCriterioId).toBe('a');
    expect(state().criterios[1].observaciones).toBe('Cambio remoto');
  });
  it('crea un criterio confirmado con expectativa nula', async () => {
    const result = await state().createWithConcurrencyCheck({ ...draft, tema: 'Permisos' });
    expect(result.ok).toBe(true);
    expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ id: result.recordId, tema: 'Permisos' }), null);
    expect(state().criterios).toHaveLength(2);
    expect(m.backup).toHaveBeenCalledWith(state().criterios);
  });
  it('edita con la versión esperada y conserva la fecha de creación', async () => {
    expect(await state().updateWithConcurrencyCheck('a', { ...draft, observaciones: 'Revisado' }, stamp)).toMatchObject({ ok: true });
    expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', createdAt: stamp, observaciones: 'Revisado' }), stamp);
  });
  it.each(['update', 'remove'])('no modifica estado ni Excel si falla %s', async op => {
    m.save.mockResolvedValue({ ok: false, message: 'conflicto' });
    m.remove.mockResolvedValue({ ok: false, message: 'conflicto' });
    const result = op === 'update' ? await state().updateWithConcurrencyCheck('a', draft, 'old') : await state().removeWithConcurrencyCheck('a', 'old');
    expect(result.ok).toBe(false);
    expect(state().criterios).toEqual([record]);
    expect(m.backup).not.toHaveBeenCalled();
    expect(m.cache).not.toHaveBeenCalled();
  });
  it('elimina el criterio confirmado y selecciona otro activo', async () => {
    const other = { ...record, id: 'b' };
    useCriteriosRrllStore.setState({ criterios: [record, other] });
    expect(await state().removeWithConcurrencyCheck('a', stamp)).toMatchObject({ ok: true });
    expect(state().criterios).toEqual([other]);
    expect(state().selectedCriterioId).toBe('b');
  });
  it('envía una importación en lote con versiones esperadas de registros existentes y nuevos', async () => {
    await state().importDrafts([draft, { ...draft, tema: 'Otro tema', criterio: 'Otro criterio' }]);
    expect(m.batch).toHaveBeenCalledTimes(1);
    expect(m.batch).toHaveBeenCalledWith([
      expect.objectContaining({ record: expect.objectContaining({ id: 'a' }), expectedUpdatedAt: stamp }),
      expect.objectContaining({ record: expect.objectContaining({ tema: 'Otro tema' }), expectedUpdatedAt: null }),
    ]);
    expect(state().criterios).toHaveLength(2);
  });
  it('conserva la lista ante importación rechazada y no genera Excel', async () => {
    m.batch.mockResolvedValue({ ok: false, message: 'conflicto' });
    await expect(state().importDrafts([draft])).rejects.toThrow('conflicto');
    expect(state().criterios).toEqual([record]);
    expect(m.backup).not.toHaveBeenCalled();
  });
  it('rechaza importación sin repositorio compartido', async () => {
    m.available.mockReturnValue(false);
    await expect(state().importDrafts([draft])).rejects.toThrow(/SQLite/);
    expect(m.batch).not.toHaveBeenCalled();
  });
});

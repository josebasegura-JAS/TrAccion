import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_VINCULOGRAMA_DRAFT, buildVinculograma } from '../domain/vinculograma';
import { useVinculogramaStore } from './useVinculogramaStore';

const m = vi.hoisted(() => ({ available: vi.fn(), load: vi.fn(), rows: vi.fn(), save: vi.fn(), remove: vi.fn(), read: vi.fn(), cache: vi.fn(), backup: vi.fn(), fallbackNew: vi.fn(), fallbackUpdate: vi.fn() }));
vi.mock('./vinculogramaSqliteRepository', () => ({
  hasVinculogramaSqliteRepository: m.available, loadVinculogramasFromSqlite: m.load,
  loadVinculogramaRecordsFromSqlite: m.rows, saveVinculogramaToSqlite: m.save, deleteVinculogramaInSqlite: m.remove,
}));
vi.mock('../../../services/persistence', () => ({ readStorageItem: m.read, writeRendererStorageCache: m.cache }));
vi.mock('../../../services/sharedRecordPersistence', () => ({ saveNewSharedArrayRecord: m.fallbackNew, saveSharedArrayRecord: m.fallbackUpdate }));
vi.mock('../../../shared/export/operationalExcelBackups', () => ({ syncVinculogramaExcelBackup: m.backup, appendBackupMessage: (message: string) => message }));

const stamp = '2026-01-01T00:00:00.000Z';
const draft = { ...EMPTY_VINCULOGRAMA_DRAFT, employeeNumber: '100', nombreCompleto: 'Persona ficticia', linkedPerson: 'Persona vinculada', requestDate: '2026-01-01' };
const record = buildVinculograma(draft, stamp, 'a');
const state = () => useVinculogramaStore.getState();
beforeEach(() => {
  vi.resetAllMocks();
  m.available.mockReturnValue(true);
  m.rows.mockResolvedValue(null);
  m.load.mockResolvedValue([record]);
  m.save.mockResolvedValue({ ok: true, message: 'guardado' });
  m.remove.mockResolvedValue({ ok: true, message: 'eliminado' });
  m.backup.mockResolvedValue(undefined);
  useVinculogramaStore.setState({ records: [record] });
});
describe('T6B: persistencia de Vinculograma', () => {
  it('carga registros compartidos y conserva la referencia si no cambian', async () => {
    useVinculogramaStore.setState({ records: [] });
    await state().load();
    expect(state().records).toEqual([record]);
    const before = state().records;
    m.load.mockResolvedValue([{ ...record }]);
    await state().reloadFromStorage();
    expect(state().records).toBe(before);
    expect(m.cache).toHaveBeenCalledTimes(2);
  });
  it('crea un vínculo confirmado incluso si no puede releer la lista después', async () => {
    const result = await state().createWithConcurrencyCheck({ ...draft, employeeNumber: ' 200 ' });
    expect(result.ok).toBe(true);
    expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ employeeNumber: '200', expiryDate: '2029-01-01' }), null);
    expect(state().records).toHaveLength(2);
    expect(m.backup).toHaveBeenCalledWith(state().records);
  });
  it('no publica cambios ni Excel si SQLite rechaza el alta', async () => {
    m.save.mockResolvedValue({ ok: false, message: 'conflicto' });
    expect(await state().createWithConcurrencyCheck(draft)).toMatchObject({ ok: false });
    expect(state().records).toEqual([record]);
    expect(m.cache).not.toHaveBeenCalled();
    expect(m.backup).not.toHaveBeenCalled();
  });
  it('conserva revocación y fecha de creación al editar datos del vínculo', async () => {
    const revoked = { ...record, revokedAt: '2026-02-01', revocationReason: 'Motivo' };
    useVinculogramaStore.setState({ records: [revoked] });
    const next = { employeeNumber: '100', nombreCompleto: 'Nombre corregido', linkedPerson: 'Persona vinculada', requestDate: '2026-01-01' };
    expect(await state().updateWithConcurrencyCheck('a', next, stamp)).toMatchObject({ ok: true });
    expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', createdAt: stamp, revokedAt: revoked.revokedAt, revocationReason: revoked.revocationReason }), stamp);
    expect(state().records[0].nombreCompleto).toBe('Nombre corregido');
  });
  it.each(['update', 'remove'])('no escribe si el registro de %s no existe', async op => {
    const result = op === 'update' ? await state().updateWithConcurrencyCheck('missing', draft, stamp) : await state().removeWithConcurrencyCheck('missing', stamp);
    expect(result.ok).toBe(false);
    expect(m.save).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
  });
  it.each(['update', 'remove'])('conserva lista si SQLite devuelve conflicto en %s', async op => {
    m.save.mockResolvedValue({ ok: false, message: 'conflicto' });
    m.remove.mockResolvedValue({ ok: false, message: 'conflicto' });
    const result = op === 'update' ? await state().updateWithConcurrencyCheck('a', draft, 'old') : await state().removeWithConcurrencyCheck('a', 'old');
    expect(result).toEqual({ ok: false, message: 'conflicto' });
    expect(state().records).toEqual([record]);
    expect(m.backup).not.toHaveBeenCalled();
    expect(m.cache).not.toHaveBeenCalled();
  });
  it('elimina solo el vínculo confirmado y conserva los otros si falla la relectura', async () => {
    const other = { ...record, id: 'b' };
    useVinculogramaStore.setState({ records: [record, other] });
    expect(await state().removeWithConcurrencyCheck('a', stamp)).toMatchObject({ ok: true });
    expect(m.remove).toHaveBeenCalledWith(record, stamp);
    expect(state().records).toEqual([other]);
    expect(m.backup).toHaveBeenCalledWith([other]);
  });
});

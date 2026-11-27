import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_LICENCIA_SIN_SUELDO_DRAFT, buildLicenciaSinSueldoRecord } from '../domain/licenciaSinSueldo';
import { useLicenciasSinSueldoStore } from './useLicenciasSinSueldoStore';

const m = vi.hoisted(() => ({ available: vi.fn(), load: vi.fn(), rows: vi.fn(), save: vi.fn(), remove: vi.fn(), read: vi.fn(), cache: vi.fn(), backup: vi.fn(), audit: vi.fn(), fallbackNew: vi.fn(), fallbackUpdate: vi.fn() }));
vi.mock('./licenciaSinSueldoSqliteRepository', () => ({
  hasLicenciaSinSueldoSqliteRepository: m.available, loadLicenciasSinSueldoFromSqlite: m.load,
  loadLicenciaSinSueldoRecordsFromSqlite: m.rows, saveLicenciaSinSueldoToSqlite: m.save, deleteLicenciaSinSueldoInSqlite: m.remove,
}));
vi.mock('../../../services/persistence', () => ({ readStorageItem: m.read, writeRendererStorageCache: m.cache }));
vi.mock('../../../services/sharedRecordPersistence', () => ({ saveNewSharedArrayRecord: m.fallbackNew, saveSharedArrayRecord: m.fallbackUpdate }));
vi.mock('../../../shared/export/operationalExcelBackups', () => ({ syncLicenciasExcelBackup: m.backup, appendBackupMessage: (message: string) => message }));
vi.mock('../../../shared/audit/auditTrail', async original => ({ ...await original<typeof import('../../../shared/audit/auditTrail')>(), addAuditEvent: m.audit }));

const stamp = '2026-01-01T00:00:00.000Z';
const draft = { ...EMPTY_LICENCIA_SIN_SUELDO_DRAFT, numeroEmpleado: '100', nombreCompleto: 'Persona ficticia', fechaSolicitud: '2026-01-01', fechaInicio: '2026-02-01', fechaFin: '2026-03-01' };
const record = buildLicenciaSinSueldoRecord(draft, stamp, 'a');
const row = { id: 'a', value: JSON.stringify(record), updatedAt: stamp };
const state = () => useLicenciasSinSueldoStore.getState();
beforeEach(() => {
  vi.resetAllMocks();
  m.available.mockReturnValue(true);
  m.rows.mockResolvedValue([row]);
  m.load.mockResolvedValue([record]);
  m.save.mockResolvedValue({ ok: true, message: 'guardado' });
  m.remove.mockResolvedValue({ ok: true, message: 'eliminado' });
  m.backup.mockResolvedValue(undefined);
  useLicenciasSinSueldoStore.setState({ records: [record] });
});
describe('T6B: persistencia de Licencias sin sueldo', () => {
  it('carga la lista compartida y refleja los datos en caché', async () => {
    useLicenciasSinSueldoStore.setState({ records: [] });
    await state().load();
    expect(state().records).toEqual([record]);
    expect(m.cache).toHaveBeenCalledWith(expect.any(String), JSON.stringify([record]), 'sqlite');
  });
  it('no sustituye la referencia de la lista si la recarga es equivalente', async () => {
    const before = state().records;
    m.load.mockResolvedValue([{ ...record }]);
    await state().reloadFromStorage();
    expect(state().records).toBe(before);
  });
  it('crea una licencia con OCC nulo y actualiza Excel tras el commit', async () => {
    expect(await state().createWithConcurrencyCheck({ ...draft, numeroEmpleado: ' 200 ' })).toMatchObject({ ok: true });
    expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ numeroEmpleado: '200', deletedAt: null }), null);
    expect(state().records).toHaveLength(2);
    expect(m.backup).toHaveBeenCalledWith(state().records);
  });
  it('rechaza alta no confirmada sin tocar caché ni Excel', async () => {
    m.save.mockResolvedValue({ ok: false, message: 'conflicto' });
    expect(await state().createWithConcurrencyCheck(draft)).toMatchObject({ ok: false });
    expect(state().records).toEqual([record]);
    expect(m.cache).not.toHaveBeenCalled();
    expect(m.backup).not.toHaveBeenCalled();
  });
  it('edita usando la versión compartida y preserva la fecha de creación', async () => {
    expect(await state().updateWithConcurrencyCheck('a', { ...draft, observaciones: ' Revisado ' }, stamp)).toMatchObject({ ok: true });
    expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', createdAt: stamp, observaciones: 'Revisado' }), stamp);
    expect(state().records[0].observaciones).toBe('Revisado');
  });
  it.each(['update', 'remove'])('rechaza %s con versión obsoleta sin escribir', async op => {
    const result = op === 'update' ? await state().updateWithConcurrencyCheck('a', draft, 'old') : await state().removeWithConcurrencyCheck('a', 'old');
    expect(result.ok).toBe(false);
    expect(m.save).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.backup).not.toHaveBeenCalled();
    expect(state().records).toEqual([record]);
  });
  it('elimina solo tras confirmación y sincroniza lista vacía', async () => {
    expect(await state().removeWithConcurrencyCheck('a', stamp)).toMatchObject({ ok: true });
    expect(m.remove).toHaveBeenCalledWith(record, stamp);
    expect(state().records).toEqual([]);
    expect(m.backup).toHaveBeenCalledWith([]);
  });
  it('conserva registro si falla la eliminación', async () => {
    m.remove.mockRejectedValue(new Error('timeout'));
    expect(await state().removeWithConcurrencyCheck('a', stamp)).toEqual({ ok: false, message: 'timeout' });
    expect(state().records).toEqual([record]);
    expect(m.cache).not.toHaveBeenCalled();
    expect(m.backup).not.toHaveBeenCalled();
  });
});

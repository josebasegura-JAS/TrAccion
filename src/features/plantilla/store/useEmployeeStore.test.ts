import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_EMPLOYEE_DRAFT } from '../domain/employee';
import { hydrateEmployee } from '../domain/derived';
import { useEmployeeStore } from './useEmployeeStore';

const mocks = vi.hoisted(() => ({
  available: vi.fn(), batch: vi.fn(), load: vi.fn(), save: vi.fn(), saveBatch: vi.fn(),
  read: vi.fn(), write: vi.fn(), feedback: vi.fn(), fallbackNew: vi.fn(), fallbackUpdate: vi.fn(),
}));
vi.mock('./employeeSqliteRepository', () => ({
  hasEmployeeSqliteRepository: mocks.available, hasEmployeeSqliteBatchRepository: mocks.batch,
  loadEmployeesFromSqlite: mocks.load, saveEmployeeToSqlite: mocks.save, saveEmployeesToSqlite: mocks.saveBatch,
}));
vi.mock('../../../services/persistence', () => ({ readStorageItem: mocks.read, writeJsonStorageAsync: mocks.write }));
vi.mock('../../../services/persistenceFeedback', () => ({ emitPersistenceFeedback: mocks.feedback }));
vi.mock('../../../services/sharedRecordPersistence', () => ({
  saveNewSharedArrayRecord: mocks.fallbackNew, saveSharedArrayRecord: mocks.fallbackUpdate,
}));

const draft = { ...EMPTY_EMPLOYEE_DRAFT, empleado: '100', nombreApellidos: 'Persona ficticia' };
const employee = hydrateEmployee(draft, null);
const state = () => useEmployeeStore.getState();
beforeEach(() => {
  vi.resetAllMocks();
  mocks.available.mockReturnValue(true);
  mocks.load.mockResolvedValue([employee]);
  mocks.save.mockResolvedValue({ ok: true, message: 'guardado', currentValue: null });
  mocks.read.mockReturnValue(null);
  useEmployeeStore.setState({ employees: [employee], selectedEmployeeId: '100', jobPositionTranslations: [], isLoading: false });
});

describe('T6A: persistencia de Plantilla', () => {
  it('conserva los datos visibles si se pierde SQLite durante una recarga', async () => {
    mocks.load.mockResolvedValue(null);
    await expect(state().reloadFromStorage()).rejects.toThrow(/SQLite/);
    expect(state().employees).toEqual([employee]);
    expect(state().isLoading).toBe(false);
  });

  it('crea una persona con expectativa de inexistencia y selecciona el registro confirmado', async () => {
    const next = { ...draft, empleado: '200' };
    mocks.load.mockResolvedValue([employee, hydrateEmployee(next, null)]);
    expect(await state().createWithConcurrencyCheck(next)).toMatchObject({ ok: true, recordId: '200' });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ empleado: '200', deletedAt: null }), null);
    expect(state().selectedEmployeeId).toBe('200');
    expect(state().employees).toHaveLength(2);
  });

  it('no altera la plantilla si el alta entra en conflicto', async () => {
    mocks.save.mockResolvedValue({ ok: false, message: 'duplicado', currentValue: JSON.stringify(employee) });
    expect(await state().createWithConcurrencyCheck(draft)).toMatchObject({ ok: false });
    expect(state().employees).toEqual([employee]);
    expect(mocks.fallbackNew).not.toHaveBeenCalled();
  });

  it('no permite cambiar el identificador compartido de una persona', async () => {
    expect(await state().updateWithConcurrencyCheck('100', { ...draft, empleado: '200' }, JSON.stringify(employee))).toMatchObject({ ok: false });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('no reintenta una edición cuando otro usuario cambió realmente el registro', async () => {
    const changed = hydrateEmployee({ ...draft, nombreApellidos: 'Cambio remoto' }, null);
    mocks.load.mockResolvedValue([changed]);
    mocks.save.mockResolvedValue({ ok: false, message: 'conflicto', currentValue: JSON.stringify(changed) });
    expect(await state().updateWithConcurrencyCheck('100', { ...draft, email: 'test@example.invalid' }, JSON.stringify(employee))).toMatchObject({ ok: false });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.fallbackUpdate).not.toHaveBeenCalled();
    expect(state().employees).toEqual([employee]);
  });

  it('aplica una edición confirmada conservando la fecha de baja existente', async () => {
    const deletedAt = '2026-01-01T00:00:00.000Z';
    const old = hydrateEmployee(draft, deletedAt);
    const next = { ...draft, nombreApellidos: 'Nombre corregido' };
    mocks.load.mockResolvedValueOnce([old]).mockResolvedValueOnce([hydrateEmployee(next, deletedAt)]);
    expect(await state().updateWithConcurrencyCheck('100', next, JSON.stringify(old))).toMatchObject({ ok: true });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ deletedAt, nombreApellidos: next.nombreApellidos }), JSON.stringify(old));
    expect(state().employees[0].deletedAt).toBe(deletedAt);
  });

  it('elimina de forma lógica y selecciona otra persona activa tras confirmación', async () => {
    const other = hydrateEmployee({ ...draft, empleado: '200' }, null);
    mocks.load.mockResolvedValueOnce([employee, other]).mockResolvedValueOnce([{ ...employee, deletedAt: '2026-01-01T00:00:00.000Z' }, other]);
    expect(await state().removeWithConcurrencyCheck('100', JSON.stringify(employee))).toMatchObject({ ok: true });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ empleado: '100', deletedAt: expect.any(String) }), JSON.stringify(employee));
    expect(state().selectedEmployeeId).toBe('200');
  });

  it.each(['update', 'remove'])('rechaza %s si el registro ya no existe', async operation => {
    mocks.load.mockResolvedValue([]);
    const result = operation === 'update'
      ? await state().updateWithConcurrencyCheck('100', draft, JSON.stringify(employee))
      : await state().removeWithConcurrencyCheck('100', JSON.stringify(employee));
    expect(result.ok).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('normaliza un correo nuevo antes de guardarlo mediante OCC', async () => {
    const next = hydrateEmployee({ ...draft, email: 'test@example.invalid' }, null);
    mocks.load.mockResolvedValueOnce([employee]).mockResolvedValueOnce([next]);
    expect(await state().updateEmail('100', ' TEST@EXAMPLE.INVALID ')).toMatchObject({ ok: true });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ email: 'test@example.invalid' }), JSON.stringify(employee));
  });

  it.each(['empty', 'missing', 'duplicate', 'existing', 'same'])('no escribe si el correo no requiere o no admite cambios: %s', async kind => {
    const existing = hydrateEmployee({ ...draft, email: 'old@example.invalid' }, null);
    const other = hydrateEmployee({ ...draft, empleado: '200', email: 'test@example.invalid' }, null);
    if (kind === 'duplicate') useEmployeeStore.setState({ employees: [employee, other] });
    if (kind === 'existing' || kind === 'same') useEmployeeStore.setState({ employees: [existing] });
    const result = await state().updateEmail(kind === 'missing' ? '999' : '100',
      kind === 'empty' ? ' ' : kind === 'same' ? 'OLD@example.invalid' : 'test@example.invalid');
    expect(result.ok).toBe(kind === 'same');
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useActasStore } from './useActasStore';

const m = vi.hoisted(() => ({ available: vi.fn(), save: vi.fn(), remove: vi.fn(), load: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('./actaTypesSqliteRepository', () => ({
  hasActaTypesSqliteRepository: m.available, saveActaTypeToSqlite: m.save,
  deleteActaTypeInSqlite: m.remove, loadActaTypeRecordsFromSqlite: m.load,
}));
vi.mock('../../../services/persistence', async original => ({
  ...await original<typeof import('../../../services/persistence')>(), readStorageItem: m.read, writeStorageItem: m.write,
}));
const state = () => useActasStore.getState();
beforeEach(() => {
  vi.resetAllMocks();
  m.available.mockReturnValue(true);
  m.save.mockResolvedValue({ ok: true, currentUpdatedAt: 'token-created' });
  m.remove.mockResolvedValue({ ok: true });
  useActasStore.setState({ actas: [], actaTypes: [], hasLoadedHistoricalActas: false });
});
describe('T6C: tipos de actas', () => {
  it('normaliza el nombre y utiliza el token confirmado en la siguiente edición', async () => {
    expect(await state().createActaType('  Comisión   técnica  ')).toMatchObject({ ok: true });
    const type = state().actaTypes[0];
    expect(type.nombre).toBe('Comisión técnica');
    expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ nombre: type.nombre }), null);
    m.save.mockResolvedValue({ ok: true, currentUpdatedAt: 'token-disabled' });
    expect(await state().toggleActaType(type.id)).toMatchObject({ ok: true });
    expect(m.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: type.id, disabled: true }), 'token-created');
    expect(await state().removeActaType(type.id)).toMatchObject({ ok: true });
    expect(m.remove).toHaveBeenCalledWith(expect.objectContaining({ id: type.id }), 'token-disabled');
    expect(state().actaTypes).toEqual([]);
  });
  it('rechaza nombres vacíos y duplicados sin escribir', async () => {
    expect(await state().createActaType(' ')).toMatchObject({ ok: false });
    await state().createActaType('Comisión de prueba');
    m.save.mockClear();
    expect(await state().createActaType(' COMISIÓN DE PRUEBA ')).toMatchObject({ ok: false });
    expect(m.save).not.toHaveBeenCalled();
  });
  it('conserva el catálogo si SQLite rechaza el alta', async () => {
    m.save.mockResolvedValue({ ok: false, message: 'conflicto' });
    expect(await state().createActaType('Tipo nuevo')).toMatchObject({ ok: false });
    expect(state().actaTypes).toEqual([]);
  });
  it.each(['toggle', 'remove'])('conserva el catálogo ante conflicto de %s', async operation => {
    await state().createActaType('Tipo existente');
    const before = state().actaTypes;
    m.save.mockResolvedValue({ ok: false, message: 'conflicto' });
    m.remove.mockResolvedValue({ ok: false, message: 'conflicto' });
    const result = operation === 'toggle' ? await state().toggleActaType(before[0].id) : await state().removeActaType(before[0].id);
    expect(result.ok).toBe(false);
    expect(state().actaTypes).toBe(before);
  });
});

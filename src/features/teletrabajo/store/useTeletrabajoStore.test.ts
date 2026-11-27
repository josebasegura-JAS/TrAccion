import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_TELETRABAJO_DRAFT, type TeletrabajoSolicitud } from '../domain/solicitud';
import { useTeletrabajoStore } from './useTeletrabajoStore';

const mocks = vi.hoisted(() => ({
  available: vi.fn(), load: vi.fn(), loadSolicitudes: vi.fn(), save: vi.fn(), remove: vi.fn(), batch: vi.fn(),
  audit: vi.fn(), busy: vi.fn(), clear: vi.fn(),
}));
vi.mock('./teletrabajoSqliteRepository', () => ({
  hasTeletrabajoSqliteRepository: mocks.available, loadTeletrabajoRecordsFromSqlite: mocks.load,
  loadTeletrabajoSolicitudesFromSqlite: mocks.loadSolicitudes,
  saveTeletrabajoSolicitudToSqlite: mocks.save, deleteTeletrabajoSolicitudInSqlite: mocks.remove,
  saveTeletrabajoSolicitudesToSqlite: mocks.batch,
}));
vi.mock('../../../services/persistence', async importOriginal => ({
  ...await importOriginal<typeof import('../../../services/persistence')>(),
  publishPersistenceBusy: mocks.busy, clearPersistenceBusy: mocks.clear, waitForNextPaint: async () => undefined,
}));
vi.mock('../../../shared/audit/auditTrail', async importOriginal => ({
  ...await importOriginal<typeof import('../../../shared/audit/auditTrail')>(), enqueueAuditEvent: mocks.audit,
}));
vi.mock('./teletrabajoPuestos.helpers', async importOriginal => ({
  ...await importOriginal<typeof import('./teletrabajoPuestos.helpers')>(),
  loadPuestosYGruposConMigracion: async () => ({ puestos: [], gruposCobertura: [] }),
}));

const stamp = '2026-09-01T10:00:00.000Z';
const draft = { ...EMPTY_TELETRABAJO_DRAFT, empleado: '100', nombreApellidos: 'Persona ficticia',
  periodo: '2026-2027', fechaSolicitud: '2026-09-01' };
const original: TeletrabajoSolicitud = { ...draft, id: 'one', modalidadTramitacion: 'extraordinaria',
  createdAt: stamp, updatedAt: stamp, deletedAt: null };
const row = (value: TeletrabajoSolicitud = original) => ({ id: value.id, value: JSON.stringify(value), updatedAt: value.updatedAt });
const state = () => useTeletrabajoStore.getState();

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 27, 12));
  mocks.available.mockReturnValue(true);
  mocks.load.mockResolvedValue([row()]);
  mocks.loadSolicitudes.mockResolvedValue([original]);
  mocks.save.mockResolvedValue({ ok: true, message: 'guardado' });
  mocks.remove.mockResolvedValue({ ok: true, message: 'eliminado' });
  useTeletrabajoStore.setState({ solicitudes: [original], puestosTeletrabajo: [], gruposCobertura: [],
    selectedSolicitudId: original.id, pendingHistoricoImport: null });
});
afterEach(() => vi.useRealTimers());

describe('T6A: persistencia de solicitudes de Teletrabajo', () => {
  it('mantiene datos y selección cuando falla la recarga SQLite', async () => {
    mocks.loadSolicitudes.mockResolvedValue(null);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(state().reloadFromStorage()).rejects.toThrow(/SQLite/);
      expect(state().solicitudes).toEqual([original]);
      expect(state().selectedSolicitudId).toBe(original.id);
    } finally { log.mockRestore(); }
  });

  it('crea una solicitud extraordinaria normalizada con expectativa OCC nula', async () => {
    expect(await state().createWithConcurrencyCheck({ ...draft, empleado: ' 200 ', diasTeletrabajo: ['jueves', 'martes'] }))
      .toMatchObject({ ok: true });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      empleado: '200', modalidadTramitacion: 'extraordinaria', diasTeletrabajo: ['martes', 'jueves'], deletedAt: null,
    }), null);
    expect(state().solicitudes).toHaveLength(2);
    expect(state().selectedSolicitudId).not.toBe(original.id);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'created' }));
  });

  it('no admite altas ordinarias retroactivas con campaña cerrada', async () => {
    expect(await state().createWithConcurrencyCheck({ ...draft, fechaSolicitud: '2026-07-01' })).toMatchObject({ ok: false });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(state().solicitudes).toEqual([original]);
  });

  it('no modifica ni audita un alta rechazada por SQLite', async () => {
    mocks.save.mockResolvedValue({ ok: false, message: 'conflicto' });
    expect(await state().createWithConcurrencyCheck(draft)).toEqual({ ok: false, message: 'conflicto' });
    expect(state().solicitudes).toEqual([original]);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.clear).toHaveBeenCalledTimes(1);
  });

  it('omite escrituras si la edición no cambia ningún campo', async () => {
    expect(await state().updateWithConcurrencyCheck(original.id, draft, stamp)).toMatchObject({ ok: true });
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('guarda cambios con la versión compartida y conserva clasificación e identidad', async () => {
    expect(await state().updateWithConcurrencyCheck(original.id, { ...draft, estado: 'aprobada' }, stamp)).toMatchObject({ ok: true });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      id: original.id, estado: 'aprobada', modalidadTramitacion: 'extraordinaria', createdAt: stamp,
    }), stamp);
    expect(state().solicitudes[0].estado).toBe('aprobada');
    expect(state().selectedSolicitudId).toBe(original.id);
  });

  it.each(['missing', 'conflict', 'invalid'])('rechaza editar un registro compartido no válido: %s', async kind => {
    mocks.load.mockResolvedValue(kind === 'missing' ? [] : kind === 'conflict'
      ? [row({ ...original, updatedAt: '2026-10-01T10:00:00.000Z' })] : [{ ...row(), value: '{' }]);
    expect(await state().updateWithConcurrencyCheck(original.id, { ...draft, estado: 'aprobada' }, stamp)).toMatchObject({ ok: false });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(state().solicitudes).toEqual([original]);
  });

  it('impide reclasificar una solicitud extraordinaria como ordinaria mediante edición', async () => {
    expect(await state().updateWithConcurrencyCheck(original.id, { ...draft, fechaSolicitud: '2026-07-01' }, stamp)).toMatchObject({ ok: false });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('conserva el estado visible si falla el guardado de una edición', async () => {
    mocks.save.mockRejectedValue(new Error('timeout'));
    expect(await state().updateWithConcurrencyCheck(original.id, { ...draft, estado: 'aprobada' }, stamp)).toEqual({ ok: false, message: 'timeout' });
    expect(state().solicitudes).toEqual([original]);
    expect(mocks.clear).toHaveBeenCalledTimes(1);
  });

  it('elimina una solicitud extraordinaria solo después de confirmación y actualiza selección', async () => {
    const other = { ...original, id: 'two', empleado: '200' };
    mocks.load.mockResolvedValue([row(), row(other)]);
    expect(await state().removeWithConcurrencyCheck(original.id, stamp)).toMatchObject({ ok: true });
    expect(mocks.remove).toHaveBeenCalledWith(expect.objectContaining({ id: original.id }), stamp);
    expect(state().solicitudes.map(s => s.id)).toEqual(['two']);
    expect(state().selectedSolicitudId).toBe('two');
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'deleted' }));
  });

  it('no elimina una ordinaria cuando la admisión de la campaña está cerrada', async () => {
    mocks.load.mockResolvedValue([row({ ...original, modalidadTramitacion: 'ordinaria', fechaSolicitud: '2026-07-01' })]);
    expect(await state().removeWithConcurrencyCheck(original.id, stamp)).toMatchObject({ ok: false });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it.each(['missing', 'conflict', 'failure'])('conserva la solicitud si falla la eliminación: %s', async kind => {
    if (kind === 'missing') mocks.load.mockResolvedValue([]);
    if (kind === 'conflict') mocks.load.mockResolvedValue([row({ ...original, updatedAt: '2026-10-01T10:00:00.000Z' })]);
    if (kind === 'failure') mocks.remove.mockResolvedValue({ ok: false, message: 'fallo' });
    expect(await state().removeWithConcurrencyCheck(original.id, stamp)).toMatchObject({ ok: false });
    expect(state().solicitudes).toEqual([original]);
    expect(mocks.remove).toHaveBeenCalledTimes(kind === 'failure' ? 1 : 0);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('no crea, modifica ni elimina solicitudes cuando SQLite no está activa', async () => {
    mocks.load.mockResolvedValue(null);
    expect(await state().createWithConcurrencyCheck(draft)).toMatchObject({ ok: false });
    expect(await state().updateWithConcurrencyCheck(original.id, { ...draft, estado: 'aprobada' }, stamp)).toMatchObject({ ok: false });
    expect(await state().removeWithConcurrencyCheck(original.id, stamp)).toMatchObject({ ok: false });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(state().solicitudes).toEqual([original]);
  });
});

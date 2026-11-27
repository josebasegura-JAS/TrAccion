import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useActividadesExternasStore } from './useActividadesExternasStore';
import type { ActividadExterna, ActividadExternaDraft } from '../domain/actividadExterna';

const m = vi.hoisted(() => ({ read: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), backup: vi.fn() }));
vi.mock('../../../services/persistence', () => ({ readStorageItem: m.read }));
vi.mock('../../../services/sharedRecordPersistence', () => ({
  saveNewSharedArrayRecord: m.create, saveSharedArrayRecord: m.update, deleteSharedArrayRecord: m.remove,
}));
vi.mock('../services/actividadesExternasExcelBackup', () => ({ syncActividadesExternasExcelBackup: m.backup }));

const stamp = '2026-01-01T00:00:00.000Z';
const draft: ActividadExternaDraft = { empleado: '100', nombre: 'Persona ficticia', email: 'test@example.invalid', actividad: 'Docencia', fechaSolicitud: '2026-01-01', remunerada: true };
const record: ActividadExterna = { ...draft, id: 'a', estado: 'pendiente', motivoDenegacion: '', fechaResolucion: null, comunicacion: 'pendiente', fechaComunicacion: null, createdAt: stamp, updatedAt: stamp };
const state = () => useActividadesExternasStore.getState();
beforeEach(() => {
  vi.resetAllMocks();
  useActividadesExternasStore.setState({ records: [record] });
  m.create.mockImplementation(async ({ newRecord }) => ({ records: [record, newRecord], newRecord }));
  m.update.mockImplementation(async ({ updateRecord }) => ({ records: [updateRecord(state().records[0])] }));
  m.remove.mockResolvedValue({ records: [] });
});
describe('T6C: actividades externas', () => {
  it('carga únicamente registros reconocibles', () => {
    m.read.mockReturnValue(JSON.stringify([record, null, { ...record, estado: 'invalido' }]));
    state().load();
    expect(state().records).toEqual([record]);
  });
  it('crea una solicitud pendiente normalizada y publica Excel tras confirmar', async () => {
    expect(await state().create({ ...draft, actividad: ' Docencia ' })).toMatchObject({ ok: true });
    expect(state().records[1]).toMatchObject({ actividad: 'Docencia', estado: 'pendiente', comunicacion: 'pendiente' });
    expect(m.backup).toHaveBeenCalledWith(state().records);
  });
  it('rechaza altas sin actividad', async () => {
    expect(await state().create({ ...draft, actividad: ' ' })).toMatchObject({ ok: false });
    expect(m.create).not.toHaveBeenCalled();
  });
  it('edita mediante OCC y conserva la identidad', async () => {
    expect(await state().update('a', { ...draft, actividad: ' Formación ' }, ' Revisado ')).toMatchObject({ ok: true });
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ recordId: 'a', expectedUpdatedAt: stamp }));
    expect(state().records[0]).toMatchObject({ id: 'a', actividad: 'Formación', observacionesRrll: 'Revisado', createdAt: stamp });
  });
  it('tramita propuesta, autorización y comunicación confirmada', async () => {
    expect(await state().resolve('a', 'propuesta', ' Conforme ')).toMatchObject({ ok: true });
    expect(state().records[0]).toMatchObject({ estado: 'propuesta', observacionesRrll: 'Conforme', fechaRevisionRrll: expect.any(String) });
    expect(await state().resolve('a', 'autorizada', 'Aprobada')).toMatchObject({ ok: true });
    expect(state().records[0]).toMatchObject({ estado: 'autorizada', fechaResolucion: expect.any(String) });
    expect(await state().setComunicacion('a', 'confirmada')).toMatchObject({ ok: true });
    expect(state().records[0]).toMatchObject({ comunicacion: 'confirmada', fechaComunicacion: expect.any(String) });
  });
  it('impide saltar directamente a autorización', async () => {
    expect(await state().resolve('a', 'autorizada', '')).toMatchObject({ ok: false });
    expect(m.update).not.toHaveBeenCalled();
  });
  it('exige motivo para rechazar', async () => {
    expect(await state().resolve('a', 'rechazada_rrll', ' ')).toMatchObject({ ok: false });
    expect(m.update).not.toHaveBeenCalled();
  });
  it('rechaza una transición si la fase compartida cambió durante el guardado', async () => {
    m.update.mockImplementation(async ({ updateRecord }) => ({ records: [updateRecord({ ...record, estado: 'rechazada_rrll' })] }));
    expect(await state().resolve('a', 'propuesta', '')).toMatchObject({ ok: false });
    expect(state().records).toEqual([record]);
    expect(m.backup).not.toHaveBeenCalled();
  });
  it('no confirma comunicación de una solicitud todavía propuesta', async () => {
    useActividadesExternasStore.setState({ records: [{ ...record, estado: 'propuesta' }] });
    expect(await state().setComunicacion('a', 'confirmada')).toMatchObject({ ok: false });
    expect(m.backup).not.toHaveBeenCalled();
  });
  it('elimina mediante OCC y publica solo la lista confirmada', async () => {
    expect(await state().remove('a')).toMatchObject({ ok: true });
    expect(m.remove).toHaveBeenCalledWith(expect.objectContaining({ recordId: 'a', expectedUpdatedAt: stamp }));
    expect(state().records).toEqual([]);
    expect(m.backup).toHaveBeenCalledWith([]);
  });
  it.each(['update', 'remove', 'resolve'] as const)('conserva los registros ante conflicto de %s', async op => {
    m.update.mockRejectedValue(new Error('conflicto'));
    m.remove.mockRejectedValue(new Error('conflicto'));
    const result = op === 'update' ? await state().update('a', draft) : op === 'remove' ? await state().remove('a') : await state().resolve('a', 'propuesta', '');
    expect(result).toEqual({ ok: false, message: 'conflicto' });
    expect(state().records).toEqual([record]);
    expect(m.backup).not.toHaveBeenCalled();
  });
});

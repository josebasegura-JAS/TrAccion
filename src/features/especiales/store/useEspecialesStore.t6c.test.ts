import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEspecialesStore } from './useEspecialesStore';
import { buildEspecialRecipient, type EspecialRecipientDraft } from '../domain/especiales';

const m = vi.hoisted(() => ({ read: vi.fn(), cache: vi.fn(), load: vi.fn(), save: vi.fn(), fallbackNew: vi.fn(), fallbackUpdate: vi.fn() }));
vi.mock('../../../services/persistence', () => ({ readStorageItem: m.read, writeRendererStorageCache: m.cache }));
vi.mock('../../../services/sharedRecordPersistence', () => ({ saveNewSharedArrayRecord: m.fallbackNew, saveSharedArrayRecord: m.fallbackUpdate }));
const stamp = '2026-01-01T00:00:00.000Z';
const draft: EspecialRecipientDraft = { name: 'Persona ficticia', email: 'test@example.invalid', type: 'to' };
const record = buildEspecialRecipient(draft, stamp, 'a');
const row = { id: 'a', value: JSON.stringify(record), updatedAt: stamp };
const state = () => useEspecialesStore.getState();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('traccion', { loadEspecialesRecipientRecords: m.load, saveEspecialesRecipientRecordIfUnchanged: m.save });
  m.load.mockResolvedValue({ status: { ready: true, phase: 'active' }, records: [row] });
  m.save.mockResolvedValue({ ok: true, currentUpdatedAt: 'next', message: 'guardado' });
  useEspecialesStore.setState({ recipients: [record] });
});
afterEach(() => vi.unstubAllGlobals());

describe('T6C: destinatarios de Especiales', () => {
  it.each([{ ...draft, name: ' ' }, { ...draft, email: 'incorrecto' }])('rechaza datos inválidos sin llamar a SQLite', async invalid => {
    expect(await state().createRecipientWithConcurrencyCheck(invalid)).toMatchObject({ ok: false });
    expect(m.load).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  });
  it('rechaza duplicados entre Para y CC sin distinguir mayúsculas', async () => {
    expect(await state().createRecipientWithConcurrencyCheck({ ...draft, email: ' TEST@example.invalid ', type: 'cc' })).toMatchObject({ ok: false });
    expect(m.save).not.toHaveBeenCalled();
  });
  it('crea un destinatario confirmado con versión OCC nula', async () => {
    const result = await state().createRecipientWithConcurrencyCheck({ ...draft, name: ' Otro ', email: 'other@example.invalid', type: 'cc' });
    expect(result.ok).toBe(true);
    expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ id: result.recordId, expectedUpdatedAt: null }));
    expect(state().recipients[1]).toMatchObject({ name: 'Otro', type: 'cc', sqliteUpdatedAt: 'next' });
  });
  it('permite editar el propio correo sin confundirlo con un duplicado', async () => {
    expect(await state().updateRecipientWithConcurrencyCheck('a', { ...draft, name: 'Editado', type: 'cc' }, stamp)).toMatchObject({ ok: true });
    expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', expectedUpdatedAt: stamp }));
    expect(state().recipients[0]).toMatchObject({ name: 'Editado', type: 'cc', createdAt: stamp });
  });
  it('no aplica cambios rechazados por concurrencia', async () => {
    m.save.mockResolvedValue({ ok: false, message: 'conflicto' });
    expect(await state().updateRecipientWithConcurrencyCheck('a', { ...draft, name: 'Editado' }, 'old')).toEqual({ ok: false, message: 'conflicto' });
    expect(state().recipients).toEqual([record]);
    expect(m.fallbackUpdate).not.toHaveBeenCalled();
  });
  it('elimina lógicamente el destinatario conservando su identidad', async () => {
    expect(await state().removeRecipientWithConcurrencyCheck('a', stamp)).toMatchObject({ ok: true });
    const payload = m.save.mock.calls[0][0];
    expect(payload.expectedUpdatedAt).toBe(stamp);
    expect(JSON.parse(payload.value)).toMatchObject({ id: 'a', deletedAt: expect.any(String) });
    expect(state().recipients[0].deletedAt).toBeTruthy();
  });
  it.each(['update', 'remove'])('rechaza %s cuando el destinatario no existe', async op => {
    m.load.mockResolvedValue({ status: { ready: true, phase: 'active' }, records: [] });
    const result = op === 'update' ? await state().updateRecipientWithConcurrencyCheck('a', draft, stamp) : await state().removeRecipientWithConcurrencyCheck('a', stamp);
    expect(result.ok).toBe(false);
    expect(m.save).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultLotteryCampaign } from '../domain/loteria';
import { LOTTERY_STORAGE_KEY, useLoteriaStore } from './useLoteriaStore';

const mocks = vi.hoisted(() => ({
  read: vi.fn(), write: vi.fn(), cache: vi.fn(), status: vi.fn(),
  feedback: vi.fn(), busy: vi.fn(), clear: vi.fn(), load: vi.fn(), save: vi.fn(),
}));
vi.mock('../../../services/persistence', () => ({
  readStorageItem: mocks.read, writeStorageItem: mocks.write, writeRendererStorageCache: mocks.cache,
}));
vi.mock('../../../services/databaseStatus', () => ({ publishDatabaseStatus: mocks.status }));
vi.mock('../../../services/persistenceFeedback', () => ({
  emitPersistenceFeedback: mocks.feedback, publishPersistenceBusy: mocks.busy, clearPersistenceBusy: mocks.clear,
}));

const year = new Date().getFullYear();
const active = { ready: true, phase: 'active' };
const stamp = '2026-10-01T10:00:00.000Z';
const campaign = () => createDefaultLotteryCampaign(year);
const closed = () => { const value = campaign(); value.workflow.campanaCerrada = true; return value; };
const row = (value = campaign()) => ({ id: String(value.year), value: JSON.stringify(value), updatedAt: stamp });
const request = { id: 'person-1', nombre: 'Persona ficticia', decimosNumero1: 2, decimosNumero2: 1, pagado: true, formaPago: 'bizum' };
const requestRow = { id: request.id, campaignYear: year, value: JSON.stringify(request), updatedAt: stamp };
function snapshot(campaigns = [row()], requests: unknown[] = []) { return { status: active, campaigns, requests }; }
const state = () => useLoteriaStore.getState();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('traccion', { loadLoteriaRecords: mocks.load, saveLoteriaSnapshotIfUnchanged: mocks.save });
  mocks.load.mockResolvedValue(snapshot());
  mocks.save.mockResolvedValue({ ok: true, status: active, message: 'guardado', campaignUpdatedAt: stamp, requestUpdatedAt: {} });
  useLoteriaStore.setState({ campaign: campaign(), campaignUpdatedAt: null, requestUpdatedAt: {} });
});
afterEach(() => vi.unstubAllGlobals());

describe('T5: persistencia y cambio de campaña de Lotería', () => {
  it('carga solo las solicitudes del año activo y conserva sus versiones OCC', async () => {
    mocks.load.mockResolvedValue(snapshot([row()], [requestRow, { ...requestRow, id: 'old', campaignYear: year - 1 }]));
    await state().reloadFromStorage();
    expect(state().campaign.requests).toMatchObject([request]);
    expect(state().campaignUpdatedAt).toBe(stamp);
    expect(state().requestUpdatedAt).toEqual({ [request.id]: stamp });
    expect(mocks.cache).toHaveBeenCalledWith(LOTTERY_STORAGE_KEY, expect.any(String), 'sqlite');
  });

  it.each(['campaign-json', 'request-json', 'request-id', 'campaign-array'])('conserva el estado anterior si SQLite devuelve datos inválidos: %s', kind => {
    const previous = state().campaign;
    if (kind === 'campaign-json') mocks.load.mockResolvedValue(snapshot([{ ...row(), value: '{' }]));
    else if (kind === 'campaign-array') mocks.load.mockResolvedValue(snapshot([{ ...row(), value: '[]' }]));
    else mocks.load.mockResolvedValue(snapshot([row()], [{ ...requestRow, value: kind === 'request-json' ? '{' : JSON.stringify({ ...request, id: 'wrong' }) }]));
    return expect(state().reloadFromStorage()).rejects.toThrow().then(() => {
      expect(state().campaign).toBe(previous);
      expect(mocks.cache).not.toHaveBeenCalled();
      expect(mocks.feedback).toHaveBeenCalled();
    });
  });

  it('envía las versiones OCC y separa solicitudes de la cabecera al guardar', async () => {
    mocks.load.mockResolvedValue(snapshot([row()], [requestRow]));
    await state().reloadFromStorage();
    const next = { ...state().campaign, precioDecimo: 25 };
    await expect(state().saveCampaign(next)).resolves.toMatchObject({ ok: true });
    expect(mocks.save).toHaveBeenCalledWith({
      year, campaignValue: JSON.stringify({ ...next, requests: [] }),
      requests: next.requests.map(r => ({ id: r.id, value: JSON.stringify(r) })),
      expectedCampaignUpdatedAt: stamp, expectedRequestUpdatedAt: { [request.id]: stamp },
    });
    expect(state().campaign.precioDecimo).toBe(25);
  });

  it('no altera estado ni caché si otro usuario ganó el guardado', async () => {
    const previous = state().campaign;
    mocks.save.mockResolvedValue({ ok: false, status: active, message: 'conflicto' });
    await expect(state().saveCampaign({ ...previous, precioDecimo: 25 })).resolves.toEqual({ ok: false, message: 'conflicto' });
    expect(state().campaign).toBe(previous);
    expect(mocks.cache).not.toHaveBeenCalled();
    expect(mocks.feedback).toHaveBeenCalled();
  });

  it('propaga un fallo de transporte sin confirmar el guardado', async () => {
    const previous = state().campaign;
    mocks.save.mockRejectedValue(new Error('timeout'));
    await expect(state().saveCampaign({ ...previous, precioDecimo: 25 })).rejects.toThrow('timeout');
    expect(state().campaign).toBe(previous);
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it('no permite abrir otra campaña antes de cerrar la actual', async () => {
    expect(await state().startNextCampaign()).toMatchObject({ ok: false });
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it.each(['existing', 'missing', 'open', 'invalid', 'inactive'])('rechaza abrir campaña si el estado compartido no lo permite: %s', async kind => {
    useLoteriaStore.setState({ campaign: closed() });
    const current = row(closed());
    if (kind === 'existing') mocks.load.mockResolvedValue(snapshot([current, row(createDefaultLotteryCampaign(year + 1))]));
    else if (kind === 'missing') mocks.load.mockResolvedValue(snapshot([]));
    else if (kind === 'open') mocks.load.mockResolvedValue(snapshot([row()]));
    else if (kind === 'invalid') mocks.load.mockResolvedValue(snapshot([{ ...current, value: '{' }]));
    else mocks.load.mockResolvedValue({ ...snapshot([current]), status: { ready: false, phase: 'locked' } });
    expect(await state().startNextCampaign()).toMatchObject({ ok: false });
    expect(state().campaign.year).toBe(year);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('abre la nueva campaña mediante inserción OCC y conserva el histórico en caché', async () => {
    const previous = closed();
    useLoteriaStore.setState({ campaign: previous });
    mocks.load.mockResolvedValue(snapshot([row(previous)]));
    mocks.read.mockReturnValue(JSON.stringify({ version: 2, campaigns: { [year]: previous } }));
    expect(await state().startNextCampaign()).toMatchObject({ ok: true });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      year: year + 1, expectedCampaignUpdatedAt: null, expectedRequestUpdatedAt: {}, requests: [],
    }));
    expect(state().campaign.year).toBe(year + 1);
    const archive = JSON.parse(mocks.cache.mock.calls[0][1]);
    expect(archive.campaigns[String(year)]).toEqual(previous);
    expect(archive.campaigns[String(year + 1)].year).toBe(year + 1);
  });

  it('no cambia de campaña si otro usuario la creó simultáneamente', async () => {
    useLoteriaStore.setState({ campaign: closed() });
    mocks.load.mockResolvedValue(snapshot([row(closed())]));
    mocks.save.mockResolvedValue({ ok: false, status: active, message: 'conflicto' });
    expect(await state().startNextCampaign()).toMatchObject({ ok: false });
    expect(state().campaign.year).toBe(year);
    expect(mocks.cache).not.toHaveBeenCalled();
  });
});

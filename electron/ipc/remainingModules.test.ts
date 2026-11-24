import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload?: unknown) => unknown>(),
  enqueue: vi.fn((channel: string, operation: () => unknown) => {
    if (!channel) throw new Error('Canal vacío');
    return operation();
  }),
  read: vi.fn(() => ({ records: [] })),
  write: vi.fn(() => ({ ok: true })),
  status: { ready: true, phase: 'active' },
  dialog: vi.fn(async () => ({ canceled: true, filePaths: [] as string[] })),
}));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (event: unknown, payload?: unknown) => unknown) => mocks.handlers.set(channel, handler) },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showOpenDialog: mocks.dialog },
}));
vi.mock('../sqliteIpcQueue.js', () => ({ enqueueSqliteIpc: mocks.enqueue }));
vi.mock('../outlookDraftCompat.js', () => ({ createOutlookDraftCompat: vi.fn() }));
vi.mock('../sqlitePersistence.js', () => ({
  getSqliteStatus: () => mocks.status,
  loadSorteosRecordsSnapshot: mocks.read,
  saveSorteosSnapshotIfUnchanged: mocks.write,
  loadPresupuestosRecordsSnapshot: mocks.read,
  savePresupuestosSnapshotIfUnchanged: mocks.write,
  loadLoteriaRecordsSnapshot: mocks.read,
  saveLoteriaSnapshotIfUnchanged: mocks.write,
  loadVinculogramaRecordsSnapshot: mocks.read,
  saveVinculogramaRecordIfUnchanged: mocks.write,
  loadLicenciaSinSueldoRecordsSnapshot: mocks.read,
  saveLicenciaSinSueldoRecordIfUnchanged: mocks.write,
  loadEspecialesRecipientRecordsSnapshot: mocks.read,
  saveEspecialesRecipientRecordIfUnchanged: mocks.write,
}));

import { registerSorteosIpc } from './registerSorteosIpc.js';
import { registerPresupuestosIpc } from './registerPresupuestosIpc.js';
import { registerLoteriaIpc } from './registerLoteriaIpc.js';
import { registerVinculogramaIpc } from './registerVinculogramaIpc.js';
import { registerLicenciasSinSueldoIpc } from './registerLicenciasSinSueldoIpc.js';
import { registerEspecialesIpc } from './registerEspecialesIpc.js';

function invoke(channel: string, payload?: unknown) {
  const handler = mocks.handlers.get(channel);
  if (!handler) throw new Error('Canal no registrado: ' + channel);
  return handler({}, payload);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
  registerSorteosIpc();
  registerPresupuestosIpc();
  registerLoteriaIpc();
  registerVinculogramaIpc();
  registerLicenciasSinSueldoIpc();
  registerEspecialesIpc();
});

const item = { id: 'test', value: '{}' };
const cases = [
  { module: 'sorteos', valid: { draws: [item], exclusions: [], expectedDrawsUpdatedAt: 'token', expectedExclusionsUpdatedAt: null },
    invalid: [{ draws: [null] }, { exclusions: [null] }, { expectedDrawsUpdatedAt: 1 }, { expectedExclusionsUpdatedAt: false }] },
  { module: 'presupuestos', valid: { scenarios: [item], manualItems: [], ticketGroups: [], actuals: [], expectedUpdatedAt: 'token' },
    invalid: [{ scenarios: [null] }, { manualItems: [null] }, { ticketGroups: [null] }, { actuals: [null] }, { expectedUpdatedAt: 1 }] },
  { module: 'loteria', valid: { year: 2026, campaignValue: '{}', requests: [item], expectedCampaignUpdatedAt: 'token', expectedRequestUpdatedAt: { test: null } },
    invalid: [{ year: '2026' }, { campaignValue: 1 }, { requests: [null] }, { expectedCampaignUpdatedAt: false }, { expectedRequestUpdatedAt: null }] },
];
const recordChannels = [
  ['vinculograma:load-records', 'vinculograma:save-record-if-unchanged'],
  ['licencias-sin-sueldo:load-records', 'licencias-sin-sueldo:save-record-if-unchanged'],
  ['especiales:load-recipient-records', 'especiales:save-recipient-record-if-unchanged'],
];
describe('IPC módulos auxiliares', () => {
  it.each(cases)('$module rechaza snapshots incompletos y tokens incorrectos', ({ module, valid, invalid }) => {
    const channel = module + ':save-snapshot-if-unchanged';
    for (const payload of [null, {}, ...invalid.map(patch => ({ ...valid, ...patch }))]) {
      expect(invoke(channel, payload)).toMatchObject({ ok: false, status: mocks.status });
    }
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it.each(cases)('$module conserva los datos y tokens en una única operación', ({ module, valid }) => {
    const channel = module + ':save-snapshot-if-unchanged';
    expect(invoke(channel, { ...valid, extra: true })).toEqual({ ok: true });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue).toHaveBeenCalledWith(channel, expect.any(Function));
    expect(mocks.write).toHaveBeenCalledWith(valid);
    invoke(module + ':load-records');
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it.each(recordChannels)('%s rechaza escrituras inválidas', (readChannel, saveChannel) => {
    for (const payload of [null, {}, { ...item, expectedUpdatedAt: 1 }, { ...item, expectedUpdatedAt: null, value: 2 }]) {
      expect(invoke(saveChannel, payload)).toMatchObject({ ok: false });
    }
    expect(mocks.handlers.has(readChannel)).toBe(true);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it.each(recordChannels)('%s usa la cola y conserva el token de escritura', (readChannel, saveChannel) => {
    const record = { ...item, expectedUpdatedAt: 'token' };
    invoke(saveChannel, { ...record, extra: true });
    expect(mocks.write).toHaveBeenCalledWith(record);
    expect(mocks.enqueue).toHaveBeenCalledWith(saveChannel, expect.any(Function));
    invoke(readChannel);
    expect(mocks.enqueue).toHaveBeenCalledWith(readChannel, expect.any(Function));
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it.each(['vinculograma', 'licencias-sin-sueldo', 'excedencia'])('%s rechaza plantillas que no sean DOCX', async (module) => {
    await expect(invoke(module + ':read-template', 'no-existe.exe')).rejects.toThrow('DOCX');
    await expect(invoke(module + ':select-template')).resolves.toBeNull();
  });
  it('Lotería rechaza exportaciones con contenido no binario', async () => {
    expect(await invoke('loteria:save-campaign-excel', { year: 2026, directoryTemplate: 'test', fileName: 'test.xlsx', buffer: 'invalid' })).toMatchObject({ ok: false, path: null });
  });
});

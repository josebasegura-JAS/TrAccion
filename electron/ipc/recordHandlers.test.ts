import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload?: unknown) => unknown>(),
  enqueue: vi.fn((channel: string, operation: () => unknown) => ({ channel, result: operation() })),
  write: vi.fn(() => ({ ok: true })),
  read: vi.fn(() => ({ records: [] })),
  status: { ready: false, phase: 'fallback' },
}));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (event: unknown, payload?: unknown) => unknown) => mocks.handlers.set(channel, handler) },
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
}));
vi.mock('../documentOpener.js', () => ({ openTeletrabajoWord: vi.fn() }));
vi.mock('../sqliteIpcQueue.js', () => ({ enqueueSqliteIpc: mocks.enqueue }));
vi.mock('../sqlitePersistence.js', () => ({
  getSqliteStatus: () => mocks.status,
  loadEmployeeRecordsSnapshot: mocks.read,
  loadJobPositionTranslationRecordsSnapshot: mocks.read,
  saveEmployeeRecordIfUnchanged: mocks.write,
  saveEmployeeRecordsIfUnchanged: mocks.write,
  saveJobPositionTranslationRecordIfUnchanged: mocks.write,
  loadTeletrabajoRecordsSnapshot: mocks.read,
  loadTeletrabajoPuestoRecordsSnapshot: mocks.read,
  loadTeletrabajoGrupoCoberturaRecordsSnapshot: mocks.read,
  saveTeletrabajoRecordIfUnchanged: mocks.write,
  saveTeletrabajoRecordsIfUnchanged: mocks.write,
  saveTeletrabajoPuestoRecordIfUnchanged: mocks.write,
  saveTeletrabajoGrupoCoberturaRecordIfUnchanged: mocks.write,
  loadConfiguracionSnapshot: mocks.read,
  saveConfiguracionIfUnchanged: mocks.write,
  loadCriteriosRrllRecordsSnapshot: mocks.read,
  loadActaTypeRecordsSnapshot: mocks.read,
  saveCriteriosRrllRecordIfUnchanged: mocks.write,
  saveCriteriosRrllRecordsIfUnchanged: mocks.write,
  saveActaTypeRecordIfUnchanged: mocks.write,
  saveActaTypeRecordsIfUnchanged: mocks.write,
}));

import { registerPlantillaIpc } from './registerPlantillaIpc.js';
import { registerTeletrabajoIpc } from './registerTeletrabajoIpc.js';
import { registerConfiguracionIpc } from './registerConfiguracionIpc.js';
import { registerCriteriosRrllIpc } from './registerCriteriosRrllIpc.js';

function invoke(channel: string, payload?: unknown) {
  const handler = mocks.handlers.get(channel);
  if (!handler) throw new Error('Canal IPC no registrado: ' + channel);
  return handler({}, payload);
}
const record = { id: 'test-id', value: '{"enabled":true}', expectedUpdatedAt: '2026-11-01T12:00:00Z' };
const singleChannels = [
  'plantilla-job-translations', 'teletrabajo', 'teletrabajo-puestos',
  'teletrabajo-grupos-cobertura', 'criterios-rrll', 'acta-types',
];
const batchChannels = ['teletrabajo', 'criterios-rrll', 'acta-types'];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
  registerPlantillaIpc();
  registerTeletrabajoIpc();
  registerConfiguracionIpc();
  registerCriteriosRrllIpc();
});

describe('IPC de registros: validación antes de admitir escrituras', () => {
  it.each(singleChannels)('%s rechaza tipos y tokens inválidos sin acceder a persistencia', (module) => {
    const channel = module + ':save-record-if-unchanged';
    for (const payload of [null, 42, {}, { ...record, id: 1 }, { ...record, value: {} }, { ...record, expectedUpdatedAt: 5 }, { id: record.id, value: record.value }]) {
      expect(invoke(channel, payload)).toMatchObject({ ok: false, status: mocks.status, currentUpdatedAt: null });
    }
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each(singleChannels)('%s conserva el token OCC y descarta campos adicionales', (module) => {
    const channel = module + ':save-record-if-unchanged';
    expect(invoke(channel, { ...record, extra: true })).toEqual({ channel, result: { ok: true } });
    expect(mocks.enqueue).toHaveBeenCalledWith(channel, expect.any(Function));
    expect(mocks.write).toHaveBeenCalledWith(record);
  });

  it.each(batchChannels)('%s rechaza el lote completo si un registro es inválido', (module) => {
    const channel = module + ':save-records-if-unchanged';
    expect(invoke(channel, { records: [record, { ...record, value: null }] })).toMatchObject({ ok: false, results: [] });
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each(batchChannels)('%s admite un lote en una única operación y conserva su orden', (module) => {
    const channel = module + ':save-records-if-unchanged';
    const second = { ...record, id: 'new', expectedUpdatedAt: null };
    invoke(channel, { records: [record, { ...second, extra: true }] });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.write).toHaveBeenCalledWith([record, second]);
  });

  it('Plantilla utiliza expectedValue, no expectedUpdatedAt', () => {
    const channel = 'plantilla:save-record-if-unchanged';
    expect(invoke(channel, record)).toMatchObject({ ok: false, currentValue: null });
    expect(mocks.enqueue).not.toHaveBeenCalled();
    const employee = { id: 'employee', value: '{}', expectedValue: null };
    invoke(channel, { ...employee, extra: true });
    expect(mocks.write).toHaveBeenCalledWith(employee);
  });

  it('Plantilla no admite importaciones parciales con registros incorrectos', () => {
    const employee = { id: 'employee', value: '{}', expectedValue: null };
    const channel = 'plantilla:save-records-if-unchanged';
    expect(invoke(channel, { records: [employee, record] })).toMatchObject({ ok: false, saved: 0 });
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    invoke(channel, { records: [employee] });
    expect(mocks.write).toHaveBeenCalledWith([employee]);
  });

  it('Configuración exige un valor y un token válido antes de encolar', () => {
    const channel = 'configuracion:save-if-unchanged';
    for (const payload of [null, {}, { value: '{}' }, { value: {}, expectedUpdatedAt: null }]) {
      expect(invoke(channel, payload)).toMatchObject({ ok: false });
    }
    expect(mocks.enqueue).not.toHaveBeenCalled();
    const valid = { value: '{}', expectedUpdatedAt: null };
    invoke(channel, { ...valid, extra: true });
    expect(mocks.write).toHaveBeenCalledWith(valid);
  });

  it.each([...singleChannels, 'plantilla'])('%s realiza las lecturas por la cola IPC', (module) => {
    const channel = module + ':load-records';
    expect(invoke(channel)).toEqual({ channel, result: { records: [] } });
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload?: unknown) => unknown>(),
  enqueue: vi.fn((channel: string, operation: () => unknown) => {
    if (!channel) throw new Error('Canal vacío');
    return operation();
  }),
  read: vi.fn(() => ({ records: [] })),
  write: vi.fn(() => ({ ok: true })),
  atomic: vi.fn(() => ({ ok: false, message: 'conflicto' })),
  word: vi.fn(() => ({ ok: true })),
  calendar: vi.fn(() => ({ ok: true })),
  status: { ready: true, phase: 'active' },
}));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (event: unknown, payload?: unknown) => unknown) => mocks.handlers.set(channel, handler) },
}));
vi.mock('../sqliteIpcQueue.js', () => ({ enqueueSqliteIpc: mocks.enqueue }));
vi.mock('../outlookIntegration.js', () => ({ createOutlookCalendar: mocks.calendar }));
vi.mock('../committeeSummaryWord.js', () => ({ updateCommitteeSummaryWord: mocks.word }));
vi.mock('../paritariaSummaryWord.js', () => ({ updateParitariaSummaryWord: mocks.word }));
vi.mock('../sqlitePersistence.js', () => ({
  getSqliteStatus: () => mocks.status,
  loadComiteSessionRecordsSnapshot: mocks.read,
  loadParitariaSessionRecordsSnapshot: mocks.read,
  loadActaRecordsSnapshot: mocks.read,
  saveComiteSessionRecordIfUnchanged: mocks.write,
  saveParitariaSessionRecordIfUnchanged: mocks.write,
  saveActaRecordIfUnchanged: mocks.write,
  closeSessionWorkflowAtomically: mocks.atomic,
  importSessionHistoryAtomically: mocks.atomic,
  closeCoordinationWorkflowAtomically: mocks.atomic,
  createCoordinationTaskAtomically: mocks.atomic,
}));

import { registerSesionesIpc } from './registerSesionesIpc.js';

function invoke(channel: string, payload?: unknown) {
  const handler = mocks.handlers.get(channel);
  if (!handler) throw new Error('Canal no registrado: ' + channel);
  return handler({}, payload);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
  registerSesionesIpc();
});
const record = { id: 'session-1', value: '{}', expectedUpdatedAt: 'token' };
const summary = { folderPath: 'test-dir', code: '1', date: '2026-11-24', points: ['Punto 1'] };
const atomicChannels = ['sessions:import-history-atomically', 'sessions:close-workflow-atomically', 'coordinacion:create-task-atomically', 'coordinacion:close-workflow-atomically'];

describe('IPC sesiones y actas', () => {
  it.each(['comite', 'paritaria', 'actas'])('%s rechaza registros inválidos antes de escribir', (module) => {
    for (const payload of [null, {}, { ...record, id: 1 }, { ...record, value: null }, { ...record, expectedUpdatedAt: false }]) {
      expect(invoke(module + ':save-record-if-unchanged', payload)).toMatchObject({ ok: false, currentUpdatedAt: null });
    }
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it.each(['comite', 'paritaria', 'actas'])('%s conserva el token OCC y usa la cola', (module) => {
    const channel = module + ':save-record-if-unchanged';
    invoke(channel, { ...record, extra: true });
    expect(mocks.write).toHaveBeenCalledWith(record);
    expect(mocks.enqueue).toHaveBeenCalledWith(channel, expect.any(Function));
  });
  it.each(['comite', 'paritaria'])('%s rechaza identificadores de sesión inválidos', (module) => {
    for (const id of [null, 1, '', ' ', 'x'.repeat(257)]) {
      expect(() => invoke(module + ':load-records', { id })).toThrow('Identificador de sesión inválido');
    }
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each(['comite', 'paritaria'])('%s distingue lectura individual y listado', (module) => {
    const channel = module + ':load-records';
    invoke(channel, { id: 'session-1' });
    invoke(channel);
    expect(mocks.read).toHaveBeenNthCalledWith(1, 'session-1');
    expect(mocks.read).toHaveBeenNthCalledWith(2, undefined);
  });
  it.each(['comite', 'paritaria'])('%s no genera Word con datos de resumen inválidos', (module) => {
    for (const payload of [null, {}, { ...summary, points: [1] }, { ...summary, date: null }]) {
      expect(invoke(module + ':update-summary-word', payload)).toMatchObject({ ok: false });
    }
    expect(mocks.word).not.toHaveBeenCalled();
  });
  it.each(['comite', 'paritaria'])('%s transmite únicamente los campos del resumen', (module) => {
    expect(invoke(module + ':update-summary-word', { ...summary, extra: true })).toEqual({ ok: true });
    expect(mocks.word).toHaveBeenCalledWith(summary);
  });
  it.each(['comite', 'paritaria'])('%s no publica el Word compartido en PRUEBAS', (module) => {
    const original = process.argv;
    process.argv = [...original.filter(arg => !arg.startsWith('--traccion-env')), '--traccion-env=test'];
    try {
      expect(invoke(module + ':update-summary-word', { ...summary, folderPath: 'production-folder' })).toMatchObject({ ok: false, message: expect.stringContaining('PRUEBAS') });
      expect(mocks.word).not.toHaveBeenCalled();
    } finally { process.argv = original; }
  });
  it.each(atomicChannels)('%s rechaza entradas no estructuradas', (channel) => {
    for (const payload of [null, undefined, 1, 'bad']) {
      expect(invoke(channel, payload)).toMatchObject({ ok: false });
    }
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.atomic).not.toHaveBeenCalled();
  });
  it.each(atomicChannels)('%s delega la validación de dominio y conserva el error de persistencia', (channel) => {
    const payload = { test: true };
    expect(invoke(channel, payload)).toEqual({ ok: false, message: 'conflicto' });
    expect(mocks.enqueue).toHaveBeenCalledWith(channel, expect.any(Function));
    expect(mocks.atomic).toHaveBeenCalledWith(payload);
  });
});

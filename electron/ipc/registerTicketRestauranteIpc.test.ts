import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload?: unknown) => unknown>(),
  enqueue: vi.fn((channel: string, operation: () => unknown) => {
    if (!channel) throw new Error('Canal vacío');
    return operation();
  }),
  read: vi.fn(() => ({ records: [] })),
  write: vi.fn(() => ({ ok: true })),
  batch: vi.fn(() => ({ ok: true })),
  remove: vi.fn(() => ({ ok: true })),
  importPeople: vi.fn(() => ({ ok: true })),
  workbook: vi.fn(async () => new Uint8Array([1, 2])),
  open: vi.fn(async () => ({ ok: true })),
  status: { ready: true, phase: 'active' },
}));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (event: unknown, payload?: unknown) => unknown) => mocks.handlers.set(channel, handler) },
}));
vi.mock('../sqliteIpcQueue.js', () => ({ enqueueSqliteIpc: mocks.enqueue }));
vi.mock('../documentOpener.js', () => ({ openExcelWorkbook: mocks.open }));
vi.mock('../ticketRestaurantLoadWorkbook.js', () => ({ buildTicketRestaurantLoadWorkbook: mocks.workbook }));
vi.mock('../persistence/ticketRestauranteAtomicCalendarRemoval.js', () => ({ removeTicketRestauranteCalendarWithPeopleAtomically: mocks.remove }));
vi.mock('../persistence/ticketRestauranteAtomicPeopleImport.js', () => ({ importTicketRestaurantePeopleAtomically: mocks.importPeople }));
vi.mock('../sqlitePersistence.js', () => ({
  getSqliteStatus: () => mocks.status,
  loadTicketRestauranteCalendarRecordsSnapshot: mocks.read,
  loadTicketRestaurantePersonRecordsSnapshot: mocks.read,
  loadTicketRestauranteAbsenceRecordsSnapshot: mocks.read,
  loadTicketRestauranteConfigRecordsSnapshot: mocks.read,
  loadTicketRestauranteManutencionRecordsSnapshot: mocks.read,
  saveTicketRestauranteCalendarRecordIfUnchanged: mocks.write,
  saveTicketRestauranteCalendarRecordsIfUnchanged: mocks.batch,
  saveTicketRestaurantePersonRecordIfUnchanged: mocks.write,
  saveTicketRestaurantePersonRecordsIfUnchanged: mocks.batch,
  saveTicketRestauranteAbsenceRecordIfUnchanged: mocks.write,
  saveTicketRestauranteAbsenceRecordsIfUnchanged: mocks.batch,
  saveTicketRestauranteConfigRecordIfUnchanged: mocks.write,
  saveTicketRestauranteManutencionRecordIfUnchanged: mocks.write,
  saveTicketRestauranteManutencionRecordsIfUnchanged: mocks.batch,
}));

import { registerTicketRestauranteIpc } from './registerTicketRestauranteIpc.js';

function invoke(channel: string, payload?: unknown) {
  const handler = mocks.handlers.get(channel);
  if (!handler) throw new Error('Canal no registrado: ' + channel);
  return handler({}, payload);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
  registerTicketRestauranteIpc();
});
const record = { id: 'test', value: '{}', expectedUpdatedAt: 'token-1' };
const person = { ...record, id: 'person', expectedUpdatedAt: null };
const batchModules = ['calendars', 'people', 'absences', 'manutenciones'];
const modules = [...batchModules, 'config'];
const prefix = 'ticket-restaurante-';
const row = {
  nombre: 'Test', apellido1: 'Uno', apellido2: 'Dos', dni: 'TEST',
  pedido: '1', ceco: '2', importeTotal: 14.57,
  fechaInicio: '2026-11-01', fechaCaducidad: '2026-11-30',
};

describe('IPC Ticket Restaurante', () => {
  it.each(modules)('%s rechaza registros inválidos sin admitir escrituras', (module) => {
    const channel = prefix + module + ':save-record-if-unchanged';
    for (const payload of [null, {}, { ...record, value: 1 }, { ...record, expectedUpdatedAt: false }]) {
      expect(invoke(channel, payload)).toMatchObject({ ok: false });
    }
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each(modules)('%s conserva el token y usa la cola para leer y guardar', (module) => {
    const channel = prefix + module + ':save-record-if-unchanged';
    invoke(channel, { ...record, extra: true });
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(mocks.write).toHaveBeenCalledWith(record);
    expect(mocks.enqueue).toHaveBeenCalledWith(channel, expect.any(Function));
    const readChannel = prefix + module + ':load-records';
    invoke(readChannel);
    expect(mocks.enqueue).toHaveBeenCalledWith(readChannel, expect.any(Function));
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });

  it.each(batchModules)('%s rechaza lotes inválidos completos', (module) => {
    const channel = prefix + module + ':save-records-if-unchanged';
    expect(invoke(channel, { records: [record, null] })).toMatchObject({ ok: false, results: [] });
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  it.each(batchModules)('%s entrega el lote válido completo en una sola operación', (module) => {
    invoke(prefix + module + ':save-records-if-unchanged', { records: [record, { ...person, extra: true }] });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.batch).toHaveBeenCalledWith([record, person]);
  });

  it('no elimina un calendario si el calendario o las personas son inválidos', () => {
    const channel = prefix + 'calendars:remove-with-people-atomically';
    for (const payload of [null, { calendar: null, people: [] }, { calendar: record, people: [null] }]) {
      expect(invoke(channel, payload)).toMatchObject({ ok: false });
    }
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('entrega calendario y personas juntos a la operación atómica', () => {
    const channel = prefix + 'calendars:remove-with-people-atomically';
    invoke(channel, { calendar: { ...record, extra: true }, people: [person] });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith(mocks.status, { calendar: record, people: [person] });
  });

  it('rechaza una importación si falla cualquiera de sus dos lotes', () => {
    const channel = prefix + 'people:import-atomically';
    for (const payload of [null, { calendars: [null], people: [person] }, { calendars: [record], people: [null] }]) {
      expect(invoke(channel, payload)).toMatchObject({ ok: false });
    }
    expect(mocks.importPeople).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('admite ambos lotes en una única importación atómica', () => {
    invoke(prefix + 'people:import-atomically', { calendars: [record], people: [person] });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.importPeople).toHaveBeenCalledWith(mocks.status, { calendars: [record], people: [person] });
  });

  it('rechaza filas de carga incompletas o importes que no sean numéricos', async () => {
    for (const payload of [null, {}, { rows: [null], fileName: 'test.xlsx' }, { rows: [{ ...row, dni: null }], fileName: 'test.xlsx' }, { rows: [{ ...row, importeTotal: '14.57' }], fileName: 'test.xlsx' }]) {
      expect(await invoke('ticket-restaurante:open-load-workbook', payload)).toMatchObject({ ok: false });
    }
    expect(mocks.workbook).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('entrega filas normalizadas al generador y abre el resultado', async () => {
    expect(await invoke('ticket-restaurante:open-load-workbook', { rows: [{ ...row, extra: true }], fileName: 'test.xlsx' })).toMatchObject({ ok: true });
    expect(mocks.workbook).toHaveBeenCalledWith([row]);
    expect(mocks.open).toHaveBeenCalledWith({ buffer: new Uint8Array([1, 2]), fileName: 'test.xlsx' });
  });

  it('no abre el Excel si falla la generación', async () => {
    mocks.workbook.mockRejectedValueOnce(new Error('fallo de generación'));
    expect(await invoke('ticket-restaurante:open-load-workbook', { rows: [row], fileName: 'test.xlsx' })).toEqual({ ok: false, message: 'fallo de generación' });
    expect(mocks.open).not.toHaveBeenCalled();
  });
});

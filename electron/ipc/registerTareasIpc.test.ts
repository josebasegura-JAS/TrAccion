import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload?: unknown) => unknown>(),
  enqueue: vi.fn((channel: string, operation: () => unknown) => {
    if (!channel) throw new Error('Canal vacío');
    return operation();
  }),
  read: vi.fn(() => ({ records: [] })),
  save: vi.fn(() => ({ ok: false, message: 'conflicto' })),
  batch: vi.fn(() => ({ ok: false, saved: 0 })),
  schedule: vi.fn(),
  openPath: vi.fn(async () => ''),
  status: { ready: true, phase: 'active' },
}));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (event: unknown, payload?: unknown) => unknown) => mocks.handlers.set(channel, handler) },
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: mocks.openPath },
}));
vi.mock('../sqliteIpcQueue.js', () => ({ enqueueSqliteIpc: mocks.enqueue }));
vi.mock('../sqlitePersistence.js', () => ({
  getSqliteStatus: () => mocks.status,
  loadTaskRecordsSnapshot: mocks.read,
  saveTaskRecordIfUnchanged: mocks.save,
}));
vi.mock('../persistence/taskBatchPersistence.js', () => ({ saveTaskRecordsAtomically: mocks.batch }));
vi.mock('../taskOpenWordPreferences.js', () => ({
  clearOpenTasksWordDirectory: vi.fn(), getOpenTasksWordDirectory: vi.fn(), setOpenTasksWordDirectory: vi.fn(),
}));
vi.mock('../taskOpenWordExport.js', () => ({ exportOpenTasksWord: vi.fn() }));
vi.mock('../taskExcelRefreshScheduler.js', () => ({ createDebouncedSerialRefresh: () => ({ schedule: mocks.schedule }) }));
vi.mock('../taskExcelSharedPublication.js', () => ({
  TASK_EXCEL_GENERATION_LOCK_DIRECTORY: 'test-lock',
  TaskExcelLockBusyError: Error,
  hasPublishedTaskExcelSignature: vi.fn(), markPublishedTaskExcelSignature: vi.fn(),
  taskExcelSnapshotSignature: vi.fn(), withSharedTaskExcelLock: vi.fn(),
}));

import { registerTareasIpc } from './registerTareasIpc.js';

function invoke(channel: string, payload?: unknown) {
  const handler = mocks.handlers.get(channel);
  if (!handler) throw new Error('Canal no registrado: ' + channel);
  return handler({}, payload);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
  registerTareasIpc();
});

const record = { id: 'task-1', value: '{}', expectedUpdatedAt: null };

describe('IPC Tareas', () => {
  it.each([
    { ids: 'bad' }, { ids: [''] }, { ids: [42] },
    { ids: ['x'.repeat(257)] }, { ids: Array(301).fill('x') },
    { id: 'a', ids: ['b'] },
  ])('rechaza filtros de identificadores inválidos: %o', (payload) => {
    expect(() => invoke('tasks:load-records', payload)).toThrow('Lista de identificadores');
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('deduplica identificadores y conserva el filtro de tareas activas', () => {
    invoke('tasks:load-records', { mode: 'active', ids: ['a', 'b', 'a'] });
    expect(mocks.read).toHaveBeenCalledWith({ mode: 'active', ids: ['a', 'b'] });
  });

  it('rechaza escrituras individuales y lotes mal formados antes de encolar', async () => {
    for (const payload of [null, {}, { ...record, expectedUpdatedAt: 1 }, { records: [record, null] }]) {
      expect(await invoke('tasks:save-record-if-unchanged', payload)).toMatchObject({ ok: false });
    }
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.batch).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it('un conflicto individual conserva el token y no programa exportación', async () => {
    const payload = { ...record, expectedUpdatedAt: 'token-1' };
    expect(await invoke('tasks:save-record-if-unchanged', payload)).toMatchObject({ ok: false });
    expect(mocks.save).toHaveBeenCalledWith(payload);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it('un lote correcto entra por la vía atómica y solo programa exportación si guarda', async () => {
    const records = [record, { ...record, id: 'task-2' }];
    mocks.batch.mockReturnValueOnce({ ok: true, saved: 2 });
    expect(await invoke('tasks:save-record-if-unchanged', { records })).toMatchObject({ ok: true, saved: 2 });
    expect(mocks.enqueue).toHaveBeenCalledWith('tasks:save-records-atomically', expect.any(Function));
    expect(mocks.batch).toHaveBeenCalledWith(records);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.schedule).toHaveBeenCalledTimes(1);
  });

  it.each([null, '', '   ', 'program.exe', 'script.cmd', 'document.pdf.exe'])('no abre rutas no permitidas: %s', async (payload) => {
    expect(await invoke('tasks:open-document', payload)).toMatchObject({ ok: false });
    expect(mocks.openPath).not.toHaveBeenCalled();
  });

  it('admite una extensión documental en mayúsculas y normaliza espacios', async () => {
    expect(await invoke('tasks:open-document', '  informe.PDF  ')).toMatchObject({ ok: true });
    expect(mocks.openPath).toHaveBeenCalledWith('informe.PDF');
  });

  it('propaga el error de apertura del sistema sin declarar éxito', async () => {
    mocks.openPath.mockResolvedValueOnce('Archivo no encontrado');
    expect(await invoke('tasks:open-document', 'informe.docx')).toEqual({ ok: false, message: 'Archivo no encontrado' });
  });
});

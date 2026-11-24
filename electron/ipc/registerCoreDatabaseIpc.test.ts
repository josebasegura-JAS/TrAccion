import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload?: unknown) => unknown>(),
  enqueue: vi.fn((channel: string, operation: () => unknown) => {
    if (!channel) throw new Error('Canal vacío');
    return operation();
  }),
  write: vi.fn(() => ({ ok: true })),
  batch: vi.fn(() => ({ ok: true })),
  read: vi.fn(() => ({ record: null })),
  lock: vi.fn(() => ({ ok: true })),
  health: vi.fn(() => ({ ok: true })),
  maintenance: vi.fn(() => ({ ok: true })),
  changeDirectory: vi.fn(() => ({ ready: true })),
  dialog: vi.fn(async () => ({ canceled: true, filePaths: [] as string[] })),
  status: { ready: true, phase: 'active' },
}));
vi.mock('electron', () => ({
  app: { getVersion: () => 'test' },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showOpenDialog: mocks.dialog },
  ipcMain: { handle: (channel: string, handler: (event: unknown, payload?: unknown) => unknown) => mocks.handlers.set(channel, handler) },
}));
vi.mock('../sqliteIpcQueue.js', () => ({ enqueueSqliteIpc: mocks.enqueue }));
vi.mock('../persistence/traccionEnvironment.js', () => ({ getTraccionEnvironment: vi.fn() }));
vi.mock('../appUpdate.js', () => ({ applyAppUpdate: vi.fn(), checkForAppUpdate: vi.fn() }));
vi.mock('../sqlitePersistence.js', () => ({
  getSqliteStatus: () => mocks.status,
  savePersistedRecordIfUnchanged: mocks.write,
  savePersistedRecordsIfUnchanged: mocks.batch,
  getPersistedRecordSnapshot: mocks.read,
  acquireRecordLock: mocks.lock,
  heartbeatRecordLock: mocks.lock,
  releaseRecordLock: mocks.lock,
  getRecordLock: mocks.lock,
  listOtherTaskLocks: mocks.lock,
  checkSqliteHealth: mocks.health,
  vacuumDatabaseNow: mocks.maintenance,
  forceReleaseDatabaseLock: mocks.maintenance,
  runDataIntegrityAuditNow: mocks.maintenance,
  changeSqliteDirectory: mocks.changeDirectory,
}));

import { registerCoreDatabaseIpc } from './registerCoreDatabaseIpc.js';

function invoke(channel: string, payload?: unknown) {
  const handler = mocks.handlers.get(channel);
  if (!handler) throw new Error('Canal no registrado: ' + channel);
  return handler({}, payload);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
  registerCoreDatabaseIpc();
});

const record = { key: 'test-key', value: '{}', expectedUpdatedAt: null };
const lockChannels = ['recordLock:acquire', 'recordLock:heartbeat', 'recordLock:release', 'recordLock:get'];

describe('IPC central de SQLite', () => {
  it('rechaza escrituras condicionales con datos o token incorrectos', () => {
    for (const payload of [null, {}, { ...record, key: 1 }, { ...record, value: null }, { ...record, expectedUpdatedAt: 5 }]) {
      expect(invoke('database:save-local-storage-record-if-unchanged', payload)).toMatchObject({ ok: false, currentUpdatedAt: null });
    }
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('conserva el token de concurrencia y solo transmite campos esperados', () => {
    const payload = { ...record, expectedUpdatedAt: 'token-1' };
    const channel = 'database:save-local-storage-record-if-unchanged';
    invoke(channel, { ...payload, extra: true });
    expect(mocks.enqueue).toHaveBeenCalledWith(channel, expect.any(Function));
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(mocks.write).toHaveBeenCalledWith(payload);
  });

  it('rechaza el lote completo si alguna clave o token es inválido', () => {
    const channel = 'database:save-local-storage-records-if-unchanged';
    for (const payload of [null, {}, { records: [record, null] }, { records: [record, { ...record, key: ' ' }] }, { records: [record, { ...record, expectedUpdatedAt: false }] }]) {
      expect(invoke(channel, payload)).toMatchObject({ ok: false });
    }
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  it('admite un lote válido como una sola operación', () => {
    const records = [record, { ...record, key: 'second', expectedUpdatedAt: 'token' }];
    invoke('database:save-local-storage-records-if-unchanged', { records });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.batch).toHaveBeenCalledWith(records);
  });

  it('no lee registros con clave ausente o vacía', () => {
    for (const payload of [null, {}, { key: 1 }, { key: ' ' }]) {
      expect(invoke('database:get-persisted-record', payload)).toEqual({ status: mocks.status, record: null });
    }
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it.each(lockChannels)('%s rechaza identificadores inválidos sin acceder a persistencia', (channel) => {
    for (const payload of [null, {}, { module: 1, recordId: 'x' }, { module: 'tasks', recordId: ' ' }]) {
      expect(invoke(channel, payload)).toMatchObject({ ok: false, lock: null });
    }
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.lock).not.toHaveBeenCalled();
  });

  it.each(lockChannels)('%s normaliza los identificadores y respeta la política de cola', (channel) => {
    invoke(channel, { module: ' tasks ', recordId: ' a ' });
    expect(mocks.lock).toHaveBeenCalledWith({ module: 'tasks', recordId: 'a' });
    if (channel === 'recordLock:heartbeat') expect(mocks.enqueue).not.toHaveBeenCalled();
    else expect(mocks.enqueue).toHaveBeenCalledWith(channel, expect.any(Function));
  });

  it('coalesce comprobaciones de salud y consultas de bloqueos en la cola', () => {
    invoke('database:health-check');
    invoke('recordLock:list-other-tasks');
    expect(mocks.enqueue).toHaveBeenCalledWith('database:health-check', expect.any(Function), true);
    expect(mocks.enqueue).toHaveBeenCalledWith('recordLock:list-other-tasks', expect.any(Function), true);
  });

  it.each(['database:vacuum-now', 'database:force-release-lock', 'database:run-integrity-audit'])('%s pasa por la cola SQLite', (channel) => {
    invoke(channel);
    expect(mocks.enqueue).toHaveBeenCalledWith(channel, expect.any(Function));
    expect(mocks.maintenance).toHaveBeenCalledTimes(1);
  });

  it('cancelar el selector de base no cambia la ruta', async () => {
    expect(await invoke('database:select-directory')).toEqual(mocks.status);
    expect(mocks.changeDirectory).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('cambia la ruta elegida mediante el selector y la cola', async () => {
    mocks.dialog.mockResolvedValueOnce({ canceled: false, filePaths: ['test-directory'] });
    await invoke('database:select-directory', { path: 'ignored-renderer-path' });
    expect(mocks.changeDirectory).toHaveBeenCalledWith('test-directory');
    expect(mocks.enqueue).toHaveBeenCalledWith('database:select-directory', expect.any(Function));
  });
});

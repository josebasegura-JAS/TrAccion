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
  restore: vi.fn(() => ({ ok: false, message: 'respaldo no válido' })),
  migrate: vi.fn(() => ({ ready: true })),
  backup: vi.fn(() => ({ ready: true })),
  status: { ready: true, phase: 'active' },
  initiatingWindow: vi.fn<() => { isDestroyed: () => boolean; webContents: { executeJavaScript: () => Promise<unknown>; isDestroyed: () => boolean } } | null>(() => null),
  confirmUpdate: vi.fn(async () => true),
  applyUpdate: vi.fn<(version: string, directory: string, confirm: () => Promise<boolean>) => Promise<{ ok: boolean; message: string }>>(async () => ({ ok: false, message: 'Actualización cancelada' })),
  checkUpdate: vi.fn(),
  updatesDirectory: vi.fn(async () => 'test-updates'),
  quit: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { getVersion: () => 'test', quit: mocks.quit },
  BrowserWindow: { fromWebContents: mocks.initiatingWindow },
  dialog: { showOpenDialog: mocks.dialog },
  ipcMain: { handle: (channel: string, handler: (event: unknown, payload?: unknown) => unknown) => mocks.handlers.set(channel, handler) },
}));
vi.mock('../sqliteIpcQueue.js', () => ({ enqueueSqliteIpc: mocks.enqueue }));
vi.mock('../persistence/traccionEnvironment.js', () => ({ getTraccionEnvironment: vi.fn() }));
vi.mock('../appUpdate.js', () => ({ applyAppUpdate: mocks.applyUpdate, checkForAppUpdate: mocks.checkUpdate }));
vi.mock('../sqlitePersistence.js', () => ({
  getSqliteStatus: () => mocks.status,
  getUpdatesDirectory: mocks.updatesDirectory,
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
  restoreLocalBackup: mocks.restore,
  migrateLocalStorageSnapshot: mocks.migrate,
  createLocalStorageBackup: mocks.backup,
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
  mocks.initiatingWindow.mockReturnValue(null);
  mocks.confirmUpdate.mockResolvedValue(true);
  mocks.applyUpdate.mockResolvedValue({ ok: false, message: 'Actualización cancelada' });
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
  it.each(['database:backup-local-storage', 'database:migrate-local-storage'])('%s rechaza entradas sin un array de registros', (channel) => {
    for (const payload of [null, {}, { records: null }, { records: 'bad' }]) {
      expect(invoke(channel, payload)).toEqual(mocks.status);
    }
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.backup).not.toHaveBeenCalled();
    expect(mocks.migrate).not.toHaveBeenCalled();
  });

  it.each(['database:backup-local-storage', 'database:migrate-local-storage'])('%s delega el conjunto de registros por la cola', (channel) => {
    const payload = { records: [{ key: 'test', value: '{}' }] };
    invoke(channel, payload);
    expect(mocks.enqueue).toHaveBeenCalledWith(channel, expect.any(Function));
    const operation = channel === 'database:backup-local-storage' ? mocks.backup : mocks.migrate;
    expect(operation).toHaveBeenCalledWith(payload);
  });

  it('encola la restauración solicitada y devuelve el resultado del servicio', () => {
    const channel = 'database:restore-local-backup';
    expect(invoke(channel, { id: 'test-backup' })).toEqual({ ok: false, message: 'respaldo no válido' });
    expect(mocks.enqueue).toHaveBeenCalledWith(channel, expect.any(Function));
    expect(mocks.restore).toHaveBeenCalledWith('test-backup');
  });

  it('normaliza un identificador de restauración no textual a vacío para el servicio', () => {
    expect(invoke('database:restore-local-backup', { id: 123 })).toMatchObject({ ok: false });
    expect(mocks.restore).toHaveBeenCalledWith('');
  });
});

describe('IPC de actualización', () => {
  function availableWindow() {
    mocks.initiatingWindow.mockReturnValue({ isDestroyed: () => false, webContents: { executeJavaScript: mocks.confirmUpdate, isDestroyed: () => false } });
  }
  it('rechaza una petición sin ventana iniciadora', async () => {
    expect(await invoke('app-update:apply')).toMatchObject({ ok: false });
    expect(mocks.applyUpdate).not.toHaveBeenCalled();
    expect(mocks.quit).not.toHaveBeenCalled();
  });
  it('respeta la negativa a descartar cambios', async () => {
    availableWindow();
    mocks.confirmUpdate.mockResolvedValueOnce(false);
    expect(await invoke('app-update:apply')).toMatchObject({ ok: false, message: expect.stringContaining('sin guardar') });
    expect(mocks.applyUpdate).not.toHaveBeenCalled();
  });
  it('no prepara la actualización cuando falla la consulta al renderer', async () => {
    availableWindow();
    mocks.confirmUpdate.mockRejectedValueOnce(new Error('renderer no disponible'));
    expect(await invoke('app-update:apply')).toMatchObject({ ok: false });
    expect(mocks.applyUpdate).not.toHaveBeenCalled();
  });
  it('mantiene abierta la aplicación si la preparación falla', async () => {
    availableWindow();
    expect(await invoke('app-update:apply')).toMatchObject({ ok: false });
    expect(mocks.applyUpdate).toHaveBeenCalledWith('test', 'test-updates', expect.any(Function));
    expect(mocks.quit).not.toHaveBeenCalled();
  });
  it('solicita cierre ordenado solo después de preparar correctamente la actualización', async () => {
    availableWindow();
    mocks.applyUpdate.mockResolvedValueOnce({ ok: true, message: 'Preparado' });
    vi.useFakeTimers();
    try {
      expect(await invoke('app-update:apply')).toMatchObject({ ok: true });
      expect(mocks.quit).not.toHaveBeenCalled();
      await vi.runAllTimersAsync();
      expect(mocks.quit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it('consulta la versión usando el directorio configurado', async () => {
    mocks.checkUpdate.mockReturnValueOnce({ updateAvailable: true });
    expect(await invoke('app-update:check')).toEqual({ updateAvailable: true });
    expect(mocks.checkUpdate).toHaveBeenCalledWith('test', 'test-updates');
  });
});

describe('IPC: regresiones de seguridad del actualizador', () => {
  it('rechaza una confirmación final negativa sin cerrar la aplicación', async () => {
    mocks.initiatingWindow.mockReturnValue({ isDestroyed: () => false, webContents: { executeJavaScript: mocks.confirmUpdate, isDestroyed: () => false } });
    mocks.confirmUpdate.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    mocks.applyUpdate.mockImplementationOnce(async (_version, _directory, confirm) => ({ ok: await confirm(), message: 'Resultado final' }));
    expect(await invoke('app-update:apply')).toMatchObject({ ok: false });
    expect(mocks.confirmUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.quit).not.toHaveBeenCalled();
  });
  it('no permite dos solicitudes IPC simultáneas mientras espera confirmación', async () => {
    mocks.initiatingWindow.mockReturnValue({ isDestroyed: () => false, webContents: { executeJavaScript: mocks.confirmUpdate, isDestroyed: () => false } });
    let finish!: (value: boolean) => void;
    mocks.confirmUpdate.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const first = invoke('app-update:apply');
    expect(await invoke('app-update:apply')).toMatchObject({ ok: false, message: expect.stringContaining('en preparación') });
    finish(false);
    expect(await first).toMatchObject({ ok: false });
    expect(mocks.applyUpdate).not.toHaveBeenCalled();
  });
});

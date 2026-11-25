import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const execute = vi.fn<() => Promise<unknown>>(async () => true);
  const window = { isDestroyed: () => false, webContents: { isDestroyed: () => false, executeJavaScript: execute } };
  const handlers = new Map<string, (event: unknown, payload?: unknown) => unknown>();
  const events = new Map<string, (...args: unknown[]) => unknown>();
  const queue = { runningOperation: null as string | null, queuedOperations: 0, timedOut: false };
  const backups = { activeBackupOperations: 0, queuedBackupOperations: 0, pendingBackupRevisions: 0 };
  return {
    execute, window, handlers, events, queue, backups,
    fromWindow: vi.fn(() => window as typeof window | null),
    windows: vi.fn(() => [window]),
    quit: vi.fn(), relaunch: vi.fn(), drain: vi.fn(() => true), cancelDrain: vi.fn(),
    single: vi.fn(() => true), ready: vi.fn(() => new Promise<void>(() => undefined)),
    status: vi.fn(() => ({ ready: false, phase: 'recovering', isDefaultPath: false })),
    incident: vi.fn(() => ({ uncertain: [] as unknown[] })),
    read: vi.fn(async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); }),
    write: vi.fn(async () => undefined),
    close: vi.fn(async () => ({ totalMs: 1, vacuumMs: 0, shutdownBackupMs: 0, closeDatabaseMs: 1 })),
    destroy: vi.fn(),
  };
});
vi.mock('electron', () => ({
  app: {
    isPackaged: true, requestSingleInstanceLock: mocks.single, whenReady: mocks.ready,
    getPath: () => '/test-user-data', quit: mocks.quit, relaunch: mocks.relaunch,
    on: (name: string, handler: (...args: unknown[]) => unknown) => mocks.events.set(name, handler),
  },
  BrowserWindow: Object.assign(class {
    center() { /* ventana simulada */ }
    async loadFile() { return undefined; }
    isDestroyed() { return false; }
    destroy() { mocks.destroy(); }
  }, { fromWebContents: mocks.fromWindow, getAllWindows: mocks.windows }),
  ipcMain: { handle: (name: string, handler: (event: unknown, payload?: unknown) => unknown) => mocks.handlers.set(name, handler) },
  Menu: {}, utilityProcess: {},
}));
vi.mock('node:fs/promises', () => ({ readFile: mocks.read, writeFile: mocks.write }));
vi.mock('./sqlitePersistence.js', () => ({
  getSqliteRestartBackupSnapshot: () => mocks.backups, getSqliteStatus: mocks.status, closeSqlitePersistence: mocks.close,
}));
vi.mock('./sqliteIpcQueue.js', () => ({
  beginSqliteRestartDrain: mocks.drain, cancelSqliteRestartDrain: mocks.cancelDrain,
  getSqliteIpcQueueDiagnostics: () => mocks.queue,
}));
vi.mock('./sqliteIncidentJournal.js', () => ({ getSqliteIncidentReport: mocks.incident }));
vi.mock('./mainWatchdogBridge.js', () => ({ registerMainWatchdogOperationSender: vi.fn(), notifyMainWatchdogOperation: vi.fn() }));
vi.mock('./sqliteWorkerProbeSupervisor.js', () => ({ startSqliteWorkerProbeSupervisor: vi.fn() }));
vi.mock('./localUpdateInstances.js', () => ({ startLocalInstanceUpdateListener: vi.fn() }));
vi.mock('./multiuserPerformanceDiagnostics.js', () => ({ getMultiuserPerformanceReport: vi.fn() }));

async function restart(automatic = false) {
  const handler = mocks.handlers.get('app:request-safe-restart');
  if (!handler) throw new Error('Canal de reinicio no registrado');
  return handler({ sender: {} }, { automatic });
}
function beforeQuit() {
  const handler = mocks.events.get('before-quit');
  if (!handler) throw new Error('Evento de cierre no registrado');
  const preventDefault = vi.fn();
  handler({ preventDefault });
  return preventDefault;
}

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  mocks.handlers.clear();
  mocks.events.clear();
  Object.assign(mocks.queue, { runningOperation: null, queuedOperations: 0, timedOut: false });
  Object.assign(mocks.backups, { activeBackupOperations: 0, queuedBackupOperations: 0, pendingBackupRevisions: 0 });
  mocks.single.mockReturnValue(true);
  mocks.ready.mockImplementation(() => new Promise<void>(() => undefined));
  mocks.fromWindow.mockReturnValue(mocks.window);
  mocks.windows.mockReturnValue([mocks.window]);
  mocks.execute.mockResolvedValue(true);
  mocks.drain.mockReturnValue(true);
  mocks.status.mockReturnValue({ ready: false, phase: 'recovering', isDefaultPath: false });
  mocks.incident.mockReturnValue({ uncertain: [] });
  mocks.read.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
  mocks.write.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue({ totalMs: 1, vacuumMs: 0, shutdownBackupMs: 0, closeDatabaseMs: 1 });
  await import('./main.js');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('reinicio supervisado del proceso principal', () => {
  it('rechaza una ventana que ya no existe', async () => {
    mocks.fromWindow.mockReturnValue(null);
    expect(await restart()).toMatchObject({ ok: false });
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });
  it('no reinicia si hay una escritura incierta', async () => {
    mocks.incident.mockReturnValue({ uncertain: [{}] });
    expect(await restart()).toMatchObject({ ok: false });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.drain).not.toHaveBeenCalled();
  });
  it('respeta la negativa del editor a cerrar', async () => {
    mocks.execute.mockResolvedValueOnce(false);
    expect(await restart()).toMatchObject({ ok: false });
    expect(mocks.relaunch).not.toHaveBeenCalled();
    expect(mocks.quit).not.toHaveBeenCalled();
  });
  it('vuelve a comprobar la cola después de la confirmación del usuario', async () => {
    mocks.execute.mockImplementationOnce(async () => {
      mocks.queue.queuedOperations = 1;
      return true;
    });
    expect(await restart()).toMatchObject({ ok: false });
    expect(mocks.drain).not.toHaveBeenCalled();
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });
  it('cancela el drain si aparece un backup después de reservar el cierre', async () => {
    mocks.drain.mockImplementationOnce(() => {
      mocks.backups.activeBackupOperations = 1;
      return true;
    });
    expect(await restart()).toMatchObject({ ok: false });
    expect(mocks.cancelDrain).toHaveBeenCalledTimes(1);
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });
  it('no reinicia automáticamente una base sana', async () => {
    mocks.status.mockReturnValueOnce({ ready: true, phase: 'active', isDefaultPath: false });
    expect(await restart(true)).toMatchObject({ ok: false });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('bloquea reinicios automáticos si no puede leer la marca local', async () => {
    mocks.read.mockRejectedValueOnce(new Error('acceso denegado'));
    expect(await restart(true)).toMatchObject({ ok: false });
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });
  it('libera el drain si falla el registro de reinicio automático', async () => {
    mocks.write.mockRejectedValueOnce(new Error('disco lleno'));
    expect(await restart(true)).toMatchObject({ ok: false });
    expect(mocks.cancelDrain).toHaveBeenCalledTimes(1);
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });
  it('cancela el reinicio automático si aparecen cambios durante la última comprobación', async () => {
    mocks.execute.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await restart(true)).toMatchObject({ ok: false });
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(mocks.cancelDrain).toHaveBeenCalledTimes(1);
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });
  it('conserva los argumentos de entorno y solicita el cierre ordenado', async () => {
    const original = process.argv;
    process.argv = [...original, '--traccion-env=test', '--traccion-test-user-b'];
    try {
      expect(await restart()).toEqual({ ok: true });
      expect(mocks.relaunch).toHaveBeenCalledWith({ args: process.argv.slice(1) });
      expect(mocks.cancelDrain).not.toHaveBeenCalled();
      await vi.runAllTimersAsync();
      expect(mocks.quit).toHaveBeenCalledTimes(1);
    } finally { process.argv = original; }
  });
});

describe('cierre ordenado del proceso principal', () => {
  it('no autoriza el cierre cuando el renderer rechaza la comprobación', async () => {
    mocks.execute.mockRejectedValueOnce(new Error('renderer no disponible'));
    expect(beforeQuit()).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(mocks.quit).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
    mocks.execute.mockResolvedValueOnce(true);
    expect(beforeQuit()).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(mocks.quit).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, null, 'true'])('no autoriza una respuesta no afirmativa (%s)', async (response) => {
    mocks.execute.mockResolvedValueOnce(response);
    expect(beforeQuit()).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(mocks.quit).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
  });
  it('no cierra SQLite si el usuario decide seguir editando', async () => {
    mocks.execute.mockResolvedValueOnce(false);
    expect(beforeQuit()).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(mocks.close).not.toHaveBeenCalled();
    expect(mocks.quit).not.toHaveBeenCalled();
  });
  it('espera a SQLite y evita duplicar el cierre ante varios eventos', async () => {
    let finish!: (metrics: { totalMs: number; vacuumMs: number; shutdownBackupMs: number; closeDatabaseMs: number }) => void;
    mocks.windows.mockReturnValue([]);
    mocks.close.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    expect(beforeQuit()).toHaveBeenCalledTimes(1);
    await vi.dynamicImportSettled();
    await vi.runAllTimersAsync();
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(beforeQuit()).toHaveBeenCalledTimes(1);
    expect(mocks.quit).not.toHaveBeenCalled();
    finish({ totalMs: 1, vacuumMs: 0, shutdownBackupMs: 0, closeDatabaseMs: 1 });
    await vi.runAllTimersAsync();
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    expect(mocks.quit).toHaveBeenCalledTimes(1);
    expect(beforeQuit()).not.toHaveBeenCalled();
  });
});

describe('admisión al arranque', () => {
  it('sale sin inicializar SQLite cuando no obtiene el bloqueo de instancia', async () => {
    vi.resetModules();
    mocks.events.clear();
    mocks.handlers.clear();
    mocks.ready.mockClear();
    mocks.single.mockReturnValueOnce(false);
    await import('./main.js');
    expect(mocks.quit).toHaveBeenCalledTimes(1);
    expect(mocks.ready).not.toHaveBeenCalled();
    expect(mocks.events.has('before-quit')).toBe(false);
  });
});

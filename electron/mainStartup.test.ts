import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, (...args: unknown[]) => unknown>();
  const events = new Map<string, (...args: unknown[]) => unknown>();
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const windows: Array<{ options: { title: string; show: boolean }; show: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; webContents: { executeJavaScript: ReturnType<typeof vi.fn> } }> = [];
  return {
    listeners, events, handlers, windows,
    initialize: vi.fn(async () => ({ ready: true, message: '' })),
    registerCore: vi.fn(), notifier: vi.fn(), quit: vi.fn(),
    write: vi.fn(async () => undefined),
  };
});
vi.mock('electron', () => ({
  app: {
    isPackaged: true, requestSingleInstanceLock: () => true, whenReady: async () => undefined,
    getVersion: () => 'test', getPath: () => '/test-user-data', quit: mocks.quit,
    setAppUserModelId: vi.fn(),
    on: (name: string, handler: (...args: unknown[]) => unknown) => mocks.events.set(name, handler),
  },
  BrowserWindow: class {
    show = vi.fn();
    close = vi.fn();
    focus = vi.fn();
    webContents = {
      on: vi.fn(), once: vi.fn(), executeJavaScript: vi.fn(async () => true),
      setWindowOpenHandler: vi.fn(), send: vi.fn(), isDestroyed: () => false,
    };
    constructor(public options: { title: string; show: boolean }) { mocks.windows.push(this); }
    center() { /* ventana simulada */ }
    once() { /* evento simulado */ }
    on() { /* evento simulado */ }
    isDestroyed() { return false; }
    async loadFile() { return undefined; }
  },
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) => mocks.handlers.set(name, handler),
    on: (name: string, handler: (...args: unknown[]) => unknown) => mocks.listeners.set(name, handler),
    removeListener: (name: string) => mocks.listeners.delete(name),
  },
  Menu: { setApplicationMenu: vi.fn() },
  utilityProcess: { fork: () => { throw new Error('watchdog simulado'); } },
}));
vi.mock('node:fs/promises', () => ({ writeFile: mocks.write, readFile: vi.fn() }));
vi.mock('./sqlitePersistence.js', () => ({ initializeSqlitePersistence: mocks.initialize, setDatabaseConnectivityIssueNotifier: mocks.notifier }));
vi.mock('./sqliteIpcQueue.js', () => ({ beginSqliteRestartDrain: vi.fn(), cancelSqliteRestartDrain: vi.fn(), getSqliteIpcQueueDiagnostics: vi.fn() }));
vi.mock('./sqliteIncidentJournal.js', () => ({ getSqliteIncidentReport: vi.fn() }));
vi.mock('./mainWatchdogBridge.js', () => ({ registerMainWatchdogOperationSender: vi.fn(), notifyMainWatchdogOperation: vi.fn() }));
vi.mock('./sqliteWorkerProbeSupervisor.js', () => ({ startSqliteWorkerProbeSupervisor: vi.fn() }));
vi.mock('./localUpdateInstances.js', () => ({ startLocalInstanceUpdateListener: vi.fn(async () => () => undefined) }));
vi.mock('./multiuserPerformanceDiagnostics.js', () => ({ getMultiuserPerformanceReport: vi.fn() }));
vi.mock('./ipc/registerCoreDatabaseIpc.js', () => ({ registerCoreDatabaseIpc: mocks.registerCore }));
vi.mock('./ipc/registerSorteosIpc.js', () => ({ registerSorteosIpc: vi.fn() }));
vi.mock('./ipc/registerPlantillaIpc.js', () => ({ registerPlantillaIpc: vi.fn() }));
vi.mock('./ipc/registerTareasIpc.js', () => ({ registerTareasIpc: vi.fn() }));
vi.mock('./ipc/registerSesionesIpc.js', () => ({ registerSesionesIpc: vi.fn() }));
vi.mock('./ipc/registerVinculogramaIpc.js', () => ({ registerVinculogramaIpc: vi.fn() }));
vi.mock('./ipc/registerCriteriosRrllIpc.js', () => ({ registerCriteriosRrllIpc: vi.fn() }));
vi.mock('./ipc/registerTicketRestauranteIpc.js', () => ({ registerTicketRestauranteIpc: vi.fn() }));
vi.mock('./ipc/registerPresupuestosIpc.js', () => ({ registerPresupuestosIpc: vi.fn() }));
vi.mock('./ipc/registerEspecialesIpc.js', () => ({ registerEspecialesIpc: vi.fn() }));
vi.mock('./ipc/registerTeletrabajoIpc.js', () => ({ registerTeletrabajoIpc: vi.fn() }));
vi.mock('./ipc/registerConfiguracionIpc.js', () => ({ registerConfiguracionIpc: vi.fn() }));
vi.mock('./ipc/registerLicenciasSinSueldoIpc.js', () => ({ registerLicenciasSinSueldoIpc: vi.fn() }));
vi.mock('./ipc/registerSharedDocumentIpc.js', () => ({ registerSharedDocumentIpc: vi.fn() }));
vi.mock('./ipc/registerLoteriaIpc.js', () => ({ registerLoteriaIpc: vi.fn() }));
vi.mock('./ipc/registerOperationalExcelBackupIpc.js', () => ({ registerOperationalExcelBackupIpc: vi.fn() }));
vi.mock('./ipc/registerAyudaEscolarIpc.js', () => ({ registerAyudaEscolarIpc: vi.fn() }));

let originalArgv: string[];
beforeEach(() => {
  originalArgv = process.argv;
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.windows.length = 0;
  mocks.listeners.clear();
  mocks.events.clear();
  mocks.handlers.clear();
  mocks.initialize.mockReset().mockResolvedValue({ ready: true, message: '' });
  mocks.registerCore.mockReset();
});
afterEach(() => {
  process.argv = originalArgv;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function boot(...flags: string[]) {
  process.argv = ['electron', 'main.js', ...flags];
  await import('./main.js');
  await vi.advanceTimersByTimeAsync(760);
  await vi.dynamicImportSettled();
  await vi.advanceTimersByTimeAsync(0);
}
function mainWindow() {
  const window = mocks.windows[1];
  if (!window) throw new Error('No se creó la ventana principal');
  return window;
}
function signal(name: string, sender: unknown) {
  const handler = mocks.listeners.get(name);
  if (!handler) throw new Error('Señal no registrada: ' + name);
  handler({ sender });
}
describe('arranque del proceso principal', () => {

  it('avisa de arranque lento sin abrir dashboard ni repetir la activación pendiente', async () => {
    let finish!: (value: { ready: boolean; message: string }) => void;
    mocks.initialize.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await boot();
    expect(mocks.windows).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_001);
    expect(mocks.windows[0].webContents.executeJavaScript).toHaveBeenCalledWith('window.__traccionSplashShowSlow?.()', true);
    expect(mocks.write).toHaveBeenCalledWith(expect.stringContaining('last-startup-performance.json'), expect.stringContaining('Arranque pendiente tras 30 segundos'), 'utf8');
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.windows).toHaveLength(1);
    finish({ ready: true, message: '' });
    await vi.advanceTimersByTimeAsync(0);
    expect(mainWindow()).toBeDefined();
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
  });

  it('aplaza el cierre hasta que la activación termina y nunca abre el dashboard tras cancelar', async () => {
    let finish!: (value: { ready: boolean; message: string }) => void;
    mocks.initialize.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await boot();
    const preventDefault = vi.fn();
    const quit = mocks.events.get('before-quit')!;
    quit({ preventDefault });
    quit({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(mocks.quit).not.toHaveBeenCalled();
    expect(mocks.windows[0].webContents.executeJavaScript).toHaveBeenCalledWith('window.__traccionSplashShowClosing?.()', true);
    await vi.advanceTimersByTimeAsync(35_000);
    expect(mocks.quit).not.toHaveBeenCalled();
    expect(mocks.windows).toHaveLength(1);
    finish({ ready: true, message: '' });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.quit).toHaveBeenCalledTimes(1);
    expect(mocks.windows).toHaveLength(1);
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
  });

  it('no muestra aviso de demora si el arranque ya terminó', async () => {
    await boot();
    signal('app:renderer-ready', mainWindow().webContents);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(mocks.windows[0].webContents.executeJavaScript).not.toHaveBeenCalledWith('window.__traccionSplashShowSlow?.()', true);
  });
  it('crea el dashboard aunque SQLite devuelva no disponible', async () => {
    mocks.initialize.mockResolvedValueOnce({ ready: false, message: 'Sin conexión SMB' });
    await boot();
    expect(mocks.registerCore).toHaveBeenCalledTimes(1);
    expect(mainWindow().options.show).toBe(false);
    expect(mocks.windows[0].webContents.executeJavaScript).toHaveBeenCalledWith(expect.stringContaining('Sin conexión SMB'), true);
    signal('app:renderer-ready', mainWindow().webContents);
    await vi.advanceTimersByTimeAsync(2000);
    expect(mainWindow().show).toHaveBeenCalledTimes(1);
    expect(mocks.windows[0].close).toHaveBeenCalledTimes(1);
  });
  it('crea el dashboard cuando la inicialización SQLite rechaza la promesa', async () => {
    mocks.initialize.mockRejectedValueOnce(new Error('Fallo de inicialización'));
    await boot();
    expect(mocks.registerCore).toHaveBeenCalledTimes(1);
    expect(mainWindow()).toBeDefined();
    expect(mocks.windows[0].webContents.executeJavaScript).toHaveBeenCalledWith(expect.stringContaining('Fallo de inicialización'), true);
  });
  it('muestra fallo fatal si no se pueden registrar servicios IPC', async () => {
    mocks.registerCore.mockImplementationOnce(() => { throw new Error('IPC no disponible'); });
    await boot();
    expect(mocks.windows).toHaveLength(1);
    expect(mocks.windows[0].webContents.executeJavaScript).toHaveBeenCalledWith('window.__traccionSplashShowFatal?.()', true);
    expect(mocks.quit).not.toHaveBeenCalled();
  });
  it('ignora señales de otras ventanas y no duplica la transición al recibir dos válidas', async () => {
    await boot();
    signal('app:renderer-ready', {});
    signal('app:boot-visible', {});
    await vi.advanceTimersByTimeAsync(2000);
    expect(mainWindow().show).not.toHaveBeenCalled();
    signal('app:renderer-ready', mainWindow().webContents);
    signal('app:boot-visible', mainWindow().webContents);
    await vi.advanceTimersByTimeAsync(2000);
    expect(mainWindow().show).toHaveBeenCalledTimes(1);
  });
  it('abre el dashboard para diagnóstico si el renderer no confirma el arranque', async () => {
    await boot();
    await vi.advanceTimersByTimeAsync(60_001);
    expect(mainWindow().show).toHaveBeenCalledTimes(1);
    expect(mocks.windows[0].webContents.executeJavaScript).toHaveBeenCalledWith(expect.stringContaining('60 segundos'), true);
    expect(mocks.write).toHaveBeenCalledWith(expect.stringContaining('last-startup-performance.json'), expect.stringContaining('Dashboard visible en modo diagnóstico'), 'utf8');
  });
  it.each([
    { flags: [], expected: 'Cuadro de Mando RRLL - TrAcción V.test' },
    { flags: ['--traccion-env=production'], expected: 'Cuadro de Mando RRLL - TrAcción V.test' },
    { flags: ['--traccion-env=test'], expected: 'Cuadro de Mando RRLL - TrAcción V.test · PRUEBAS · BASE AISLADA' },
    { flags: ['--traccion-env=test', '--traccion-test-user-b'], expected: 'Cuadro de Mando RRLL - TrAcción V.test · PRUEBAS · BASE AISLADA · CLIENTE B' },
  ])('identifica el entorno en el título ($flags)', async ({ flags, expected }) => {
    await boot(...flags);
    expect(mainWindow().options.title).toBe(expected);
  });
});

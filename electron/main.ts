import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import type { IpcMainEvent, MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';
const appIconPath = path.join(__dirname, '../build/icon/traccion-icon-256.ico');
const splashHtmlPath = path.join(__dirname, '../build/icon/splash.html');
const shutdownHtmlPath = path.join(__dirname, '../build/icon/shutdown.html');
const splashMinimumVisibleMs = 800;
const splashMaximumVisibleMs = 60_000;
const shutdownPerformanceFileName = 'last-shutdown-performance.json';

interface PersistedShutdownPerformance {
  recordedAt: string;
  totalMs: number;
  vacuumMs: number;
  shutdownBackupMs: number;
  closeDatabaseMs: number;
  shutdownBackupPrepareMs?: number;
  shutdownBackupJsonMs?: number;
  shutdownBackupLocalSqliteMs?: number;
  shutdownBackupSharedSqliteMs?: number;
  shutdownBackupDailySqliteMs?: number;
}

function shutdownPerformancePath(): string {
  return path.join(app.getPath('userData'), shutdownPerformanceFileName);
}

async function writeShutdownPerformance(metrics: Omit<PersistedShutdownPerformance, 'recordedAt'>): Promise<void> {
  const payload: PersistedShutdownPerformance = { recordedAt: new Date().toISOString(), ...metrics };
  await writeFile(shutdownPerformancePath(), JSON.stringify(payload), 'utf8');
}

async function readShutdownPerformance(): Promise<PersistedShutdownPerformance | null> {
  try {
    const raw = await readFile(shutdownPerformancePath(), 'utf8');
    return JSON.parse(raw) as PersistedShutdownPerformance;
  } catch {
    return null;
  }
}

type SqlitePersistenceModule = typeof import('./sqlitePersistence.js');
type ConnectivityIssueNotifier = Parameters<SqlitePersistenceModule['setDatabaseConnectivityIssueNotifier']>[0];
let sqlitePersistenceModulePromise: Promise<SqlitePersistenceModule> | null = null;

function loadSqlitePersistenceModule(): Promise<SqlitePersistenceModule> {
  sqlitePersistenceModulePromise ??= import('./sqlitePersistence.js');
  return sqlitePersistenceModulePromise;
}
function logStartupPhase(startedAt: number, phase: string): void { console.info(`[startup] ${phase}: ${Date.now() - startedAt} ms`); }
function createContextMenu(mainWindow: BrowserWindow): void {
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const template: MenuItemConstructorOptions[] = [];

    if (params.isEditable && params.misspelledWord) {
      const suggestions = params.dictionarySuggestions.slice(0, 6);
      if (suggestions.length > 0) {
        for (const suggestion of suggestions) {
          template.push({
            label: suggestion,
            click: () => mainWindow.webContents.replaceMisspelling(suggestion),
          });
        }
      } else {
        template.push({ label: 'Sin sugerencias ortográficas', enabled: false });
      }
      template.push({
        label: 'Añadir al diccionario',
        click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });
      template.push({ type: 'separator' });
    }

    if (params.isEditable) {
      template.push(
        { role: 'undo', label: 'Deshacer', enabled: params.editFlags.canUndo },
        { role: 'redo', label: 'Rehacer', enabled: params.editFlags.canRedo },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar', enabled: params.editFlags.canCut },
        { role: 'copy', label: 'Copiar', enabled: params.editFlags.canCopy },
        { role: 'paste', label: 'Pegar', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll', label: 'Seleccionar todo', enabled: params.editFlags.canSelectAll },
      );
    } else {
      template.push(
        { role: 'copy', label: 'Copiar', enabled: params.selectionText.length > 0 },
        { type: 'separator' },
        { role: 'selectAll', label: 'Seleccionar todo' },
      );
    }

    Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });
}
type SplashStepStatus = 'pending' | 'active' | 'done' | 'error';

function createSplashWindow(): BrowserWindow {
  const splashWindow = new BrowserWindow({ width: 500, height: 540, resizable: false, movable: true, minimizable: false, maximizable: false, closable: true, frame: false, show: true, alwaysOnTop: true, skipTaskbar: true, title: 'Cargando TrAcción', backgroundColor: '#0F1F2A', icon: appIconPath, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  splashWindow.center();
  splashWindow.loadFile(splashHtmlPath).catch(() => undefined);
  return splashWindow;
}

function updateSplashStep(
  splashWindow: BrowserWindow | null,
  step: string,
  status: SplashStepStatus,
  detail?: string,
): void {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const payload = JSON.stringify({ step, status, detail });
  void splashWindow.webContents
    .executeJavaScript(`window.__traccionSplashUpdate?.(${payload})`, true)
    .catch(() => undefined);
}
function createShutdownWindow(): BrowserWindow {
  const shutdownWindow = new BrowserWindow({ width: 460, height: 360, resizable: false, movable: true, minimizable: false, maximizable: false, closable: false, frame: false, show: true, alwaysOnTop: true, skipTaskbar: true, title: 'Cerrando TrAcción', backgroundColor: '#0F1F2A', icon: appIconPath, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  shutdownWindow.center();
  shutdownWindow.loadFile(shutdownHtmlPath).catch(() => undefined);
  return shutdownWindow;
}
function waitForSplashPaint(splashWindow: BrowserWindow, timeoutMs = 700): Promise<void> {
  if (splashWindow.isDestroyed()) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (settled) return; settled = true; setTimeout(resolve, 60); };
    const timeout = setTimeout(finish, timeoutMs);
    splashWindow.webContents.once('did-finish-load', () => { clearTimeout(timeout); finish(); });
    splashWindow.webContents.once('did-fail-load', () => { clearTimeout(timeout); finish(); });
  });
}
function closeSplashAndShowMain(splashWindow: BrowserWindow | null, mainWindow: BrowserWindow): void {
  if (!mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
}
function showMainAfterSplash(splashWindow: BrowserWindow | null, mainWindow: BrowserWindow, splashStartedAt: number): void {
  const remainingMs = Math.max(0, splashMinimumVisibleMs - (Date.now() - splashStartedAt));
  setTimeout(() => closeSplashAndShowMain(splashWindow, mainWindow), remainingMs);
}
function createWindow(splashWindow: BrowserWindow | null = null, splashStartedAt = Date.now(), setConnectivityIssueNotifier?: (notifier: ConnectivityIssueNotifier) => void): BrowserWindow {
  const mainWindowTitle = `Cuadro de Mando RRLL - TrAcción V.${app.getVersion()}`;
  const mainWindow = new BrowserWindow({ width: 1360, height: 860, minWidth: 1180, minHeight: 720, title: mainWindowTitle, backgroundColor: '#D9EDF2', icon: appIconPath, show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  // El <title> del renderer no debe sustituir el título corporativo/versionado de la ventana.
  mainWindow.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    if (!mainWindow.isDestroyed()) mainWindow.setTitle(mainWindowTitle);
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    const isAllowedDevNavigation = isDev && navigationUrl.startsWith(devServerUrl);
    const isAllowedPackagedNavigation = !isDev && parsedUrl.protocol === 'file:';
    if (!isAllowedDevNavigation && !isAllowedPackagedNavigation) event.preventDefault();
  });
  createContextMenu(mainWindow);
  setConnectivityIssueNotifier?.((payload) => { if (!mainWindow.isDestroyed()) mainWindow.webContents.send('database:connectivity-issue', payload); });
  let hasRequestedMainWindowShow = false;
  const requestMainWindowShow = (markInterfaceReady = true): void => {
    if (hasRequestedMainWindowShow || mainWindow.isDestroyed()) return;
    hasRequestedMainWindowShow = true;
    clearTimeout(forceShowTimer);
    if (markInterfaceReady) updateSplashStep(splashWindow, 'interface', 'done');
    showMainAfterSplash(splashWindow, mainWindow, splashStartedAt);
  };
  const forceShowTimer: ReturnType<typeof setTimeout> = setTimeout(() => {
    updateSplashStep(splashWindow, 'interface', 'error', 'La interfaz no confirmó el arranque en 60 segundos. Se abrirá para permitir el diagnóstico.');
    requestMainWindowShow(false);
  }, splashMaximumVisibleMs);
  const onBootVisible = (event: IpcMainEvent): void => { if (event.sender === mainWindow.webContents) requestMainWindowShow(); };
  const onRendererReady = (event: IpcMainEvent): void => { if (event.sender === mainWindow.webContents) requestMainWindowShow(); };
  mainWindow.webContents.once('did-finish-load', () => {
    updateSplashStep(splashWindow, 'interface', 'active', 'Interfaz cargada. Esperando a que termine su inicialización…');
  });
  ipcMain.on('app:boot-visible', onBootVisible);
  ipcMain.on('app:renderer-ready', onRendererReady);
  mainWindow.once('closed', () => { clearTimeout(forceShowTimer); ipcMain.removeListener('app:boot-visible', onBootVisible); ipcMain.removeListener('app:renderer-ready', onRendererReady); setConnectivityIssueNotifier?.(null); });
  if (isDev) mainWindow.loadURL(devServerUrl).catch(() => { clearTimeout(forceShowTimer); showMainAfterSplash(splashWindow, mainWindow, splashStartedAt); });
  else mainWindow.loadFile(path.join(__dirname, '../dist/index.html')).catch(() => { clearTimeout(forceShowTimer); showMainAfterSplash(splashWindow, mainWindow, splashStartedAt); });
  return mainWindow;
}

async function registerIpcHandlers(): Promise<void> {
  ipcMain.handle('performance:last-shutdown', () => readShutdownPerformance());
  const [
    { registerCoreDatabaseIpc }, { registerSorteosIpc }, { registerPlantillaIpc }, { registerTareasIpc }, { registerSesionesIpc }, { registerVinculogramaIpc }, { registerCriteriosRrllIpc }, { registerTicketRestauranteIpc }, { registerPresupuestosIpc }, { registerEspecialesIpc }, { registerTeletrabajoIpc }, { registerConfiguracionIpc }, { registerLicenciasSinSueldoIpc }, { registerSharedDocumentIpc }, { registerLoteriaIpc }, { registerOperationalExcelBackupIpc }, { registerAyudaEscolarIpc },
  ] = await Promise.all([
    import('./ipc/registerCoreDatabaseIpc.js'), import('./ipc/registerSorteosIpc.js'), import('./ipc/registerPlantillaIpc.js'), import('./ipc/registerTareasIpc.js'), import('./ipc/registerSesionesIpc.js'), import('./ipc/registerVinculogramaIpc.js'), import('./ipc/registerCriteriosRrllIpc.js'), import('./ipc/registerTicketRestauranteIpc.js'), import('./ipc/registerPresupuestosIpc.js'), import('./ipc/registerEspecialesIpc.js'), import('./ipc/registerTeletrabajoIpc.js'), import('./ipc/registerConfiguracionIpc.js'), import('./ipc/registerLicenciasSinSueldoIpc.js'), import('./ipc/registerSharedDocumentIpc.js'), import('./ipc/registerLoteriaIpc.js'), import('./ipc/registerOperationalExcelBackupIpc.js'), import('./ipc/registerAyudaEscolarIpc.js'),
  ]);
  registerCoreDatabaseIpc(); registerSorteosIpc(); registerPlantillaIpc(); registerTareasIpc(); registerSesionesIpc(); registerVinculogramaIpc(); registerCriteriosRrllIpc(); registerTicketRestauranteIpc(); registerPresupuestosIpc(); registerEspecialesIpc(); registerTeletrabajoIpc(); registerConfiguracionIpc(); registerLicenciasSinSueldoIpc(); registerSharedDocumentIpc(); registerLoteriaIpc(); registerOperationalExcelBackupIpc(); registerAyudaEscolarIpc();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
  app.whenReady().then(async () => {
    const startupStartedAt = Date.now();
    app.setAppUserModelId('com.metro.rrll.traccion');
    Menu.setApplicationMenu(null);
    const splashStartedAt = Date.now();
    const splashWindow = createSplashWindow();
    await waitForSplashPaint(splashWindow);
    updateSplashStep(splashWindow, 'electron', 'done');
    updateSplashStep(splashWindow, 'persistence', 'active');
    logStartupPhase(startupStartedAt, 'splash visible');

    try {
      const persistence = await loadSqlitePersistenceModule().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        updateSplashStep(splashWindow, 'persistence', 'error', message || 'No se pudo cargar el motor de datos.');
        throw error;
      });
      updateSplashStep(splashWindow, 'persistence', 'done');
      logStartupPhase(startupStartedAt, 'persistence module loaded');

      updateSplashStep(splashWindow, 'database', 'active');
      updateSplashStep(splashWindow, 'services', 'active');
      await Promise.all([
        persistence.initializeSqlitePersistence().then(() => {
          updateSplashStep(splashWindow, 'database', 'done');
        }).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          updateSplashStep(splashWindow, 'database', 'error', message || 'No se pudo inicializar la base de datos.');
          throw error;
        }),
        registerIpcHandlers().then(() => {
          updateSplashStep(splashWindow, 'services', 'done');
        }).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          updateSplashStep(splashWindow, 'services', 'error', message || 'No se pudieron preparar los servicios internos.');
          throw error;
        }),
      ]);
      logStartupPhase(startupStartedAt, 'SQLite and IPC ready');

      updateSplashStep(splashWindow, 'interface', 'active');
      createWindow(splashWindow, splashStartedAt, persistence.setDatabaseConnectivityIssueNotifier);
      logStartupPhase(startupStartedAt, 'main window loading');
      app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(null, Date.now(), persistence.setDatabaseConnectivityIssueNotifier); });
    } catch (error: unknown) {
      console.error('[startup] Error durante el arranque de TrAcción.', error);
    }
  });
  let isQuitAfterSqlitePersistenceClosed = false;
  let isShutdownInProgress = false;
  let shutdownWindow: BrowserWindow | null = null;
  app.on('before-quit', (event) => {
    if (isQuitAfterSqlitePersistenceClosed) return;
    event.preventDefault();
    if (isShutdownInProgress) return;
    isShutdownInProgress = true;
    shutdownWindow = createShutdownWindow();
    const shutdownStartedAt = Date.now();
    // Persistimos una marca al comenzar el cierre. Así el siguiente arranque puede
    // diagnosticar también un cierre que no llegue a completar la escritura final.
    void writeShutdownPerformance({ totalMs: 0, vacuumMs: 0, shutdownBackupMs: 0, closeDatabaseMs: 0 })
      .catch((error: unknown) => console.warn('No se ha podido iniciar la métrica de cierre.', error));
    loadSqlitePersistenceModule()
      .then(({ closeSqlitePersistence }) => closeSqlitePersistence())
      .then((metrics) => writeShutdownPerformance({ ...metrics, totalMs: Math.max(metrics.totalMs, Date.now() - shutdownStartedAt) }))
      .catch((error: unknown) => console.warn('No se ha podido completar el cierre SQLite antes de salir.', error))
      .finally(() => {
      isQuitAfterSqlitePersistenceClosed = true;
      if (shutdownWindow && !shutdownWindow.isDestroyed()) shutdownWindow.destroy();
      shutdownWindow = null;
      app.quit();
    });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import type { IpcMainEvent, MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';
const appIconPath = path.join(__dirname, '../build/icon/traccion-icon-256.ico');
const splashHtmlPath = path.join(__dirname, '../build/icon/splash.html');
const splashMinimumVisibleMs = 800;
const splashMaximumVisibleMs = 25_000;

type SqlitePersistenceModule = typeof import('./sqlitePersistence.js');
type ConnectivityIssueNotifier = Parameters<
  SqlitePersistenceModule['setDatabaseConnectivityIssueNotifier']
>[0];

let sqlitePersistenceModulePromise: Promise<SqlitePersistenceModule> | null = null;

function loadSqlitePersistenceModule(): Promise<SqlitePersistenceModule> {
  sqlitePersistenceModulePromise ??= import('./sqlitePersistence.js');
  return sqlitePersistenceModulePromise;
}

function logStartupPhase(startedAt: number, phase: string): void {
  console.info(`[startup] ${phase}: ${Date.now() - startedAt} ms`);
}

function createContextMenu(mainWindow: BrowserWindow): void {
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const template: MenuItemConstructorOptions[] = [
      { role: 'cut', enabled: params.isEditable },
      { role: 'copy', enabled: params.selectionText.length > 0 },
      { role: 'paste', enabled: params.isEditable },
      { type: 'separator' },
      { role: 'selectAll' },
    ];

    Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });
}

function createSplashWindow(): BrowserWindow {
  const splashWindow = new BrowserWindow({
    width: 460,
    height: 360,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    closable: true,
    frame: false,
    show: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'Cargando TrAccion',
    backgroundColor: '#0F1F2A',
    icon: appIconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  splashWindow.center();
  splashWindow.loadFile(splashHtmlPath).catch(() => undefined);

  return splashWindow;
}

function waitForSplashPaint(splashWindow: BrowserWindow, timeoutMs = 700): Promise<void> {
  if (splashWindow.isDestroyed()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      setTimeout(resolve, 60);
    };

    const timeout = setTimeout(finish, timeoutMs);
    splashWindow.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      finish();
    });
    splashWindow.webContents.once('did-fail-load', () => {
      clearTimeout(timeout);
      finish();
    });
  });
}

function closeSplashAndShowMain(
  splashWindow: BrowserWindow | null,
  mainWindow: BrowserWindow,
): void {
  if (!mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
}

function showMainAfterSplash(
  splashWindow: BrowserWindow | null,
  mainWindow: BrowserWindow,
  splashStartedAt: number,
): void {
  const elapsedMs = Date.now() - splashStartedAt;
  const remainingMs = Math.max(0, splashMinimumVisibleMs - elapsedMs);

  setTimeout(() => closeSplashAndShowMain(splashWindow, mainWindow), remainingMs);
}

function createWindow(
  splashWindow: BrowserWindow | null = null,
  splashStartedAt = Date.now(),
  setConnectivityIssueNotifier?: (notifier: ConnectivityIssueNotifier) => void,
): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1180,
    minHeight: 720,
    title: 'TrAccion',
    backgroundColor: '#D9EDF2',
    icon: appIconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    const isAllowedDevNavigation = isDev && navigationUrl.startsWith(devServerUrl);
    const isAllowedPackagedNavigation = !isDev && parsedUrl.protocol === 'file:';

    if (!isAllowedDevNavigation && !isAllowedPackagedNavigation) {
      event.preventDefault();
    }
  });

  createContextMenu(mainWindow);

  setConnectivityIssueNotifier?.((payload) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('database:connectivity-issue', payload);
    }
  });

  let hasRequestedMainWindowShow = false;
  const requestMainWindowShow = (): void => {
    if (hasRequestedMainWindowShow || mainWindow.isDestroyed()) {
      return;
    }

    hasRequestedMainWindowShow = true;
    clearTimeout(forceShowTimer);
    showMainAfterSplash(splashWindow, mainWindow, splashStartedAt);
  };

  const forceShowTimer: ReturnType<typeof setTimeout> = setTimeout(
    requestMainWindowShow,
    splashMaximumVisibleMs,
  );

  const onBootVisible = (event: IpcMainEvent): void => {
    if (event.sender !== mainWindow.webContents) {
      return;
    }

    requestMainWindowShow();
  };

  const onRendererReady = (event: IpcMainEvent): void => {
    if (event.sender !== mainWindow.webContents) {
      return;
    }

    requestMainWindowShow();
  };

  ipcMain.on('app:boot-visible', onBootVisible);
  ipcMain.on('app:renderer-ready', onRendererReady);

  mainWindow.once('closed', () => {
    clearTimeout(forceShowTimer);
    ipcMain.removeListener('app:boot-visible', onBootVisible);
    ipcMain.removeListener('app:renderer-ready', onRendererReady);
    setConnectivityIssueNotifier?.(null);
  });

  if (isDev) {
    mainWindow.loadURL(devServerUrl).catch(() => {
      clearTimeout(forceShowTimer);
      showMainAfterSplash(splashWindow, mainWindow, splashStartedAt);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html')).catch(() => {
      clearTimeout(forceShowTimer);
      showMainAfterSplash(splashWindow, mainWindow, splashStartedAt);
    });
  }

  return mainWindow;
}

async function registerIpcHandlers(): Promise<void> {
  const [
    { registerCoreDatabaseIpc },
    { registerSorteosIpc },
    { registerPlantillaIpc },
    { registerTareasIpc },
    { registerSesionesIpc },
    { registerVinculogramaIpc },
    { registerCriteriosRrllIpc },
    { registerTicketRestauranteIpc },
    { registerPresupuestosIpc },
    { registerEspecialesIpc },
    { registerTeletrabajoIpc },
    { registerConfiguracionIpc },
    { registerLicenciasSinSueldoIpc },
    { registerSharedDocumentIpc },
  ] = await Promise.all([
    import('./ipc/registerCoreDatabaseIpc.js'),
    import('./ipc/registerSorteosIpc.js'),
    import('./ipc/registerPlantillaIpc.js'),
    import('./ipc/registerTareasIpc.js'),
    import('./ipc/registerSesionesIpc.js'),
    import('./ipc/registerVinculogramaIpc.js'),
    import('./ipc/registerCriteriosRrllIpc.js'),
    import('./ipc/registerTicketRestauranteIpc.js'),
    import('./ipc/registerPresupuestosIpc.js'),
    import('./ipc/registerEspecialesIpc.js'),
    import('./ipc/registerTeletrabajoIpc.js'),
    import('./ipc/registerConfiguracionIpc.js'),
    import('./ipc/registerLicenciasSinSueldoIpc.js'),
    import('./ipc/registerSharedDocumentIpc.js'),
  ]);

  registerCoreDatabaseIpc();
  registerSorteosIpc();
  registerPlantillaIpc();
  registerTareasIpc();
  registerSesionesIpc();
  registerVinculogramaIpc();
  registerCriteriosRrllIpc();
  registerTicketRestauranteIpc();
  registerPresupuestosIpc();
  registerEspecialesIpc();
  registerTeletrabajoIpc();
  registerConfiguracionIpc();
  registerLicenciasSinSueldoIpc();
  registerSharedDocumentIpc();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows[0];
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    const startupStartedAt = Date.now();
    app.setAppUserModelId('com.metro.rrll.traccion');
    Menu.setApplicationMenu(null);

    const splashStartedAt = Date.now();
    const splashWindow = createSplashWindow();
    await waitForSplashPaint(splashWindow);
    logStartupPhase(startupStartedAt, 'splash visible');

    const persistence = await loadSqlitePersistenceModule();
    logStartupPhase(startupStartedAt, 'persistence module loaded');

    await Promise.all([persistence.initializeSqlitePersistence(), registerIpcHandlers()]);
    logStartupPhase(startupStartedAt, 'SQLite and IPC ready');

    createWindow(
      splashWindow,
      splashStartedAt,
      persistence.setDatabaseConnectivityIssueNotifier,
    );
    logStartupPhase(startupStartedAt, 'main window loading');

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(null, Date.now(), persistence.setDatabaseConnectivityIssueNotifier);
      }
    });
  });

  let isQuitAfterSqlitePersistenceClosed = false;

  app.on('before-quit', (event) => {
    if (isQuitAfterSqlitePersistenceClosed) {
      return;
    }

    event.preventDefault();
    loadSqlitePersistenceModule()
      .then(({ closeSqlitePersistence }) => closeSqlitePersistence())
      .catch((error: unknown) => {
        console.warn('No se ha podido crear la copia de cierre antes de salir.', error);
      })
      .finally(() => {
        isQuitAfterSqlitePersistenceClosed = true;
        app.quit();
      });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

import { app, BrowserWindow } from 'electron';

const SPLASH_TITLE = 'Cargando TrAcción';
const MAIN_WINDOW_TITLE_PREFIX = 'Cuadro de Mando RRLL - TrAcción';
const PRELOADER_SAFETY_TIMEOUT_MS = 8_000;

let preloaderWindow: BrowserWindow | null = null;
let preloaderSafetyTimer: ReturnType<typeof setTimeout> | null = null;

function closePreloader(): void {
  if (preloaderSafetyTimer) {
    clearTimeout(preloaderSafetyTimer);
    preloaderSafetyTimer = null;
  }

  if (preloaderWindow && !preloaderWindow.isDestroyed()) {
    preloaderWindow.destroy();
  }
  preloaderWindow = null;
}

function createPreloaderWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 260,
    height: 126,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    frame: false,
    show: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    title: 'Iniciando TrAcción',
    backgroundColor: '#0F1F2A',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.center();

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; }
  html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0F1F2A;
    color: #F8FAFC;
    font-family: "Segoe UI", Arial, sans-serif;
    user-select: none;
  }
  .loader {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 18px 22px;
  }
  .clock {
    position: relative;
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    border: 3px solid rgba(255,255,255,.22);
    border-top-color: #E30613;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  .clock::before {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 2px;
    height: 12px;
    margin-left: -1px;
    margin-top: -11px;
    border-radius: 2px;
    background: #F8FAFC;
    transform-origin: 50% 11px;
  }
  .clock::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 6px;
    height: 6px;
    margin: -3px 0 0 -3px;
    border-radius: 50%;
    background: #E30613;
  }
  .title { font-size: 14px; font-weight: 700; letter-spacing: .01em; }
  .subtitle { margin-top: 4px; font-size: 11px; color: #9FB0C3; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
  <div class="loader" role="status" aria-label="Iniciando TrAcción">
    <div class="clock" aria-hidden="true"></div>
    <div>
      <div class="title">Iniciando TrAcción…</div>
      <div class="subtitle">Preparando la aplicación</div>
    </div>
  </div>
</body>
</html>`;

  void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => undefined);

  preloaderSafetyTimer = setTimeout(closePreloader, PRELOADER_SAFETY_TIMEOUT_MS);
  return window;
}

app.on('browser-window-created', (_event, window) => {
  const title = window.getTitle();

  if (title === SPLASH_TITLE) {
    window.once('ready-to-show', closePreloader);
    return;
  }

  if (title.startsWith(MAIN_WINDOW_TITLE_PREFIX)) {
    window.maximize();
  }
});

app.whenReady().then(() => {
  preloaderWindow = createPreloaderWindow();
});

void import('./main.js');

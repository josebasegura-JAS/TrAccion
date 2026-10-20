import { app, BrowserWindow, screen } from 'electron';

const MAIN_WINDOW_TITLE_PREFIX = 'Cuadro de Mando RRLL - TrAcción';

// Mantener el punto de entrada ligero: el splash principal se crea en main.ts.
// Solo preparar la geometría del dashboard mientras permanece oculto.
app.on('browser-window-created', (_event, window) => {
  if (window.getTitle().startsWith(MAIN_WINDOW_TITLE_PREFIX)) {
    window.setBounds(screen.getDisplayMatching(window.getBounds()).workArea);
  }
});

void app.whenReady().then(async () => {
  try {
    await import('./main.js');
  } catch (error: unknown) {
    console.error('[startup] No se pudo cargar main.js.', error);
  }
});

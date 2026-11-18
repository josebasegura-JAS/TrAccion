import { app, screen } from 'electron';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const isMultiuserTestClientB = process.argv.includes('--traccion-test-user-b');
function prepareSecondClientProfile(): boolean {
  if (!isMultiuserTestClientB) return true;
  try {
    const primaryProfile = app.getPath('userData');
    const preferencesPath = path.join(primaryProfile, 'sqlite-preferences.json');
    if (!existsSync(preferencesPath)) {
      console.error('[multiuser-test] Falta configuración de SQLite en el perfil principal.');
      return false;
    }
    const preferences: unknown = JSON.parse(readFileSync(preferencesPath, 'utf8'));
    if (!preferences || typeof preferences !== 'object') return false;
    const directory = (preferences as { customDirectoryPath?: unknown }).customDirectoryPath;
    if (typeof directory !== 'string' || !directory.trim() || !existsSync(path.join(directory, 'traccion.sqlite'))) {
      console.error('[multiuser-test] Es necesario configurar una SQLite compartida existente en el perfil principal.');
      return false;
    }
    const profileB = path.join(path.dirname(primaryProfile), path.basename(primaryProfile) + '-multiuser-test-B');
    mkdirSync(profileB, { recursive: true });
    // Solo se replica la configuración de la base; nunca la identidad de bloqueo.
    copyFileSync(preferencesPath, path.join(profileB, 'sqlite-preferences.json'));
    app.setPath('userData', profileB);
    console.info('[multiuser-test] Cliente B: datos locales independientes, SQLite compartida.');
    return true;
  } catch (error) {
    console.error('[multiuser-test] Error preparando el segundo perfil.', error);
    return false;
  }
}

const multiuserProfileReady = prepareSecondClientProfile();

const MAIN_WINDOW_TITLE_PREFIX = 'Cuadro de Mando RRLL - TrAcción';

// Mantener el punto de entrada ligero: el splash principal se crea en main.ts.
// Solo preparar la geometría del dashboard mientras permanece oculto.
app.on('browser-window-created', (_event, window) => {
  if (window.getTitle().startsWith(MAIN_WINDOW_TITLE_PREFIX)) {
    window.setBounds(screen.getDisplayMatching(window.getBounds()).workArea);
  }
});

void app.whenReady().then(async () => {
  if (!multiuserProfileReady) {
    console.error('[multiuser-test] Inicio cancelado: no se ha podido aislar la segunda instancia.');
    app.quit();
    return;
  }
  try {
    await import('./main.js');
  } catch (error: unknown) {
    console.error('[startup] No se pudo cargar main.js.', error);
  }
});

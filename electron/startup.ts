import { app, dialog, screen } from 'electron';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { selectDatabaseEnvironmentBeforeMain } from './databaseEnvironmentStartup.js';

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

// The startup chooser is initially the ONLY Electron BrowserWindow. Its close
// must not trigger Electron's default "quit when all windows close" behaviour
// before main.ts can create the real window. Keep this no-op listener for the
// process lifetime; main.ts owns the normal quit logic after initialization.
app.on('window-all-closed', () => {
  // During environment selection/startup, an empty window list is expected.
  // When the actual main window closes, main.ts handles shutdown separately.
});


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
    // No production IPC or SQLite connection is initialized until the user
    // chooses an environment and (for tests) a separate userData profile.
    if (!isMultiuserTestClientB) {
      const selected = await selectDatabaseEnvironmentBeforeMain();
      if (!selected) { app.quit(); return; }
      if (selected === 'test') {
        const { prepareDisposableTestDatabase } = await import('./persistence/disposableTestDatabase.js');
        await prepareDisposableTestDatabase();
      }
    } else {
      process.env.TRACCION_DATABASE_ENVIRONMENT = 'production';
    }
    await import('./main.js');
  } catch (error: unknown) {
    console.error('[startup] No se pudo preparar el entorno o cargar main.js.', error);
    dialog.showErrorBox('TrAcción · Arranque suspendido',
      error instanceof Error ? error.message : 'No se pudo preparar el entorno de trabajo.');
    app.quit();
  }
});

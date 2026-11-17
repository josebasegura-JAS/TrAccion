/**
 * Environment selection happens BEFORE importing Electron main / SQLite.
 * A test run has its own userData, preferences, caches, backups and ownerId.
 * No SQLite handle from the production profile is ever opened by this module.
 */
import { app, dialog } from 'electron';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promptDatabaseEnvironment } from './databaseEnvironmentChoice.js';

type Environment = 'production' | 'test';
interface SavedTestPreferences {
  customDirectoryPath: string;
  expectedDatabaseUuid: string | null;
}
function normalizedExistingDirectory(value: string): string {
  return realpathSync.native(value).toLowerCase();
}
function readConfiguredDirectory(profile: string): string | null {
  try {
    const obj: unknown = JSON.parse(readFileSync(path.join(profile, 'sqlite-preferences.json'), 'utf8'));
    if (!obj || typeof obj !== 'object') return null;
    const directory = (obj as {customDirectoryPath?:unknown}).customDirectoryPath;
    return typeof directory === 'string' && directory.trim() ? directory : null;
  } catch { return null; }
}
function saveTestDirectory(profile: string, directory: string): void {
  const file = path.join(profile, 'sqlite-preferences.json');
  // Keep existing test-specific backup preferences but reset identity when
  // choosing a different database. Production preferences are never edited.
  let previous: Record<string,unknown> = {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(file,'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      previous = parsed as Record<string,unknown>;
    }
  } catch { /* first setup */ }
  const previousDirectory = typeof previous.customDirectoryPath === 'string'
    ? previous.customDirectoryPath : null;
  const sameDirectory = previousDirectory !== null && existsSync(previousDirectory)
    && existsSync(directory)
    && normalizedExistingDirectory(previousDirectory) === normalizedExistingDirectory(directory);
  // Keep the recorded UUID when reusing the SAME test database. Reset only
  // for a genuinely different directory (where a new DB may be generated).
  const settings: SavedTestPreferences & Record<string,unknown> = {
    ...previous, customDirectoryPath: directory,
    expectedDatabaseUuid: sameDirectory && typeof previous.expectedDatabaseUuid === 'string'
      ? previous.expectedDatabaseUuid : null,
  };
  mkdirSync(profile,{recursive:true});
  writeFileSync(file,JSON.stringify(settings,null,2),'utf8');
}
export async function selectDatabaseEnvironmentBeforeMain(): Promise<Environment | null> {
  const primaryProfile = app.getPath('userData');
  const selected = await promptDatabaseEnvironment();
  if (!selected) return null;
  if (selected === 'production') {
    process.env.TRACCION_DATABASE_ENVIRONMENT = 'production';
    return 'production';
  }

  const testProfile = primaryProfile + '-test-environment';
  const productionDirectory = readConfiguredDirectory(primaryProfile);
  const currentTestDirectory = readConfiguredDirectory(testProfile);
  let directory = currentTestDirectory;
  if (directory) {
    const decision = dialog.showMessageBoxSync({
      type:'question', title:'TrAcción · Base de pruebas',
      message:'Seleccionar carpeta de pruebas',
      detail:directory,
      buttons:['Usar esta carpeta','Cambiar carpeta','Cancelar'],
      defaultId:0, cancelId:2, noLink:true,
    });
    if (decision === 2) return null;
    if (decision === 1) directory = null;
  }
  if (!directory) {
    const selectedFolder = await dialog.showOpenDialog({
      title:'Selecciona una carpeta EXCLUSIVA para traccion.sqlite de pruebas',
      properties:['openDirectory','createDirectory'],
    });
    if (selectedFolder.canceled || !selectedFolder.filePaths[0]) return null;
    directory = selectedFolder.filePaths[0];
  }
  if (!existsSync(directory)) {
    dialog.showErrorBox('Carpeta de pruebas no disponible','La carpeta seleccionada no existe o no está accesible.');
    return null;
  }
  try {
    const testReal = normalizedExistingDirectory(directory);
    const prodReal = productionDirectory && existsSync(productionDirectory)
      ? normalizedExistingDirectory(productionDirectory) : null;
    if (prodReal && testReal === prodReal) {
      throw new Error('La carpeta de pruebas coincide con la carpeta configurada para producción.');
    }
    if (testReal === normalizedExistingDirectory(primaryProfile)) {
      throw new Error('No utilices el perfil local de producción como carpeta de pruebas.');
    }
  } catch(error) {
    dialog.showErrorBox('Ruta de pruebas no válida',error instanceof Error?error.message:String(error));
    return null;
  }
  saveTestDirectory(testProfile,directory);
  app.setPath('userData',testProfile);
  process.env.TRACCION_DATABASE_ENVIRONMENT = 'test';
  return 'test';
}

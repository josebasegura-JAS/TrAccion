/**
 * Environment selection happens BEFORE importing Electron main / SQLite.
 * A test run has its own userData, preferences, caches, backups and ownerId.
 * No SQLite handle from the production profile is ever opened by this module.
 */
import { app, dialog } from 'electron';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Environment = 'production' | 'test';
interface SavedTestPreferences {
  customDirectoryPath: string;
  expectedDatabaseUuid: null;
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
  const settings: SavedTestPreferences & Record<string,unknown> = {
    ...previous, customDirectoryPath: directory, expectedDatabaseUuid: null,
  };
  mkdirSync(profile,{recursive:true});
  writeFileSync(file,JSON.stringify(settings,null,2),'utf8');
}
export async function selectDatabaseEnvironmentBeforeMain(): Promise<Environment | null> {
  const primaryProfile = app.getPath('userData');
  const selected = dialog.showMessageBoxSync({
    type:'question', title:'TrAcción · Entorno de trabajo',
    message:'¿Con qué base de datos quieres trabajar?',
    detail:'Producción utiliza tu configuración habitual. Pruebas utiliza otro perfil, otra carpeta SQLite y datos de ensayo.',
    buttons:['Producción','Pruebas','Cancelar'],
    defaultId:0, cancelId:2, noLink:true,
  });
  if (selected === 2) return null;
  if (selected === 0) {
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

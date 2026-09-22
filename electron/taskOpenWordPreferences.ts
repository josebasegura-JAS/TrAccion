import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfiguracionSnapshot, saveConfiguracionIfUnchanged } from './sqlitePersistence.js';

const PREFERENCES_FILE_NAME = 'task-word-preferences.json';
const SHARED_ROUTE_KEY = 'rutaExportacionTareas';

interface TaskWordPreferences {
  directoryPath: string | null;
}

type SharedConfiguracion = Record<string, unknown> & {
  rutaExportacionTareas?: unknown;
};

function getPreferencesPath(): string {
  return path.join(app.getPath('userData'), PREFERENCES_FILE_NAME);
}

function parseSharedConfiguracion(value: string | null): SharedConfiguracion {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as SharedConfiguracion) : {};
  } catch {
    return {};
  }
}

async function getLegacyLocalDirectory(): Promise<string | null> {
  try {
    const raw = await readFile(getPreferencesPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const directoryPath = (parsed as Partial<TaskWordPreferences>).directoryPath;
    return typeof directoryPath === 'string' && directoryPath.trim() ? directoryPath.trim() : null;
  } catch {
    return null;
  }
}

async function writeLegacyLocalDirectory(directoryPath: string | null): Promise<void> {
  await mkdir(path.dirname(getPreferencesPath()), { recursive: true });
  await writeFile(
    getPreferencesPath(),
    JSON.stringify({ directoryPath } satisfies TaskWordPreferences, null, 2),
    'utf8',
  );
}

async function saveSharedDirectory(directoryPath: string | null): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const snapshot = await loadConfiguracionSnapshot();
    if (!snapshot.status.ready || snapshot.status.phase !== 'active') return false;

    const configuracion = parseSharedConfiguracion(snapshot.value);
    // No crear aquí una configuración parcial: el store del renderer es quien
    // inicializa el documento completo de Ajustes. Si aún no existe, mantenemos
    // temporalmente la preferencia local hasta que el usuario guarde Ajustes.
    if (typeof configuracion.rutaPlantillaTeletrabajo !== 'string') return false;
    configuracion[SHARED_ROUTE_KEY] = directoryPath ?? '';
    const result = await saveConfiguracionIfUnchanged({
      value: JSON.stringify(configuracion),
      expectedUpdatedAt: snapshot.updatedAt,
    });
    if (result.ok) return true;
    if (attempt === 1) return false;
  }
  return false;
}

export async function getOpenTasksWordDirectory(): Promise<string | null> {
  const snapshot = await loadConfiguracionSnapshot();
  if (snapshot.status.ready && snapshot.status.phase === 'active') {
    const configuracion = parseSharedConfiguracion(snapshot.value);
    const sharedPath = configuracion.rutaExportacionTareas;
    if (typeof sharedPath === 'string' && sharedPath.trim()) return sharedPath.trim();
  }

  // Compatibilidad con versiones anteriores: si todavía no existe la ruta
  // compartida, se puede seguir leyendo la preferencia local del equipo.
  return getLegacyLocalDirectory();
}

export async function setOpenTasksWordDirectory(directoryPath: string): Promise<string> {
  const normalized = path.resolve(directoryPath);
  const sharedSaved = await saveSharedDirectory(normalized);
  if (!sharedSaved) {
    // Fallback para no dejar inoperativa la función si SQLite no está disponible.
    await writeLegacyLocalDirectory(normalized);
  } else {
    // Limpia la preferencia local para que la fuente de verdad sea la compartida.
    await writeLegacyLocalDirectory(null).catch(() => undefined);
  }
  return normalized;
}

export async function clearOpenTasksWordDirectory(): Promise<void> {
  const sharedSaved = await saveSharedDirectory(null);
  if (!sharedSaved) {
    await writeLegacyLocalDirectory(null);
    return;
  }
  await writeLegacyLocalDirectory(null).catch(() => undefined);
}

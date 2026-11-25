import * as electron from 'electron';
import path from 'node:path';

// El proceso principal conserva la resolución histórica. Un futuro propietario
// SQLite puede recibir la ruta ya resuelta antes de cargar la persistencia.
let configuredUserData: string | undefined;

export function configurePersistenceUserDataPath(userData: string): void {
  if (!path.isAbsolute(userData)) throw new Error('Ruta userData SQLite no absoluta.');
  const normalized = path.normalize(userData);
  if (configuredUserData !== undefined && configuredUserData !== normalized) {
    throw new Error('No se puede cambiar el contexto SQLite de un proceso activo.');
  }
  configuredUserData = normalized;
}

export function getPersistenceUserDataPath(): string {
  if (configuredUserData !== undefined) return configuredUserData;
  return electron.app.getPath('userData');
}

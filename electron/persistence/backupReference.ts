import path from 'node:path';

function joinBackupPath(directory: string, fileName: string): string {
  if (directory.includes('/')) {
    return path.posix.join(directory.replace(/\\/g, '/'), fileName);
  }

  return path.join(directory, fileName);
}

/**
 * Sin dependencias de Electron a propósito (mismo motivo que
 * electron/persistence/maintenanceQueries.ts y recordLocks.ts): solo
 * clasificación de nombres de archivo y resolución segura de rutas de
 * backup, sin tocar el sistema de archivos ni `app.getPath`.
 *
 * `resolveLocalBackupReference` es la pieza con más responsabilidad de
 * seguridad de todo el sistema de backups: decide qué nombre de archivo
 * "elegido por el usuario" en la lista de Ajustes se traduce en una ruta
 * real de disco, y rechaza cualquier intento de salir del directorio de
 * backups (path traversal, p. ej. "../../../etc/passwd") comprobando que
 * `path.basename(...)` no cambie el nombre recibido.
 */

export const LOCAL_BACKUP_DATABASE_FILE_NAME = 'traccion-local-backup.sqlite';
export const LOCAL_BACKUP_JSON_FILE_NAME = 'traccion-local-backup.json';
export const LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME = 'shutdown';

export function isLocalBackupFileName(fileName: string): boolean {
  return (
    fileName === LOCAL_BACKUP_DATABASE_FILE_NAME ||
    fileName === LOCAL_BACKUP_JSON_FILE_NAME ||
    /^traccion-local-backup-.*\.(sqlite|json)$/.test(fileName)
  );
}

export function isShutdownBackupFileName(fileName: string): boolean {
  return /^traccion-shutdown-backup-.*\.(sqlite|json)$/.test(fileName);
}

export function isKnownBackupFileName(fileName: string): boolean {
  return isLocalBackupFileName(fileName) || isShutdownBackupFileName(fileName);
}

export function localBackupKindFromFileName(fileName: string): 'sqlite' | 'json' | null {
  if (fileName.endsWith('.sqlite')) {
    return 'sqlite';
  }

  if (fileName.endsWith('.json')) {
    return 'json';
  }

  return null;
}

export interface LocalBackupReference {
  safeFileName: string;
  backupPath: string;
}

/**
 * Traduce el `fileName` que llega desde la UI (elegido por el usuario en la
 * lista de copias de Ajustes) a una ruta real de disco, o `null` si no es
 * un nombre de backup válido o conocido.
 *
 * Acepta dos formas: un nombre simple ("traccion-local-backup.sqlite") o
 * uno con el prefijo de la carpeta de cierre ("shutdown/traccion-shutdown-backup-...").
 * Cualquier otra cosa — incluido cualquier intento de salir del directorio
 * de backups via "../" — se rechaza devolviendo null.
 */
export function resolveLocalBackupReference(
  fileName: string,
  localBackupDirectory: string,
  localShutdownBackupDirectory: string,
): LocalBackupReference | null {
  const normalizedReference = fileName.replace(/\\/g, '/');
  const isShutdownReference = normalizedReference.startsWith(`${LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME}/`);
  const rawFileName = isShutdownReference
    ? normalizedReference.slice(LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME.length + 1)
    : normalizedReference;
  const safeFileName = path.basename(rawFileName);

  // Si path.basename() cambió algo (porque había separadores de directorio,
  // ".." o similar), el nombre no es un nombre de archivo simple y se
  // rechaza: esto es lo que impide el path traversal.
  if (safeFileName !== rawFileName || !isKnownBackupFileName(safeFileName)) {
    return null;
  }

  if (isShutdownReference) {
    return isShutdownBackupFileName(safeFileName)
      ? { safeFileName, backupPath: joinBackupPath(localShutdownBackupDirectory, safeFileName) }
      : null;
  }

  return isLocalBackupFileName(safeFileName)
    ? { safeFileName, backupPath: joinBackupPath(localBackupDirectory, safeFileName) }
    : null;
}

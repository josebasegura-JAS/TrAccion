import { resolveTestOutputDirectory } from './testOutputPaths.js';
import { getTraccionEnvironment } from './traccionEnvironment.js';
import { getPersistenceUserDataPath } from './persistenceRuntime.js';
import { copyFile, mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { verifySqliteIntegrityReadOnly, type ExpectedSqliteIdentity } from './sqliteIntegrityVerification.js';
import path from 'node:path';
import {
  LOCAL_BACKUP_DATABASE_FILE_NAME,
  LOCAL_BACKUP_JSON_FILE_NAME,
  LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME,
} from './backupReference.js';
import type { Database } from 'better-sqlite3';
import type { DatabasePreferences } from './databasePreferences.js';

export { LOCAL_BACKUP_DATABASE_FILE_NAME, LOCAL_BACKUP_JSON_FILE_NAME, LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME };

const LOCAL_BACKUP_DIRECTORY_NAME = 'sqlite-local-backup';
const LOCAL_ROTATED_BACKUP_RETENTION_COUNT = 5;
const LOCAL_SHUTDOWN_BACKUP_RETENTION_COUNT = 3;
export const SHARED_SQLITE_BACKUP_RETENTION_COUNT = 3;
export const LOCAL_ROTATED_BACKUP_MIN_INTERVAL_MS = 15 * 60 * 1000;
export const DAILY_LOCAL_BACKUP_DIRECTORY_NAME = 'sqlite-daily-backup';

export function getLocalBackupDirectory(root = getPersistenceUserDataPath()): string {
  return path.join(root, LOCAL_BACKUP_DIRECTORY_NAME);
}

export function getLocalBackupDatabasePath(root?: string): string {
  return path.join(getLocalBackupDirectory(root), LOCAL_BACKUP_DATABASE_FILE_NAME);
}

export function getLocalBackupJsonPath(root?: string): string {
  return path.join(getLocalBackupDirectory(root), LOCAL_BACKUP_JSON_FILE_NAME);
}

export function getLocalShutdownBackupDirectory(root?: string): string {
  return path.join(getLocalBackupDirectory(root), LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME);
}

export function backupTimestampForFileName(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function getRotatedLocalBackupDatabasePath(timestamp: string, root?: string): string {
  return path.join(getLocalBackupDirectory(root), `traccion-local-backup-${timestamp}.sqlite`);
}

export function getRotatedLocalBackupJsonPath(timestamp: string, root?: string): string {
  return path.join(getLocalBackupDirectory(root), `traccion-local-backup-${timestamp}.json`);
}

export function getShutdownLocalBackupDatabasePath(timestamp: string, root?: string): string {
  return path.join(getLocalShutdownBackupDirectory(root), `traccion-shutdown-backup-${timestamp}.sqlite`);
}

export function getShutdownLocalBackupJsonPath(timestamp: string, root?: string): string {
  return path.join(getLocalShutdownBackupDirectory(root), `traccion-shutdown-backup-${timestamp}.json`);
}

export async function getDailyLocalBackupDirectory(preferences: DatabasePreferences): Promise<string> {
  return preferences.dailyLocalBackupDirectoryPath
    ? preferences.dailyLocalBackupDirectoryPath
    : path.join(getPersistenceUserDataPath(), DAILY_LOCAL_BACKUP_DIRECTORY_NAME);
}

export function getDailyLocalBackupDatabasePath(directory: string, weekdayName: string): string {
  return path.join(directory, `traccion-daily-${weekdayName}.sqlite`);
}

export function getSharedSqliteBackupPath(databasePath: string, timestamp: string): string {
  return path.join(path.dirname(databasePath), `traccion-backup-${timestamp}.sqlite`);
}

export function isSharedSqliteBackupFileName(fileName: string): boolean {
  return /^traccion-backup-.*\.sqlite$/.test(fileName);
}

async function pruneBackupsInDirectory(
  backupDirectory: string,
  prefix: string,
  extension: 'sqlite' | 'json',
  retentionCount: number,
): Promise<void> {
  const suffix = `.${extension}`;
  const entries = await readdir(backupDirectory).catch(() => []);
  const backups = entries
    .filter((entry) => entry.startsWith(prefix) && entry.endsWith(suffix))
    .sort()
    .reverse();

  await Promise.all(
    backups.slice(retentionCount).map((entry) =>
      unlink(path.join(backupDirectory, entry)).catch(() => undefined),
    ),
  );
}

export async function pruneRotatedLocalBackups(extension: 'sqlite' | 'json', root?: string): Promise<void> {
  await pruneBackupsInDirectory(
    getLocalBackupDirectory(root),
    'traccion-local-backup-',
    extension,
    LOCAL_ROTATED_BACKUP_RETENTION_COUNT,
  );
}

export async function pruneShutdownLocalBackups(extension: 'sqlite' | 'json', root?: string): Promise<void> {
  await pruneBackupsInDirectory(
    getLocalShutdownBackupDirectory(root),
    'traccion-shutdown-backup-',
    extension,
    LOCAL_SHUTDOWN_BACKUP_RETENTION_COUNT,
  );
}

/**
 * Crea una instantánea consistente de la base SQLite usando la Online Backup API
 * de SQLite. Si el backup nativo no está disponible o falla, conserva el
 * comportamiento histórico mediante una copia física del fichero origen.
 */
type DatabaseWithBackup = Database & {
  backup?: (destinationPath: string) => Promise<unknown>;
};

export async function backupSqliteDatabase(
  database: Database | null,
  databasePath: string,
  destinationPath: string,
): Promise<'native' | 'copy'> {
  const databaseWithBackup = database as DatabaseWithBackup | null;
  if (databaseWithBackup && typeof databaseWithBackup.backup === 'function') {
    try {
      await databaseWithBackup.backup(destinationPath);
      return 'native';
    } catch (error) {
      console.warn('El backup nativo SQLite ha fallado; se usará la copia física de respaldo.', error);
    }
  }

  await copyFile(databasePath, destinationPath);
  return 'copy';
}

/** La publicación conserva el archivo anterior si falla la escritura o rename.
 * El temporal es hermano del destino: no hay copyFile sobre la copia vigente.
 */
async function publishBackupFile(destination: string, produce: (temporary: string) => Promise<unknown>): Promise<void> {
  const temporary = destination + '.' + randomUUID() + '.pending';
  try {
    await produce(temporary);
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export async function copyBackupAtomically(source: string, destination: string): Promise<void> {
  await publishBackupFile(destination, temporary => copyFile(source, temporary));
}

export async function writeBackupJsonAtomically(destination: string, content: string): Promise<void> {
  await publishBackupFile(destination, temporary => writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' }));
}

/** Para una base viva no hay fallback a copiar el fichero físico. La única
 * fuente admitida es una instantánea nativa nueva e íntegra con su identidad.
 */
export async function publishVerifiedSqliteSnapshot(
  database: Database, destination: string, identity: ExpectedSqliteIdentity,
): Promise<void> {
  if (!identity.databaseUuid || !identity.applicationId || !identity.environment || !identity.schemaVersion) {
    throw new Error('No se ha confirmado la identidad SQLite para el respaldo.');
  }
  const backup = (database as DatabaseWithBackup).backup;
  if (typeof backup !== 'function') throw new Error('Backup nativo SQLite no disponible.');
  await publishBackupFile(destination, async temporary => {
    await backup.call(database, temporary);
    verifySqliteIntegrityReadOnly(temporary, identity);
  });
}

export async function pruneSharedSqliteBackups(databasePath: string): Promise<void> {
  const backupDirectory = path.dirname(databasePath);
  const entries = await readdir(backupDirectory).catch(() => []);
  const backups = entries.filter(isSharedSqliteBackupFileName).sort().reverse();

  await Promise.all(
    backups.slice(SHARED_SQLITE_BACKUP_RETENTION_COUNT).map((entry) =>
      unlink(path.join(backupDirectory, entry)).catch(() => undefined),
    ),
  );
}

export async function writeSharedSqliteBackup(
  databasePath: string,
  timestamp: string,
  sourceSnapshotPath: string = databasePath,
): Promise<void> {
  await copyBackupAtomically(sourceSnapshotPath, getSharedSqliteBackupPath(databasePath, timestamp));
  await pruneSharedSqliteBackups(databasePath);
}

/**
 * Elimina los archivos de días que ya no están dentro del rango de
 * retención configurado (p. ej. si el usuario reduce de 7 a 5 días).
 * El día de retención se cuenta hacia atrás desde hoy, por nombre de día
 * de la semana, no por fecha exacta del archivo.
 */
export async function pruneDailyLocalBackups(
  directory: string,
  retentionDays: number,
  today: Date,
  getDailyLocalBackupWeekdayName: (date: Date) => string,
): Promise<void> {
  const keptWeekdayNames = new Set<string>();
  for (let offset = 0; offset < retentionDays; offset += 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - offset);
    keptWeekdayNames.add(getDailyLocalBackupWeekdayName(date));
  }

  const entries = await readdir(directory).catch(() => []);
  const dailyBackupFiles = entries.filter((entry) => /^traccion-daily-[a-z]+\.sqlite$/.test(entry));

  await Promise.all(
    dailyBackupFiles
      .filter((entry) => {
        const weekdayMatch = /^traccion-daily-([a-z]+)\.sqlite$/.exec(entry);
        const weekdayName = weekdayMatch?.[1];
        return !weekdayName || !keptWeekdayNames.has(weekdayName);
      })
      .map((entry) => unlink(path.join(directory, entry)).catch(() => undefined)),
  );
}

/**
 * Copia local diaria, independiente de la carpeta compartida de red: un
 * archivo fijo por día de la semana (traccion-daily-lunes.sqlite, etc.) que
 * se sobrescribe en cada backup del mismo día. La retención configurada
 * limita cuántos de esos 7 archivos se mantienen.
 */
export async function writeDailyLocalBackup(
  databasePath: string,
  preferences: DatabasePreferences,
  getDailyLocalBackupWeekdayName: (date: Date) => string,
  sourceSnapshotPath: string = databasePath,
  strict = false,
): Promise<void> {
  if (!preferences.dailyLocalBackupEnabled) {
    return;
  }

  try {
    const directory = getTraccionEnvironment() === 'test'
      ? await resolveTestOutputDirectory({ ready: true, phase: 'active', isDefaultPath: false, environment: 'test', path: databasePath }, 'backups-pruebas', DAILY_LOCAL_BACKUP_DIRECTORY_NAME)
      : await getDailyLocalBackupDirectory(preferences);
    await mkdir(directory, { recursive: true });

    const today = new Date();
    const todayWeekdayName = getDailyLocalBackupWeekdayName(today);
    await copyBackupAtomically(sourceSnapshotPath, getDailyLocalBackupDatabasePath(directory, todayWeekdayName));

    await pruneDailyLocalBackups(directory, preferences.dailyLocalBackupRetentionDays, today, getDailyLocalBackupWeekdayName);
  } catch (error) {
    console.warn('No se ha podido crear la copia diaria local SQLite.', error);
    if (strict) throw error;
  }
}

export async function getLatestRotatedLocalBackupTime(root?: string): Promise<number | null> {
  const backupDirectory = getLocalBackupDirectory(root);
  const entries = await readdir(backupDirectory).catch(() => []);
  const rotatedSqliteBackups = entries.filter(
    (entry) => entry.startsWith('traccion-local-backup-') && entry.endsWith('.sqlite'),
  );

  const backupStats = await Promise.all(
    rotatedSqliteBackups.map(async (entry) => {
      const fileStat = await stat(path.join(backupDirectory, entry)).catch(() => null);
      return fileStat?.isFile() ? fileStat.mtime.getTime() : null;
    }),
  );

  const timestamps = backupStats.filter((value): value is number => typeof value === 'number');
  if (timestamps.length === 0) {
    return null;
  }

  return Math.max(...timestamps);
}

export async function shouldCreateRotatedLocalBackup(reason: string, root?: string): Promise<boolean> {
  const reasons = reason
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (reasons.length === 0 || reasons.some((item) => !item.startsWith('save:'))) {
    return true;
  }

  const latestBackupTime = await getLatestRotatedLocalBackupTime(root);
  return latestBackupTime === null || Date.now() - latestBackupTime >= LOCAL_ROTATED_BACKUP_MIN_INTERVAL_MS;
}

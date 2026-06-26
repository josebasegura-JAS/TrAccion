import { app } from 'electron';
import { copyFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  LOCAL_BACKUP_DATABASE_FILE_NAME,
  LOCAL_BACKUP_JSON_FILE_NAME,
  LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME,
} from './backupReference.js';
import type { DatabasePreferences } from './databasePreferences.js';

export { LOCAL_BACKUP_DATABASE_FILE_NAME, LOCAL_BACKUP_JSON_FILE_NAME, LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME };

const LOCAL_BACKUP_DIRECTORY_NAME = 'sqlite-local-backup';
const LOCAL_ROTATED_BACKUP_RETENTION_COUNT = 5;
const LOCAL_SHUTDOWN_BACKUP_RETENTION_COUNT = 3;
export const SHARED_SQLITE_BACKUP_RETENTION_COUNT = 3;
export const LOCAL_ROTATED_BACKUP_MIN_INTERVAL_MS = 15 * 60 * 1000;
export const DAILY_LOCAL_BACKUP_DIRECTORY_NAME = 'sqlite-daily-backup';

export function getLocalBackupDirectory(): string {
  return path.join(app.getPath('userData'), LOCAL_BACKUP_DIRECTORY_NAME);
}

export function getLocalBackupDatabasePath(): string {
  return path.join(getLocalBackupDirectory(), LOCAL_BACKUP_DATABASE_FILE_NAME);
}

export function getLocalBackupJsonPath(): string {
  return path.join(getLocalBackupDirectory(), LOCAL_BACKUP_JSON_FILE_NAME);
}

export function getLocalShutdownBackupDirectory(): string {
  return path.join(getLocalBackupDirectory(), LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME);
}

export function backupTimestampForFileName(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function getRotatedLocalBackupDatabasePath(timestamp: string): string {
  return path.join(getLocalBackupDirectory(), `traccion-local-backup-${timestamp}.sqlite`);
}

export function getRotatedLocalBackupJsonPath(timestamp: string): string {
  return path.join(getLocalBackupDirectory(), `traccion-local-backup-${timestamp}.json`);
}

export function getShutdownLocalBackupDatabasePath(timestamp: string): string {
  return path.join(getLocalShutdownBackupDirectory(), `traccion-shutdown-backup-${timestamp}.sqlite`);
}

export function getShutdownLocalBackupJsonPath(timestamp: string): string {
  return path.join(getLocalShutdownBackupDirectory(), `traccion-shutdown-backup-${timestamp}.json`);
}

export async function getDailyLocalBackupDirectory(preferences: DatabasePreferences): Promise<string> {
  return preferences.dailyLocalBackupDirectoryPath
    ? preferences.dailyLocalBackupDirectoryPath
    : path.join(app.getPath('userData'), DAILY_LOCAL_BACKUP_DIRECTORY_NAME);
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

export async function pruneRotatedLocalBackups(extension: 'sqlite' | 'json'): Promise<void> {
  await pruneBackupsInDirectory(
    getLocalBackupDirectory(),
    'traccion-local-backup-',
    extension,
    LOCAL_ROTATED_BACKUP_RETENTION_COUNT,
  );
}

export async function pruneShutdownLocalBackups(extension: 'sqlite' | 'json'): Promise<void> {
  await pruneBackupsInDirectory(
    getLocalShutdownBackupDirectory(),
    'traccion-shutdown-backup-',
    extension,
    LOCAL_SHUTDOWN_BACKUP_RETENTION_COUNT,
  );
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

export async function writeSharedSqliteBackup(databasePath: string, timestamp: string): Promise<void> {
  await copyFile(databasePath, getSharedSqliteBackupPath(databasePath, timestamp));
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
): Promise<void> {
  if (!preferences.dailyLocalBackupEnabled) {
    return;
  }

  const directory = await getDailyLocalBackupDirectory(preferences);

  try {
    await mkdir(directory, { recursive: true });

    const today = new Date();
    const todayWeekdayName = getDailyLocalBackupWeekdayName(today);
    await copyFile(databasePath, getDailyLocalBackupDatabasePath(directory, todayWeekdayName));

    await pruneDailyLocalBackups(directory, preferences.dailyLocalBackupRetentionDays, today, getDailyLocalBackupWeekdayName);
  } catch (error) {
    console.warn('No se ha podido crear la copia diaria local SQLite.', error);
  }
}

export async function getLatestRotatedLocalBackupTime(): Promise<number | null> {
  const backupDirectory = getLocalBackupDirectory();
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

export async function shouldCreateRotatedLocalBackup(reason: string): Promise<boolean> {
  const reasons = reason
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (reasons.length === 0 || reasons.some((item) => !item.startsWith('save:'))) {
    return true;
  }

  const latestBackupTime = await getLatestRotatedLocalBackupTime();
  return latestBackupTime === null || Date.now() - latestBackupTime >= LOCAL_ROTATED_BACKUP_MIN_INTERVAL_MS;
}

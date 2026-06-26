import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DATABASE_FILE_NAME = 'traccion.sqlite';
const DATABASE_PREFERENCES_FILE_NAME = 'sqlite-preferences.json';

const DAILY_LOCAL_BACKUP_DEFAULT_ENABLED = true;
const DAILY_LOCAL_BACKUP_DEFAULT_RETENTION_DAYS = 7;
export const DAILY_LOCAL_BACKUP_MIN_RETENTION_DAYS = 1;
export const DAILY_LOCAL_BACKUP_MAX_RETENTION_DAYS = 7;

export interface DatabasePreferences {
  customDirectoryPath: string | null;
  secondaryBackupDirectoryPath: string | null;
  dailyLocalBackupEnabled: boolean;
  dailyLocalBackupRetentionDays: number;
  dailyLocalBackupDirectoryPath: string | null;
  updatesDirectoryPath: string | null;
}

export function getDefaultDatabaseDirectory(): string {
  return path.join(app.getPath('userData'), 'data');
}

export function getPreferencesPath(): string {
  return path.join(app.getPath('userData'), DATABASE_PREFERENCES_FILE_NAME);
}

export function getDatabasePathForDirectory(directoryPath: string): string {
  return path.join(directoryPath, DATABASE_FILE_NAME);
}

export async function readDatabasePreferences(): Promise<DatabasePreferences> {
  const defaults: DatabasePreferences = {
    customDirectoryPath: null,
    secondaryBackupDirectoryPath: null,
    dailyLocalBackupEnabled: DAILY_LOCAL_BACKUP_DEFAULT_ENABLED,
    dailyLocalBackupRetentionDays: DAILY_LOCAL_BACKUP_DEFAULT_RETENTION_DAYS,
    dailyLocalBackupDirectoryPath: null,
    updatesDirectoryPath: null,
  };

  try {
    const raw = await readFile(getPreferencesPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return defaults;
    }

    const candidate = parsed as Partial<DatabasePreferences>;
    const retentionDaysCandidate = candidate.dailyLocalBackupRetentionDays;
    const retentionDays =
      typeof retentionDaysCandidate === 'number' && Number.isFinite(retentionDaysCandidate)
        ? Math.min(
            DAILY_LOCAL_BACKUP_MAX_RETENTION_DAYS,
            Math.max(DAILY_LOCAL_BACKUP_MIN_RETENTION_DAYS, Math.round(retentionDaysCandidate)),
          )
        : defaults.dailyLocalBackupRetentionDays;

    return {
      customDirectoryPath:
        typeof candidate.customDirectoryPath === 'string' && candidate.customDirectoryPath.trim()
          ? candidate.customDirectoryPath
          : null,
      secondaryBackupDirectoryPath:
        typeof candidate.secondaryBackupDirectoryPath === 'string' &&
        candidate.secondaryBackupDirectoryPath.trim()
          ? candidate.secondaryBackupDirectoryPath
          : null,
      dailyLocalBackupEnabled:
        typeof candidate.dailyLocalBackupEnabled === 'boolean'
          ? candidate.dailyLocalBackupEnabled
          : defaults.dailyLocalBackupEnabled,
      dailyLocalBackupRetentionDays: retentionDays,
      dailyLocalBackupDirectoryPath:
        typeof candidate.dailyLocalBackupDirectoryPath === 'string' &&
        candidate.dailyLocalBackupDirectoryPath.trim()
          ? candidate.dailyLocalBackupDirectoryPath
          : null,
      updatesDirectoryPath:
        typeof candidate.updatesDirectoryPath === 'string' && candidate.updatesDirectoryPath.trim()
          ? candidate.updatesDirectoryPath
          : null,
    };
  } catch {
    return defaults;
  }
}

export async function writeDatabasePreferences(preferences: DatabasePreferences): Promise<void> {
  await mkdir(path.dirname(getPreferencesPath()), { recursive: true });
  await writeFile(getPreferencesPath(), JSON.stringify(preferences, null, 2), 'utf8');
}

export async function getConfiguredDatabaseDirectory(): Promise<{
  directoryPath: string;
  isDefaultPath: boolean;
}> {
  const preferences = await readDatabasePreferences();
  if (preferences.customDirectoryPath) {
    return { directoryPath: preferences.customDirectoryPath, isDefaultPath: false };
  }

  return { directoryPath: getDefaultDatabaseDirectory(), isDefaultPath: true };
}

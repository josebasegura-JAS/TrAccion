import path from 'node:path';
import {
  DAILY_LOCAL_BACKUP_MAX_RETENTION_DAYS,
  DAILY_LOCAL_BACKUP_MIN_RETENTION_DAYS,
  readDatabasePreferences,
  writeDatabasePreferences,
} from './databasePreferences.js';

export async function getSecondaryBackupDirectory(): Promise<string | null> {
  const preferences = await readDatabasePreferences();
  return preferences.secondaryBackupDirectoryPath;
}

export async function setSecondaryBackupDirectory(directoryPath: string): Promise<void> {
  const preferences = await readDatabasePreferences();
  await writeDatabasePreferences({
    ...preferences,
    secondaryBackupDirectoryPath: path.resolve(directoryPath),
  });
}

export async function clearSecondaryBackupDirectory(): Promise<void> {
  const preferences = await readDatabasePreferences();
  await writeDatabasePreferences({
    ...preferences,
    secondaryBackupDirectoryPath: null,
  });
}

export async function getUpdatesDirectory(): Promise<string | null> {
  const preferences = await readDatabasePreferences();
  return preferences.updatesDirectoryPath;
}

export async function setUpdatesDirectory(directoryPath: string): Promise<void> {
  const preferences = await readDatabasePreferences();
  await writeDatabasePreferences({
    ...preferences,
    updatesDirectoryPath: path.resolve(directoryPath),
  });
}

export async function clearUpdatesDirectory(): Promise<void> {
  const preferences = await readDatabasePreferences();
  await writeDatabasePreferences({
    ...preferences,
    updatesDirectoryPath: null,
  });
}

export interface DailyLocalBackupSettings {
  enabled: boolean;
  retentionDays: number;
  directoryPath: string | null;
}

export async function getDailyLocalBackupSettings(): Promise<DailyLocalBackupSettings> {
  const preferences = await readDatabasePreferences();
  return {
    enabled: preferences.dailyLocalBackupEnabled,
    retentionDays: preferences.dailyLocalBackupRetentionDays,
    directoryPath: preferences.dailyLocalBackupDirectoryPath,
  };
}

export async function setDailyLocalBackupEnabled(enabled: boolean): Promise<void> {
  const preferences = await readDatabasePreferences();
  await writeDatabasePreferences({ ...preferences, dailyLocalBackupEnabled: enabled });
}

export async function setDailyLocalBackupRetentionDays(retentionDays: number): Promise<void> {
  const preferences = await readDatabasePreferences();
  const normalized = Math.min(
    DAILY_LOCAL_BACKUP_MAX_RETENTION_DAYS,
    Math.max(DAILY_LOCAL_BACKUP_MIN_RETENTION_DAYS, Math.round(retentionDays)),
  );
  await writeDatabasePreferences({ ...preferences, dailyLocalBackupRetentionDays: normalized });
}

export async function setDailyLocalBackupDirectory(directoryPath: string): Promise<void> {
  const preferences = await readDatabasePreferences();
  await writeDatabasePreferences({
    ...preferences,
    dailyLocalBackupDirectoryPath: path.resolve(directoryPath),
  });
}

export async function clearDailyLocalBackupDirectory(): Promise<void> {
  const preferences = await readDatabasePreferences();
  await writeDatabasePreferences({ ...preferences, dailyLocalBackupDirectoryPath: null });
}

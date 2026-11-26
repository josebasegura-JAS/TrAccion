import { getTraccionEnvironment } from './traccionEnvironment.js';
import path from 'node:path';
import {
  DAILY_LOCAL_BACKUP_MAX_RETENTION_DAYS,
  DAILY_LOCAL_BACKUP_MIN_RETENTION_DAYS,
  readDatabasePreferences,
  writeDatabasePreferences,
} from './databasePreferences.js';

export async function getSecondaryBackupDirectory(): Promise<string | null> {
  const preferences = await readDatabasePreferences();
  return getTraccionEnvironment() === 'test' ? null : preferences.secondaryBackupDirectoryPath;
}

export async function setSecondaryBackupDirectory(directoryPath: string): Promise<void> {
  if (getTraccionEnvironment() === 'test') throw new Error('Respaldo secundario externo desactivado en PRUEBAS.');
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
  if (getTraccionEnvironment() === 'test') throw new Error('Actualizaciones externas desactivadas en PRUEBAS.');
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
    directoryPath: getTraccionEnvironment() === 'test' ? (preferences.customDirectoryPath ? path.join(preferences.customDirectoryPath, 'backups-pruebas', 'sqlite-daily-backup') : null) : preferences.dailyLocalBackupDirectoryPath,
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
  if (getTraccionEnvironment() === 'test') throw new Error('La copia diaria de PRUEBAS se guarda junto a su SQLite.');
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

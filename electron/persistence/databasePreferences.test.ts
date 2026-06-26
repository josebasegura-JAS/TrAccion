import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A diferencia de schemaMigrations.ts/recordLocks.ts (sin ningún import de
 * 'electron' a propósito), este módulo sí necesita app.getPath('userData')
 * para resolver dónde viven las preferencias — es justo lo que se está
 * probando. Se mockea de forma mínima apuntando a un directorio temporal
 * real, en vez de evitar la dependencia. El mock lee `userDataDir` en el
 * momento de cada llamada (no al importar el módulo), así que no hace
 * falta vi.resetModules entre tests.
 */
let userDataDir: string;

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') {
        return userDataDir;
      }
      throw new Error(`Ruta de Electron no mockeada en este test: ${name}`);
    },
  },
}));

const {
  DATABASE_FILE_NAME,
  getConfiguredDatabaseDirectory,
  getDatabasePathForDirectory,
  getDefaultDatabaseDirectory,
  getPreferencesPath,
  readDatabasePreferences,
  writeDatabasePreferences,
} = await import('./databasePreferences');

describe('databasePreferences', () => {
  beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), 'traccion-prefs-test-'));
  });

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it('getDefaultDatabaseDirectory devuelve una subcarpeta "data" de userData', () => {
    expect(getDefaultDatabaseDirectory()).toBe(path.join(userDataDir, 'data'));
  });

  it('getDatabasePathForDirectory añade el nombre fijo del fichero .sqlite a la carpeta dada', () => {
    expect(getDatabasePathForDirectory('/cualquier/carpeta')).toBe(
      path.join('/cualquier/carpeta', DATABASE_FILE_NAME),
    );
  });

  it('readDatabasePreferences devuelve los valores por defecto si no hay fichero de preferencias', async () => {
    const preferences = await readDatabasePreferences();

    expect(preferences).toEqual({
      customDirectoryPath: null,
      secondaryBackupDirectoryPath: null,
      dailyLocalBackupEnabled: true,
      dailyLocalBackupRetentionDays: 7,
      dailyLocalBackupDirectoryPath: null,
      updatesDirectoryPath: null,
    });
  });

  it('writeDatabasePreferences seguido de readDatabasePreferences devuelve exactamente lo escrito', async () => {
    await writeDatabasePreferences({
      customDirectoryPath: '/red/carpeta',
      secondaryBackupDirectoryPath: '/red/backup',
      dailyLocalBackupEnabled: false,
      dailyLocalBackupRetentionDays: 3,
      dailyLocalBackupDirectoryPath: '/red/diario',
      updatesDirectoryPath: '/red/updates',
    });

    const preferences = await readDatabasePreferences();

    expect(preferences).toEqual({
      customDirectoryPath: '/red/carpeta',
      secondaryBackupDirectoryPath: '/red/backup',
      dailyLocalBackupEnabled: false,
      dailyLocalBackupRetentionDays: 3,
      dailyLocalBackupDirectoryPath: '/red/diario',
      updatesDirectoryPath: '/red/updates',
    });
  });

  it('readDatabasePreferences recorta dailyLocalBackupRetentionDays al rango válido (1-7)', async () => {
    await writeDatabasePreferences({
      customDirectoryPath: null,
      secondaryBackupDirectoryPath: null,
      dailyLocalBackupEnabled: true,
      dailyLocalBackupRetentionDays: 99,
      dailyLocalBackupDirectoryPath: null,
      updatesDirectoryPath: null,
    });

    const preferences = await readDatabasePreferences();
    expect(preferences.dailyLocalBackupRetentionDays).toBe(7);
  });

  it('readDatabasePreferences ignora un fichero corrupto y devuelve los valores por defecto', async () => {
    writeFileSync(getPreferencesPath(), '{ esto no es json válido', 'utf8');

    const preferences = await readDatabasePreferences();
    expect(preferences.customDirectoryPath).toBeNull();
  });

  it('getConfiguredDatabaseDirectory usa customDirectoryPath si está configurado', async () => {
    await writeDatabasePreferences({
      customDirectoryPath: '/ruta/personalizada',
      secondaryBackupDirectoryPath: null,
      dailyLocalBackupEnabled: true,
      dailyLocalBackupRetentionDays: 7,
      dailyLocalBackupDirectoryPath: null,
      updatesDirectoryPath: null,
    });

    const result = await getConfiguredDatabaseDirectory();
    expect(result).toEqual({ directoryPath: '/ruta/personalizada', isDefaultPath: false });
  });

  it('getConfiguredDatabaseDirectory usa la carpeta por defecto si no hay customDirectoryPath', async () => {
    const result = await getConfiguredDatabaseDirectory();
    expect(result).toEqual({ directoryPath: path.join(userDataDir, 'data'), isDefaultPath: true });
  });
});

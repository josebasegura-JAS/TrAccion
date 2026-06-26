import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Mismo motivo y patrón que databasePreferences.test.ts: este módulo
 * necesita app.getPath('userData') de verdad, así que se mockea de forma
 * mínima apuntando a un directorio temporal real.
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
  backupTimestampForFileName,
  getDailyLocalBackupDatabasePath,
  getDailyLocalBackupDirectory,
  getLatestRotatedLocalBackupTime,
  getLocalBackupDatabasePath,
  getLocalBackupDirectory,
  getLocalBackupJsonPath,
  getLocalShutdownBackupDirectory,
  getRotatedLocalBackupDatabasePath,
  getRotatedLocalBackupJsonPath,
  getSharedSqliteBackupPath,
  getShutdownLocalBackupDatabasePath,
  getShutdownLocalBackupJsonPath,
  isSharedSqliteBackupFileName,
  LOCAL_BACKUP_DATABASE_FILE_NAME,
  LOCAL_BACKUP_JSON_FILE_NAME,
  pruneDailyLocalBackups,
  pruneRotatedLocalBackups,
  pruneShutdownLocalBackups,
  shouldCreateRotatedLocalBackup,
  writeDailyLocalBackup,
} = await import('./localBackups');

const DEFAULT_PREFERENCES = {
  customDirectoryPath: null,
  secondaryBackupDirectoryPath: null,
  dailyLocalBackupEnabled: true,
  dailyLocalBackupRetentionDays: 7,
  dailyLocalBackupDirectoryPath: null,
  updatesDirectoryPath: null,
};

// Igual que TELETRABAJO_DIAS/los días de semana en otros módulos, los
// nombres deben ser estables y reconocibles por la prueba (no importa que
// no coincidan exactamente con los reales de maintenanceQueries.ts, ya que
// pruneDailyLocalBackups/writeDailyLocalBackup reciben ese cálculo
// inyectado por parámetro precisamente para no acoplarse a esa función).
function weekdayNameForTest(date: Date): string {
  return ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'][date.getDay()];
}

describe('localBackups', () => {
  beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), 'traccion-backups-test-'));
  });

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it('las rutas de backup local cuelgan de la carpeta sqlite-local-backup dentro de userData', () => {
    expect(getLocalBackupDirectory()).toBe(path.join(userDataDir, 'sqlite-local-backup'));
    expect(getLocalBackupDatabasePath()).toBe(
      path.join(userDataDir, 'sqlite-local-backup', LOCAL_BACKUP_DATABASE_FILE_NAME),
    );
    expect(getLocalBackupJsonPath()).toBe(
      path.join(userDataDir, 'sqlite-local-backup', LOCAL_BACKUP_JSON_FILE_NAME),
    );
  });

  it('las rutas de backup rotado y de cierre incluyen el timestamp dado', () => {
    expect(getRotatedLocalBackupDatabasePath('2026-06-01')).toContain('2026-06-01');
    expect(getRotatedLocalBackupJsonPath('2026-06-01')).toContain('2026-06-01');
    expect(getShutdownLocalBackupDatabasePath('2026-06-01')).toContain('2026-06-01');
    expect(getShutdownLocalBackupJsonPath('2026-06-01')).toContain('2026-06-01');
    expect(getShutdownLocalBackupDatabasePath('2026-06-01')).toContain(getLocalShutdownBackupDirectory());
  });

  it('backupTimestampForFileName produce un timestamp seguro para nombre de fichero (sin : ni .)', () => {
    const timestamp = backupTimestampForFileName();
    expect(timestamp).not.toMatch(/[:.]/);
  });

  it('isSharedSqliteBackupFileName reconoce solo el patrón traccion-backup-*.sqlite', () => {
    expect(isSharedSqliteBackupFileName('traccion-backup-2026-06-01.sqlite')).toBe(true);
    expect(isSharedSqliteBackupFileName('traccion-local-backup-2026-06-01.sqlite')).toBe(false);
    expect(isSharedSqliteBackupFileName('otra-cosa.sqlite')).toBe(false);
  });

  it('getSharedSqliteBackupPath construye la ruta en el mismo directorio que la base original', () => {
    const result = getSharedSqliteBackupPath('/red/carpeta/traccion.sqlite', '2026-06-01');
    expect(result).toBe(path.join('/red/carpeta', 'traccion-backup-2026-06-01.sqlite'));
  });

  it('pruneRotatedLocalBackups conserva solo los 5 más recientes por orden de nombre', async () => {
    const backupDir = getLocalBackupDirectory();
    mkdirSync(backupDir, { recursive: true });
    const names = Array.from({ length: 8 }, (_, index) => `traccion-local-backup-2026-06-0${index}.sqlite`);
    names.forEach((name) => writeFileSync(path.join(backupDir, name), 'x'));

    await pruneRotatedLocalBackups('sqlite');

    const { readdirSync } = await import('node:fs');
    const remaining = readdirSync(backupDir);
    expect(remaining).toHaveLength(5);
    // Se conservan los de nombre más alto (más recientes, por orden alfabético/fecha).
    expect(remaining.sort()).toEqual(names.slice(3).sort());
  });

  it('pruneShutdownLocalBackups conserva solo los 3 más recientes', async () => {
    const shutdownDir = getLocalShutdownBackupDirectory();
    mkdirSync(shutdownDir, { recursive: true });
    const names = Array.from({ length: 5 }, (_, index) => `traccion-shutdown-backup-2026-06-0${index}.json`);
    names.forEach((name) => writeFileSync(path.join(shutdownDir, name), '{}'));

    await pruneShutdownLocalBackups('json');

    const { readdirSync } = await import('node:fs');
    expect(readdirSync(shutdownDir)).toHaveLength(3);
  });

  it('pruneDailyLocalBackups conserva solo los días dentro del rango de retención', async () => {
    const directory = path.join(userDataDir, 'daily');
    mkdirSync(directory, { recursive: true });
    ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].forEach((day) => {
      writeFileSync(path.join(directory, `traccion-daily-${day}.sqlite`), 'x');
    });

    // Hoy es lunes (2026-06-01 es lunes); retención de 3 días debe
    // conservar lunes, domingo y sábado (los 3 días hacia atrás desde hoy).
    const today = new Date('2026-06-01T12:00:00.000Z');
    await pruneDailyLocalBackups(directory, 3, today, weekdayNameForTest);

    const { readdirSync } = await import('node:fs');
    const remaining = readdirSync(directory).sort();
    expect(remaining).toEqual(['traccion-daily-domingo.sqlite', 'traccion-daily-lunes.sqlite', 'traccion-daily-sabado.sqlite']);
  });

  it('writeDailyLocalBackup no hace nada si dailyLocalBackupEnabled es false', async () => {
    const sourcePath = path.join(userDataDir, 'origen.sqlite');
    writeFileSync(sourcePath, 'contenido');

    await writeDailyLocalBackup(sourcePath, { ...DEFAULT_PREFERENCES, dailyLocalBackupEnabled: false }, weekdayNameForTest);

    const directory = await getDailyLocalBackupDirectory(DEFAULT_PREFERENCES);
    const { existsSync } = await import('node:fs');
    expect(existsSync(directory)).toBe(false);
  });

  it('writeDailyLocalBackup copia la base al fichero del día de la semana correspondiente', async () => {
    const sourcePath = path.join(userDataDir, 'origen.sqlite');
    writeFileSync(sourcePath, 'contenido-de-prueba');

    await writeDailyLocalBackup(sourcePath, DEFAULT_PREFERENCES, weekdayNameForTest);

    const directory = await getDailyLocalBackupDirectory(DEFAULT_PREFERENCES);
    const expectedFile = getDailyLocalBackupDatabasePath(directory, weekdayNameForTest(new Date()));
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(expectedFile, 'utf8')).toBe('contenido-de-prueba');
  });

  it('getDailyLocalBackupDirectory usa dailyLocalBackupDirectoryPath si está configurado', async () => {
    const result = await getDailyLocalBackupDirectory({
      ...DEFAULT_PREFERENCES,
      dailyLocalBackupDirectoryPath: '/red/diario-personalizado',
    });

    expect(result).toBe('/red/diario-personalizado');
  });

  it('getLatestRotatedLocalBackupTime devuelve null si no hay ningún backup rotado', async () => {
    expect(await getLatestRotatedLocalBackupTime()).toBeNull();
  });

  it('shouldCreateRotatedLocalBackup siempre crea backup si el motivo no es solo "save:..."', async () => {
    expect(await shouldCreateRotatedLocalBackup('manual')).toBe(true);
    expect(await shouldCreateRotatedLocalBackup('')).toBe(true);
  });

  it('shouldCreateRotatedLocalBackup evita crear backup de guardado si no ha pasado el intervalo mínimo', async () => {
    const backupDir = getLocalBackupDirectory();
    mkdirSync(backupDir, { recursive: true });
    writeFileSync(path.join(backupDir, 'traccion-local-backup-recien-creado.sqlite'), 'x');

    expect(await shouldCreateRotatedLocalBackup('save:teletrabajo')).toBe(false);
  });
});

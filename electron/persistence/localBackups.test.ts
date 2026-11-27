import { applyMigrations, CURRENT_SCHEMA_VERSION } from './schemaMigrations.js';
import { inspectAndEnsureDatabaseIdentity } from './databaseIdentity.js';
import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
  backupSqliteDatabase,
  copyBackupAtomically,
  publishVerifiedSqliteSnapshot,
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
  writeSharedSqliteBackup,
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

  it('backupSqliteDatabase usa la Online Backup API cuando está disponible', async () => {
    const sourcePath = path.join(userDataDir, 'origen.sqlite');
    const destinationPath = path.join(userDataDir, 'destino.sqlite');
    writeFileSync(sourcePath, 'origen');
    const backup = vi.fn(async (destination: string) => {
      const { copyFile } = await import('node:fs/promises');
      await copyFile(sourcePath, destination);
    });

    const mode = await backupSqliteDatabase({ backup } as never, sourcePath, destinationPath);

    const { readFileSync } = await import('node:fs');
    expect(mode).toBe('native');
    expect(backup).toHaveBeenCalledWith(destinationPath);
    expect(readFileSync(destinationPath, 'utf8')).toBe('origen');
  });

  it('backupSqliteDatabase vuelve a copyFile si el backup nativo falla', async () => {
    const sourcePath = path.join(userDataDir, 'origen-fallback.sqlite');
    const destinationPath = path.join(userDataDir, 'destino-fallback.sqlite');
    writeFileSync(sourcePath, 'contenido-fallback');
    const backup = vi.fn(async () => {
      throw new Error('fallo intencionado');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const mode = await backupSqliteDatabase({ backup } as never, sourcePath, destinationPath);

    const { readFileSync } = await import('node:fs');
    expect(mode).toBe('copy');
    expect(backup).toHaveBeenCalledTimes(1);
    expect(readFileSync(destinationPath, 'utf8')).toBe('contenido-fallback');
    warn.mockRestore();
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

  it('isSharedSqliteBackupFileName reconoce solo timestamps generados y válidos', () => {
    expect(isSharedSqliteBackupFileName('traccion-backup-2026-06-01T12-00-00-000Z.sqlite')).toBe(true);
    expect(isSharedSqliteBackupFileName('traccion-backup-2026-06-01.sqlite')).toBe(false);
    expect(isSharedSqliteBackupFileName('traccion-backup-2026-02-30T12-00-00-000Z.sqlite')).toBe(false);
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
    const names = Array.from({ length: 8 }, (_, index) => `traccion-local-backup-2026-06-0${index + 1}T12-00-00-000Z.sqlite`);
    names.forEach((name) => writeFileSync(path.join(backupDir, name), 'x'));

    const unrelated = 'traccion-local-backup-manual.sqlite';
    writeFileSync(path.join(backupDir, unrelated), 'keep');
    await pruneRotatedLocalBackups('sqlite');

    const { readdirSync } = await import('node:fs');
    const remaining = readdirSync(backupDir);
    expect(remaining).toHaveLength(6);
    // Se conservan los de nombre más alto (más recientes, por orden alfabético/fecha).
    expect(remaining.sort()).toEqual([...names.slice(3), unrelated].sort());
  });

  it('pruneShutdownLocalBackups conserva solo los 3 más recientes', async () => {
    const shutdownDir = getLocalShutdownBackupDirectory();
    mkdirSync(shutdownDir, { recursive: true });
    const names = Array.from({ length: 5 }, (_, index) => `traccion-shutdown-backup-2026-06-0${index + 1}T12-00-00-000Z.json`);
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
    writeFileSync(path.join(directory, 'traccion-daily-manual.sqlite'), 'keep');
    await pruneDailyLocalBackups(directory, 3, today, weekdayNameForTest);

    const { readdirSync } = await import('node:fs');
    const remaining = readdirSync(directory).sort();
    expect(remaining).toEqual(['traccion-daily-domingo.sqlite', 'traccion-daily-lunes.sqlite', 'traccion-daily-manual.sqlite', 'traccion-daily-sabado.sqlite']);
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
    writeFileSync(path.join(backupDir, 'traccion-local-backup-2026-06-01T12-00-00-000Z.sqlite'), 'x');

    expect(await shouldCreateRotatedLocalBackup('save:teletrabajo')).toBe(false);
  });
  it('genera una copia SQLite nativa íntegra e independiente de escrituras posteriores', async () => {
    const source = path.join(userDataDir, 'real.sqlite');
    const destination = path.join(userDataDir, 'backup.sqlite');
    const db = new Database(source);
    try {
      db.exec('CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO records VALUES (1, \'original\')');
      expect(await backupSqliteDatabase(db, source, destination)).toBe('native');
      db.prepare('UPDATE records SET value = ? WHERE id = 1').run('changed');
      const copy = new Database(destination, { readonly: true, fileMustExist: true });
      try {
        expect(copy.pragma('quick_check')).toEqual([{ quick_check: 'ok' }]);
        expect(copy.prepare('SELECT * FROM records').all()).toEqual([{ id: 1, value: 'original' }]);
      } finally {
        copy.close();
      }
    } finally {
      db.close();
    }
  }, 20000);

  it('publica desde la instantánea y conserva solo tres respaldos compartidos sin tocar la base', async () => {
    const source = path.join(userDataDir, 'traccion.sqlite');
    const snapshot = path.join(userDataDir, 'snapshot.sqlite');
    writeFileSync(source, 'live');
    writeFileSync(snapshot, 'snapshot');
    for (let day = 1; day <= 5; day++) {
      await writeSharedSqliteBackup(source, '2026-11-0' + day + 'T12-00-00-000Z', snapshot);
    }
    expect(readdirSync(userDataDir).filter(isSharedSqliteBackupFileName).sort()).toEqual([
      'traccion-backup-2026-11-03T12-00-00-000Z.sqlite',
      'traccion-backup-2026-11-04T12-00-00-000Z.sqlite',
      'traccion-backup-2026-11-05T12-00-00-000Z.sqlite',
    ]);
    expect(readFileSync(source, 'utf8')).toBe('live');
    expect(readFileSync(snapshot, 'utf8')).toBe('snapshot');
    expect(readFileSync(getSharedSqliteBackupPath(source, '2026-11-05T12-00-00-000Z'), 'utf8')).toBe('snapshot');
  });

  it('no elimina respaldos anteriores cuando falla la publicación de la nueva copia', async () => {
    const source = path.join(userDataDir, 'traccion.sqlite');
    const previous = ['01', '02', '03'].map(day => 'traccion-backup-2026-11-' + day + 'T12-00-00-000Z.sqlite');
    previous.forEach(name => writeFileSync(path.join(userDataDir, name), 'previous'));
    await expect(writeSharedSqliteBackup(source, '2026-11-04T12-00-00-000Z', path.join(userDataDir, 'missing.sqlite'))).rejects.toThrow();
    expect(readdirSync(userDataDir).sort()).toEqual(previous);
    previous.forEach(name => expect(readFileSync(path.join(userDataDir, name), 'utf8')).toBe('previous'));
  });

  it('no trunca la copia vigente si falla el origen de una publicación', async () => {
    const destination = path.join(userDataDir, 'vigente.sqlite');
    writeFileSync(destination, 'previous');
    await expect(copyBackupAtomically(path.join(userDataDir, 'missing.sqlite'), destination)).rejects.toThrow();
    expect(readFileSync(destination, 'utf8')).toBe('previous');
    expect(readdirSync(userDataDir)).toEqual(['vigente.sqlite']);
  });

  it('rechaza cada campo de identidad ausente y la falta de API nativa antes de publicar', async () => {
    const destination = path.join(userDataDir, 'vigente.sqlite');
    writeFileSync(destination, 'previous');
    const identity = { databaseUuid: 'uuid', applicationId: 'traccion', environment: 'production', schemaVersion: 1 };
    const backup = vi.fn();
    for (const missing of [
      { databaseUuid: '' }, { applicationId: '' }, { environment: '' }, { schemaVersion: 0 },
    ]) {
      await expect(publishVerifiedSqliteSnapshot({ backup } as never, destination, { ...identity, ...missing })).rejects.toThrow(/identidad SQLite/);
    }
    await expect(publishVerifiedSqliteSnapshot({} as never, destination, identity)).rejects.toThrow(/Backup nativo/);
    expect(backup).not.toHaveBeenCalled();
    expect(readFileSync(destination, 'utf8')).toBe('previous');
  });

  it('publica una instantánea nativa verificada y conserva la anterior si falla la identidad o la API', async () => {
    const source = path.join(userDataDir, 'real.sqlite');
    const destination = path.join(userDataDir, 'verified.sqlite');
    const setup = new Database(source);
    try { applyMigrations(setup); } finally { setup.close(); }
    const identity = { ...inspectAndEnsureDatabaseIdentity(source, { allowLegacyBootstrap: true }).identity, schemaVersion: CURRENT_SCHEMA_VERSION };
    const db = new Database(source);
    try {
      await publishVerifiedSqliteSnapshot(db, destination, identity);
      const previous = readFileSync(destination);
      await expect(publishVerifiedSqliteSnapshot(db, destination, { ...identity, databaseUuid: 'other' })).rejects.toThrow();
      const backup = vi.fn(async (temporary: string) => {
        writeFileSync(temporary, 'partial');
        throw new Error('native failure');
      });
      await expect(publishVerifiedSqliteSnapshot({ backup } as never, destination, identity)).rejects.toThrow('native failure');
      expect(readFileSync(destination)).toEqual(previous);
      expect(readdirSync(userDataDir).some(name => name.endsWith('.pending'))).toBe(false);
    } finally { db.close(); }
  }, 20000);

  it('la copia diaria estricta propaga el fallo y el modo histórico no lo hace', async () => {
    const source = path.join(userDataDir, 'missing.sqlite');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await expect(writeDailyLocalBackup(source, DEFAULT_PREFERENCES, weekdayNameForTest, source, true)).rejects.toThrow();
      await expect(writeDailyLocalBackup(source, DEFAULT_PREFERENCES, weekdayNameForTest)).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(2);
    } finally { warn.mockRestore(); }
  });

  it('la copia diaria en PRUEBAS utiliza la carpeta de la base y no userData', async () => {
    const original = process.argv;
    const shared = path.join(userDataDir, 'shared');
    mkdirSync(shared);
    const source = path.join(shared, 'traccion.sqlite');
    writeFileSync(source, 'snapshot');
    process.argv = [...original.filter(arg => !arg.startsWith('--traccion-env')), '--traccion-env=test'];
    try {
      await writeDailyLocalBackup(source, DEFAULT_PREFERENCES, weekdayNameForTest, source, true);
      const destination = path.join(shared, 'backups-pruebas', 'sqlite-daily-backup', 'traccion-daily-' + weekdayNameForTest(new Date()) + '.sqlite');
      expect(readFileSync(destination, 'utf8')).toBe('snapshot');
    } finally { process.argv = original; }
  });

});

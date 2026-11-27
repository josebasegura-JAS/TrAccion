import { copyFileSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { inspectAndEnsureDatabaseIdentity } from './databaseIdentity.js';
import { applyMigrations, CURRENT_SCHEMA_VERSION } from './schemaMigrations.js';
import { validateSqliteBackupForRestore } from './sqliteBackupValidation.js';

const tempDirectories: string[] = [];

let templateDirectory: string;
let templateDatabasePath: string;

beforeAll(() => {
  templateDirectory = mkdtempSync(path.join(tmpdir(), 'traccion-backup-template-'));
  templateDatabasePath = path.join(templateDirectory, 'schema.sqlite');
  const db = new Database(templateDatabasePath);
  try {
    applyMigrations(db);
  } finally {
    db.close();
  }
});

afterAll(() => {
  if (templateDirectory) rmSync(templateDirectory, { recursive: true, force: true });
});

function createLegacyDatabase(): string {
  const databasePath = tempDatabasePath();
  copyFileSync(templateDatabasePath, databasePath);
  return databasePath;
}


function tempDatabasePath(fileName = 'backup.sqlite'): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'traccion-backup-validation-'));
  tempDirectories.push(directory);
  return path.join(directory, fileName);
}

function createValidTraccionDatabase(): { databasePath: string; databaseUuid: string } {
  const databasePath = createLegacyDatabase();
  const identity = inspectAndEnsureDatabaseIdentity(databasePath, { allowLegacyBootstrap: true }).identity;
  return { databasePath, databaseUuid: identity.databaseUuid };
}

afterEach(() => {
  while (tempDirectories.length) {
    rmSync(tempDirectories.pop()!, { recursive: true, force: true });
  }
});

describe('validateSqliteBackupForRestore', () => {
  it('acepta una copia íntegra de TrAcción con el UUID esperado', () => {
    const { databasePath, databaseUuid } = createValidTraccionDatabase();

    const result = validateSqliteBackupForRestore(databasePath, {
      expectedDatabaseUuid: databaseUuid,
    });

    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.databaseUuid).toBe(databaseUuid);
    expect(result.legacyIdentity).toBe(false);
  });

  it('rechaza un fichero que no es SQLite', () => {
    const databasePath = tempDatabasePath();
    writeFileSync(databasePath, 'esto no es sqlite', 'utf8');

    expect(() => validateSqliteBackupForRestore(databasePath)).toThrow(
      /no es válido, está dañado o no puede leerse/i,
    );
  });

  it('rechaza una SQLite ajena aunque sea íntegra', () => {
    const databasePath = tempDatabasePath();
    const db = new Database(databasePath);
    db.exec('CREATE TABLE foreign_table (id INTEGER PRIMARY KEY)');
    db.close();

    expect(() => validateSqliteBackupForRestore(databasePath)).toThrow(
      /no se reconoce como una base de datos de TrAcción/i,
    );
  });

  it('rechaza un schema más reciente que el soportado', () => {
    const { databasePath } = createValidTraccionDatabase();
    const db = new Database(databasePath);
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      CURRENT_SCHEMA_VERSION + 1,
      new Date().toISOString(),
    );
    db.close();

    expect(() => validateSqliteBackupForRestore(databasePath)).toThrow(/schema más reciente/i);
  });

  it('rechaza una copia con UUID distinto al vinculado al equipo', () => {
    const { databasePath } = createValidTraccionDatabase();

    expect(() =>
      validateSqliteBackupForRestore(databasePath, { expectedDatabaseUuid: 'uuid-distinto' }),
    ).toThrow(/no coincide con la base compartida vinculada/i);
  });

  it('admite una base legacy reconocible sin modificarla', () => {
    const databasePath = createLegacyDatabase();

    const result = validateSqliteBackupForRestore(databasePath);

    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.databaseUuid).toBeNull();
    expect(result.legacyIdentity).toBe(true);
  });
  it('rechaza una copia SQLite real truncada sin modificarla durante la comprobación', () => {
    const { databasePath } = createValidTraccionDatabase();
    truncateSync(databasePath, 512);
    const before = readFileSync(databasePath);
    expect(() => validateSqliteBackupForRestore(databasePath)).toThrow(/respaldo SQLite/i);
    expect(readFileSync(databasePath)).toEqual(before);
  });

  it.each(['application_id', 'database_uuid', 'database_created_at', 'environment'])(
    'rechaza identidad incompleta por ausencia de %s sin reparar automáticamente el respaldo', key => {
      const { databasePath } = createValidTraccionDatabase();
      const db = new Database(databasePath);
      try { db.prepare('DELETE FROM app_metadata WHERE key = ?').run(key); }
      finally { db.close(); }
      const before = readFileSync(databasePath);
      expect(() => validateSqliteBackupForRestore(databasePath)).toThrow(/identidad incompletos/i);
      expect(readFileSync(databasePath)).toEqual(before);
    },
  );

  it('rechaza una identidad de otra aplicación aunque SQLite sea íntegra', () => {
    const { databasePath } = createValidTraccionDatabase();
    const db = new Database(databasePath);
    try {
      db.prepare("UPDATE app_metadata SET value = 'foreign' WHERE key = 'application_id'").run();
      expect(db.pragma('quick_check')).toEqual([{ quick_check: 'ok' }]);
    } finally { db.close(); }
    expect(() => validateSqliteBackupForRestore(databasePath)).toThrow(/otra aplicación/i);
  });

  it('rechaza una copia de otro entorno sin modificar el archivo', () => {
    const { databasePath } = createValidTraccionDatabase();
    const db = new Database(databasePath);
    try { db.prepare("UPDATE app_metadata SET value = 'test' WHERE key = 'environment'").run(); }
    finally { db.close(); }
    const before = readFileSync(databasePath);
    expect(() => validateSqliteBackupForRestore(databasePath)).toThrow(/pertenece al entorno/i);
    expect(readFileSync(databasePath)).toEqual(before);
  });

});

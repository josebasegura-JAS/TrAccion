import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectAndEnsureDatabaseIdentity } from './databaseIdentity.js';
import { applyMigrations, CURRENT_SCHEMA_VERSION } from './schemaMigrations.js';
import { validateSqliteBackupForRestore } from './sqliteBackupValidation.js';

const tempDirectories: string[] = [];

function tempDatabasePath(fileName = 'backup.sqlite'): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'traccion-backup-validation-'));
  tempDirectories.push(directory);
  return path.join(directory, fileName);
}

function createValidTraccionDatabase(): { databasePath: string; databaseUuid: string } {
  const databasePath = tempDatabasePath();
  const db = new Database(databasePath);
  applyMigrations(db);
  db.close();
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
    const databasePath = tempDatabasePath();
    const db = new Database(databasePath);
    applyMigrations(db);
    db.close();

    const result = validateSqliteBackupForRestore(databasePath);

    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.databaseUuid).toBeNull();
    expect(result.legacyIdentity).toBe(true);
  });
});

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectAndEnsureDatabaseIdentity } from './databaseIdentity.js';
import { CURRENT_SCHEMA_VERSION, applyMigrations } from './schemaMigrations.js';
import { verifySqliteIntegrityReadOnly } from './sqliteIntegrityVerification.js';

const directories: string[] = [];

function createVerifiedDatabase() {
  const directory = mkdtempSync(path.join(tmpdir(), 'traccion-readonly-integrity-'));
  directories.push(directory);
  const file = path.join(directory, 'traccion.sqlite');
  const db = new Database(file);
  applyMigrations(db);
  db.close();
  const { identity } = inspectAndEnsureDatabaseIdentity(file, { allowLegacyBootstrap: true });
  return {
    file,
    expected: {
      databaseUuid: identity.databaseUuid,
      applicationId: identity.applicationId,
      environment: identity.environment,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
  };
}

afterEach(() => {
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true });
});

describe('preflight de integridad SQLite en modo lectura', () => {
  it('acepta la misma base íntegra, identidad y esquema', () => {
    const { file, expected } = createVerifiedDatabase();
    expect(() => verifySqliteIntegrityReadOnly(file, expected)).not.toThrow();
  });

  it('no crea un fichero inexistente ni recupera automáticamente la base', () => {
    const { file, expected } = createVerifiedDatabase();
    expect(() => verifySqliteIntegrityReadOnly(file + '.missing', expected)).toThrow();
  });

  it('rechaza una base distinta aunque sea íntegra', () => {
    const original = createVerifiedDatabase();
    const other = createVerifiedDatabase();
    expect(() => verifySqliteIntegrityReadOnly(other.file, original.expected)).toThrow(/identidad/i);
  });

  it('rechaza una discrepancia de esquema sin mutar la base', () => {
    const { file, expected } = createVerifiedDatabase();
    expect(() => verifySqliteIntegrityReadOnly(file, { ...expected, schemaVersion: expected.schemaVersion + 1 })).toThrow(/esquema/i);
    expect(() => verifySqliteIntegrityReadOnly(file, expected)).not.toThrow();
  });

  it('no autoriza una base con contenido manifiestamente inválido', () => {
    const { file, expected } = createVerifiedDatabase();
    writeFileSync(file, 'no es un fichero SQLite');
    expect(() => verifySqliteIntegrityReadOnly(file, expected)).toThrow();
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyMigrations } from './schemaMigrations.js';
import {
  inspectAndEnsureDatabaseIdentity,
  TRACCION_APPLICATION_ID,
  TRACCION_DATABASE_ENVIRONMENT,
} from './databaseIdentity.js';

const tempDirectories: string[] = [];

let templateDirectory: string;
let templateDatabasePath: string;

beforeAll(() => {
  templateDirectory = mkdtempSync(path.join(tmpdir(), 'traccion-identity-template-'));
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


function tempDatabasePath(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'traccion-identity-'));
  tempDirectories.push(directory);
  return path.join(directory, 'traccion.sqlite');
}

afterEach(() => {
  while (tempDirectories.length) {
    rmSync(tempDirectories.pop()!, { recursive: true, force: true });
  }
});

describe('database identity', () => {
  it('rechaza una SQLite ajena sin modificarla', () => {
    const databasePath = tempDatabasePath();
    const db = new Database(databasePath);
    db.exec('CREATE TABLE foreign_table (id INTEGER PRIMARY KEY)');
    db.close();

    expect(() =>
      inspectAndEnsureDatabaseIdentity(databasePath, { allowLegacyBootstrap: true }),
    ).toThrow(/no se reconoce como una base de datos de TrAcción/i);

    const check = new Database(databasePath, { readonly: true });
    const appMetadata = check
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_metadata'")
      .get();
    check.close();
    expect(appMetadata).toBeUndefined();
  });

  it('asigna identidad a una base legacy válida', () => {
    const databasePath = createLegacyDatabase();

    const result = inspectAndEnsureDatabaseIdentity(databasePath, { allowLegacyBootstrap: true });

    expect(result.bootstrappedLegacyIdentity).toBe(true);
    expect(result.identity.applicationId).toBe(TRACCION_APPLICATION_ID);
    expect(result.identity.environment).toBe(TRACCION_DATABASE_ENVIRONMENT);
    expect(result.identity.databaseUuid.length).toBeGreaterThan(20);
  });

  it('rechaza un UUID distinto al vinculado al equipo', () => {
    const databasePath = createLegacyDatabase();

    const first = inspectAndEnsureDatabaseIdentity(databasePath, { allowLegacyBootstrap: true });

    expect(() =>
      inspectAndEnsureDatabaseIdentity(databasePath, {
        expectedDatabaseUuid: `${first.identity.databaseUuid}-otro`,
        allowLegacyBootstrap: false,
      }),
    ).toThrow(/no coincide con la base compartida vinculada/i);
  });
});

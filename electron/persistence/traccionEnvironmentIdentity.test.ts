import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyMigrations } from './schemaMigrations.js';
import {
  assertDatabaseEnvironmentBeforeWrite,
  inspectAndEnsureDatabaseIdentity,
  readDatabaseIdentity,
} from './databaseIdentity.js';

const dirs: string[] = [];
function createSchema(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'traccion-env-integrity-'));
  dirs.push(dir);
  const p = path.join(dir, 'traccion.sqlite');
  const db = new Database(p);
  applyMigrations(db);
  db.close();
  return p;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('protección de identidad SQLite de producción/pruebas', () => {
  it('una test existente no es aceptada por producción y viceversa', () => {
    const productionPath = createSchema();
    const testPath = createSchema();
    const prod = inspectAndEnsureDatabaseIdentity(productionPath, {
      allowLegacyBootstrap: true, expectedEnvironment: 'production',
    });
    const test = inspectAndEnsureDatabaseIdentity(testPath, {
      allowLegacyBootstrap: true, expectedEnvironment: 'test',
    });
    expect(prod.identity.environment).toBe('production');
    expect(test.identity.environment).toBe('test');
    expect(() => assertDatabaseEnvironmentBeforeWrite(productionPath, 'test')).toThrow('Entorno incompatible');
    expect(() => assertDatabaseEnvironmentBeforeWrite(testPath, 'production')).toThrow('Entorno incompatible');
    const readProd = new Database(productionPath, { readonly: true });
    try { expect(readDatabaseIdentity(readProd)?.environment).toBe('production'); }
    finally { readProd.close(); }
  });

  it('pruebas nunca convierte automáticamente una SQLite legacy existente', () => {
    const legacyPath = createSchema();
    expect(() => assertDatabaseEnvironmentBeforeWrite(legacyPath, 'test')).toThrow('sin identidad test');
    const db = new Database(legacyPath, { readonly: true });
    try { expect(readDatabaseIdentity(db)).toBeNull(); }
    finally { db.close(); }
  });

  it('identidad test no se puede abrir como producción incluso con allowLegacyBootstrap', () => {
    const testPath = createSchema();
    inspectAndEnsureDatabaseIdentity(testPath, { allowLegacyBootstrap: true, expectedEnvironment: 'test' });
    expect(() => inspectAndEnsureDatabaseIdentity(testPath, {
      allowLegacyBootstrap: true, expectedEnvironment: 'production',
    })).toThrow('solo admite "production"');
  });
});

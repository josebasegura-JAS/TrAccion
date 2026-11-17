import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { applyMigrations, CURRENT_SCHEMA_VERSION } from './schemaMigrations.js';
import { inspectAndEnsureDatabaseIdentity } from './databaseIdentity.js';

let userData = '';
vi.mock('electron', () => ({
  app: { getPath: (name: string) => {
    if (name !== 'userData') throw new Error('unexpected Electron path');
    return userData;
  } },
}));
import { prepareDisposableTestDatabase } from './disposableTestDatabase.js';

let root = '';
let shared = '';
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'traccion-pr507-db-'));
  userData = path.join(root, 'user-test-environment');
  shared = path.join(root, 'shared');
  mkdirSync(userData);
  mkdirSync(shared);
  writeFileSync(path.join(userData, 'sqlite-preferences.json'),
    JSON.stringify({customDirectoryPath:shared,expectedDatabaseUuid:null}));
  process.env.TRACCION_DATABASE_ENVIRONMENT='test';
});
afterEach(() => {
  rmSync(root,{recursive:true,force:true});
  delete process.env.TRACCION_DATABASE_ENVIRONMENT;
});

describe('PR507 · base de pruebas sin datos reales', () => {
  it('crea una base vacía con esquema e identidad de pruebas', async () => {
    await prepareDisposableTestDatabase();
    const file = path.join(shared,'traccion.sqlite');
    expect(existsSync(file)).toBe(true);
    const db = new Database(file,{readonly:true});
    try {
      const version = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {version:number};
      expect(version.version).toBe(CURRENT_SCHEMA_VERSION);
      const rows = db.prepare('SELECT key,value FROM app_metadata').all() as Array<{key:string;value:string}>;
      expect(rows.find(row=>row.key==='environment')?.value).toBe('test');
      expect(rows.find(row=>row.key==='database_uuid')?.value).toBeTruthy();
    } finally { db.close(); }
    await prepareDisposableTestDatabase();
    expect(existsSync(path.join(shared,'traccion.sqlite.test-initialization.lockdir'))).toBe(false);
  });

  it('no crea bases al ejecutarse desde entorno productivo', async () => {
    process.env.TRACCION_DATABASE_ENVIRONMENT='production';
    await expect(prepareDisposableTestDatabase()).rejects.toThrow('fuera del perfil');
    expect(existsSync(path.join(shared,'traccion.sqlite'))).toBe(false);
  });

  it('no sobrescribe una SQLite existente de producción', async () => {
    process.env.TRACCION_DATABASE_ENVIRONMENT='production';
    const file=path.join(shared,'traccion.sqlite');
    const db = new Database(file);
    applyMigrations(db);
    db.close();
    const original = inspectAndEnsureDatabaseIdentity(file,{allowLegacyBootstrap:true}).identity;
    expect(original.environment).toBe('production');
    process.env.TRACCION_DATABASE_ENVIRONMENT='test';
    await prepareDisposableTestDatabase();
    const check=new Database(file,{readonly:true});
    try {
      const record=check.prepare("SELECT value FROM app_metadata WHERE key='database_uuid'").get() as {value:string};
      expect(record.value).toBe(original.databaseUuid);
    } finally {check.close();}
    expect(() => inspectAndEnsureDatabaseIdentity(file,{allowLegacyBootstrap:false}))
      .toThrow(/entorno/);
  });

  it('rechaza abrir una SQLite ya visible si otro equipo aún conserva el marcador de copia', async()=>{
    const databasePath=path.join(shared,'traccion.sqlite');
    writeFileSync(databasePath,'incomplete-test-sqlite');
    const lock=databasePath+'.test-initialization.lockdir';
    mkdirSync(lock);
    await expect(prepareDisposableTestDatabase()).rejects.toThrow('posiblemente incompleto');
    expect(existsSync(lock)).toBe(true);
  });

  it('no elimina un marcador de inicialización perteneciente a otro equipo',async()=>{
    const lock=path.join(shared,'traccion.sqlite.test-initialization.lockdir');
    mkdirSync(lock);
    await expect(prepareDisposableTestDatabase()).rejects.toThrow('inicialización');
    expect(existsSync(lock)).toBe(true);
    expect(existsSync(path.join(shared,'traccion.sqlite'))).toBe(false);
  });
});

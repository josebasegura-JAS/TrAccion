import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { DatabaseStatus } from '../sqlitePersistence.js';
import type { ConditionalSqliteSorteosSnapshot } from './sorteosRepository.js';
import { getSorteosCollectionUpdatedAt, saveSorteosTransaction } from './sorteosRepository.js';

const status: DatabaseStatus = {
  ready: true, engine: 'better-sqlite3', phase: 'active',
  path: ':memory:', schemaVersion: 0, isDefaultPath: false, lockPath: ':test:',
};

function fixture() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE sorteos_draw_records (
      id TEXT PRIMARY KEY, value_json TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE sorteos_exclusion_records (
      id TEXT PRIMARY KEY, value_json TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
  `);
  const snapshot: ConditionalSqliteSorteosSnapshot = {
    draws: [{id:'draw-1',value:'{"id":"draw-1"}'}],
    exclusions: [{id:'exclusion-1',value:'{"id":"exclusion-1"}'}],
    expectedDrawsUpdatedAt: null,
    expectedExclusionsUpdatedAt: null,
  };
  let migrations = 0;
  let migrate: (database: SqliteDatabase) => void = () => {migrations++;};
  const updateToken = (database: SqliteDatabase, updatedAt: string) => {
    database.prepare(
      "INSERT INTO app_metadata (key,value,updated_at) VALUES ('refresh',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at"
    ).run(updatedAt,updatedAt);
  };
  const save = () => saveSorteosTransaction(db,snapshot,status,migrate,updateToken);
  const rowCount = (table: 'sorteos_draw_records'|'sorteos_exclusion_records'|'app_metadata') =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${table === 'app_metadata' ? '1=1' : 'deleted_at IS NULL'}`).get() as {n:number}).n;
  const refreshVersions = () => {
    snapshot.expectedDrawsUpdatedAt = getSorteosCollectionUpdatedAt(db,'sorteos_draw_records');
    snapshot.expectedExclusionsUpdatedAt = getSorteosCollectionUpdatedAt(db,'sorteos_exclusion_records');
  };
  return {db,snapshot,save,rowCount,refreshVersions,setMigrate:(fn:typeof migrate)=>{migrate=fn;},migrations:()=>migrations};
}

describe('PR461A · Sorteos y exclusiones en una transacción SQLite real', () => {
  it('guarda ambas colecciones y token en el mismo commit', () => {
    const f=fixture();try{
      expect(f.save()).toMatchObject({ok:true});
      expect(f.rowCount('sorteos_draw_records')).toBe(1);
      expect(f.rowCount('sorteos_exclusion_records')).toBe(1);
      expect(f.rowCount('app_metadata')).toBe(1);
      expect(f.migrations()).toBe(1);
    }finally{f.db.close();}
  });

  it('rechaza revisión de sorteos obsoleta sin tocar exclusiones', () => {
    const f=fixture();try{
      const first=f.save();expect(first.ok).toBe(true);
      f.snapshot.expectedExclusionsUpdatedAt=first.currentExclusionsUpdatedAt;
      f.snapshot.draws=[{id:'draw-2',value:'{}'}];
      expect(f.save()).toMatchObject({ok:false});
      expect(f.rowCount('sorteos_draw_records')).toBe(1);
      expect(f.rowCount('sorteos_exclusion_records')).toBe(1);
    }finally{f.db.close();}
  });

  it('rechaza revisión de exclusiones obsoleta sin modificar sorteos', () => {
    const f=fixture();try{
      const first=f.save();expect(first.ok).toBe(true);
      f.snapshot.expectedDrawsUpdatedAt=first.currentDrawsUpdatedAt;
      f.snapshot.exclusions=[{id:'exclusion-2',value:'{}'}];
      expect(f.save()).toMatchObject({ok:false});
      expect(f.rowCount('sorteos_draw_records')).toBe(1);
      expect(f.rowCount('sorteos_exclusion_records')).toBe(1);
    }finally{f.db.close();}
  });

  it('aplica borrado lógico sin eliminar físicamente filas anteriores', () => {
    const f=fixture();try{
      expect(f.save().ok).toBe(true);
      f.refreshVersions();
      f.snapshot.draws=[];
      expect(f.save().ok).toBe(true);
      expect(f.rowCount('sorteos_draw_records')).toBe(0);
      expect((f.db.prepare('SELECT COUNT(*) AS n FROM sorteos_draw_records').get() as {n:number}).n).toBe(1);
    }finally{f.db.close();}
  });

  it('si falla exclusiones revierte también sorteos y token', () => {
    const f=fixture();try{
      f.db.exec("CREATE TRIGGER fail_exclusion BEFORE INSERT ON sorteos_exclusion_records BEGIN SELECT RAISE(ABORT,'fallo simulado'); END;");
      expect(() => f.save()).toThrow('fallo simulado');
      expect(f.rowCount('sorteos_draw_records')).toBe(0);
      expect(f.rowCount('sorteos_exclusion_records')).toBe(0);
      expect(f.rowCount('app_metadata')).toBe(0);
    }finally{f.db.close();}
  });

  it('si falla el token revierte incluso las migraciones legacy', () => {
    const f=fixture();try{
      f.setMigrate(db => db.prepare(
        "INSERT INTO sorteos_draw_records (id,value_json,created_at,updated_at,deleted_at) VALUES ('legacy','{}','t0','t0',NULL)"
      ).run());
      f.snapshot.expectedDrawsUpdatedAt='t0';
      f.db.exec("CREATE TRIGGER fail_token BEFORE INSERT ON app_metadata BEGIN SELECT RAISE(ABORT,'fallo simulado'); END;");
      expect(() => f.save()).toThrow('fallo simulado');
      expect(f.rowCount('sorteos_draw_records')).toBe(0);
      expect(f.rowCount('sorteos_exclusion_records')).toBe(0);
      expect(f.rowCount('app_metadata')).toBe(0);
    }finally{f.db.close();}
  });
});

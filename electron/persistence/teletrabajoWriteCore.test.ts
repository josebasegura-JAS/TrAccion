import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { DatabaseStatus } from '../sqlitePersistence.js';
import type { ConditionalSqliteTeletrabajoRecord } from './teletrabajoRepository.js';
import {
  saveTeletrabajoBatchTransaction,
  saveTeletrabajoSingleTransaction,
  TeletrabajoBatchSaveError,
} from './teletrabajoWriteCore.js';

const status: DatabaseStatus = {
  ready:true, engine:'better-sqlite3', phase:'active',
  path:':memory:', schemaVersion:0, isDefaultPath:false, lockPath:':test:',
};
function fixture() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE teletrabajo_solicitud_records (
      id TEXT PRIMARY KEY, value_json TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE app_metadata (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  const now='2026-01-01T00:00:00.000Z';
  const record=(id:string, expectedUpdatedAt:string|null=null): ConditionalSqliteTeletrabajoRecord=>({
    id,value:JSON.stringify({id,createdAt:now,updatedAt:now}),expectedUpdatedAt,
  });
  const updateRefreshMetadata = (database: SqliteDatabase, at:string):void => {
    database.prepare(
      "INSERT INTO app_metadata (key,value,updated_at) VALUES ('refresh',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
    ).run(at,at);
  };
  const count=(table:'teletrabajo_solicitud_records'|'app_metadata'):number=>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {n:number}).n;
  const save=(records:ConditionalSqliteTeletrabajoRecord[],migrate:(db:SqliteDatabase)=>void=()=>undefined)=>
    saveTeletrabajoBatchTransaction(db,records,status,migrate,updateRefreshMetadata);
  return {db,record,save,count,updateRefreshMetadata};
}

describe('PR463 · Transacciones Teletrabajo con SQLite real',()=>{
  it('inserta lote de solicitudes y token dentro de la misma transacción',()=>{
    const f=fixture();try {
      const result=f.save([f.record('a'),f.record('b')]);
      expect(result).toHaveLength(2);
      expect(result.every(x=>x.ok)).toBe(true);
      expect(f.count('teletrabajo_solicitud_records')).toBe(2);
      expect(f.count('app_metadata')).toBe(1);
    } finally { f.db.close(); }
  });
  it('conflicto en tercera solicitud revierte las dos primeras y el token',()=>{
    const f=fixture();try {
      const old='2026-02-01T00:00:00.000Z';
      f.db.prepare(
        'INSERT INTO teletrabajo_solicitud_records VALUES (?,?,?,?,NULL)',
      ).run('c','{"id":"c"}',old,old);
      const records=[f.record('a'),f.record('b'),f.record('c','obsoleta')];
      expect(()=>f.save(records)).toThrow(TeletrabajoBatchSaveError);
      expect(f.count('teletrabajo_solicitud_records')).toBe(1);
      expect(f.count('app_metadata')).toBe(0);
      expect((f.db.prepare("SELECT updated_at FROM teletrabajo_solicitud_records WHERE id = 'c'").get() as {updated_at:string}).updated_at).toBe(old);
    } finally { f.db.close(); }
  });
  it('error SQL en la última solicitud revierte el lote',()=>{
    const f=fixture();try {
      f.db.exec("CREATE TRIGGER fail_c BEFORE INSERT ON teletrabajo_solicitud_records WHEN NEW.id='c' BEGIN SELECT RAISE(ABORT,'fallo simulado'); END;");
      expect(()=>f.save([f.record('a'),f.record('b'),f.record('c')])).toThrow('fallo simulado');
      expect(f.count('teletrabajo_solicitud_records')).toBe(0);
      expect(f.count('app_metadata')).toBe(0);
    } finally { f.db.close(); }
  });
  it('un fallo SQL también revierte la migración realizada al inicio',()=>{
    const f=fixture();try {
      const migrate=(db:SqliteDatabase):void=>{
        db.prepare('INSERT INTO teletrabajo_solicitud_records VALUES (?,?,?,?,NULL)').run('legacy','{}','old','old');
      };
      f.db.exec("CREATE TRIGGER fail_c BEFORE INSERT ON teletrabajo_solicitud_records WHEN NEW.id='c' BEGIN SELECT RAISE(ABORT,'fallo simulado'); END;");
      expect(()=>f.save([f.record('c')],migrate)).toThrow('fallo simulado');
      expect(f.count('teletrabajo_solicitud_records')).toBe(0);
    } finally { f.db.close(); }
  });
  it('guardado individual conserva OCC y actualización de token',()=>{
    const f=fixture();try {
      expect(saveTeletrabajoSingleTransaction(f.db,f.record('x'),status,()=>undefined,f.updateRefreshMetadata).ok).toBe(true);
      expect(saveTeletrabajoSingleTransaction(f.db,f.record('x'),status,()=>undefined,f.updateRefreshMetadata).ok).toBe(false);
      expect(f.count('teletrabajo_solicitud_records')).toBe(1);
      expect(f.count('app_metadata')).toBe(1);
    } finally { f.db.close(); }
  });
  it('conflicto identifica registro causante para la UI',()=>{
    const f=fixture();try {
      f.db.prepare('INSERT INTO teletrabajo_solicitud_records VALUES (?,?,?,?,NULL)').run('b','{}','v1','v1');
      try {
        f.save([f.record('a'),f.record('b')]);
        throw new Error('Se esperaba un conflicto de concurrencia');
      } catch(error) {
        expect(error).toBeInstanceOf(TeletrabajoBatchSaveError);
        if (error instanceof TeletrabajoBatchSaveError) {
          expect(error.recordId).toBe('b');
          expect(error.saveResult).toMatchObject({ok:false,currentUpdatedAt:'v1'});
        }
      }
      expect(f.count('teletrabajo_solicitud_records')).toBe(1);
    } finally { f.db.close(); }
  });
});

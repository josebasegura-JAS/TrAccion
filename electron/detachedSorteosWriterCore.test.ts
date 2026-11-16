import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { isDetachedSorteosSave, saveDetachedSorteos } from './detachedSorteosWriterCore.js';
import { migrateSorteosLegacyInTransaction } from './persistence/sorteosRepository.js';
import { isDetachedWriterRequest, isDetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';

function setup(){
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE persisted_records (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
    CREATE TABLE sorteos_draw_records (id TEXT PRIMARY KEY,value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT);
    CREATE TABLE sorteos_exclusion_records (id TEXT PRIMARY KEY,value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT);
    CREATE TABLE app_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
  `);
  const request = { ownerId:'owner-a',snapshot:{
    draws:[{id:'d1',value:'{"id":"d1"}'}],
    exclusions:[{id:'e1',value:'{"id":"e1"}'}],
    expectedDrawsUpdatedAt:null,expectedExclusionsUpdatedAt:null,
  }};
  const count=(t:'sorteos_draw_records'|'sorteos_exclusion_records'|'app_metadata')=>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as {n:number}).n;
  return {db,request,count};
}
describe('PR462 · escritor aislado Sorteos en SQLite real',()=>{
  it('migración de datos antiguos idéntica en ambos módulos',()=>{
    const f=setup();try{
      f.db.prepare('INSERT INTO persisted_records VALUES (?,?)').run(
        'traccion.v1.sorteos.draws','[{"id":"legacy-d","createdAt":"2026-01-01"}]'
      );
      f.db.prepare('INSERT INTO persisted_records VALUES (?,?)').run(
        'traccion.v1.sorteos.exclusions','[{"id":"legacy-e"}]'
      );
      f.db.transaction(()=>migrateSorteosLegacyInTransaction(f.db))();
      expect(f.count('sorteos_draw_records')).toBe(1);
      expect(f.count('sorteos_exclusion_records')).toBe(1);
      f.db.transaction(()=>migrateSorteosLegacyInTransaction(f.db))();
      expect(f.count('sorteos_draw_records')).toBe(1);
      expect(f.count('sorteos_exclusion_records')).toBe(1);
    }finally{f.db.close();}
  });
  it('escribe sorteo, exclusión y token de modo atómico',()=>{
    const f=setup();try{
      expect(saveDetachedSorteos(f.db,f.request).ok).toBe(true);
      expect(f.count('sorteos_draw_records')).toBe(1);
      expect(f.count('sorteos_exclusion_records')).toBe(1);
      expect(f.count('app_metadata')).toBe(1);
    }finally{f.db.close();}
  });
  it('rechaza OCC obsoleto y no altera colecciones',()=>{
    const f=setup();try{
      expect(saveDetachedSorteos(f.db,f.request).ok).toBe(true);
      expect(saveDetachedSorteos(f.db,f.request).ok).toBe(false);
      expect(f.count('sorteos_draw_records')).toBe(1);
      expect(f.count('sorteos_exclusion_records')).toBe(1);
    }finally{f.db.close();}
  });
  it('error SQL en exclusiones hace rollback de sorteos y migración legacy',()=>{
    const f=setup();try{
      f.db.prepare('INSERT INTO persisted_records VALUES (?,?)').run(
        'traccion.v1.sorteos.draws','[{"id":"legacy-d"}]'
      );
      f.db.prepare('INSERT INTO persisted_records VALUES (?,?)').run(
        'traccion.v1.sorteos.exclusions','[{"id":"legacy-e"}]'
      );
      f.db.exec("CREATE TRIGGER fail_exclusion BEFORE INSERT ON sorteos_exclusion_records BEGIN SELECT RAISE(ABORT,'fallo simulado'); END;");
      // La migración legacy inserta primero un sorteo y falla al importar
      // exclusiones: ambas operaciones deben deshacerse.
      expect(()=>saveDetachedSorteos(f.db,f.request)).toThrow('fallo simulado');
      expect(f.count('sorteos_draw_records')).toBe(0);
      expect(f.count('sorteos_exclusion_records')).toBe(0);
      expect(f.count('app_metadata')).toBe(0);
    }finally{f.db.close();}
  });
});
describe('PR462 · validación de protocolo',()=>{
  const payload={ownerId:'owner-a',snapshot:{draws:[],exclusions:[],expectedDrawsUpdatedAt:null,expectedExclusionsUpdatedAt:null}};
  it('valida lotes, duplicados y tipos',()=>{
    expect(isDetachedSorteosSave(payload)).toBe(true);
    expect(isDetachedWriterRequest({kind:'detached:save-sorteos',operationId:'op',payload})).toBe(true);
    expect(isDetachedWriterResponse({kind:'detached:sorteos-saved',operationId:'op',
      result:{ok:true,message:'ok',status:{ready:true},currentDrawsUpdatedAt:'v1',currentExclusionsUpdatedAt:'v1'}})).toBe(true);
    expect(isDetachedSorteosSave({...payload,ownerId:''})).toBe(false);
    expect(isDetachedSorteosSave({...payload,snapshot:{...payload.snapshot,draws:[{id:'x',value:'{}'},{id:'x',value:'{}'}]}})).toBe(false);
    expect(isDetachedSorteosSave({...payload,snapshot:{...payload.snapshot,expectedDrawsUpdatedAt:42}})).toBe(false);
    expect(isDetachedWriterRequest({kind:'detached:save-sorteos',operationId:'',payload})).toBe(false);
  });
});

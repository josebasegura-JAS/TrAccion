import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { DatabaseStatus } from './sqlitePersistence.js';
import { saveConfiguracionTransaction } from './persistence/configuracionWriteCore.js';
import { saveDetachedConfiguracion, isDetachedConfiguracionSave } from './detachedConfiguracionWriterCore.js';
import { isDetachedWriterRequest, isDetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';

const status: DatabaseStatus = {
  ready:true, engine:'better-sqlite3', phase:'active',
  path:':memory:', schemaVersion:0, isDefaultPath:false, lockPath:':test:',
};
const old='2026-01-01T00:00:00.000Z';
function setup() {
  const db=new Database(':memory:');
  db.exec(`
    CREATE TABLE persisted_records (key TEXT PRIMARY KEY,value_json TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE configuracion_state (id TEXT PRIMARY KEY,value_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT);
    CREATE TABLE app_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
  `);
  const count=(table:'configuracion_state'|'app_metadata')=>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {n:number}).n;
  const revision=()=> (db.prepare('SELECT updated_at FROM configuracion_state').get() as {updated_at:string}|undefined)?.updated_at ?? null;
  const token=(database:SqliteDatabase,now:string)=>database.prepare(
    "INSERT INTO app_metadata (key,value,updated_at) VALUES ('refresh',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
  ).run(now,now);
  return {db,count,revision,token};
}
describe('PR459 · Configuración con SQLite real',()=>{
  it('escribe Configuración y token juntos',()=>{
    const f=setup();try{
      const result=saveConfiguracionTransaction(f.db,{value:'{"version":1}',expectedUpdatedAt:null},status,f.token);
      expect(result.ok).toBe(true);
      expect(f.count('configuracion_state')).toBe(1);
      expect(f.count('app_metadata')).toBe(1);
    }finally{f.db.close();}
  });
  it('reconoce revisión antigua y no sobrescribe otro usuario',()=>{
    const f=setup();try{
      expect(saveConfiguracionTransaction(f.db,{value:'{"version":1}',expectedUpdatedAt:null},status,f.token).ok).toBe(true);
      const revision=f.revision();
      const conflict=saveConfiguracionTransaction(f.db,{value:'{"version":2}',expectedUpdatedAt:null},status,f.token);
      expect(conflict).toMatchObject({ok:false,currentUpdatedAt:revision});
      expect((f.db.prepare('SELECT value_json FROM configuracion_state').get() as {value_json:string}).value_json)
        .toBe('{"version":1}');
    }finally{f.db.close();}
  });
  it('importa legacy dentro de la misma transacción y evita sobrescribirlo',()=>{
    const f=setup();try{
      f.db.prepare('INSERT INTO persisted_records VALUES (?,?,?)').run('traccion.v1.configuracion','{"legacy":true}',old);
      const conflict=saveConfiguracionTransaction(f.db,{value:'{"new":true}',expectedUpdatedAt:null},status,f.token);
      expect(conflict).toMatchObject({ok:false,currentUpdatedAt:old});
      expect((f.db.prepare('SELECT value_json FROM configuracion_state').get() as {value_json:string}).value_json)
        .toBe('{"legacy":true}');
    }finally{f.db.close();}
  });
  it('revierte configuración y migración si falla token',()=>{
    const f=setup();try{
      f.db.exec("CREATE TRIGGER fail_token BEFORE INSERT ON app_metadata BEGIN SELECT RAISE(ABORT,'fallo simulado'); END;");
      expect(()=>saveConfiguracionTransaction(f.db,{value:'{}',expectedUpdatedAt:null},status,f.token)).toThrow('fallo simulado');
      expect(f.count('configuracion_state')).toBe(0);
      expect(f.count('app_metadata')).toBe(0);
    }finally{f.db.close();}
  });
  it('el adaptador usa exactamente la misma semántica de guardado',()=>{
    const f=setup();try{
      const payload={ownerId:'owner-a',record:{value:'{"active":true}',expectedUpdatedAt:null}};
      expect(saveDetachedConfiguracion(f.db,payload)).toMatchObject({ok:true});
      expect(saveDetachedConfiguracion(f.db,payload)).toMatchObject({ok:false});
    }finally{f.db.close();}
  });
});
describe('PR459 · validación protocolo',()=>{
  const payload={ownerId:'owner-a',record:{value:'{}',expectedUpdatedAt:null}};
  it('acepta solo mensajes y respuestas de Configuración válidos',()=>{
    expect(isDetachedConfiguracionSave(payload)).toBe(true);
    expect(isDetachedWriterRequest({kind:'detached:save-configuracion',operationId:'op1',payload})).toBe(true);
    expect(isDetachedWriterResponse({kind:'detached:configuracion-saved',operationId:'op1',
      result:{ok:true,message:'ok',currentUpdatedAt:'v1',status:{ready:true}}})).toBe(true);
    expect(isDetachedConfiguracionSave({...payload,ownerId:''})).toBe(false);
    expect(isDetachedConfiguracionSave({...payload,record:{value:'{}',expectedUpdatedAt:42}})).toBe(false);
    expect(isDetachedWriterRequest({kind:'detached:save-configuracion',operationId:'',payload})).toBe(false);
  });
});

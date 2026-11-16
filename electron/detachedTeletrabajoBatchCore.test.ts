import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { isDetachedTeletrabajoBatchSave, saveDetachedTeletrabajoBatch } from './detachedTeletrabajoBatchCore.js';
import { isDetachedWriterRequest, isDetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';

function fixture() {
  const db=new Database(':memory:');
  db.exec(`
    CREATE TABLE persisted_records (key TEXT PRIMARY KEY,value_json TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE teletrabajo_solicitud_records (
      id TEXT PRIMARY KEY,value_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT
    );
    CREATE TABLE app_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
  `);
  const record=(id:string,expectedUpdatedAt:string|null=null)=>({
    id,value:JSON.stringify({id,createdAt:'2026-01-01',updatedAt:'2026-01-01'}),expectedUpdatedAt,
  });
  const request={ownerId:'owner',records:[record('a'),record('b')]};
  const count=(t:'teletrabajo_solicitud_records'|'app_metadata')=>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as {n:number}).n;
  return {db,record,request,count};
}
describe('PR464 · Teletrabajo aislado con SQLite real',()=>{
  it('importación masiva y token en una transacción',()=>{
    const f=fixture();try{
      expect(saveDetachedTeletrabajoBatch(f.db,f.request)).toMatchObject({ok:true});
      expect(f.count('teletrabajo_solicitud_records')).toBe(2);
      expect(f.count('app_metadata')).toBe(1);
    }finally{f.db.close();}
  });
  it('conflicto en segunda solicitud revierte primera y devuelve ID afectado',()=>{
    const f=fixture();try{
      f.db.prepare('INSERT INTO teletrabajo_solicitud_records VALUES (?,?,?,?,NULL)')
        .run('b','{"id":"b"}','old','old');
      const result=saveDetachedTeletrabajoBatch(f.db,f.request);
      expect(result).toMatchObject({ok:false,failedRecordId:'b'});
      expect(f.count('teletrabajo_solicitud_records')).toBe(1);
      expect(f.count('app_metadata')).toBe(0);
    }finally{f.db.close();}
  });
  it('migración legacy y conflicto OCC no dejan escrituras parciales',()=>{
    const f=fixture();try{
      f.db.prepare('INSERT INTO persisted_records VALUES (?,?,?)')
        .run('traccion.v1.teletrabajo.solicitudes','[{"id":"legacy"}]','old');
      f.request.records=[f.record('a'),f.record('legacy','old-revision')];
      expect(saveDetachedTeletrabajoBatch(f.db,f.request)).toMatchObject({ok:false,failedRecordId:'legacy'});
      expect(f.count('teletrabajo_solicitud_records')).toBe(0);
      expect(f.count('app_metadata')).toBe(0);
    }finally{f.db.close();}
  });
  it('fallo SQL posterior revierte migración, registros y token',()=>{
    const f=fixture();try{
      f.db.prepare('INSERT INTO persisted_records VALUES (?,?,?)')
        .run('traccion.v1.teletrabajo.solicitudes','[{"id":"legacy"}]','old');
      f.db.exec("CREATE TRIGGER fail_b BEFORE INSERT ON teletrabajo_solicitud_records WHEN NEW.id='b' BEGIN SELECT RAISE(ABORT,'fallo simulado'); END;");
      expect(()=>saveDetachedTeletrabajoBatch(f.db,f.request)).toThrow('fallo simulado');
      expect(f.count('teletrabajo_solicitud_records')).toBe(0);
      expect(f.count('app_metadata')).toBe(0);
    }finally{f.db.close();}
  });
});
describe('PR464 · validación de protocolo',()=>{
  const payload={ownerId:'owner',records:[{id:'a',value:'{}',expectedUpdatedAt:null}]};
  it('acepta lote válido y rechaza duplicados y tipos incorrectos',()=>{
    expect(isDetachedTeletrabajoBatchSave(payload)).toBe(true);
    expect(isDetachedWriterRequest({kind:'detached:save-teletrabajo-batch',operationId:'op',payload})).toBe(true);
    expect(isDetachedTeletrabajoBatchSave({...payload,records:[]})).toBe(false);
    expect(isDetachedTeletrabajoBatchSave({...payload,records:[...payload.records,...payload.records]})).toBe(false);
    expect(isDetachedTeletrabajoBatchSave({...payload,ownerId:''})).toBe(false);
    expect(isDetachedWriterRequest({kind:'detached:save-teletrabajo-batch',operationId:'',payload})).toBe(false);
  });
  it('valida respuesta tipada',()=>{
    const result={ok:true,status:{ready:true},message:'ok',results:[]};
    expect(isDetachedWriterResponse({kind:'detached:teletrabajo-batch-saved',operationId:'op',result})).toBe(true);
    expect(isDetachedWriterResponse({kind:'detached:teletrabajo-batch-saved',operationId:'op',result:{...result,results:null}})).toBe(false);
  });
});

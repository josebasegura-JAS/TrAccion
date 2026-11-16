import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { isDetachedPresupuestosSave, saveDetachedPresupuestos } from './detachedPresupuestosWriterCore.js';
import { isDetachedWriterRequest, isDetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';

const TABLES=['presupuesto_scenario_records','presupuesto_manual_item_records','presupuesto_ticket_group_records','presupuesto_actual_records'] as const;
function fixture(){
  const db=new Database(':memory:');
  for(const table of TABLES)db.exec(`
    CREATE TABLE ${table}(
      id TEXT PRIMARY KEY,value_json TEXT NOT NULL,created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,deleted_at TEXT
    );`);
  db.exec('CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)');
  const request={ownerId:'owner-a',snapshot:{
    scenarios:[{id:'s1',value:'{"id":"s1"}'}],
    manualItems:[{id:'m1',value:'{"id":"m1"}'}],
    ticketGroups:[{id:'t1',value:'{"id":"t1"}'}],
    actuals:[{id:'a1',value:'{"id":"a1"}'}],
    expectedUpdatedAt:null as string|null,
  }};
  const count=(name:typeof TABLES[number] | 'app_metadata')=>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get() as {n:number}).n;
  return {db,request,count};
}
describe('PR466 · Presupuestos en escritor aislado con SQLite real',()=>{
  it('cuatro colecciones y token se confirman juntos',()=>{
    const f=fixture();try{
      const result=saveDetachedPresupuestos(f.db,f.request);
      expect(result.ok).toBe(true);
      for(const table of TABLES)expect(f.count(table)).toBe(1);
      expect(f.count('app_metadata')).toBe(1);
    }finally{f.db.close();}
  });
  it('OCC rechaza escritura externa sin tocar ninguna tabla',()=>{
    const f=fixture();try{
      f.db.prepare('INSERT INTO presupuesto_manual_item_records VALUES (?,?,?,?,NULL)')
        .run('m2','{}','2026-01-01','2026-01-01');
      const result=saveDetachedPresupuestos(f.db,f.request);
      expect(result).toMatchObject({ok:false,currentUpdatedAt:expect.stringMatching(/^budget-rev:sha256:/)});
      expect(f.count('presupuesto_manual_item_records')).toBe(1);
      for(const table of TABLES.filter(x=>x!=='presupuesto_manual_item_records'))expect(f.count(table)).toBe(0);
      expect(f.count('app_metadata')).toBe(0);
    }finally{f.db.close();}
  });
  it('SQL abortado en cuarta tabla revierte otras tres y token',()=>{
    const f=fixture();try{
      f.db.exec("CREATE TRIGGER fail_actual BEFORE INSERT ON presupuesto_actual_records BEGIN SELECT RAISE(ABORT,'fallo simulado'); END;");
      expect(()=>saveDetachedPresupuestos(f.db,f.request)).toThrow('fallo simulado');
      for(const table of TABLES)expect(f.count(table)).toBe(0);
      expect(f.count('app_metadata')).toBe(0);
    }finally{f.db.close();}
  });
  it('un guardado obsoleto no revierte una versión ya consolidada',()=>{
    const f=fixture();try{
      const first=saveDetachedPresupuestos(f.db,f.request);
      expect(first.ok).toBe(true);
      f.request.snapshot.scenarios=[{id:'s1',value:'{"changed":true}'}];
      expect(saveDetachedPresupuestos(f.db,f.request).ok).toBe(false);
      const row=f.db.prepare("SELECT value_json FROM presupuesto_scenario_records WHERE id='s1'").get() as {value_json:string};
      expect(row.value_json).toBe('{"id":"s1"}');
    }finally{f.db.close();}
  });
  it('valida cuatro colecciones, tipos y duplicados',()=>{
    const f=fixture();try{
      expect(isDetachedPresupuestosSave(f.request)).toBe(true);
      expect(isDetachedPresupuestosSave({...f.request,ownerId:''})).toBe(false);
      expect(isDetachedPresupuestosSave({...f.request,snapshot:{...f.request.snapshot,actuals:null}})).toBe(false);
      expect(isDetachedPresupuestosSave({...f.request,snapshot:{...f.request.snapshot,scenarios:[...f.request.snapshot.scenarios,...f.request.snapshot.scenarios]}})).toBe(false);
      expect(isDetachedPresupuestosSave({...f.request,snapshot:{...f.request.snapshot,expectedUpdatedAt:1}})).toBe(false);
      expect(isDetachedWriterRequest({kind:'detached:save-presupuestos',operationId:'',payload:f.request})).toBe(false);
    }finally{f.db.close();}
  });
  it('protocolo acepta solicitud y respuesta correctas',()=>{
    const f=fixture();try{
      expect(isDetachedWriterRequest({kind:'detached:save-presupuestos',operationId:'op',payload:f.request})).toBe(true);
      expect(isDetachedWriterResponse({kind:'detached:presupuestos-saved',operationId:'op',
        result:{ok:true,status:{ready:true},message:'ok',currentUpdatedAt:'v1'}})).toBe(true);
      expect(isDetachedWriterResponse({kind:'detached:presupuestos-saved',operationId:'op',
        result:{ok:true,status:{ready:true},message:'ok',currentUpdatedAt:45}})).toBe(false);
    }finally{f.db.close();}
  });
});

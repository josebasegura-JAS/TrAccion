import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { DatabaseStatus } from '../sqlitePersistence.js';
import type { PresupuestosSnapshotInput } from './presupuestosRepository.js';
import { savePresupuestosTransaction } from './presupuestosWriteCore.js';

const status: DatabaseStatus = {
  ready:true,engine:'better-sqlite3',phase:'active',
  path:':memory:',schemaVersion:0,isDefaultPath:false,lockPath:':test:',
};
const names=['presupuesto_scenario_records','presupuesto_manual_item_records',
  'presupuesto_ticket_group_records','presupuesto_actual_records'] as const;
function fixture() {
  const db=new Database(':memory:');
  for (const table of names) db.exec(`
    CREATE TABLE ${table} (
      id TEXT PRIMARY KEY,value_json TEXT NOT NULL,created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,deleted_at TEXT
    );`);
  db.exec('CREATE TABLE app_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)');
  const snapshot: PresupuestosSnapshotInput = {
    scenarios:[{id:'s',value:'{"id":"s"}'}],
    manualItems:[{id:'m',value:'{"id":"m"}'}],
    ticketGroups:[{id:'t',value:'{"id":"t"}'}],
    actuals:[{id:'a',value:'{"id":"a"}'}],
    expectedUpdatedAt:null,
  };
  const update=(database:SqliteDatabase,at:string):void=>{
    database.prepare("INSERT INTO app_metadata (key,value,updated_at) VALUES ('refresh',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(at,at);
  };
  const save=()=>savePresupuestosTransaction(db,snapshot,status,update);
  const count=(table:typeof names[number] | 'app_metadata') =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {n:number}).n;
  return {db,snapshot,save,count};
}
describe('PR465 · presupuesto atómico de cuatro colecciones',()=>{
  it('guarda cuatro colecciones y token juntos',()=>{
    const f=fixture();try{
      const result=f.save();
      expect(result.ok).toBe(true);
      for(const t of names)expect(f.count(t)).toBe(1);
      expect(f.count('app_metadata')).toBe(1);
    }finally{f.db.close();}
  });
  it('OCC se comprueba dentro de la transacción: escritura ajena posterior al load se rechaza',()=>{
    const f=fixture();try{
      f.db.prepare("INSERT INTO presupuesto_manual_item_records VALUES (?,?,?,?,NULL)")
        .run('other','{}','2026-01-01','2026-01-01');
      expect(f.save()).toMatchObject({ok:false,currentUpdatedAt:'2026-01-01'});
      expect(f.count('presupuesto_manual_item_records')).toBe(1);
      for(const t of names.filter(t=>t!=='presupuesto_manual_item_records'))expect(f.count(t)).toBe(0);
      expect(f.count('app_metadata')).toBe(0);
    }finally{f.db.close();}
  });
  it('si falla la cuarta colección se revierte también lo escrito en las tres primeras',()=>{
    const f=fixture();try{
      f.db.exec("CREATE TRIGGER fail_actual BEFORE INSERT ON presupuesto_actual_records BEGIN SELECT RAISE(ABORT,'fallo simulado'); END;");
      expect(()=>f.save()).toThrow('fallo simulado');
      for(const t of names)expect(f.count(t)).toBe(0);
      expect(f.count('app_metadata')).toBe(0);
    }finally{f.db.close();}
  });
  it('un guardado posterior puede efectuar borrado lógico sin eliminar físicamente',()=>{
    const f=fixture();try{
      const first=f.save();expect(first.ok).toBe(true);
      f.snapshot.expectedUpdatedAt=first.currentUpdatedAt;
      f.snapshot.scenarios=[];
      const second=f.save();expect(second.ok).toBe(true);
      const row=f.db.prepare("SELECT deleted_at FROM presupuesto_scenario_records WHERE id='s'").get() as {deleted_at:string};
      expect(row.deleted_at).toBeTruthy();
      expect(f.count('presupuesto_scenario_records')).toBe(1);
    }finally{f.db.close();}
  });
  it('no permite IDs duplicados en ninguna colección',()=>{
    const f=fixture();try{
      f.snapshot.actuals.push({...f.snapshot.actuals[0]});
      expect(()=>f.save()).toThrow('duplicado');
      for(const t of names)expect(f.count(t)).toBe(0);
    }finally{f.db.close();}
  });
  it('conflicto por otra colección impide reactivar una fila borrada sin revisión correcta',()=>{
    const f=fixture();try{
      const first=f.save();expect(first.ok).toBe(true);
      f.snapshot.expectedUpdatedAt='revisión obsoleta';
      f.snapshot.scenarios=[{id:'s',value:'{"changed":true}'}];
      expect(f.save().ok).toBe(false);
      expect((f.db.prepare("SELECT value_json FROM presupuesto_scenario_records WHERE id='s'").get() as {value_json:string}).value_json).toBe('{"id":"s"}');
    }finally{f.db.close();}
  });
});

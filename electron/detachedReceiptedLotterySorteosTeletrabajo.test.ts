import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { saveDetachedLotterySnapshot } from './detachedLotteryWriterCore.js';
import { saveDetachedSorteos } from './detachedSorteosWriterCore.js';
import { saveDetachedTeletrabajoBatch } from './detachedTeletrabajoBatchCore.js';
import { saveWithDetachedCommitReceipt, verifyDetachedSqliteCommit } from './detachedWriterCommitReceipt.js';
import { isDetachedWriterRequest, isDetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';

const identity = { databaseUuid:'db-pr487', applicationId:'TrAccion', environment:'test', schemaVersion:1 };
const key = (operationId: string) => ({ operationId, generation:7, databaseUuid:identity.databaseUuid });
function fixture() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE app_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES(1,'2026-11-17');
    CREATE TABLE persisted_records(key TEXT PRIMARY KEY,value_json TEXT NOT NULL,updated_at TEXT);
    CREATE TABLE loteria_campaign_records(id TEXT PRIMARY KEY,value_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT);
    CREATE TABLE loteria_request_records(id TEXT PRIMARY KEY,campaign_year INTEGER NOT NULL,value_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT);
    CREATE TABLE sorteos_draw_records(id TEXT PRIMARY KEY,value_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT);
    CREATE TABLE sorteos_exclusion_records(id TEXT PRIMARY KEY,value_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT);
    CREATE TABLE teletrabajo_solicitud_records(id TEXT PRIMARY KEY,value_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT);
  `);
  for(const [k,v] of [
    ['database_uuid',identity.databaseUuid],['application_id',identity.applicationId],
    ['environment',identity.environment],['database_created_at','2026-11-17'],
  ]) db.prepare('INSERT INTO app_metadata VALUES (?,?,?)').run(k,v,'2026-11-17');
  const lottery = {ownerId:'owner-a',payload:{
    year:2026,campaignValue:'{"year":2026,"cashArqueos":[],"cashMovements":[]}',
    requests:[{id:'r1',value:'{"id":"r1","nombre":"Prueba"}'}],
    expectedCampaignUpdatedAt:null as string|null,expectedRequestUpdatedAt:{} as Record<string,string|null>,
  }};
  const draws = {ownerId:'owner-a',snapshot:{
    draws:[{id:'d1',value:'{"id":"d1"}'}],exclusions:[{id:'e1',value:'{"id":"e1"}'}],
    expectedDrawsUpdatedAt:null as string|null,expectedExclusionsUpdatedAt:null as string|null,
  }};
  const telework = {ownerId:'owner-a',records:[
    {id:'a',value:'{"id":"a","updatedAt":"v1"}',expectedUpdatedAt:null as string|null},
    {id:'b',value:'{"id":"b","updatedAt":"v1"}',expectedUpdatedAt:null as string|null},
  ]};
  return { db, lottery, draws, telework };
}
describe('PR487 · recibos para Lotería, Sorteos y Teletrabajo', () => {
  it('confirma campaña, participantes y recibo y rechaza revisión obsoleta', () => {
    const f=fixture();try {
      const first=saveWithDetachedCommitReceipt(f.db,key('lottery'),()=>
        saveDetachedLotterySnapshot(f.db,f.lottery));
      expect(first.ok).toBe(true);
      expect(verifyDetachedSqliteCommit(f.db,identity,key('lottery')).outcome).toBe('committed');
      expect((f.db.prepare('SELECT COUNT(*) AS n FROM loteria_request_records').get() as {n:number}).n).toBe(1);
      const stale=saveWithDetachedCommitReceipt(f.db,key('lottery-stale'),()=>
        saveDetachedLotterySnapshot(f.db,f.lottery));
      expect(stale.ok).toBe(false);
      expect(verifyDetachedSqliteCommit(f.db,identity,key('lottery-stale')).outcome).toBe('not-committed');
    }finally{f.db.close();}
  });
  it('confirma sorteo, exclusión y recibo en una transacción', () => {
    const f=fixture();try{
      const result=saveWithDetachedCommitReceipt(f.db,key('sorteos'),()=>
        saveDetachedSorteos(f.db,f.draws));
      expect(result.ok).toBe(true);
      expect((f.db.prepare('SELECT COUNT(*) AS n FROM sorteos_exclusion_records').get() as {n:number}).n).toBe(1);
      expect(verifyDetachedSqliteCommit(f.db,identity,key('sorteos')).outcome).toBe('committed');
      const stale=saveWithDetachedCommitReceipt(f.db,key('sorteos-stale'),()=>
        saveDetachedSorteos(f.db,f.draws));
      expect(stale.ok).toBe(false);
      expect(verifyDetachedSqliteCommit(f.db,identity,key('sorteos-stale')).outcome).toBe('not-committed');
    }finally{f.db.close();}
  });
  it('conflicto en segunda solicitud de Teletrabajo revierte el lote entero y el recibo', () => {
    const f=fixture();try{
      saveWithDetachedCommitReceipt(f.db,key('baseline'),()=>({ok:true}));
      f.db.prepare('INSERT INTO teletrabajo_solicitud_records VALUES(?,?,?,?,NULL)')
        .run('b','{"id":"b"}','old','old');
      const result=saveWithDetachedCommitReceipt(f.db,key('telework-conflict'),()=>
        saveDetachedTeletrabajoBatch(f.db,f.telework));
      expect(result).toMatchObject({ok:false,failedRecordId:'b'});
      expect(f.db.prepare("SELECT id FROM teletrabajo_solicitud_records WHERE id='a'").get()).toBeUndefined();
      expect(verifyDetachedSqliteCommit(f.db,identity,key('telework-conflict')).outcome).toBe('not-committed');
    }finally{f.db.close();}
  });
  it('Teletrabajo confirma dos solicitudes y recibo, sin permitir reutilizar operación', () => {
    const f=fixture();try {
      const result=saveWithDetachedCommitReceipt(f.db,key('telework'),()=>
        saveDetachedTeletrabajoBatch(f.db,f.telework));
      expect(result.ok).toBe(true);
      expect((f.db.prepare('SELECT COUNT(*) AS n FROM teletrabajo_solicitud_records').get() as {n:number}).n).toBe(2);
      expect(verifyDetachedSqliteCommit(f.db,identity,key('telework')).outcome).toBe('committed');
      expect(()=>saveWithDetachedCommitReceipt(f.db,key('telework'),()=>
        saveDetachedSorteos(f.db,f.draws))).toThrow('prohibido repetir');
    }finally{f.db.close();}
  });
  it('valida las nuevas peticiones y respuestas con recibo', () => {
    const f=fixture();try{
      for(const [kind,response,payload] of [
        ['lottery','lottery',f.lottery],['sorteos','sorteos',f.draws],
        ['teletrabajo-batch','teletrabajo-batch',f.telework],
      ] as const){
        const message={kind:'detached:save-'+kind+'-receipted',...key('id-'+kind),payload};
        expect(isDetachedWriterRequest(message)).toBe(true);
        expect(isDetachedWriterRequest({...message,generation:0})).toBe(false);
        expect(isDetachedWriterRequest({...message,databaseUuid:''})).toBe(false);
        const result=kind==='lottery'
          ? {ok:true,message:'ok',status:{ready:true},campaignUpdatedAt:'v1',requestUpdatedAt:{}}
          : kind==='sorteos'
            ? {ok:true,message:'ok',status:{ready:true},currentDrawsUpdatedAt:'v1',currentExclusionsUpdatedAt:'v1'}
            : {ok:true,message:'ok',status:{ready:true},results:[]};
        expect(isDetachedWriterResponse({kind:'detached:'+response+'-receipted',
          operationId:'id-'+kind,result})).toBe(true);
      }
    }finally{f.db.close();}
  });
});

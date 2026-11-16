import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { DatabaseStatus } from './sqlitePersistence.js';
import type { LotterySavePayload } from './persistence/loteriaRepository.js';
import { saveLotterySnapshotTransaction } from './persistence/loteriaRepository.js';
import { isDetachedLotterySave, saveDetachedLotterySnapshot } from './detachedLotteryWriterCore.js';
import { isDetachedWriterRequest, isDetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';

const status: DatabaseStatus = {ready:true,engine:'better-sqlite3',phase:'active',
  path:':memory:',schemaVersion:0,isDefaultPath:false,lockPath:':test:'};
function fixture(){
  const db=new Database(':memory:');
  db.exec(`
    CREATE TABLE persisted_records (key TEXT PRIMARY KEY,value_json TEXT NOT NULL);
    CREATE TABLE loteria_campaign_records (id TEXT PRIMARY KEY,value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT);
    CREATE TABLE loteria_request_records (id TEXT PRIMARY KEY,campaign_year INTEGER NOT NULL,value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT);
    CREATE TABLE app_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
  `);
  const payload:LotterySavePayload={year:2026,campaignValue:'{"year":2026,"cashArqueos":[],"cashMovements":[]}',
    requests:[{id:'r1',value:'{"id":"r1","nombre":"Prueba"}'}],
    expectedCampaignUpdatedAt:null,expectedRequestUpdatedAt:{}};
  const token=(database:SqliteDatabase,updatedAt:string)=>
    database.prepare("INSERT INTO app_metadata (key,value,updated_at) VALUES ('refresh',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
      .run(updatedAt,updatedAt);
  const save=()=>saveLotterySnapshotTransaction(db,payload,status,token);
  const count=(table:'loteria_campaign_records'|'loteria_request_records'|'app_metadata')=>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {n:number}).n;
  return {db,payload,save,count};
}

describe('PR460 · escritura de Lotería con SQLite real',()=>{
  it('guarda campaña, participantes y token juntos',()=>{
    const f=fixture();try{
      expect(f.save()).toMatchObject({ok:true});
      expect(f.count('loteria_campaign_records')).toBe(1);
      expect(f.count('loteria_request_records')).toBe(1);
      expect(f.count('app_metadata')).toBe(1);
    }finally{f.db.close();}
  });
  it('rechaza OCC obsoleto de campaña sin alterar participantes',()=>{
    const f=fixture();try{
      const first=f.save();
      expect(first.ok).toBe(true);
      const conflict=f.save();
      expect(conflict).toMatchObject({ok:false,campaignUpdatedAt:first.campaignUpdatedAt});
      expect(f.count('loteria_request_records')).toBe(1);
    }finally{f.db.close();}
  });
  it('rechaza alterar un arqueo cerrado aunque la revisión sea actual',()=>{
    const f=fixture();try{
      const first=f.save();expect(first.ok).toBe(true);
      f.payload.expectedCampaignUpdatedAt=first.campaignUpdatedAt;
      f.payload.expectedRequestUpdatedAt=Object.fromEntries(Object.entries(first.requestUpdatedAt));
      f.payload.campaignValue='{"year":2026,"cashArqueos":[{"id":"a1","at":"2026-01-01T10:00:00.000Z","recordedBy":"Test","expected":0,"counted":0,"difference":0,"cashPaid":0,"movementNet":0,"payments":[],"movements":[]}],"cashMovements":[]}';
      const saved=f.save();expect(saved.ok).toBe(true);
      f.payload.expectedCampaignUpdatedAt=saved.campaignUpdatedAt;
      f.payload.expectedRequestUpdatedAt={...saved.requestUpdatedAt};
      f.payload.campaignValue='{"year":2026,"cashArqueos":[],"cashMovements":[]}';
      expect(f.save()).toMatchObject({ok:false});
      const row=f.db.prepare("SELECT value_json FROM loteria_campaign_records WHERE id='2026'").get() as {value_json:string};
      expect(JSON.parse(row.value_json).cashArqueos).toHaveLength(1);
    }finally{f.db.close();}
  });
  it('error al insertar participante revierte también campaña y token',()=>{
    const f=fixture();try{
      f.db.exec("CREATE TRIGGER fail_request BEFORE INSERT ON loteria_request_records BEGIN SELECT RAISE(ABORT,'fallo simulado'); END;");
      expect(()=>f.save()).toThrow('fallo simulado');
      expect(f.count('loteria_campaign_records')).toBe(0);
      expect(f.count('loteria_request_records')).toBe(0);
      expect(f.count('app_metadata')).toBe(0);
    }finally{f.db.close();}
  });
  it('el adaptador preserva control OCC y forma del resultado',()=>{
    const f=fixture();try{
      const request={ownerId:'owner-a',payload:f.payload};
      expect(saveDetachedLotterySnapshot(f.db,request)).toMatchObject({ok:true});
      expect(saveDetachedLotterySnapshot(f.db,request)).toMatchObject({ok:false});
    }finally{f.db.close();}
  });
});
describe('PR460 · protocolo Lotería',()=>{
  const payload={ownerId:'owner-a',payload:{year:2026,campaignValue:'{}',requests:[],
    expectedCampaignUpdatedAt:null,expectedRequestUpdatedAt:{}}};
  it('solo acepta solicitudes y respuestas válidas',()=>{
    expect(isDetachedLotterySave(payload)).toBe(true);
    expect(isDetachedWriterRequest({kind:'detached:save-lottery',operationId:'o1',payload})).toBe(true);
    expect(isDetachedWriterResponse({kind:'detached:lottery-saved',operationId:'o1',
      result:{ok:true,message:'ok',status:{ready:true},campaignUpdatedAt:'v1',requestUpdatedAt:{}}})).toBe(true);
    expect(isDetachedLotterySave({...payload,ownerId:''})).toBe(false);
    expect(isDetachedLotterySave({...payload,payload:{...payload.payload,year:1}})).toBe(false);
    expect(isDetachedLotterySave({...payload,payload:{...payload.payload,requests:[{id:'r1',value:'{}'},{id:'r1',value:'{}'}]}})).toBe(false);
    expect(isDetachedWriterRequest({kind:'detached:save-lottery',operationId:'',payload})).toBe(false);
  });
});

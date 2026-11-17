/**
 * PR490 — Two independently opened SQLite handles, independent lock owners.
 * Automated filesystem contention checks. Local disk is NOT a substitute
 * for real Windows SMB/disconnection validation; see the runbook.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { createDatabaseLockManager } from './persistence/databaseLockManager.js';
import { withDetachedSqliteSmbLease } from './detachedWriterSmbLease.js';
import { saveDetachedJsonBatch } from './detachedJsonWriterCore.js';

const dirs: string[] = [];
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'traccion-two-instance-490-'));
  dirs.push(dir);
  const databasePath = join(dir, 'shared.sqlite');
  const a = new Database(databasePath);
  const b = new Database(databasePath);
  a.exec(`CREATE TABLE app_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE ticket_restaurante_calendar_records(
      id TEXT PRIMARY KEY,value_json TEXT NOT NULL,created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,deleted_at TEXT
    );`);
  const managerA = createDatabaseLockManager({getOwnerId:()=> 'pr490-instance-A'});
  const managerB = createDatabaseLockManager({getOwnerId:()=> 'pr490-instance-B'});
  const record = (id: string, revision: string, previous: string | null = null) => ({
    id, expectedUpdatedAt:previous,
    value:JSON.stringify({id,createdAt:'2026-11-17',updatedAt:revision}),
  });
  return {a,b,databasePath,managerA,managerB,record};
}
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});

describe('PR490 · dos conexiones/propietarios sobre una misma base',()=>{
  it('contención real del lock: B no guarda mientras A retiene la exclusión',async()=>{
    const f=fixture();
    let release!:()=>void;
    let entered!:()=>void;
    const inside=new Promise<void>(resolve=>{entered=resolve;});
    const hold=new Promise<void>(resolve=>{release=resolve;});
    try {
      const first=withDetachedSqliteSmbLease(f.managerA,f.databasePath,async()=>{
        entered();
        await hold;
        return saveDetachedJsonBatch(f.a,'ticket_restaurante_calendar_records',
          [f.record('first','v1')]);
      });
      try {
        await inside;
        expect(await f.managerB.readLock(f.managerB.getLockPath(f.databasePath)))
          .toMatchObject({ownerId:'pr490-instance-A'});
        await expect(f.managerB.acquireLock(f.databasePath,80)).rejects.toThrow();
        expect(f.b.prepare('SELECT id FROM ticket_restaurante_calendar_records').all()).toEqual([]);
      } finally {
        release();
        expect((await first).ok).toBe(true);
      }
      const second=await withDetachedSqliteSmbLease(f.managerB,f.databasePath,
        ()=>saveDetachedJsonBatch(f.b,'ticket_restaurante_calendar_records',
          [f.record('second','v1')]));
      expect(second.ok).toBe(true);
      expect((f.a.prepare('SELECT COUNT(*) AS n FROM ticket_restaurante_calendar_records')
        .get() as {n:number}).n).toBe(2);
    }finally{f.a.close();f.b.close();}
  });

  it('B detecta revisión obsoleta y no sobrescribe el guardado de A',async()=>{
    const f=fixture();
    try {
      expect((await withDetachedSqliteSmbLease(f.managerA,f.databasePath,()=>saveDetachedJsonBatch(
        f.a,'ticket_restaurante_calendar_records',[f.record('same','rev-A')]
      ))).ok).toBe(true);
      const stale=await withDetachedSqliteSmbLease(f.managerB,f.databasePath,()=>saveDetachedJsonBatch(
        f.b,'ticket_restaurante_calendar_records',[f.record('same','rev-B')]
      ));
      expect(stale).toEqual({ok:false,failedRecordId:'same',currentUpdatedAt:'rev-A'});
      expect((f.a.prepare("SELECT updated_at FROM ticket_restaurante_calendar_records WHERE id='same'")
        .get() as {updated_at:string}).updated_at).toBe('rev-A');
      const updated=await withDetachedSqliteSmbLease(f.managerB,f.databasePath,()=>saveDetachedJsonBatch(
        f.b,'ticket_restaurante_calendar_records',[f.record('same','rev-B','rev-A')]
      ));
      expect(updated.ok).toBe(true);
      expect((f.a.prepare("SELECT updated_at FROM ticket_restaurante_calendar_records WHERE id='same'")
        .get() as {updated_at:string}).updated_at).toBe('rev-B');
    }finally{f.a.close();f.b.close();}
  });

  it('deniega escribir cuando no se puede verificar propiedad del lock',async()=>{
    const f=fixture();
    let executed=false;
    const injected={...f.managerA,readLock:async(path:string)=>{
      const actual=await f.managerA.readLock(path);
      if(actual)throw new Error('SMB EIO simulado: propiedad no verificable');
      return actual;
    }};
    try{
      await expect(withDetachedSqliteSmbLease(injected,f.databasePath,()=>{
        executed=true;
        return saveDetachedJsonBatch(f.a,'ticket_restaurante_calendar_records',
          [f.record('must-not-save','v1')]);
      })).rejects.toThrow('SMB EIO simulado');
      expect(executed).toBe(false);
      expect((f.b.prepare('SELECT COUNT(*) AS n FROM ticket_restaurante_calendar_records')
        .get() as {n:number}).n).toBe(0);
    }finally{f.a.close();f.b.close();}
  });

  it('fallo tras commit no autoriza repetir una operación por inferencia',async()=>{
    const f=fixture();
    try{
      const result=await withDetachedSqliteSmbLease(f.managerA,f.databasePath,()=>saveDetachedJsonBatch(
        f.a,'ticket_restaurante_calendar_records',[f.record('receipt-first','v1')]));
      expect(result.ok).toBe(true);
      // Network failure after SQL may hide the response from the caller.
      // A second blind INSERT with expectedUpdatedAt:null MUST conflict.
      const duplicate=await withDetachedSqliteSmbLease(f.managerB,f.databasePath,()=>saveDetachedJsonBatch(
        f.b,'ticket_restaurante_calendar_records',[f.record('receipt-first','v2')]));
      expect(duplicate).toMatchObject({ok:false,failedRecordId:'receipt-first'});
      expect((f.b.prepare('SELECT COUNT(*) AS n FROM ticket_restaurante_calendar_records')
        .get() as {n:number}).n).toBe(1);
    }finally{f.a.close();f.b.close();}
  });
});

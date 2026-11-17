/**
 * PR502 · End-to-end experimental writer receipts and restart recovery,
 * using a real disposable SQLite database. Not production IPC or real SMB.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDurableWriterJournal } from './durableWriterJournal.js';
import { createDetachedWriterProcessStore } from './detachedWriterProcessStore.js';
import { saveWithDetachedCommitReceipt } from './detachedWriterCommitReceipt.js';
import { createExclusiveWriterRecoveryBarrier } from './exclusiveWriterRecoveryBarrier.js';
import { reconcileDetachedWriterAfterCrash } from './detachedWriterRecoveryWorkflow.js';
import {
  sendReceiptBackedWriterOperation,
  type ReceiptedWriterRequest,
} from './receiptBackedWriterTransport.js';

const dirs:string[]=[];
const expected={databaseUuid:'pr502-end-to-end',applicationId:'TrAccion',environment:'test',schemaVersion:1};

function setup() {
  const dir=mkdtempSync(join(tmpdir(),'traccion-pr502-e2e-'));
  dirs.push(dir);
  const databasePath=join(dir,'shared.sqlite');
  const db=new Database(databasePath);
  db.exec(`CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES(1,'2026-11-17');
    CREATE TABLE work(id TEXT PRIMARY KEY);`);
  for(const [key,value] of [
    ['database_uuid',expected.databaseUuid],['application_id',expected.applicationId],
    ['environment',expected.environment],['database_created_at','2026-11-17'],
  ]) db.prepare('INSERT INTO app_metadata VALUES(?,?,?)').run(key,value,'2026-11-17');
  const store=createDetachedWriterProcessStore(join(dir,'process.json'));
  const marker=store.claim(expected.databaseUuid,17);
  const journal=createDurableWriterJournal(join(dir,'journal.json'),expected.databaseUuid);
  const state={connected:true,checkCount:0};
  const manager={
    getLockPath:(p:string)=>p+'.lockdir',
    acquireLock:vi.fn(async()=>({
      ownerId:'recovery-pr502',hostname:'WIN-TEST',pid:300,username:'tester',
      createdAt:'2026-11-17T12:00:00Z',updatedAt:'2026-11-17T12:00:00Z',
    })),
    readLock:vi.fn(async()=>{
      state.checkCount+=1;
      if(!state.connected)throw new Error('SMB interrupted');
      return {ownerId:'recovery-pr502',hostname:'WIN-TEST',pid:300,username:'tester',
        createdAt:'2026-11-17T12:00:00Z',updatedAt:'2026-11-17T12:00:00Z'};
    }),
    releaseLock:vi.fn(async()=>undefined),
    startDatabaseLockHeartbeat:()=>setInterval(()=>undefined,30_000),
    pauseDatabaseLockHeartbeat:vi.fn(async()=>undefined),
    assertDatabaseWritesAllowed:()=>{
      if(!state.connected)throw new Error('SMB interrupted');
    },
  };
  const assertPreviousWriterTerminated=vi.fn(async()=>undefined);
  const withExclusiveRecoveryBarrier=createExclusiveWriterRecoveryBarrier({
    manager,databasePath,assertLocalSqliteInactive:vi.fn(async()=>undefined),
  });
  const recover=()=>reconcileDetachedWriterAfterCrash({
    store,journal,databasePath,expected,assertPreviousWriterTerminated,
    withExclusiveRecoveryBarrier,
  });
  const request=(operationId:string):ReceiptedWriterRequest=>({
    kind:'detached:save-criteria-receipted',operationId,generation:17,
    databaseUuid:expected.databaseUuid,
    record:{id:operationId,value:'{}',expectedUpdatedAt:null},
  });
  const deps={
    registerWriterOperation:(id:string,generation:number,backed:true)=>{
      journal.recordSubmitted(id,generation,backed);
    },
    acknowledgeWriterOperation:(id:string,generation:number)=>{
      journal.recordAcknowledged(id,generation);
    },
    workerUncertain:(generation:number)=>journal.markGenerationUnknown(generation),
    sendAndAwait:vi.fn(async(req:ReceiptedWriterRequest):Promise<unknown>=>{
      saveWithDetachedCommitReceipt(db,{
        operationId:req.operationId,generation:req.generation,databaseUuid:req.databaseUuid,
      },()=>{
        db.prepare('INSERT INTO work VALUES(?)').run(req.operationId);
        return {ok:true};
      });
      return {
        kind:'detached:criteria-receipted',operationId:req.operationId,
        result:{ok:true,updatedAt:'2026-11-17T12:00:00Z'},
      };
    }),
  };
  return {db,store,marker,journal,manager,state,request,deps,recover,
    assertPreviousWriterTerminated};
}
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});

describe('PR502 · integrated transport → receipt → EXIT → SMB reconciliation',()=>{
  it('ACK is not commit proof: real SQLite receipt resolves journal after EXIT and SMB barrier',async()=>{
    const f=setup();
    await sendReceiptBackedWriterOperation(f.deps,expected.databaseUuid,f.request('first'));
    expect(f.journal.unsettled()).toMatchObject([{id:'first',state:'acknowledged'}]);
    expect(f.db.prepare('SELECT id FROM work').all()).toEqual([{id:'first'}]);
    f.db.close();
    f.store.confirmExit(f.marker,0);
    await expect(f.recover()).resolves.toEqual({
      generation:17,receiptsReconciled:1,tombstoneRetained:true,
    });
    expect(f.assertPreviousWriterTerminated).toHaveBeenCalledTimes(2);
    expect(f.journal.snapshot()).toMatchObject([{id:'first',state:'reconciled',
      evidence:{outcome:'committed'}}]);
    expect(f.store.inspect()?.state).toBe('reconciled');
    expect(()=>f.store.claim(expected.databaseUuid,18)).toThrow('sesión escritora previa');
  });

  it('commit followed by lost ACK is uncertain; reconciliation finds commit without retry',async()=>{
    const f=setup();
    f.deps.sendAndAwait.mockImplementation(async(req:ReceiptedWriterRequest)=>{
      saveWithDetachedCommitReceipt(f.db,{
        operationId:req.operationId,generation:req.generation,databaseUuid:req.databaseUuid,
      },()=>{
        f.db.prepare('INSERT INTO work VALUES(?)').run(req.operationId);
        return {ok:true};
      });
      throw new Error('IPC disconnected after commit');
    });
    await expect(sendReceiptBackedWriterOperation(f.deps,expected.databaseUuid,f.request('crashed')))
      .rejects.toThrow('IPC disconnected');
    expect(f.deps.sendAndAwait).toHaveBeenCalledTimes(1);
    expect(f.journal.unsettled()).toMatchObject([{id:'crashed',state:'unknown'}]);
    f.db.close();
    f.store.confirmExit(f.marker,1);
    const recovered=await f.recover();
    expect(recovered.receiptsReconciled).toBe(1);
    expect(f.journal.snapshot()[0]?.evidence?.outcome).toBe('committed');
  });

  it('network loss during recovery cannot settle the durable marker',async()=>{
    const f=setup();
    await sendReceiptBackedWriterOperation(f.deps,expected.databaseUuid,f.request('queued'));
    f.db.close();
    f.store.confirmExit(f.marker,1);
    f.state.connected=false;
    await expect(f.recover()).rejects.toThrow('SMB interrupted');
    expect(f.store.inspect()?.state).toBe('exit-confirmed');
    expect(f.journal.unsettled()).toHaveLength(1);
    expect(f.manager.releaseLock).toHaveBeenCalledTimes(0);
  });

  it('without confirmed EXIT even a correct receipt cannot authorize recovery',async()=>{
    const f=setup();
    await sendReceiptBackedWriterOperation(f.deps,expected.databaseUuid,f.request('pending'));
    f.db.close();
    await expect(f.recover()).rejects.toThrow('Salida durable no confirmada');
    expect(f.assertPreviousWriterTerminated).not.toHaveBeenCalled();
    expect(f.store.inspect()?.state).toBe('launching');
    expect(f.journal.unsettled()).toHaveLength(1);
  });
});

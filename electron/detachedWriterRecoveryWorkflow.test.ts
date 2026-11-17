import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { createDurableWriterJournal } from './durableWriterJournal.js';
import { createDetachedWriterProcessStore } from './detachedWriterProcessStore.js';
import { saveWithDetachedCommitReceipt } from './detachedWriterCommitReceipt.js';
import { reconcileDetachedWriterAfterCrash } from './detachedWriterRecoveryWorkflow.js';

const directories:string[]=[];
const expected={ databaseUuid:'db-pr501', applicationId:'TrAccion',
  environment:'test', schemaVersion:1 };

function fixture() {
  const folder=mkdtempSync(join(tmpdir(),'traccion-pr501-recovery-'));
  directories.push(folder);
  const databasePath=join(folder,'shared.sqlite');
  const journalPath=join(folder,'journal.json');
  const markerPath=join(folder,'writer-process.json');
  const db=new Database(databasePath);
  db.exec(`CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES (1,'2026-11-17');
    CREATE TABLE work (id TEXT PRIMARY KEY);`);
  for(const [key,value] of [
    ['database_uuid',expected.databaseUuid],
    ['application_id',expected.applicationId],
    ['environment',expected.environment],
    ['database_created_at','2026-11-17'],
  ]) db.prepare('INSERT INTO app_metadata VALUES (?,?,?)').run(key,value,'2026-11-17');
  const store=createDetachedWriterProcessStore(markerPath);
  const marker=store.claim(expected.databaseUuid,4);
  store.confirmExit(marker,1);
  const journal=createDurableWriterJournal(journalPath,expected.databaseUuid);
  const terminated=vi.fn(async()=>undefined);
  let inside=false;
  const barrier=vi.fn(async(work:()=>Promise<unknown>)=>{
    if(inside)throw new Error('Barrera de recuperación reentrante');
    inside=true;
    try{return await work();}finally{inside=false;}
  });
  const run=(override:Partial<Parameters<typeof reconcileDetachedWriterAfterCrash>[0]>={})=>
    reconcileDetachedWriterAfterCrash({
      store,journal,databasePath,expected,
      assertPreviousWriterTerminated:async()=>{
        if(inside) expect(barrier).toHaveBeenCalled();
        await terminated();
      },
      withExclusiveRecoveryBarrier:<T>(work:()=>Promise<T>)=>barrier(work) as Promise<T>,
      ...override,
    });
  return {db,store,marker,journal,databasePath,terminated,barrier,run};
}
afterEach(()=>{for(const dir of directories.splice(0))rmSync(dir,{recursive:true,force:true});});

describe('PR501 · recovery integrates EXIT marker, SQLite receipts and SMB barrier',()=>{
  it('reconciles committed and absent operations under ONE exclusive barrier; retains marker',async()=>{
    const f=fixture();
    f.journal.recordSubmitted('committed',4,true);
    f.journal.recordAcknowledged('committed',4); // ACK alone proves nothing.
    f.journal.recordSubmitted('absent',4,true);
    saveWithDetachedCommitReceipt(f.db,
      {operationId:'committed',generation:4,databaseUuid:expected.databaseUuid},
      ()=>{f.db.prepare('INSERT INTO work VALUES (?)').run('written');return {ok:true};});
    f.db.close();
    const result=await f.run();
    expect(result).toEqual({generation:4,receiptsReconciled:2,tombstoneRetained:true});
    expect(f.terminated).toHaveBeenCalledTimes(2);
    expect(f.barrier).toHaveBeenCalledOnce();
    expect(f.journal.unsettled()).toEqual([]);
    expect(f.journal.snapshot().map(e=>e.evidence?.outcome)).toEqual(['committed','not-committed']);
    expect(f.store.inspect()).toMatchObject({state:'reconciled',generation:4,exitCode:1});
    expect(()=>f.store.claim(expected.databaseUuid,5)).toThrow('sesión escritora previa');
    await expect(f.run()).rejects.toThrow('ya conciliada');
  });

  it('verifies SQLite identity even when there are no pending journal operations',async()=>{
    const f=fixture();
    f.db.close();
    const result=await f.run();
    expect(result.receiptsReconciled).toBe(0);
    expect(f.barrier).toHaveBeenCalledOnce();
    expect(f.terminated).toHaveBeenCalledTimes(2);
    expect(f.store.inspect()?.state).toBe('reconciled');
  });

  it('refuses an unconfirmed orphan, even if all receipts and SMB look healthy',async()=>{
    const f=fixture();
    f.db.close();
    const second=createDetachedWriterProcessStore(join(directories[directories.length-1]!,'another.json'));
    second.claim(expected.databaseUuid,4);
    await expect(f.run({store:second})).rejects.toThrow('Salida durable no confirmada');
    expect(f.terminated).not.toHaveBeenCalled();
    expect(f.barrier).not.toHaveBeenCalled();
  });

  it('refuses recovery when independent process termination cannot be established',async()=>{
    const f=fixture();
    f.db.close();
    f.terminated.mockRejectedValue(new Error('orphan may still be alive'));
    await expect(f.run()).rejects.toThrow('orphan may still be alive');
    expect(f.barrier).not.toHaveBeenCalled();
    expect(f.store.inspect()?.state).toBe('exit-confirmed');
  });

  it('refuses offline SMB before SQLite verification or tombstone settlement',async()=>{
    const f=fixture();
    f.db.close();
    f.barrier.mockRejectedValue(new Error('SMB offline'));
    await expect(f.run()).rejects.toThrow('SMB offline');
    expect(f.store.inspect()?.state).toBe('exit-confirmed');
  });

  it('requires repeated termination proof INSIDE barrier; never finalizes after a race',async()=>{
    const f=fixture();
    f.db.close();
    f.terminated.mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('previous writer detected'));
    await expect(f.run()).rejects.toThrow('previous writer detected');
    expect(f.store.inspect()?.state).toBe('exit-confirmed');
  });

  it('does not settle journal with legacy non-receipted operations',async()=>{
    const f=fixture();
    f.journal.recordSubmitted('legacy',4,false);
    f.db.close();
    await expect(f.run()).rejects.toThrow('sin protocolo de recibo');
    expect(f.store.inspect()?.state).toBe('exit-confirmed');
    expect(f.journal.unsettled()).toHaveLength(1);
  });

  it('rejects other generations before reconciling or deleting evidence',async()=>{
    const f=fixture();
    f.journal.recordSubmitted('wrong-generation',3,true);
    f.db.close();
    await expect(f.run()).rejects.toThrow('generaciones ajenas');
    expect(f.journal.unsettled()).toHaveLength(1);
    expect(f.store.inspect()?.state).toBe('exit-confirmed');
  });

  it('rejects damaged/mismatched SQLite identity and retains the tombstone',async()=>{
    const f=fixture();
    f.db.prepare("UPDATE app_metadata SET value='changed' WHERE key='database_uuid'").run();
    f.db.close();
    await expect(f.run()).rejects.toThrow('identidad');
    expect(f.store.inspect()?.state).toBe('exit-confirmed');
  });

  it('missing atomic receipt table is UNKNOWN, not evidence of non-commit',async()=>{
    const f=fixture();
    f.journal.recordSubmitted('not-proven',4,true);
    f.db.close();
    await expect(f.run()).rejects.toThrow('commit incierto');
    expect(f.store.inspect()?.state).toBe('exit-confirmed');
    expect(f.journal.unsettled()).toMatchObject([{state:'unknown'}]);
  });
});

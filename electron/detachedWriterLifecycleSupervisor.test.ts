import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DetachedWriterRequest } from './detachedCriteriaWriterProtocol.js';
import { createDetachedWriterProcessStore } from './detachedWriterProcessStore.js';
import { createDetachedWriterLifecycleSupervisor } from './detachedWriterLifecycleSupervisor.js';
import type { SupervisedDetachedChild } from './supervisedDetachedWriterSession.js';

const dirs: string[]=[];
const expected={databaseUuid:'writer-500',applicationId:'TrAccion',environment:'test',schemaVersion:1};
const proof={ownerId:'detached-writer:200:unique',hostname:'WIN-A',pid:200,
  createdAt:'2026-11-17T09:00:00Z'};
function fixture() {
  const folder=mkdtempSync(join(tmpdir(),'traccion-supervisor500-'));
  dirs.push(folder);
  const store=createDetachedWriterProcessStore(join(folder,'writer.json'));
  let message:(m:unknown)=>void=()=>undefined;
  let exit:(code:number)=>void=()=>undefined;
  const kill=vi.fn();
  const send=vi.fn<(request:DetachedWriterRequest)=>void>();
  const child: SupervisedDetachedChild={
    postMessage:send,kill,
    onMessage(handler){message=handler;},
    onExit(handler){exit=handler;},
  };
  const quarantine=vi.fn();
  const exitConfirmed=vi.fn();
  const verify=vi.fn(async()=>undefined);
  const spawn=vi.fn(()=>child);
  const supervisor=createDetachedWriterLifecycleSupervisor({
    databasePath:'X:/shared.sqlite',expected,store,createChild:spawn,
    verifyOwnership:verify,onUncertain:quarantine,
    onExitConfirmed:exitConfirmed,timeoutMs:20_000,
  });
  return {supervisor,store,spawn,send,kill,quarantine,exitConfirmed,verify,message:(m:unknown)=>message(m),exit:(code:number)=>exit(code)};
}
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});vi.useRealTimers();});

describe('PR500 · integrated fail-closed detached writer supervisor',()=>{
  it('persists claim BEFORE fork; requires READY and real SMB proof before verified',async()=>{
    const f=fixture();
    const originalSpawn=f.spawn.getMockImplementation()!;
    f.spawn.mockImplementation(()=>{
      expect(f.store.inspect()).toMatchObject({generation:3,state:'launching'});
      return originalSpawn();
    });
    const start=f.supervisor.start(3);
    f.message({kind:'detached:ready'});
    f.message({kind:'detached:session-opened',generation:3,proof});
    await start;
    expect(f.spawn).toHaveBeenCalledOnce();
    expect(f.verify).toHaveBeenCalledWith(proof);
    expect(f.supervisor.snapshot()).toMatchObject({started:true,verified:true,exitObserved:false});
    f.supervisor.requestStop();
    expect(f.kill).toHaveBeenCalledOnce();
    let done=false;
    const finished=f.supervisor.waitForConfirmedExit().then(()=>{done=true;});
    await Promise.resolve();
    expect(done).toBe(false);
    f.exit(0);
    await finished;
    expect(f.store.inspect()).toMatchObject({state:'exit-confirmed',exitCode:0});
    expect(f.exitConfirmed).toHaveBeenCalledWith(3,0);
    expect(f.supervisor.snapshot()).toMatchObject({verified:false,exitObserved:true,exitDurable:true});
  });

  it('never starts another writer when a durable marker survived an interrupted parent',async()=>{
    const f=fixture();
    f.store.claim(expected.databaseUuid,9);
    await expect(f.supervisor.start(10)).rejects.toThrow('sesión escritora previa');
    expect(f.spawn).not.toHaveBeenCalled();
    expect(f.supervisor.snapshot().started).toBe(false);
  });

  it('mismatched generation quarantines; kill alone is NOT confirmed EXIT',async()=>{
    const f=fixture();
    const starting=f.supervisor.start(4);
    f.message({kind:'detached:ready'});
    f.message({kind:'detached:session-opened',generation:5,proof});
    await expect(starting).rejects.toThrow('generación');
    expect(f.quarantine).toHaveBeenCalledWith(4);
    expect(f.kill).toHaveBeenCalled();
    expect(f.store.inspect()?.state).toBe('launching');
    const waiting=f.supervisor.waitForConfirmedExit();
    let resolved=false;
    void waiting.then(()=>{resolved=true;});
    await Promise.resolve();
    expect(resolved).toBe(false);
    f.exit(1);
    await waiting;
    expect(f.store.inspect()).toMatchObject({state:'exit-confirmed',exitCode:1});
    expect(f.supervisor.snapshot().verified).toBe(false);
  });

  it('no fallback or session verified after SMB verification fails',async()=>{
    const f=fixture();
    f.verify.mockRejectedValue(new Error('SMB offline'));
    const starting=f.supervisor.start(7);
    f.message({kind:'detached:ready'});
    f.message({kind:'detached:session-opened',generation:7,proof});
    await expect(starting).rejects.toThrow('SMB offline');
    expect(f.quarantine).toHaveBeenCalledWith(7);
    expect(f.kill).toHaveBeenCalledOnce();
    expect(f.store.inspect()?.state).toBe('launching');
    f.exit(1);
    await f.supervisor.waitForConfirmedExit();
    expect(f.supervisor.snapshot().verified).toBe(false);
  });

  it('durable EXIT persistence failure cannot be mistaken for permission to recover',async()=>{
    const f=fixture();
    const start=f.supervisor.start(12);
    f.message({kind:'detached:ready'});
    f.message({kind:'detached:session-opened',generation:12,proof});
    await start;
    vi.spyOn(f.store,'confirmExit').mockImplementation(()=>{
      throw new Error('local disk offline');
    });
    f.exit(0);
    await expect(f.supervisor.waitForConfirmedExit())
      .rejects.toThrow('no confirmada durablemente');
    expect(f.quarantine).toHaveBeenCalledWith(12);
    expect(f.supervisor.snapshot()).toMatchObject({exitObserved:true,exitDurable:false,verified:false});
    expect(f.store.inspect()?.state).toBe('launching');
  });

  it('startup timeout requests kill but cannot confirm EXIT until the child actually exits',async()=>{
    vi.useFakeTimers();
    const f=fixture();
    const starting=f.supervisor.start(15);
    const outcome=expect(starting).rejects.toThrow('Timeout');
    await vi.advanceTimersByTimeAsync(20_000);
    await outcome;
    expect(f.kill).toHaveBeenCalledOnce();
    expect(f.quarantine).toHaveBeenCalledWith(15);
    expect(f.store.inspect()?.state).toBe('launching');
    let exitConfirmed=false;
    const waiting=f.supervisor.waitForConfirmedExit().then(()=>{exitConfirmed=true;});
    await Promise.resolve();
    expect(exitConfirmed).toBe(false);
    f.exit(1);
    await waiting;
    expect(exitConfirmed).toBe(true);
    expect(f.store.inspect()).toMatchObject({state:'exit-confirmed',exitCode:1});
  });

  it('does not fork if timeout config is invalid',async()=>{
    const f=fixture();
    const other=createDetachedWriterLifecycleSupervisor({
      databasePath:'X:/db.sqlite',expected,store:f.store,createChild:f.spawn,
      verifyOwnership:f.verify,onUncertain:f.quarantine,onExitConfirmed:f.exitConfirmed,timeoutMs:0,
    });
    await expect(other.start(1)).rejects.toThrow('Timeout');
    expect(f.spawn).not.toHaveBeenCalled();
    expect(f.store.inspect()).toBeNull();
  });
});

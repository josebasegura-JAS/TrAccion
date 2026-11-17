import { describe, expect, it, vi } from 'vitest';
import type { DatabaseLockInfo } from './persistence/databaseLockManager.js';
import { createExclusiveWriterRecoveryBarrier } from './exclusiveWriterRecoveryBarrier.js';

const owner:DatabaseLockInfo={
  ownerId:'recovery-501',username:'tester',hostname:'WIN-A',pid:300,
  createdAt:'2026-11-17T12:00:00Z',updatedAt:'2026-11-17T12:00:00Z',
};
function fixture() {
  const events:string[]=[];
  const readLock=vi.fn(async (): Promise<DatabaseLockInfo | null>=>({...owner}));
  const acquireLock=vi.fn(async()=>{events.push('acquire');return {...owner};});
  const releaseLock=vi.fn(async()=>{events.push('release');});
  const pauseDatabaseLockHeartbeat=vi.fn(async()=>{events.push('pause');});
  const assertLocalSqliteInactive=vi.fn(async()=>{events.push('local-idle');});
  const manager={
    getLockPath:(p:string)=>p+'.lockdir',
    acquireLock,readLock,releaseLock,
    startDatabaseLockHeartbeat:()=>setInterval(()=>undefined,30_000),
    pauseDatabaseLockHeartbeat,
    assertDatabaseWritesAllowed:vi.fn(),
  };
  const barrier=createExclusiveWriterRecoveryBarrier({
    manager,databasePath:'X:/shared.sqlite',assertLocalSqliteInactive,
  });
  return {events,readLock,acquireLock,releaseLock,pauseDatabaseLockHeartbeat,
    assertLocalSqliteInactive,barrier};
}

describe('PR501 · exclusive SMB recovery window',()=>{
  it('verifies actual SMB owner before AND after callback, with heartbeat and release',async()=>{
    const f=fixture();
    const result=await f.barrier(async()=>{f.events.push('receipts');return 42;});
    expect(result).toBe(42);
    expect(f.readLock).toHaveBeenCalledTimes(2);
    expect(f.assertLocalSqliteInactive).toHaveBeenCalledTimes(3);
    expect(f.events).toEqual([
      'local-idle','acquire','local-idle','receipts','local-idle','pause','release',
    ]);
  });

  it('does not run verification when SMB owner differs from the acquired lock',async()=>{
    const f=fixture();
    f.readLock.mockResolvedValue({...owner,ownerId:'another'});
    const work=vi.fn(async()=>undefined);
    await expect(f.barrier(work)).rejects.toThrow('Propietario SMB');
    expect(work).not.toHaveBeenCalled();
    expect(f.releaseLock).toHaveBeenCalledOnce();
    await expect(f.barrier(work)).rejects.toThrow('ocupada');
  });

  it('does not report success if ownership is lost during a running reconciliation',async()=>{
    const f=fixture();
    f.readLock.mockResolvedValueOnce({...owner}).mockResolvedValueOnce(null);
    await expect(f.barrier(async()=> 'reconciled')).rejects.toThrow('Propietario SMB');
    expect(f.pauseDatabaseLockHeartbeat).toHaveBeenCalledOnce();
    expect(f.releaseLock).toHaveBeenCalledOnce();
  });

  it('refuses overlapping recovery attempts even from same process',async()=>{
    const f=fixture();
    let release!:()=>void;
    const pending=new Promise<void>(resolve=>{release=resolve;});
    let started!:()=>void;
    const entered=new Promise<void>(resolve=>{started=resolve;});
    const first=f.barrier(async()=>{started();await pending;return 1;});
    await entered;
    await expect(f.barrier(async()=>2)).rejects.toThrow('ocupada');
    release();
    expect(await first).toBe(1);
  });

  it('preserves the original reconciliation failure even when release also fails',async()=>{
    const f=fixture();
    f.releaseLock.mockRejectedValue(new Error('release SMB offline'));
    await expect(f.barrier(async()=>{
      throw new Error('original SQLite verification failed');
    })).rejects.toThrow('original SQLite verification failed');
    expect(f.pauseDatabaseLockHeartbeat).toHaveBeenCalledOnce();
    expect(f.releaseLock).toHaveBeenCalledOnce();
    await expect(f.barrier(async()=>42)).rejects.toThrow('ocupada');
  });

  it('retains lease if heartbeat suspension is uncertain, preventing a release race',async()=>{
    const f=fixture();
    f.pauseDatabaseLockHeartbeat.mockRejectedValue(new Error('heartbeat pause failed'));
    await expect(f.barrier(async()=>42)).rejects.toThrow('heartbeat pause failed');
    expect(f.releaseLock).not.toHaveBeenCalled();
    await expect(f.barrier(async()=>42)).rejects.toThrow('ocupada');
  });

  it('fails closed if local main SQLite work is still active',async()=>{
    const f=fixture();
    f.assertLocalSqliteInactive.mockRejectedValue(new Error('main handle still open'));
    await expect(f.barrier(async()=>1)).rejects.toThrow('main handle');
    expect(f.acquireLock).not.toHaveBeenCalled();
  });
});

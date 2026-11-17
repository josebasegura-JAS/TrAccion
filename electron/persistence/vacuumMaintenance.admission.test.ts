import { describe, expect, it, vi } from 'vitest';
import type { Database } from 'better-sqlite3';
import { sqliteIndependentActivityTracker } from '../sqliteIndependentActivityTracker.js';
import {
  vacuumDatabase, getVacuumStatus, runScheduledVacuumIfDue,
  type VacuumMaintenanceDependencies,
} from './vacuumMaintenance.js';

function dependencies(): VacuumMaintenanceDependencies {
  return {
    getDatabase: vi.fn(() => null),
    getStatus: vi.fn(() => ({
      ready:false, engine:'better-sqlite3' as const, phase:'error' as const,
      path:'/invalid/empty.sqlite',schemaVersion:0,isDefaultPath:false,lockPath:'',
    })),
    acquireLock: vi.fn(async () => { throw new Error('must not acquire'); }),
    releaseLock: vi.fn(async () => undefined),
    getLockPath: (path) => path+'.lockdir',
    startDatabaseLockHeartbeat: () => setInterval(() => undefined, 30_000),
    isLockContentionError: () => false,
  };
}

describe('PR495 · las rutas VACUUM requieren barrera principal', () => {
  it('bloquea vacuum manual, programado y estado antes de cualquier acceso DB', async () => {
    const deps=dependencies();
    const ticket=sqliteIndependentActivityTracker.beginFreeze();
    try {
      await expect(vacuumDatabase(deps,'manual')).rejects.toThrow('suspendida');
      await expect(runScheduledVacuumIfDue(deps)).rejects.toThrow('suspendida');
      await expect(getVacuumStatus(deps)).rejects.toThrow('suspendida');
      expect(deps.getDatabase).not.toHaveBeenCalled();
      expect(deps.getStatus).not.toHaveBeenCalled();
      expect(deps.acquireLock).not.toHaveBeenCalled();
    } finally { sqliteIndependentActivityTracker.abortFreeze(ticket); }
  });

  it('espera la adquisición lenta del lock y todo el VACUUM antes de drenar', async () => {
    let release!: () => void;
    const gate=new Promise<void>(resolve => { release=resolve; });
    let entered!: () => void;
    const enteredLock=new Promise<void>(resolve => { entered=resolve; });
    const fakeDb={
      exec: vi.fn(),
      prepare: vi.fn(() => ({run: vi.fn()})),
    } as unknown as Database;
    const deps=dependencies();
    deps.getDatabase=()=>fakeDb;
    deps.getStatus=()=>({
      ready:true, engine:'better-sqlite3', phase:'active',
      path:'/nonexistent/pr495.sqlite',schemaVersion:1,
      isDefaultPath:false,lockPath:'/nonexistent/pr495.sqlite.lockdir',
    });
    deps.acquireLock=async()=> {
      entered();
      await gate;
      return {
        ownerId:'pr495',username:'tester',hostname:'local',pid:1,
        createdAt:'2026-11-17',updatedAt:'2026-11-17',
      };
    };
    const releaseSpy=vi.fn(async()=>undefined);
    deps.releaseLock=releaseSpy;
    const work=vacuumDatabase(deps,'manual');
    await enteredLock;
    const ticket=sqliteIndependentActivityTracker.beginFreeze();
    let drained=false;
    const drain=sqliteIndependentActivityTracker.waitForDrain(ticket)
      .then(()=>{drained=true;});
    try {
      await Promise.resolve();
      expect(drained).toBe(false);
      expect(sqliteIndependentActivityTracker.snapshot().labels)
        .toContain('sqlite:vacuum-full');
      release();
      expect((await work).ok).toBe(true);
      await drain;
      expect(drained).toBe(true);
      expect(fakeDb.exec).toHaveBeenCalledWith('VACUUM');
      expect(fakeDb.exec).toHaveBeenCalledWith('ANALYZE');
      expect(releaseSpy).toHaveBeenCalledOnce();
    } finally {
      release();
      sqliteIndependentActivityTracker.abortFreeze(ticket);
    }
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseLockManager, type DatabaseLockInfo } from './databaseLockManager.js';

const lock: DatabaseLockInfo = {
  ownerId: 'test-local', username: 'test', hostname: 'test-machine',
  pid: 1, createdAt: '2026-11-13T10:00:00.000Z', updatedAt: '2026-11-13T10:00:00.000Z',
};

afterEach(() => { vi.useRealTimers(); });

describe('PR9D-5E · control del heartbeat sin tocar archivos SMB reales', () => {
  it('no inicia ticks durante una pausa y reutiliza el mismo timer tras reanudar', async () => {
    vi.useFakeTimers();
    let reads = 0;
    const manager = createDatabaseLockManager({
      getOwnerId: () => lock.ownerId,
      observeHeartbeat: async () => { reads += 1; },
    });
    const timer = manager.startDatabaseLockHeartbeat('Z:/test.lockdir', lock);
    try {
      await manager.pauseDatabaseLockHeartbeat(timer);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(reads).toBe(0);
      manager.resumeDatabaseLockHeartbeat(timer);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(reads).toBe(1);
      await manager.pauseDatabaseLockHeartbeat(timer);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(reads).toBe(1);
    } finally {
      clearInterval(timer);
    }
  });

  it('espera a que termine un heartbeat ya iniciado antes de resolver pause', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const manager = createDatabaseLockManager({
      getOwnerId: () => lock.ownerId,
      observeHeartbeat: () => new Promise<void>(resolve => { finish = resolve; }),
    });
    const timer = manager.startDatabaseLockHeartbeat('Z:/test.lockdir', lock);
    try {
      await vi.advanceTimersByTimeAsync(10_000);
      let drained = false;
      const paused = manager.pauseDatabaseLockHeartbeat(timer).then(() => { drained = true; });
      await Promise.resolve();
      expect(drained).toBe(false);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(drained).toBe(false);
      finish();
      await paused;
      expect(drained).toBe(true);
    } finally {
      clearInterval(timer);
    }
  });
});

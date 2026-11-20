import { afterEach, describe, expect, it, vi } from 'vitest';
import { open } from 'node:fs/promises';
import { createDatabaseLockManager } from './databaseLockManager.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, open: vi.fn(actual.open) };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(open).mockReset();
});

describe('bloqueo de escrituras por pérdida de heartbeat SQLite', () => {
  const lock = {
    ownerId: 'equipo-a',
    username: 'usuario',
    hostname: 'equipo-a',
    pid: 101,
    createdAt: '2026-11-04T08:00:00.000Z',
    updatedAt: '2026-11-04T08:00:00.000Z',
  };

  it('tras cinco fallos bloquea y permite recuperar solo mediante clearHeartbeatBlock', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(open).mockRejectedValue(Object.assign(new Error('Sin acceso a SMB'), { code: 'EIO' }));
    const manager = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    const notifications: boolean[] = [];
    manager.setConnectivityIssueNotifier((issue) => notifications.push(issue.blocked));
    const timer = manager.startDatabaseLockHeartbeat('Z:/inaccesible.lockdir', lock);
    try {
      for (let n = 0; n < 5; n += 1) {
        await vi.advanceTimersByTimeAsync(10_000);
      }
      expect(manager.isDatabaseWriteBlockedByHeartbeat()).toBe(true);
      expect(() => manager.assertDatabaseWritesAllowed()).toThrow('Escritura bloqueada');
      expect(notifications).toContain(true);

      // Simula el final de la operación exclusiva: ya no habrá heartbeat
      // periódico. La validación de salud puede ahora limpiar el bloqueo.
      clearInterval(timer);
      expect(manager.clearHeartbeatBlock()).toBe(true);
      expect(manager.isDatabaseWriteBlockedByHeartbeat()).toBe(false);
      expect(() => manager.assertDatabaseWritesAllowed()).not.toThrow();
      expect(notifications.at(-1)).toBe(false);
    } finally {
      clearInterval(timer);
    }
  });

  it('no inicia una segunda apertura SMB mientras la primera permanece pendiente', async () => {
    vi.useFakeTimers();
    vi.mocked(open).mockImplementation(() => new Promise<never>(() => undefined));
    const manager = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    const timer = manager.startDatabaseLockHeartbeat('Z:/inaccesible.lockdir', lock);
    try {
      await vi.advanceTimersByTimeAsync(60_000);
      expect(vi.mocked(open)).toHaveBeenCalledTimes(1);
      // La comprobación de salud no debe desbloquear si la operación de
      // heartbeat que no responde todavía tiene resultado indeterminado.
      expect(manager.clearHeartbeatBlock()).toBe(false);
    } finally {
      clearInterval(timer);
    }
  });
});

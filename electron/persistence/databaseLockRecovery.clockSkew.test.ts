import { describe, expect, it, vi } from 'vitest';
import { forceReleaseDatabaseLockWithRecovery } from './databaseLockRecovery.js';
import type { DatabaseLockInfo } from './sqliteLockLifecycle.js';

const baseLock: DatabaseLockInfo = {
  ownerId: 'otro-equipo',
  username: 'usuario',
  hostname: 'pc-remoto',
  pid: 123,
  createdAt: '2026-11-11T11:00:00.000Z',
  updatedAt: '2026-11-11T11:00:00.000Z',
};

describe('liberación manual de lock con relojes potencialmente desfasados', () => {
  it.each([
    ['marca en el futuro', '2099-11-11T12:00:00.000Z'],
    ['marca inválida', 'fecha-ilegible'],
  ])('rechaza %s sin intentar activar ni borrar el bloqueo', async (_name, updatedAt) => {
    const status = { lockPath: '/inexistente/traccion.sqlite.lockdir', message: 'Base bloqueada' };
    const activateDatabase = vi.fn(async () => status);
    const setStatus = vi.fn();
    const result = await forceReleaseDatabaseLockWithRecovery({
      getStatus: () => status,
      readLock: async () => ({ ...baseLock, updatedAt }),
      getLockInfoPath: (lockPath) => `${lockPath}/owner.json`,
      isDatabaseActive: () => false,
      getConfiguredDirectory: async () => ({ directoryPath: '/inexistente', isDefaultPath: false }),
      activateDatabase,
      setStatus,
      errorMessage: (error) => String(error),
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('No se libera');
    expect(result.status).toBe(status);
    expect(activateDatabase).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
  });
});

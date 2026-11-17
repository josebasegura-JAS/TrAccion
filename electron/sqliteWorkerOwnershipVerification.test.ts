import { describe, expect, it, vi } from 'vitest';
import { verifyDetachedWorkerSmbOwner, type SqliteWorkerLockProof } from './sqliteWorkerOwnershipVerification.js';

const expected: SqliteWorkerLockProof = {
  ownerId: 'detached-writer:123:unique',
  hostname: 'WIN-A', pid: 123, createdAt: '2026-11-17T07:00:00.000Z',
};
const fullLock = { ...expected, username: 'operator', updatedAt: expected.createdAt };
function fixture(lock: typeof fullLock | null = fullLock) {
  const readLock = vi.fn(async () => lock);
  const assertDatabaseWritesAllowed = vi.fn();
  return { readLock, assertDatabaseWritesAllowed, getLockPath: (db: string) => db + '.lockdir' };
}
describe('PR479 · comprobación de propietario real SMB', () => {
  it('acepta solo el propietario y generación de proceso confirmados', async () => {
    const manager = fixture();
    await verifyDetachedWorkerSmbOwner(manager, 'X:/traccion.sqlite', expected);
    expect(manager.readLock).toHaveBeenCalledWith('X:/traccion.sqlite.lockdir');
    expect(manager.assertDatabaseWritesAllowed).toHaveBeenCalledTimes(2);
  });
  it('rechaza ausencia, identidad diferente y desconexión SMB', async () => {
    await expect(verifyDetachedWorkerSmbOwner(fixture(null), 'X:/traccion.sqlite', expected)).rejects.toThrow('propiedad');
    await expect(verifyDetachedWorkerSmbOwner(fixture({ ...fullLock, pid: 777 }), 'X:/traccion.sqlite', expected)).rejects.toThrow('propiedad');
    const blocked = fixture();
    blocked.readLock.mockRejectedValue(new Error('SMB desconectado'));
    await expect(verifyDetachedWorkerSmbOwner(blocked, 'X:/traccion.sqlite', expected)).rejects.toThrow('SMB desconectado');
  });
  it('rechaza evidencia incompleta aunque exista un lock', async () => {
    const manager = fixture();
    await expect(verifyDetachedWorkerSmbOwner(manager, 'X:/traccion.sqlite',
      { ...expected, ownerId: 'main:123' })).rejects.toThrow('incompleta');
    expect(manager.readLock).not.toHaveBeenCalled();
  });
});

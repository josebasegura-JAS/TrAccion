import { describe, it, expect } from 'vitest';
import { backupsAreSettled, isBackupSnapshot, SQLITE_ENGINE_IPC_TIMEOUT_MS, SQLITE_ENGINE_REQUEST_TIMEOUT_MS } from './sqliteEngineSafety.js';

describe('estado seguro del supervisor SQLite', () => {
  it('rechaza estados desconocidos, incompletos o pendientes', () => {
    const zero = { activeBackupOperations: 0, queuedBackupOperations: 0, pendingBackupRevisions: 0 };
    expect(isBackupSnapshot(zero)).toBe(true);
    expect(backupsAreSettled(zero)).toBe(true);
    expect(backupsAreSettled(undefined)).toBe(false);
    expect(backupsAreSettled({ ...zero, pendingBackupRevisions: 1 })).toBe(false);
    expect(backupsAreSettled({ ...zero, activeBackupOperations: 1 })).toBe(false);
    expect(isBackupSnapshot({ ...zero, queuedBackupOperations: -1 })).toBe(false);
    expect(isBackupSnapshot({ ...zero, activeBackupOperations: '0' })).toBe(false);
    expect(isBackupSnapshot({ activeBackupOperations: 0 })).toBe(false);
  });
  it('deja margen al arranque del worker y a su timeout de transporte', () => {
    expect(SQLITE_ENGINE_IPC_TIMEOUT_MS).toBeGreaterThan(SQLITE_ENGINE_REQUEST_TIMEOUT_MS + 15_000);
  });
});

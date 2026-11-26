import { describe, expect, it, vi } from 'vitest';
import { createPersistenceOperations, isEngineReadOnlyOperation, SQLITE_ENGINE_OPERATIONS } from './sqliteEngineOperations.js';
import type * as Persistence from './sqlitePersistence.js';

describe('contrato de operaciones SQLite aisladas', () => {
  it('expone únicamente operaciones declaradas y conserva argumentos', async () => {
    const handler = vi.fn(async (...args: unknown[]) => args);
    const fake = Object.fromEntries(SQLITE_ENGINE_OPERATIONS.map((name) => [name, handler])) as unknown as typeof Persistence;
    const operations = createPersistenceOperations(fake);
    expect(operations.size).toBe(SQLITE_ENGINE_OPERATIONS.length);
    expect(operations.has('constructor')).toBe(false);
    expect(operations.has('setDatabaseConnectivityIssueNotifier')).toBe(false);
    expect(operations.has('closeSqlitePersistence')).toBe(true);
    await expect(operations.get('saveTaskRecordIfUnchanged')?.({ id: '1' })).resolves.toEqual([{ id: '1' }]);
    expect(handler).toHaveBeenCalledWith({ id: '1' });
  });
});

it('solo clasifica como lecturas las operaciones revisadas', () => {
  expect(isEngineReadOnlyOperation('getPersistedRecordSnapshot')).toBe(true);
  expect(isEngineReadOnlyOperation('getPersistedRecordsTokenSnapshot')).toBe(true);
  expect(isEngineReadOnlyOperation('loadPersistedRecordsHydrationSnapshot')).toBe(true);
  for (const name of ['loadTaskRecordsSnapshot', 'loadTeletrabajoRecordsSnapshot',
    'restoreLocalBackup', 'listLocalBackups', 'checkSqliteHealth', 'unknown']) {
    expect(isEngineReadOnlyOperation(name)).toBe(false);
  }
});

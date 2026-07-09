import { describe, expect, it, vi } from 'vitest';
import { createTaskRepository } from './taskRepository';

const readyStatus = {
  ready: true,
  engine: 'better-sqlite3' as const,
  phase: 'active' as const,
  path: '/x.sqlite',
  schemaVersion: 17,
  isDefaultPath: false,
  lockPath: '/x.lockdir',
};

const notReadyStatus = { ...readyStatus, ready: false, phase: 'locked' as const };

function buildDb(overrides: { get?: unknown; all?: unknown[]; runChanges?: number } = {}) {
  const get = vi.fn(() => overrides.get ?? { count: 0 });
  const all = vi.fn(() => overrides.all ?? []);
  const run = vi.fn(() => ({ changes: overrides.runChanges ?? 1 }));
  const prepare = vi.fn(() => ({ get, all, run }));
  const transaction = vi.fn((fn: () => unknown) => () => fn());

  return { get, all, run, prepare, transaction };
}

function buildDeps(overrides: Partial<Parameters<typeof createTaskRepository>[0]> = {}) {
  const db = buildDb();

  return {
    safeDatabaseOperation: vi.fn(async (operation: () => unknown) => operation()),
    getSqliteStatus: vi.fn(() => readyStatus),
    requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createTaskRepository>[0]['requireDatabase']>),
    readPersistedRecordByKey: vi.fn(() => null),
    isJsonObjectWithStringId: vi.fn(
      (value: unknown): value is { id: string; createdAt?: unknown; updatedAt?: unknown; deletedAt?: unknown } =>
        Boolean(value && typeof value === 'object' && 'id' in value),
    ),
    isCountRow: vi.fn((value: unknown): value is { count: number } =>
      Boolean(value && typeof value === 'object' && typeof (value as { count?: unknown }).count === 'number'),
    ),
    isUpdatedAtRow: vi.fn((value: unknown): value is { updated_at: string } =>
      Boolean(value && typeof value === 'object' && typeof (value as { updated_at?: unknown }).updated_at === 'string'),
    ),
    updateRefreshMetadata: vi.fn(),
    enqueueLocalBackup: vi.fn(),
    assertDatabaseWritesAllowed: vi.fn(),
    isDatabaseWriteBlockedByHeartbeat: vi.fn(() => false),
    ...overrides,
  };
}

describe('createTaskRepository', () => {
  it('loadTaskRecordsSnapshot devuelve lista vacía sin tocar la base si SQLite no está activo', async () => {
    const deps = buildDeps({ getSqliteStatus: vi.fn(() => notReadyStatus) });
    const { loadTaskRecordsSnapshot } = createTaskRepository(deps);

    const result = await loadTaskRecordsSnapshot();

    expect(result).toEqual({ status: notReadyStatus, records: [] });
    expect(deps.requireDatabase).not.toHaveBeenCalled();
  });

  it('saveTaskRecordIfUnchanged rechaza el guardado si el heartbeat bloquea la escritura', async () => {
    const deps = buildDeps({ isDatabaseWriteBlockedByHeartbeat: vi.fn(() => true) });
    const { saveTaskRecordIfUnchanged } = createTaskRepository(deps);

    const result = await saveTaskRecordIfUnchanged({ id: 'abc', value: '{}', expectedUpdatedAt: null });

    expect(result.ok).toBe(false);
    expect(deps.enqueueLocalBackup).not.toHaveBeenCalled();
  });

  it('saveTaskRecordIfUnchanged rechaza el guardado si el updatedAt esperado no coincide (conflicto OCC)', async () => {
    const db = buildDb({ get: { updated_at: '2026-01-02T00:00:00.000Z' } });
    const deps = buildDeps({
      requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createTaskRepository>[0]['requireDatabase']>),
    });
    const { saveTaskRecordIfUnchanged } = createTaskRepository(deps);

    const result = await saveTaskRecordIfUnchanged({
      id: 'abc',
      value: '{}',
      expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('modificada por otro usuario');
    expect(deps.enqueueLocalBackup).not.toHaveBeenCalled();
  });

  it('saveTaskRecordIfUnchanged guarda y crea backup cuando el updatedAt esperado coincide (tarea nueva)', async () => {
    const db = buildDb({ get: { updated_at: null } });
    const deps = buildDeps({
      requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createTaskRepository>[0]['requireDatabase']>),
    });
    const { saveTaskRecordIfUnchanged } = createTaskRepository(deps);

    const result = await saveTaskRecordIfUnchanged({ id: 'abc', value: '{}', expectedUpdatedAt: null });

    expect(result.ok).toBe(true);
    expect(deps.updateRefreshMetadata).toHaveBeenCalledTimes(1);
    expect(deps.enqueueLocalBackup).toHaveBeenCalledWith('save:task_records');
  });

  it('readTaskRecords arma el WHERE de "active"/"historical" según el filtro (comprobado vía la SQL preparada)', async () => {
    const db = buildDb();
    const deps = buildDeps({
      requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createTaskRepository>[0]['requireDatabase']>),
    });
    const { loadTaskRecordsSnapshot } = createTaskRepository(deps);

    await loadTaskRecordsSnapshot({ mode: 'active' });

    const sqlCalls = db.prepare.mock.calls.map((call) => call[0] as string);
    expect(sqlCalls.some((sql) => sql.includes("estado') <> 'cerrada'"))).toBe(true);
  });

  it('resetMigrationState existe y es invocable (usado al cerrar/cambiar de base)', () => {
    const deps = buildDeps();
    const { resetMigrationState } = createTaskRepository(deps);

    expect(() => resetMigrationState()).not.toThrow();
  });

  it('el flag de migración evita releer el registro legacy una segunda vez, y cada repositorio tiene el suyo propio', async () => {
    const db = buildDb({ get: { count: 0 } });
    const deps = buildDeps({
      requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createTaskRepository>[0]['requireDatabase']>),
    });

    const repoA = createTaskRepository(deps);
    await repoA.loadTaskRecordsSnapshot();
    await repoA.loadTaskRecordsSnapshot();
    expect(deps.readPersistedRecordByKey).toHaveBeenCalledTimes(1);

    const repoB = createTaskRepository(deps);
    await repoB.loadTaskRecordsSnapshot();
    expect(deps.readPersistedRecordByKey).toHaveBeenCalledTimes(2);
  });
});

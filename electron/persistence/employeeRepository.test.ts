import { describe, expect, it, vi } from 'vitest';
import { createEmployeeRepository } from './employeeRepository';

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

function buildDeps(overrides: Partial<Parameters<typeof createEmployeeRepository>[0]> = {}) {
  const db = buildDb();

  return {
    safeDatabaseOperation: vi.fn(async (operation: () => unknown) => operation()),
    getSqliteStatus: vi.fn(() => readyStatus),
    requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createEmployeeRepository>[0]['requireDatabase']>),
    readPersistedRecordByKey: vi.fn(() => null),
    isCountRow: vi.fn((value: unknown): value is { count: number } =>
      Boolean(value && typeof value === 'object' && typeof (value as { count?: unknown }).count === 'number'),
    ),
    updateRefreshMetadata: vi.fn(),
    enqueueLocalBackup: vi.fn(),
    assertDatabaseWritesAllowed: vi.fn(),
    isDatabaseWriteBlockedByHeartbeat: vi.fn(() => false),
    ...overrides,
  };
}

describe('createEmployeeRepository', () => {
  it('loadEmployeeRecordsSnapshot devuelve lista vacía sin tocar la base si SQLite no está activo', async () => {
    const deps = buildDeps({ getSqliteStatus: vi.fn(() => notReadyStatus) });
    const { loadEmployeeRecordsSnapshot } = createEmployeeRepository(deps);

    const result = await loadEmployeeRecordsSnapshot();

    expect(result).toEqual({ status: notReadyStatus, records: [] });
    expect(deps.requireDatabase).not.toHaveBeenCalled();
  });

  it('saveEmployeeRecordIfUnchanged rechaza el guardado si el heartbeat bloquea la escritura', async () => {
    const deps = buildDeps({ isDatabaseWriteBlockedByHeartbeat: vi.fn(() => true) });
    const { saveEmployeeRecordIfUnchanged } = createEmployeeRepository(deps);

    const result = await saveEmployeeRecordIfUnchanged({ id: '100', value: '{}', expectedValue: null });

    expect(result.ok).toBe(false);
    expect(deps.enqueueLocalBackup).not.toHaveBeenCalled();
  });

  it('saveEmployeeRecordIfUnchanged rechaza el guardado si el valor esperado no coincide (conflicto OCC)', async () => {
    const db = buildDb({ get: { value_json: '{"nombre":"actual"}' } });
    const deps = buildDeps({
      requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createEmployeeRepository>[0]['requireDatabase']>),
    });
    const { saveEmployeeRecordIfUnchanged } = createEmployeeRepository(deps);

    const result = await saveEmployeeRecordIfUnchanged({
      id: '100',
      value: '{"nombre":"nuevo"}',
      expectedValue: '{"nombre":"viejo"}',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('modificada por otro usuario');
    expect(deps.enqueueLocalBackup).not.toHaveBeenCalled();
  });

  it('saveEmployeeRecordIfUnchanged inserta y crea backup cuando el registro es nuevo (expectedValue null)', async () => {
    const db = buildDb({ get: null, runChanges: 1 });
    const deps = buildDeps({
      requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createEmployeeRepository>[0]['requireDatabase']>),
    });
    const { saveEmployeeRecordIfUnchanged } = createEmployeeRepository(deps);

    const result = await saveEmployeeRecordIfUnchanged({ id: '100', value: '{"nombre":"nuevo"}', expectedValue: null });

    expect(result.ok).toBe(true);
    expect(deps.updateRefreshMetadata).toHaveBeenCalledTimes(1);
    expect(deps.enqueueLocalBackup).toHaveBeenCalledWith('save:employee_records');
  });

  it('saveEmployeeRecordsIfUnchanged corta el lote entero si un registro tiene conflicto OCC', async () => {
    const db = buildDb({ get: { value_json: '{"nombre":"actual"}' } });
    const deps = buildDeps({
      requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createEmployeeRepository>[0]['requireDatabase']>),
    });
    const { saveEmployeeRecordsIfUnchanged } = createEmployeeRepository(deps);

    const result = await saveEmployeeRecordsIfUnchanged([
      { id: '100', value: '{"nombre":"nuevo"}', expectedValue: '{"nombre":"viejo"}' },
    ]);

    expect(result.ok).toBe(false);
    expect(result.saved).toBe(0);
    expect(deps.enqueueLocalBackup).not.toHaveBeenCalled();
  });

  it('saveEmployeeRecordsIfUnchanged solo hace backup si se guardó al menos un registro', async () => {
    const db = buildDb({ get: null, runChanges: 1 });
    const deps = buildDeps({
      requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createEmployeeRepository>[0]['requireDatabase']>),
    });
    const { saveEmployeeRecordsIfUnchanged } = createEmployeeRepository(deps);

    const result = await saveEmployeeRecordsIfUnchanged([
      { id: '100', value: '{"nombre":"nuevo"}', expectedValue: null },
    ]);

    expect(result.ok).toBe(true);
    expect(result.saved).toBe(1);
    expect(deps.enqueueLocalBackup).toHaveBeenCalledWith('batch-save:employee_records');
  });

  it('resetMigrationState existe y es invocable (usado al cerrar/cambiar de base)', () => {
    const deps = buildDeps();
    const { resetMigrationState } = createEmployeeRepository(deps);

    expect(() => resetMigrationState()).not.toThrow();
  });

  it('el flag de migración evita releer el registro legacy una segunda vez, y cada repositorio tiene el suyo propio', async () => {
    const db = buildDb({ get: { count: 0 } });
    const deps = buildDeps({
      requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createEmployeeRepository>[0]['requireDatabase']>),
    });

    const repoA = createEmployeeRepository(deps);
    await repoA.loadEmployeeRecordsSnapshot();
    await repoA.loadEmployeeRecordsSnapshot();
    expect(deps.readPersistedRecordByKey).toHaveBeenCalledTimes(1);

    const repoB = createEmployeeRepository(deps);
    await repoB.loadEmployeeRecordsSnapshot();
    expect(deps.readPersistedRecordByKey).toHaveBeenCalledTimes(2);
  });
});

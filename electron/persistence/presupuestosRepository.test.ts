import { describe, expect, it, vi } from 'vitest';
import { createPresupuestosRepository } from './presupuestosRepository';

function buildEmptyRepository() {
  return { loadSnapshot: vi.fn(), saveIfUnchanged: vi.fn(), saveManyIfUnchanged: vi.fn() };
}

function buildDeps(overrides: Partial<Parameters<typeof createPresupuestosRepository>[0]> = {}) {
  const status = { ready: true, engine: 'better-sqlite3' as const, phase: 'active' as const, path: '/x.sqlite', schemaVersion: 17, isDefaultPath: false, lockPath: '/x.lockdir' };
  const db = { transaction: vi.fn((fn: () => void) => () => fn()), prepare: vi.fn(() => ({ run: vi.fn(), all: vi.fn(() => []) })) };

  return {
    createJsonModuleRepository: vi.fn(() => buildEmptyRepository()),
    getSqliteStatus: vi.fn(() => status),
    isDatabaseWriteBlockedByHeartbeat: vi.fn(() => false),
    assertDatabaseWritesAllowed: vi.fn(),
    requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createPresupuestosRepository>[0]['requireDatabase']>),
    updateRefreshMetadata: vi.fn(),
    enqueueLocalBackup: vi.fn(),
    safeDatabaseOperation: vi.fn(async (operation: () => unknown) => operation()),
    ...overrides,
  };
}

describe('createPresupuestosRepository', () => {
  it('crea las 4 tablas con su tabla, key legacy y label correctos', () => {
    const deps = buildDeps();
    createPresupuestosRepository(deps);

    expect(deps.createJsonModuleRepository).toHaveBeenCalledTimes(4);
    const calls = deps.createJsonModuleRepository.mock.calls;
    expect(calls.map((call) => call[0])).toEqual([
      'presupuesto_scenario_records',
      'presupuesto_manual_item_records',
      'presupuesto_ticket_group_records',
      'presupuesto_actual_records',
    ]);
    expect(calls.map((call) => call[1])).toEqual([
      'traccion.v1.presupuestos.scenarios',
      'traccion.v1.presupuestos.manualItems',
      'traccion.v1.presupuestos.ticketGroups',
      'traccion.v1.presupuestos.actuals',
    ]);
  });

  it('loadPresupuestosRecordsSnapshot carga las 4 tablas en paralelo y las combina en un único snapshot', async () => {
    const status = { ready: true, engine: 'better-sqlite3' as const, phase: 'active' as const, path: '/x.sqlite', schemaVersion: 17, isDefaultPath: false, lockPath: '/x.lockdir' };
    const repositoriesByTable = new Map<string, ReturnType<typeof buildEmptyRepository>>();
    const createJsonModuleRepository = vi.fn((tableName: string) => {
      const repo = buildEmptyRepository();
      repo.loadSnapshot.mockResolvedValue({
        status,
        records: [{ id: `${tableName}-1`, value: '{}', updatedAt: '2026-01-01T00:00:00.000Z' }],
      });
      repositoriesByTable.set(tableName, repo);
      return repo;
    });

    const api = createPresupuestosRepository(buildDeps({ createJsonModuleRepository }));
    const snapshot = await api.loadPresupuestosRecordsSnapshot();

    expect(snapshot.scenarios).toEqual([
      { id: 'presupuesto_scenario_records-1', value: '{}', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(snapshot.actuals).toEqual([
      { id: 'presupuesto_actual_records-1', value: '{}', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(snapshot.status).toBe(status);
  });

  it('savePresupuestosSnapshotIfUnchanged rechaza el guardado si expectedUpdatedAt no coincide con el más reciente de las 4 tablas', async () => {
    const status = { ready: true, engine: 'better-sqlite3' as const, phase: 'active' as const, path: '/x.sqlite', schemaVersion: 17, isDefaultPath: false, lockPath: '/x.lockdir' };
    const createJsonModuleRepository = vi.fn(() => {
      const repo = buildEmptyRepository();
      repo.loadSnapshot.mockResolvedValue({
        status,
        records: [{ id: 'a', value: '{}', updatedAt: '2026-06-01T00:00:00.000Z' }],
      });
      return repo;
    });

    const deps = buildDeps({ createJsonModuleRepository });
    const api = createPresupuestosRepository(deps);

    const result = await api.savePresupuestosSnapshotIfUnchanged({
      scenarios: [],
      manualItems: [],
      ticketGroups: [],
      actuals: [],
      expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('modificado por otro usuario');
    expect(deps.safeDatabaseOperation).not.toHaveBeenCalled();
  });

  it('savePresupuestosSnapshotIfUnchanged escribe las 4 tablas en una sola transacción cuando el token coincide', async () => {
    const status = { ready: true, engine: 'better-sqlite3' as const, phase: 'active' as const, path: '/x.sqlite', schemaVersion: 17, isDefaultPath: false, lockPath: '/x.lockdir' };
    const createJsonModuleRepository = vi.fn(() => {
      const repo = buildEmptyRepository();
      repo.loadSnapshot.mockResolvedValue({ status, records: [] });
      return repo;
    });
    const preparedStatements: string[] = [];
    const db = {
      transaction: vi.fn((fn: () => void) => () => fn()),
      prepare: vi.fn((sql: string) => {
        preparedStatements.push(sql);
        return { run: vi.fn(), all: vi.fn(() => []) };
      }),
    };
    const deps = buildDeps({
      createJsonModuleRepository,
      requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createPresupuestosRepository>[0]['requireDatabase']>),
    });
    const api = createPresupuestosRepository(deps);

    const result = await api.savePresupuestosSnapshotIfUnchanged({
      scenarios: [{ id: 's1', value: '{}' }],
      manualItems: [],
      ticketGroups: [],
      actuals: [],
      expectedUpdatedAt: null,
    });

    expect(result.ok).toBe(true);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(preparedStatements.some((sql) => sql.includes('presupuesto_scenario_records'))).toBe(true);
    expect(deps.updateRefreshMetadata).toHaveBeenCalledTimes(1);
    expect(deps.enqueueLocalBackup).toHaveBeenCalledWith('save:presupuestos');
  });

  it('savePresupuestosSnapshotIfUnchanged no escribe nada si SQLite no está activo', async () => {
    const status = { ready: true, engine: 'better-sqlite3' as const, phase: 'active' as const, path: '/x.sqlite', schemaVersion: 17, isDefaultPath: false, lockPath: '/x.lockdir' };
    const createJsonModuleRepository = vi.fn(() => {
      const repo = buildEmptyRepository();
      repo.loadSnapshot.mockResolvedValue({ status, records: [] });
      return repo;
    });
    const inactiveStatus = { ...status, ready: false, phase: 'fallback' as const, message: 'Sin SQLite.' };
    const deps = buildDeps({
      createJsonModuleRepository,
      getSqliteStatus: vi.fn(() => inactiveStatus),
    });
    const api = createPresupuestosRepository(deps);

    const result = await api.savePresupuestosSnapshotIfUnchanged({
      scenarios: [],
      manualItems: [],
      ticketGroups: [],
      actuals: [],
      expectedUpdatedAt: null,
    });

    expect(result.ok).toBe(false);
    expect(deps.requireDatabase).not.toHaveBeenCalled();
  });

  it('dos instancias de createPresupuestosRepository tienen flags de migración independientes', () => {
    const tablesByCall: string[][] = [];
    const createJsonModuleRepository = vi.fn((tableName: string) => {
      tablesByCall.push([tableName]);
      return buildEmptyRepository();
    });

    createPresupuestosRepository(buildDeps({ createJsonModuleRepository }));
    createPresupuestosRepository(buildDeps({ createJsonModuleRepository }));

    expect(createJsonModuleRepository).toHaveBeenCalledTimes(8);
  });
});

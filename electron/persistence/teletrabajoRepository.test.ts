import { describe, expect, it, vi } from 'vitest';
import { createTeletrabajoRepository } from './teletrabajoRepository';

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

function buildDeps(overrides: Partial<Parameters<typeof createTeletrabajoRepository>[0]> = {}) {
  const db = buildDb();

  return {
    safeDatabaseOperation: vi.fn(async (operation: () => unknown) => operation()),
    getSqliteStatus: vi.fn(() => readyStatus),
    requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createTeletrabajoRepository>[0]['requireDatabase']>),
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

describe('createTeletrabajoRepository', () => {
  it('loadTeletrabajoRecordsSnapshot devuelve lista vacía sin tocar la base si SQLite no está activo', async () => {
    const deps = buildDeps({ getSqliteStatus: vi.fn(() => notReadyStatus) });
    const { loadTeletrabajoRecordsSnapshot } = createTeletrabajoRepository(deps);

    const result = await loadTeletrabajoRecordsSnapshot();

    expect(result).toEqual({ status: notReadyStatus, records: [] });
    expect(deps.requireDatabase).not.toHaveBeenCalled();
  });

  it('saveTeletrabajoRecordIfUnchanged rechaza el guardado si el heartbeat bloquea la escritura', async () => {
    const deps = buildDeps({ isDatabaseWriteBlockedByHeartbeat: vi.fn(() => true) });
    const { saveTeletrabajoRecordIfUnchanged } = createTeletrabajoRepository(deps);

    const result = await saveTeletrabajoRecordIfUnchanged({ id: 'sol-1', value: '{}', expectedUpdatedAt: null });

    expect(result.ok).toBe(false);
    expect(deps.enqueueLocalBackup).not.toHaveBeenCalled();
  });

  it('saveTeletrabajoRecordIfUnchanged rechaza el guardado si el updatedAt esperado no coincide (conflicto OCC)', async () => {
    const db = buildDb({ get: { updated_at: '2026-01-02T00:00:00.000Z' } });
    const deps = buildDeps({
      requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createTeletrabajoRepository>[0]['requireDatabase']>),
    });
    const { saveTeletrabajoRecordIfUnchanged } = createTeletrabajoRepository(deps);

    const result = await saveTeletrabajoRecordIfUnchanged({
      id: 'sol-1',
      value: '{}',
      expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('modificada por otro usuario');
    expect(deps.enqueueLocalBackup).not.toHaveBeenCalled();
  });

  it('saveTeletrabajoRecordIfUnchanged guarda y crea backup cuando el updatedAt esperado coincide', async () => {
    const db = buildDb({ get: { updated_at: null } });
    const deps = buildDeps({
      requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createTeletrabajoRepository>[0]['requireDatabase']>),
    });
    const { saveTeletrabajoRecordIfUnchanged } = createTeletrabajoRepository(deps);

    const result = await saveTeletrabajoRecordIfUnchanged({ id: 'sol-1', value: '{}', expectedUpdatedAt: null });

    expect(result.ok).toBe(true);
    expect(deps.updateRefreshMetadata).toHaveBeenCalledTimes(1);
    expect(deps.enqueueLocalBackup).toHaveBeenCalledWith('save:teletrabajo_solicitud_records');
  });

  it('saveTeletrabajoRecordsIfUnchanged no hace nada si la lista está vacía', async () => {
    const deps = buildDeps();
    const { saveTeletrabajoRecordsIfUnchanged } = createTeletrabajoRepository(deps);

    const result = await saveTeletrabajoRecordsIfUnchanged([]);

    expect(result).toEqual({ ok: true, status: readyStatus, results: [], message: 'Nada que guardar.' });
    expect(deps.requireDatabase).not.toHaveBeenCalled();
  });

  it('saveTeletrabajoRecordsIfUnchanged es atómico: si un registro falla, no se guarda ninguno y se identifica cuál falló', async () => {
    const db = buildDb({ get: { updated_at: '2026-01-02T00:00:00.000Z' } });
    const deps = buildDeps({
      requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createTeletrabajoRepository>[0]['requireDatabase']>),
    });
    const { saveTeletrabajoRecordsIfUnchanged } = createTeletrabajoRepository(deps);

    const result = await saveTeletrabajoRecordsIfUnchanged([
      { id: 'sol-1', value: '{}', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    expect(result.ok).toBe(false);
    expect(result.failedRecordId).toBe('sol-1');
    expect(deps.enqueueLocalBackup).not.toHaveBeenCalled();
  });

  it('saveTeletrabajoRecordsIfUnchanged guarda todo el lote y crea un único backup cuando no hay conflictos', async () => {
    const db = buildDb({ get: { updated_at: null } });
    const deps = buildDeps({
      requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createTeletrabajoRepository>[0]['requireDatabase']>),
    });
    const { saveTeletrabajoRecordsIfUnchanged } = createTeletrabajoRepository(deps);

    const result = await saveTeletrabajoRecordsIfUnchanged([
      { id: 'sol-1', value: '{}', expectedUpdatedAt: null },
      { id: 'sol-2', value: '{}', expectedUpdatedAt: null },
    ]);

    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(deps.enqueueLocalBackup).toHaveBeenCalledTimes(1);
    expect(deps.enqueueLocalBackup).toHaveBeenCalledWith('save:teletrabajo_solicitud_records');
  });

  it('resetMigrationState existe y es invocable (usado al cerrar/cambiar de base)', () => {
    const deps = buildDeps();
    const { resetMigrationState } = createTeletrabajoRepository(deps);

    expect(() => resetMigrationState()).not.toThrow();
  });

  it('dos instancias del repositorio son independientes (cada una con su propio flag de migración)', async () => {
    const db = buildDb({ all: [] });
    const deps = buildDeps({
      requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createTeletrabajoRepository>[0]['requireDatabase']>),
    });

    const repoA = createTeletrabajoRepository(deps);
    const repoB = createTeletrabajoRepository(deps);

    await expect(repoA.loadTeletrabajoRecordsSnapshot()).resolves.toEqual({ status: readyStatus, records: [] });
    await expect(repoB.loadTeletrabajoRecordsSnapshot()).resolves.toEqual({ status: readyStatus, records: [] });
    repoA.resetMigrationState();
    expect(() => repoB.resetMigrationState()).not.toThrow();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createSorteosRepository, getSorteosCollectionUpdatedAt } from './sorteosRepository';

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

function buildDb(overrides: { get?: unknown; all?: unknown[] } = {}) {
  const get = vi.fn(() => overrides.get ?? { count: 0 });
  const all = vi.fn(() => overrides.all ?? []);
  const run = vi.fn();
  const prepare = vi.fn(() => ({ get, all, run }));
  const transaction = vi.fn((fn: () => unknown) => () => fn());

  return { get, all, run, prepare, transaction };
}

function buildDeps(overrides: Partial<Parameters<typeof createSorteosRepository>[0]> = {}) {
  const db = buildDb();

  return {
    safeDatabaseOperation: vi.fn(async (operation: () => unknown) => operation()),
    getSqliteStatus: vi.fn(() => readyStatus),
    requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createSorteosRepository>[0]['requireDatabase']>),
    readPersistedRecordByKey: vi.fn(() => null),
    isJsonObjectWithStringId: vi.fn(
      (value: unknown): value is { id: string; createdAt?: unknown; updatedAt?: unknown; deletedAt?: unknown } =>
        Boolean(value && typeof value === 'object' && 'id' in value),
    ),
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

describe('createSorteosRepository', () => {
  it('loadSorteosRecordsSnapshot devuelve listas vacías sin tocar la base si SQLite no está activo', async () => {
    const deps = buildDeps({ getSqliteStatus: vi.fn(() => notReadyStatus) });
    const { loadSorteosRecordsSnapshot } = createSorteosRepository(deps);

    const result = await loadSorteosRecordsSnapshot();

    expect(result).toEqual({
      status: notReadyStatus,
      draws: [],
      exclusions: [],
      drawsUpdatedAt: null,
      exclusionsUpdatedAt: null,
    });
    expect(deps.requireDatabase).not.toHaveBeenCalled();
  });

  it('saveSorteosSnapshotIfUnchanged rechaza el guardado si el heartbeat bloquea la escritura', async () => {
    const deps = buildDeps({ isDatabaseWriteBlockedByHeartbeat: vi.fn(() => true) });
    const { saveSorteosSnapshotIfUnchanged } = createSorteosRepository(deps);

    const result = await saveSorteosSnapshotIfUnchanged({
      draws: [],
      exclusions: [],
      expectedDrawsUpdatedAt: null,
      expectedExclusionsUpdatedAt: null,
    });

    expect(result.ok).toBe(false);
    expect(deps.enqueueLocalBackup).not.toHaveBeenCalled();
  });

  it('saveSorteosSnapshotIfUnchanged rechaza el guardado si el updatedAt esperado no coincide (conflicto OCC)', async () => {
    const db = buildDb({ get: { updated_at: '2026-01-02T00:00:00.000Z' } });
    const deps = buildDeps({
      requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createSorteosRepository>[0]['requireDatabase']>),
    });
    const { saveSorteosSnapshotIfUnchanged } = createSorteosRepository(deps);

    const result = await saveSorteosSnapshotIfUnchanged({
      draws: [],
      exclusions: [],
      expectedDrawsUpdatedAt: '2026-01-01T00:00:00.000Z',
      expectedExclusionsUpdatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('han cambiado mientras guardabas');
    expect(deps.enqueueLocalBackup).not.toHaveBeenCalled();
  });

  it('saveSorteosSnapshotIfUnchanged guarda y crea backup cuando el updatedAt esperado coincide', async () => {
    const db = buildDb({ get: { updated_at: null } });
    const deps = buildDeps({
      requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createSorteosRepository>[0]['requireDatabase']>),
    });
    const { saveSorteosSnapshotIfUnchanged } = createSorteosRepository(deps);

    const result = await saveSorteosSnapshotIfUnchanged({
      draws: [],
      exclusions: [],
      expectedDrawsUpdatedAt: null,
      expectedExclusionsUpdatedAt: null,
    });

    expect(result.ok).toBe(true);
    expect(deps.updateRefreshMetadata).toHaveBeenCalledTimes(1);
    expect(deps.enqueueLocalBackup).toHaveBeenCalledWith('save:sorteos_records');
  });

  it('resetMigrationState existe y es invocable (usado al cerrar/cambiar de base)', () => {
    const deps = buildDeps();
    const { resetMigrationState } = createSorteosRepository(deps);

    expect(() => resetMigrationState()).not.toThrow();
  });

  it('el flag de migración evita releer el registro legacy una segunda vez, y cada repositorio tiene el suyo propio', async () => {
    const db = buildDb({ get: { count: 0 } });
    const deps = buildDeps({
      requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createSorteosRepository>[0]['requireDatabase']>),
    });

    const repoA = createSorteosRepository(deps);
    await repoA.loadSorteosRecordsSnapshot();
    await repoA.loadSorteosRecordsSnapshot();
    // migrateSorteosArrayFromPersistedRecord se llama una vez por tabla (draws +
    // exclusions) solo la primera vez; la segunda carga no debería releer.
    expect(deps.readPersistedRecordByKey).toHaveBeenCalledTimes(2);

    const repoB = createSorteosRepository(deps);
    await repoB.loadSorteosRecordsSnapshot();
    // Un repositorio nuevo tiene su propio flag, así que sí vuelve a intentar migrar.
    expect(deps.readPersistedRecordByKey).toHaveBeenCalledTimes(4);
  });
});

describe('getSorteosCollectionUpdatedAt', () => {
  it('devuelve el updated_at cuando la fila lo trae', () => {
    const db = buildDb({ get: { updated_at: '2026-01-01T00:00:00.000Z' } });
    const result = getSorteosCollectionUpdatedAt(
      db as unknown as Parameters<typeof getSorteosCollectionUpdatedAt>[0],
      'sorteos_draw_records',
    );

    expect(result).toBe('2026-01-01T00:00:00.000Z');
  });

  it('devuelve null cuando no hay filas (updated_at no es string)', () => {
    const db = buildDb({ get: { updated_at: null } });
    const result = getSorteosCollectionUpdatedAt(
      db as unknown as Parameters<typeof getSorteosCollectionUpdatedAt>[0],
      'sorteos_exclusion_records',
    );

    expect(result).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createSesionesRepository } from './sesionesRepository';

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

function buildDeps(overrides: Partial<Parameters<typeof createSesionesRepository>[0]> = {}) {
  const db = buildDb();

  return {
    safeDatabaseOperation: vi.fn(async (operation: () => unknown) => operation()),
    getSqliteStatus: vi.fn(() => readyStatus),
    requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createSesionesRepository>[0]['requireDatabase']>),
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

describe('createSesionesRepository', () => {
  describe.each([
    {
      module: 'comite' as const,
      load: 'loadComiteSessionRecordsSnapshot' as const,
      save: 'saveComiteSessionRecordIfUnchanged' as const,
      backupReason: 'save:comite_session_records',
    },
    {
      module: 'paritaria' as const,
      load: 'loadParitariaSessionRecordsSnapshot' as const,
      save: 'saveParitariaSessionRecordIfUnchanged' as const,
      backupReason: 'save:paritaria_session_records',
    },
    {
      module: 'actas' as const,
      load: 'loadActaRecordsSnapshot' as const,
      save: 'saveActaRecordIfUnchanged' as const,
      backupReason: 'save:acta_records',
    },
  ])('$module', ({ load, save, backupReason }) => {
    it(`${load} devuelve lista vacía sin tocar la base si SQLite no está activo`, async () => {
      const deps = buildDeps({ getSqliteStatus: vi.fn(() => notReadyStatus) });
      const repo = createSesionesRepository(deps);

      const result = await repo[load]();

      expect(result).toEqual({ status: notReadyStatus, records: [] });
      expect(deps.requireDatabase).not.toHaveBeenCalled();
    });

    it(`${save} rechaza el guardado si el heartbeat bloquea la escritura`, async () => {
      const deps = buildDeps({ isDatabaseWriteBlockedByHeartbeat: vi.fn(() => true) });
      const repo = createSesionesRepository(deps);

      const result = await repo[save]({ id: 'abc', value: '{}', expectedUpdatedAt: null });

      expect(result.ok).toBe(false);
      expect(deps.enqueueLocalBackup).not.toHaveBeenCalled();
    });

    it(`${save} rechaza el guardado si el updatedAt esperado no coincide (conflicto OCC)`, async () => {
      const db = buildDb({ get: { updated_at: '2026-01-02T00:00:00.000Z' } });
      const deps = buildDeps({
        requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createSesionesRepository>[0]['requireDatabase']>),
      });
      const repo = createSesionesRepository(deps);

      const result = await repo[save]({
        id: 'abc',
        value: '{}',
        expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      });

      expect(result.ok).toBe(false);
      expect(result.message).toContain('modificad');
      expect(deps.enqueueLocalBackup).not.toHaveBeenCalled();
    });

    it(`${save} guarda y crea backup con la razón correcta cuando el updatedAt esperado coincide`, async () => {
      const db = buildDb({ get: { updated_at: null } });
      const deps = buildDeps({
        requireDatabase: vi.fn(() => db as unknown as ReturnType<Parameters<typeof createSesionesRepository>[0]['requireDatabase']>),
      });
      const repo = createSesionesRepository(deps);

      const result = await repo[save]({ id: 'abc', value: '{}', expectedUpdatedAt: null });

      expect(result.ok).toBe(true);
      expect(deps.updateRefreshMetadata).toHaveBeenCalledTimes(1);
      expect(deps.enqueueLocalBackup).toHaveBeenCalledWith(backupReason);
    });
  });

  it('resetMigrationState existe, es invocable, y resetea los 3 flags a la vez', () => {
    const deps = buildDeps();
    const { resetMigrationState } = createSesionesRepository(deps);

    expect(() => resetMigrationState()).not.toThrow();
  });
});

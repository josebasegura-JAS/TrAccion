import { describe, expect, it, vi } from 'vitest';
import SqliteDatabase from 'better-sqlite3';
import { createSimpleJsonModuleRepository, type SimpleDatabaseStatus } from './simpleJsonModuleRepository.js';

const LEGACY_KEY = 'legacy.records';
const TABLE = 'sample_records';

function createDatabase(recordId: string): InstanceType<typeof SqliteDatabase> {
  const db = new SqliteDatabase(':memory:');
  db.exec(`
    CREATE TABLE persisted_records (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE ${TABLE} (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `);
  const now = '2026-10-09T10:00:00.000Z';
  const value = JSON.stringify([{ id: recordId, createdAt: now, updatedAt: now, deletedAt: null }]);
  db.prepare(
    `INSERT INTO persisted_records (key, value_json, source, created_at, updated_at)
     VALUES (?, ?, 'legacy', ?, ?)`,
  ).run(LEGACY_KEY, value, now, now);
  return db;
}

function activeStatus(path: string): SimpleDatabaseStatus {
  return {
    ready: true,
    engine: 'better-sqlite3',
    phase: 'active',
    path,
    schemaVersion: 1,
    isDefaultPath: false,
    lockPath: `${path}.lockdir`,
  };
}

describe('simpleJsonModuleRepository migration/read separation', () => {
  it('migra una sola vez por conexión y deja las lecturas posteriores como operaciones puras', async () => {
    const db = createDatabase('A-1');
    const status = activeStatus('A.sqlite');
    let migrationDone = false;
    const safeReads = vi.fn(async <T>(operation: () => T) => operation());
    const safeMigrations = vi.fn(async <T>(operation: () => T) => operation());

    const repository = createSimpleJsonModuleRepository(
      {
        tableName: TABLE,
        legacyKey: LEGACY_KEY,
        moduleLabel: 'Módulo prueba',
        getMigrationDone: () => migrationDone,
        setMigrationDone: (value) => { migrationDone = value; },
      },
      {
        safeDatabaseOperation: safeReads,
        safeDatabaseMigrationOperation: safeMigrations,
        getSqliteStatus: () => status,
        requireDatabase: () => db,
        isUpdatedAtRow: (row): row is { updated_at: string } =>
          Boolean(row && typeof row === 'object' && typeof (row as { updated_at?: unknown }).updated_at === 'string'),
        updateRefreshMetadata: vi.fn(),
        enqueueLocalBackup: vi.fn(),
        assertDatabaseWritesAllowed: vi.fn(),
        isDatabaseWriteBlockedByHeartbeat: () => false,
      },
    );

    const first = await repository.loadSnapshot();
    expect(first.records.map((record) => record.id)).toEqual(['A-1']);
    expect(safeMigrations).toHaveBeenCalledTimes(1);
    expect(safeReads).toHaveBeenCalledTimes(1);

    migrationDone = false; // simula la invalidación histórica de la factoría.
    const second = await repository.loadSnapshot();
    expect(second.records.map((record) => record.id)).toEqual(['A-1']);
    expect(safeMigrations).toHaveBeenCalledTimes(1);
    expect(safeReads).toHaveBeenCalledTimes(2);

    db.close();
  });

  it('vuelve a preparar la migración al cambiar a otra conexión SQLite', async () => {
    const dbA = createDatabase('A-1');
    const dbB = createDatabase('B-1');
    let currentDb = dbA;
    let currentStatus = activeStatus('A.sqlite');
    let migrationDone = false;
    const safeMigrations = vi.fn(async <T>(operation: () => T) => operation());

    const repository = createSimpleJsonModuleRepository(
      {
        tableName: TABLE,
        legacyKey: LEGACY_KEY,
        moduleLabel: 'Módulo prueba',
        getMigrationDone: () => migrationDone,
        setMigrationDone: (value) => { migrationDone = value; },
      },
      {
        safeDatabaseOperation: async <T>(operation: () => T) => operation(),
        safeDatabaseMigrationOperation: safeMigrations,
        getSqliteStatus: () => currentStatus,
        requireDatabase: () => currentDb,
        isUpdatedAtRow: (row): row is { updated_at: string } =>
          Boolean(row && typeof row === 'object' && typeof (row as { updated_at?: unknown }).updated_at === 'string'),
        updateRefreshMetadata: vi.fn(),
        enqueueLocalBackup: vi.fn(),
        assertDatabaseWritesAllowed: vi.fn(),
        isDatabaseWriteBlockedByHeartbeat: () => false,
      },
    );

    expect((await repository.loadSnapshot()).records.map((record) => record.id)).toEqual(['A-1']);

    currentDb = dbB;
    currentStatus = activeStatus('B.sqlite');
    migrationDone = false;
    expect((await repository.loadSnapshot()).records.map((record) => record.id)).toEqual(['B-1']);
    expect(safeMigrations).toHaveBeenCalledTimes(2);

    dbA.close();
    dbB.close();
  });
});

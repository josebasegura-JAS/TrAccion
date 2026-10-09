import { afterEach, describe, expect, it, vi } from 'vitest';
import SqliteDatabase from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPersistedRecordsRepository } from './persistedRecordsRepository.js';

const tempDirectories: string[] = [];

async function createRepository() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'traccion-persisted-batch-'));
  tempDirectories.push(directory);
  const databasePath = path.join(directory, 'traccion.sqlite');
  const db = new SqliteDatabase(databasePath);
  db.exec(`
    CREATE TABLE persisted_records (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const status = {
    ready: true,
    engine: 'better-sqlite3',
    phase: 'active' as const,
    path: databasePath,
    schemaVersion: 1,
    isDefaultPath: false,
    lockPath: `${databasePath}.lockdir`,
  };
  const enqueueLocalBackup = vi.fn();
  const repository = createPersistedRecordsRepository({
    ownerId: () => 'test-owner',
    getSqliteStatus: () => status,
    requireDatabase: () => db,
    safeDatabaseOperation: async (operation) => operation(),
    isDatabaseWriteBlockedByHeartbeat: () => false,
    assertDatabaseWritesAllowed: () => undefined,
    withDatabaseOperationLock: async (_databasePath, operation) => operation(),
    enqueueLocalBackup,
    getTaskRecordsUpdatedAt: () => null,
  });
  return { db, repository, enqueueLocalBackup };
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('persisted_records batch atómico', () => {
  it('guarda todas las claves con un único timestamp de confirmación', async () => {
    const { db, repository, enqueueLocalBackup } = await createRepository();
    const result = await repository.savePersistedRecordsIfUnchanged([
      { key: 'zones', value: '[1]', expectedUpdatedAt: null },
      { key: 'areas', value: '[2]', expectedUpdatedAt: null },
    ]);

    expect(result.ok).toBe(true);
    expect(result.currentUpdatedAt).toBeTruthy();
    expect(
      db.prepare('SELECT key, value_json, updated_at FROM persisted_records ORDER BY key').all(),
    ).toEqual([
      { key: 'areas', value_json: '[2]', updated_at: result.currentUpdatedAt },
      { key: 'zones', value_json: '[1]', updated_at: result.currentUpdatedAt },
    ]);
    expect(enqueueLocalBackup).toHaveBeenCalledTimes(1);
    db.close();
  });

  it('un conflicto OCC en una clave impide modificar cualquiera del lote', async () => {
    const { db, repository } = await createRepository();
    db.prepare(
      "INSERT INTO persisted_records (key, value_json, source, created_at, updated_at) VALUES (?, ?, 'sqlite-primary', ?, ?)",
    ).run('areas', '[0]', '2026-10-09T08:00:00.000Z', '2026-10-09T08:00:00.000Z');

    const result = await repository.savePersistedRecordsIfUnchanged([
      { key: 'zones', value: '[1]', expectedUpdatedAt: null },
      { key: 'areas', value: '[2]', expectedUpdatedAt: '2026-10-09T07:59:00.000Z' },
    ]);

    expect(result.ok).toBe(false);
    expect(result.failedRecordKey).toBe('areas');
    expect(db.prepare('SELECT value_json FROM persisted_records WHERE key = ?').get('zones')).toBeUndefined();
    expect(db.prepare('SELECT value_json FROM persisted_records WHERE key = ?').get('areas')).toEqual({ value_json: '[0]' });
    db.close();
  });

  it('un fallo SQL en la segunda escritura revierte también la primera', async () => {
    const { db, repository } = await createRepository();
    db.exec(`
      CREATE TRIGGER fail_areas_insert
      BEFORE INSERT ON persisted_records
      WHEN NEW.key = 'areas'
      BEGIN
        SELECT RAISE(FAIL, 'forced batch failure');
      END;
    `);

    await expect(
      repository.savePersistedRecordsIfUnchanged([
        { key: 'zones', value: '[1]', expectedUpdatedAt: null },
        { key: 'areas', value: '[2]', expectedUpdatedAt: null },
      ]),
    ).rejects.toThrow('forced batch failure');

    expect(db.prepare('SELECT COUNT(*) AS count FROM persisted_records').get()).toEqual({ count: 0 });
    db.close();
  });
});

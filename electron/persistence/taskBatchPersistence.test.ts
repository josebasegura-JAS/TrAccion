import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { Database, DatabaseConstructor } from 'better-sqlite3';
import { saveTaskRecordsInTransaction } from './taskBatchPersistence';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as DatabaseConstructor;

const readyStatus = {
  ready: true,
  engine: 'better-sqlite3' as const,
  phase: 'active' as const,
  path: ':memory:',
  schemaVersion: 17,
  isDefaultPath: false,
  lockPath: ':memory:.lockdir',
};

function createDb(): Database {
  const db = new BetterSqlite3(':memory:');
  db.exec(`
    CREATE TABLE task_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function taskValue(id: string, updatedAt: string): string {
  return JSON.stringify({
    id,
    titulo: id,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
  });
}

describe('saveTaskRecordsInTransaction', () => {
  it('rechaza todo el lote en preflight si una fila tiene conflicto OCC', () => {
    const db = createDb();
    try {
      db.prepare(
        'INSERT INTO task_records (id, value_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)',
      ).run('existing', taskValue('existing', '2026-10-04T09:00:00.000Z'), '2026-10-04T09:00:00.000Z', '2026-10-04T09:00:00.000Z');

      expect(() =>
        saveTaskRecordsInTransaction(
          db,
          [
            {
              id: 'new-first',
              value: taskValue('new-first', '2026-10-04T10:00:00.000Z'),
              expectedUpdatedAt: null,
            },
            {
              id: 'existing',
              value: taskValue('existing', '2026-10-04T10:00:00.000Z'),
              expectedUpdatedAt: '2026-10-04T08:00:00.000Z',
            },
          ],
          readyStatus,
        ),
      ).toThrow(/modificada por otro usuario/i);

      const rows = db.prepare('SELECT id FROM task_records ORDER BY id').all() as Array<{ id: string }>;
      expect(rows.map((row) => row.id)).toEqual(['existing']);
    } finally {
      db.close();
    }
  });

  it('hace rollback si falla una escritura después de haber empezado el lote', () => {
    const db = createDb();
    try {
      db.exec(`
        CREATE TRIGGER fail_second_task
        BEFORE INSERT ON task_records
        WHEN NEW.id = 'second'
        BEGIN
          SELECT RAISE(ABORT, 'forced failure');
        END;
      `);

      expect(() =>
        saveTaskRecordsInTransaction(
          db,
          [
            {
              id: 'first',
              value: taskValue('first', '2026-10-04T10:00:00.000Z'),
              expectedUpdatedAt: null,
            },
            {
              id: 'second',
              value: taskValue('second', '2026-10-04T10:00:00.000Z'),
              expectedUpdatedAt: null,
            },
          ],
          readyStatus,
        ),
      ).toThrow('forced failure');

      const count = db.prepare('SELECT COUNT(*) AS count FROM task_records').get() as { count: number };
      expect(count.count).toBe(0);
      const metadataCount = db.prepare('SELECT COUNT(*) AS count FROM app_metadata').get() as { count: number };
      expect(metadataCount.count).toBe(0);
    } finally {
      db.close();
    }
  });

  it('guarda todo el lote y actualiza el token cuando no hay conflictos', () => {
    const db = createDb();
    try {
      const result = saveTaskRecordsInTransaction(
        db,
        [
          {
            id: 'first',
            value: taskValue('first', '2026-10-04T10:00:00.000Z'),
            expectedUpdatedAt: null,
          },
          {
            id: 'second',
            value: taskValue('second', '2026-10-04T10:00:00.000Z'),
            expectedUpdatedAt: null,
          },
        ],
        readyStatus,
      );

      expect(result).toMatchObject({ ok: true, saved: 2 });
      const count = db.prepare('SELECT COUNT(*) AS count FROM task_records').get() as { count: number };
      expect(count.count).toBe(2);
      const metadataCount = db.prepare('SELECT COUNT(*) AS count FROM app_metadata').get() as { count: number };
      expect(metadataCount.count).toBe(1);
    } finally {
      db.close();
    }
  });
});

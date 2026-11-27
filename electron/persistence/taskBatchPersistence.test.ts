import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

function createDb(databasePath = ':memory:'): Database {
  const db = new BetterSqlite3(databasePath, { timeout: 0 });
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

describe('T2: dos conexiones SQLite independientes sobre el mismo fichero', () => {
  const v1 = '2026-10-04T09:00:00.000Z';
  const v2 = '2026-10-04T10:00:00.000Z';
  const v3 = '2026-10-04T11:00:00.000Z';
  function withConnections(run: (a: Database, b: Database, status: typeof readyStatus) => void) {
    const directory = mkdtempSync(path.join(tmpdir(), 'traccion-t2-tasks-'));
    const databasePath = path.join(directory, 'traccion.sqlite');
    const a = createDb(databasePath);
    try {
      const b = new BetterSqlite3(databasePath, { timeout: 0, fileMustExist: true });
      try { run(a, b, { ...readyStatus, path: databasePath, lockPath: databasePath + '.lockdir' }); }
      finally { b.close(); }
    } finally {
      a.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }

  it('rechaza la edición obsoleta de B sin revertir la confirmada por A ni insertar otras tareas', () => {
    withConnections((a, b, status) => {
      saveTaskRecordsInTransaction(a, [{ id: 'shared', value: taskValue('shared', v1), expectedUpdatedAt: null }], status);
      const observed = b.prepare('SELECT updated_at FROM task_records WHERE id = ?').get('shared');
      expect(observed).toEqual({ updated_at: v1 });
      saveTaskRecordsInTransaction(a, [{ id: 'shared', value: taskValue('shared', v2), expectedUpdatedAt: v1 }], status);
      const metadata = a.prepare('SELECT * FROM app_metadata').all();
      expect(() => saveTaskRecordsInTransaction(b, [
        { id: 'new', value: taskValue('new', v3), expectedUpdatedAt: null },
        { id: 'shared', value: taskValue('shared', v3), expectedUpdatedAt: v1 },
      ], status)).toThrow(/modificada por otro usuario/i);
      expect(a.prepare('SELECT id, updated_at FROM task_records').all()).toEqual([{ id: 'shared', updated_at: v2 }]);
      expect(b.prepare('SELECT * FROM app_metadata').all()).toEqual(metadata);
      expect(saveTaskRecordsInTransaction(b, [{ id: 'shared', value: taskValue('shared', v3), expectedUpdatedAt: v2 }], status).ok).toBe(true);
      expect(a.prepare('SELECT updated_at FROM task_records').get()).toEqual({ updated_at: v3 });
    });
  });

  it('no publica un lote ni su token mientras otra conexión mantiene una escritura sin confirmar', () => {
    withConnections((a, b, status) => {
      a.exec('BEGIN IMMEDIATE');
      try {
        a.prepare('INSERT INTO task_records VALUES (?, ?, ?, ?, NULL)').run('uncommitted', taskValue('uncommitted', v1), v1, v1);
        expect(b.prepare('SELECT id FROM task_records').all()).toEqual([]);
        expect(() => saveTaskRecordsInTransaction(b, [{ id: 'other', value: taskValue('other', v2), expectedUpdatedAt: null }], status)).toThrow(/locked|busy/i);
        expect(b.prepare('SELECT * FROM app_metadata').all()).toEqual([]);
      } finally { a.exec('ROLLBACK'); }
      expect(saveTaskRecordsInTransaction(b, [{ id: 'other', value: taskValue('other', v2), expectedUpdatedAt: null }], status).ok).toBe(true);
      expect(a.prepare('SELECT id FROM task_records').all()).toEqual([{ id: 'other' }]);
      expect(a.pragma('quick_check')).toEqual([{ quick_check: 'ok' }]);
    });
  });

  it('revierte las escrituras si falla el token de refresco al final de la transacción', () => {
    withConnections((a, b, status) => {
      saveTaskRecordsInTransaction(a, [{ id: 'shared', value: taskValue('shared', v1), expectedUpdatedAt: null }], status);
      const before = b.prepare('SELECT * FROM app_metadata').all();
      a.exec("CREATE TRIGGER fail_refresh BEFORE UPDATE ON app_metadata BEGIN SELECT RAISE(ABORT, 'refresh failure'); END");
      expect(() => saveTaskRecordsInTransaction(a, [
        { id: 'shared', value: taskValue('shared', v2), expectedUpdatedAt: v1 },
        { id: 'new', value: taskValue('new', v2), expectedUpdatedAt: null },
      ], status)).toThrow('refresh failure');
      expect(b.prepare('SELECT id, updated_at FROM task_records').all()).toEqual([{ id: 'shared', updated_at: v1 }]);
      expect(b.prepare('SELECT * FROM app_metadata').all()).toEqual(before);
    });
  });

  it.each(['', 'duplicate'])('rechaza identificadores vacíos o duplicados (%s) sin modificar datos', id => {
    withConnections((a, b, status) => {
      expect(() => saveTaskRecordsInTransaction(a, [
        { id, value: taskValue(id, v1), expectedUpdatedAt: null },
        { id, value: taskValue(id, v2), expectedUpdatedAt: null },
      ], status)).toThrow(/vacíos o duplicados/);
      expect(b.prepare('SELECT * FROM task_records').all()).toEqual([]);
      expect(b.prepare('SELECT * FROM app_metadata').all()).toEqual([]);
    });
  });
});

import Database, { type Database as SqliteDatabase } from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from './schemaMigrations';
import { openSqliteDatabase } from './sqliteConnection';

describe('SQLite real: contención, recuperación e histórico', () => {
  let directory: string;
  const connections = new Set<SqliteDatabase>();
  function close(db: SqliteDatabase) { db.close(); connections.delete(db); }
  function open() {
    const db = openSqliteDatabase(path.join(directory, 'shared.sqlite'), { busyTimeoutMs: 0 });
    connections.add(db);
    return db;
  }
  beforeEach(() => { directory = mkdtempSync(path.join(tmpdir(), 'traccion-contention-')); });
  afterEach(() => {
    for (const db of connections) db.close();
    connections.clear();
    rmSync(directory, { recursive: true, force: true });
  });

  it('rechaza la segunda escritura sin alterar datos y permite reintentar tras liberar el lock', () => {
    const a = open();
    a.exec("CREATE TABLE contention_test (id INTEGER PRIMARY KEY, value TEXT NOT NULL); INSERT INTO contention_test VALUES (1, 'histórico')");
    const b = open();
    a.exec('BEGIN IMMEDIATE');
    let committed = false;
    try {
      a.prepare('UPDATE contention_test SET value = ? WHERE id = 1').run('usuario A');
      expect(() => b.prepare('UPDATE contention_test SET value = ? WHERE id = 1').run('usuario B'))
        .toThrowError(expect.objectContaining({ code: 'SQLITE_BUSY' }));
      expect(b.prepare('SELECT value FROM contention_test WHERE id = 1').get()).toEqual({ value: 'histórico' });
      a.exec('COMMIT');
      committed = true;
    } finally {
      if (!committed) a.exec('ROLLBACK');
    }
    expect(b.prepare('SELECT value FROM contention_test WHERE id = 1').get()).toEqual({ value: 'usuario A' });
    b.prepare('UPDATE contention_test SET value = ? WHERE id = 1').run('reintento B');
    expect(a.prepare('SELECT value FROM contention_test WHERE id = 1').get()).toEqual({ value: 'reintento B' });
    expect(a.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  });

  it('un lote interrumpido conserva el histórico y ningún dato parcial tras reabrir', () => {
    const db = open();
    db.exec("CREATE TABLE interruption_test (id INTEGER PRIMARY KEY, value TEXT NOT NULL); INSERT INTO interruption_test VALUES (1, 'histórico')");
    expect(() => db.transaction(() => {
      db.prepare('UPDATE interruption_test SET value = ? WHERE id = 1').run('parcial');
      db.prepare('INSERT INTO interruption_test VALUES (?, ?)').run(2, 'incompleto');
      throw new Error('interrupción inyectada antes de commit');
    })()).toThrow('interrupción inyectada');
    close(db);
    const reopened = open();
    expect(reopened.prepare('SELECT * FROM interruption_test ORDER BY id').all())
      .toEqual([{ id: 1, value: 'histórico' }]);
    expect(reopened.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  });

  it('rechaza una base de versión futura sin migrarla ni modificar su histórico', () => {
    const db = open();
    db.exec("CREATE TABLE future_test (value TEXT); INSERT INTO future_test VALUES ('no tocar')");
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
      .run(CURRENT_SCHEMA_VERSION + 1, '2026-10-27T00:00:00.000Z');
    close(db);
    expect(() => open()).toThrow(/Actualiza TrAcción/);
    const check = new Database(path.join(directory, 'shared.sqlite'), { readonly: true });
    connections.add(check);
    expect(check.prepare('SELECT MAX(version) AS version FROM schema_migrations').get())
      .toEqual({ version: CURRENT_SCHEMA_VERSION + 1 });
    expect(check.prepare('SELECT value FROM future_test').all()).toEqual([{ value: 'no tocar' }]);
  });
});

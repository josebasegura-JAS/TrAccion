import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { Database, DatabaseConstructor } from 'better-sqlite3';
import { saveWithDetachedCommitReceipt, verifyDetachedSqliteCommit, verifyDetachedSqliteCommitAfterExit } from './detachedWriterCommitReceipt.js';
import { saveDetachedCriteriaRecord } from './detachedCriteriaWriterCore.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as DatabaseConstructor;
const expected = { databaseUuid: 'db-uuid-482', applicationId: 'TrAccion',
  environment: 'test', schemaVersion: 1 };
function fixture(filename = ':memory:'): Database {
  const db = new BetterSqlite3(filename);
  db.exec(`
    CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE criterios_rrll_records (
      id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    INSERT INTO schema_migrations VALUES (1, '2026-11-17');
  `);
  for (const [key, value] of [
    ['database_uuid', expected.databaseUuid],
    ['application_id', expected.applicationId],
    ['environment', expected.environment],
    ['database_created_at', '2026-11-17'],
  ]) {
    db.prepare('INSERT INTO app_metadata (key, value, updated_at) VALUES (?, ?, ?)')
      .run(key, value, '2026-11-17');
  }
  return db;
}
function record(id: string, updatedAt: string, previous: string | null = null) {
  return { id, value: JSON.stringify({ id, updatedAt, title: 'Criterio' }),
    expectedUpdatedAt: previous };
}
const key = (operationId: string) => ({
  operationId, generation: 2, databaseUuid: expected.databaseUuid,
});

describe('PR482 · evidencia SQLite transaccional', () => {
  it('commits record and receipt atomically; verifies the real commit', () => {
    const db = fixture();
    try {
      const result = saveWithDetachedCommitReceipt(db, key('first'), () =>
        saveDetachedCriteriaRecord(db, record('c1', 'revision-1')));
      expect(result.ok).toBe(true);
      expect(db.prepare('SELECT id FROM criterios_rrll_records WHERE id = ?').get('c1')).toBeDefined();
      expect(verifyDetachedSqliteCommit(db, expected, key('first')).outcome).toBe('committed');
      expect(verifyDetachedSqliteCommit(db, expected, key('not-sent')).outcome).toBe('not-committed');
    } finally { db.close(); }
  });

  it('rolls back data and receipt when SQL throws', () => {
    const db = fixture();
    try {
      // A prior successful commit establishes the receipt table durably.
      saveWithDetachedCommitReceipt(db, key('baseline'), () => ({ ok: true }));
      expect(() => saveWithDetachedCommitReceipt(db, key('failed'), () => {
        db.prepare('INSERT INTO criterios_rrll_records VALUES (?, ?, ?, ?, ?)')
          .run('c2', '{}', 'a', 'b', null);
        throw new Error('injected failure');
      })).toThrow('injected failure');
      expect(db.prepare('SELECT id FROM criterios_rrll_records WHERE id = ?').get('c2')).toBeUndefined();
      expect(verifyDetachedSqliteCommit(db, expected, key('failed')).outcome).toBe('not-committed');
    } finally { db.close(); }
  });

  it('rolls back side-effects on OCC conflict and does not create a receipt', () => {
    const db = fixture();
    try {
      // A prior successful commit establishes the receipt table durably.
      saveWithDetachedCommitReceipt(db, key('baseline'), () => ({ ok: true }));
      const result = saveWithDetachedCommitReceipt(db, key('conflict'), () => {
        db.prepare('INSERT INTO criterios_rrll_records VALUES (?, ?, ?, ?, ?)')
          .run('c3', '{}', 'a', 'b', null);
        return { ok: false, conflict: true };
      });
      expect(result.ok).toBe(false);
      expect(db.prepare('SELECT id FROM criterios_rrll_records WHERE id = ?').get('c3')).toBeUndefined();
      expect(verifyDetachedSqliteCommit(db, expected, key('conflict')).outcome).toBe('not-committed');
    } finally { db.close(); }
  });

  it('keeps first failed write uncertain if its receipt table was rolled back', () => {
    const db = fixture();
    try {
      expect(() => saveWithDetachedCommitReceipt(db, key('first-failure'), () => {
        throw new Error('abort before initial receipt');
      })).toThrow('abort before initial receipt');
      expect(() => verifyDetachedSqliteCommit(db, expected, key('first-failure')))
        .toThrow('commit incierto');
    } finally { db.close(); }
  });

  it('refuses duplicate operation IDs before invoking a second mutation', () => {
    const db = fixture();
    try {
      saveWithDetachedCommitReceipt(db, key('repeat'), () => ({ ok: true }));
      let invoked = false;
      expect(() => saveWithDetachedCommitReceipt(db, key('repeat'), () => {
        invoked = true;
        return { ok: true };
      })).toThrow('prohibido repetir');
      expect(invoked).toBe(false);
    } finally { db.close(); }
  });

  it('reads proof from a fresh readonly handle only after child EXIT is confirmed', () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'traccion-receipt-482-'));
    const filename = path.join(folder, 'data.sqlite');
    try {
      const writer = fixture(filename);
      try {
        saveWithDetachedCommitReceipt(writer, key('persisted'), () => ({ ok: true }));
      } finally { writer.close(); }
      expect(() => verifyDetachedSqliteCommitAfterExit(filename, expected,
        key('persisted'), false)).toThrow('EXIT');
      expect(verifyDetachedSqliteCommitAfterExit(filename, expected,
        key('persisted'), true).outcome).toBe('committed');
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('rejects mismatched database identity and missing receipt table (unknown, not absent)', () => {
    const db = fixture();
    try {
      expect(() => saveWithDetachedCommitReceipt(db,
        { ...key('invalid'), databaseUuid: 'another-db' }, () => ({ ok: true })))
        .toThrow('identidad');
      expect(() => verifyDetachedSqliteCommit(db, expected, key('orphan')))
        .toThrow('incierto');
      expect(() => verifyDetachedSqliteCommit(db, { ...expected, databaseUuid: 'other' },
        key('orphan'))).toThrow('identidad');
    } finally { db.close(); }
  });
});

import { describe, expect, it } from 'vitest';
import SqliteDatabase from 'better-sqlite3';
import { saveDetachedJsonBatch } from './detachedJsonWriterCore.js';
import { saveWithDetachedCommitReceipt, verifyDetachedSqliteCommit } from './detachedWriterCommitReceipt.js';
import { isDetachedWriterRequest, isDetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';
import { ISOLATED_JSON_TABLES } from './persistence/isolatedJsonTables.js';

const expected = {
  databaseUuid: 'pr484-db', applicationId: 'TrAccion',
  environment: 'test', schemaVersion: 1,
};
const operation = (operationId: string) => ({
  operationId, generation: 9, databaseUuid: expected.databaseUuid,
});
const row = (id: string, updatedAt: string, expectedUpdatedAt: string | null = null) => ({
  id, expectedUpdatedAt,
  value: JSON.stringify({ id, updatedAt, createdAt: '2026-11-17' }),
});
function setup() {
  const db = new SqliteDatabase(':memory:');
  db.exec(`CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES (1, '2026-11-17');`);
  for (const [key, value] of [
    ['database_uuid', expected.databaseUuid],
    ['application_id', expected.applicationId],
    ['environment', expected.environment],
    ['database_created_at', '2026-11-17'],
  ]) {
    db.prepare('INSERT INTO app_metadata VALUES (?, ?, ?)').run(key, value, '2026-11-17');
  }
  for (const table of ISOLATED_JSON_TABLES) {
    db.exec(`CREATE TABLE ${table} (
      id TEXT PRIMARY KEY, value_json TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, deleted_at TEXT)`);
  }
  return db;
}
describe('PR484 · lotes JSON con recibo de commit', () => {
  it('guarda dos filas, metadata y el recibo en una única transacción', () => {
    const db = setup();
    try {
      const result = saveWithDetachedCommitReceipt(db, operation('batch-a'), () =>
        saveDetachedJsonBatch(db, 'ticket_restaurante_calendar_records', [
          row('a', 'v1'), row('b', 'v1'),
        ]));
      expect(result.ok).toBe(true);
      expect((db.prepare('SELECT COUNT(*) AS n FROM ticket_restaurante_calendar_records')
        .get() as { n: number }).n).toBe(2);
      expect(verifyDetachedSqliteCommit(db, expected, operation('batch-a')).outcome)
        .toBe('committed');
      expect((db.prepare("SELECT value FROM app_metadata WHERE key = 'persisted_records_refresh_token'")
        .get() as { value: string }).value).toContain('v1');
    } finally { db.close(); }
  });

  it('si una fila entra en conflicto revierte todas las modificaciones y no emite recibo', () => {
    const db = setup();
    try {
      saveWithDetachedCommitReceipt(db, operation('seed'), () =>
        saveDetachedJsonBatch(db, 'criterios_rrll_records', [row('a', 'v1'), row('b', 'v1')]));
      const result = saveWithDetachedCommitReceipt(db, operation('batch-conflict'), () =>
        saveDetachedJsonBatch(db, 'criterios_rrll_records', [
          row('a', 'v2', 'v1'), row('b', 'v2', 'stale'),
        ]));
      expect(result).toEqual({ ok: false, failedRecordId: 'b', currentUpdatedAt: 'v1' });
      expect((db.prepare("SELECT updated_at FROM criterios_rrll_records WHERE id = 'a'")
        .get() as { updated_at: string }).updated_at).toBe('v1');
      expect(verifyDetachedSqliteCommit(db, expected, operation('batch-conflict')).outcome)
        .toBe('not-committed');
    } finally { db.close(); }
  });

  it('rechaza un operationId repetido sin modificar ninguna fila', () => {
    const db = setup();
    try {
      saveWithDetachedCommitReceipt(db, operation('duplicate'), () =>
        saveDetachedJsonBatch(db, 'vinculograma_records', [row('a', 'v1')]));
      expect(() => saveWithDetachedCommitReceipt(db, operation('duplicate'), () =>
        saveDetachedJsonBatch(db, 'vinculograma_records', [row('b', 'v1')]))).toThrow('prohibido repetir');
      expect(db.prepare("SELECT id FROM vinculograma_records WHERE id = 'b'").get())
        .toBeUndefined();
    } finally { db.close(); }
  });

  it('valida el protocolo de lotes con recibo, generación, uuid y tabla permitida', () => {
    const request = {
      kind: 'detached:save-json-batch-receipted', ...operation('protocol'),
      table: 'ticket_restaurante_person_records', records: [row('a', 'v1')],
    };
    expect(isDetachedWriterRequest(request)).toBe(true);
    expect(isDetachedWriterRequest({ ...request, generation: 0 })).toBe(false);
    expect(isDetachedWriterRequest({ ...request, databaseUuid: '' })).toBe(false);
    expect(isDetachedWriterRequest({ ...request, table: 'sqlite_master' })).toBe(false);
    expect(isDetachedWriterRequest({ ...request, records: [] })).toBe(false);
    expect(isDetachedWriterResponse({
      kind: 'detached:json-batch-receipted', operationId: 'protocol',
      result: { ok: true, results: [{ ok: true, currentUpdatedAt: 'v1' }] },
    })).toBe(true);
  });
});

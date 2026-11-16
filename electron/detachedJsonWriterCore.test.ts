import { describe, expect, it } from 'vitest';
import SqliteDatabase from 'better-sqlite3';
import { saveDetachedJsonBatch } from './detachedJsonWriterCore.js';
import { isDetachedWriterRequest, isDetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';
import { ISOLATED_JSON_TABLES } from './persistence/isolatedJsonTables.js';

function setup() {
  const db = new SqliteDatabase(':memory:');
  db.exec(`CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`);
  for (const table of ISOLATED_JSON_TABLES) {
    db.exec(`CREATE TABLE ${table} (
      id TEXT PRIMARY KEY, value_json TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, deleted_at TEXT)`);
  }
  return db;
}
function entry(id: string, revision: string, expectedUpdatedAt: string | null,
  deletedAt: string | null = null) {
  return {
    id, expectedUpdatedAt,
    value: JSON.stringify({ id, createdAt: '2026-11-01', updatedAt: revision, deletedAt }),
  };
}
describe('PR444 · escritor JSON transaccional aislado', () => {
  it('permite altas, ediciones, tombstones y detección de revisión anterior', () => {
    const db = setup();
    try {
      const table = 'ticket_restaurante_calendar_records';
      expect(saveDetachedJsonBatch(db, table, [entry('a','v1',null)])).toMatchObject({ ok: true });
      expect(saveDetachedJsonBatch(db, table, [entry('a','v2',null)]))
        .toEqual({ ok: false, failedRecordId: 'a', currentUpdatedAt: 'v1' });
      expect(saveDetachedJsonBatch(db, table, [entry('a','v2','v1')])).toMatchObject({ ok: true });
      expect(saveDetachedJsonBatch(db, table, [entry('a','v3','v2','2026-11-16')])).toMatchObject({ ok: true });
      const stored = db.prepare(`SELECT updated_at, deleted_at FROM ${table} WHERE id = 'a'`).get() as { updated_at: string; deleted_at: string };
      expect(stored).toEqual({ updated_at: 'v3', deleted_at: '2026-11-16' });
      expect(saveDetachedJsonBatch(db, table, [entry('a','v4','v1')]))
        .toEqual({ ok: false, failedRecordId: 'a', currentUpdatedAt: 'v3' });
    } finally { db.close(); }
  });

  it('rechaza lote entero ante cualquier conflicto: ni primer registro ni token quedan alterados', () => {
    const db = setup();
    try {
      const table = 'criterios_rrll_records';
      saveDetachedJsonBatch(db, table, [entry('a','v1',null), entry('b','v1',null)]);
      const before = db.prepare(`SELECT value FROM app_metadata WHERE key = 'persisted_records_refresh_token'`).get() as {value: string};
      const result = saveDetachedJsonBatch(db, table, [entry('a','v2','v1'),entry('b','v2','revision-obsoleta')]);
      expect(result).toEqual({ ok: false, failedRecordId: 'b', currentUpdatedAt: 'v1' });
      expect((db.prepare(`SELECT updated_at FROM ${table} WHERE id = 'a'`).get() as {updated_at:string}).updated_at).toBe('v1');
      expect(db.prepare(`SELECT value FROM app_metadata WHERE key = 'persisted_records_refresh_token'`).get()).toEqual(before);
    } finally { db.close(); }
  });

  it('reactiva únicamente la persona Ticket previamente dada de baja', () => {
    const db = setup();
    try {
      const people = 'ticket_restaurante_person_records';
      const other = 'criterios_rrll_records';
      saveDetachedJsonBatch(db, people, [entry('empleado','v1',null)]);
      saveDetachedJsonBatch(db, people, [entry('empleado','v2','v1','2026-11-15')]);
      expect(saveDetachedJsonBatch(db, people, [entry('empleado','v3',null)]))
        .toMatchObject({ ok: true });
      const active = db.prepare(`SELECT deleted_at FROM ${people} WHERE id = 'empleado'`).get() as {deleted_at: string|null};
      expect(active.deleted_at).toBeNull();
      saveDetachedJsonBatch(db, other, [entry('c','v1',null)]);
      saveDetachedJsonBatch(db, other, [entry('c','v2','v1','2026-11-15')]);
      expect(saveDetachedJsonBatch(db, other, [entry('c','v3',null)])).toMatchObject({ok:false});
    } finally { db.close(); }
  });

  it('valida JSON, whitelist, id y duplicados ANTES de escribir', () => {
    const db = setup();
    try {
      expect(() => saveDetachedJsonBatch(db, 'sqlite_master', [entry('a','v1',null)])).toThrow('autorizada');
      expect(() => saveDetachedJsonBatch(db, 'criterios_rrll_records', [
        { id:'a', expectedUpdatedAt:null, value: JSON.stringify({id:'b', updatedAt:'v1'}) },
      ])).toThrow('ID');
      expect(() => saveDetachedJsonBatch(db, 'criterios_rrll_records', [entry('a','v1',null),entry('a','v1',null)])).toThrow('duplicados');
      expect((db.prepare('SELECT COUNT(*) AS n FROM criterios_rrll_records').get() as {n:number}).n).toBe(0);
    } finally { db.close(); }
  });

  it('el protocolo impide ejecutar SQL, tablas ajenas y lotes malformados', () => {
    const valid = {kind:'detached:save-json-batch',table:'criterios_rrll_records',operationId:'op-1',records:[entry('a','v1',null)]};
    expect(isDetachedWriterRequest(valid)).toBe(true);
    expect(isDetachedWriterRequest({...valid,table:'sqlite_master'})).toBe(false);
    expect(isDetachedWriterRequest({...valid,records:[]})).toBe(false);
    expect(isDetachedWriterRequest({kind:'detached:raw-sql',sql:'DROP TABLE task_records'})).toBe(false);
    expect(isDetachedWriterResponse({kind:'detached:json-batch-saved', operationId:'op-1',result:{ok:true,results:[{ok:true,currentUpdatedAt:'v1'}]}})).toBe(true);
  });
});

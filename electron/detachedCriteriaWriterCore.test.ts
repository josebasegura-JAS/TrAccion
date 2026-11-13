import { afterEach, describe, expect, it } from 'vitest';
import SqliteDatabase from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveDetachedCriteriaRecord } from './detachedCriteriaWriterCore.js';
import { isDetachedWriterRequest, isDetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';

const folders: string[] = [];
afterEach(() => { for (const p of folders.splice(0)) rmSync(p, { recursive: true, force: true }); });

function setup() {
  const folder = mkdtempSync(path.join(tmpdir(), 'traccion-detached-writer-'));
  folders.push(folder);
  const filename = path.join(folder, 'isolated.sqlite');
  const db = new SqliteDatabase(filename);
  db.exec(`
    CREATE TABLE criterios_rrll_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `);
  const record = (updatedAt: string, expectedUpdatedAt: string | null) => ({
    id: 'criterio-1', expectedUpdatedAt,
    value: JSON.stringify({ id: 'criterio-1', title: 'Consulta', createdAt: '2026-11-13', updatedAt }),
  });
  return { filename, db, record };
}

describe('Escritura SQL transaccional: motor separado de criterios', () => {
  it('escribe realmente en archivo SQLite y se conserva tras cerrar/reabrir', () => {
    const f = setup();
    let initialConnectionClosed = false;
    try {
      expect(saveDetachedCriteriaRecord(f.db, f.record('v1', null))).toEqual({ ok: true, updatedAt: 'v1' });
      f.db.close();
      initialConnectionClosed = true;
      const reopened = new SqliteDatabase(f.filename, { fileMustExist: true });
      try {
        const saved = reopened.prepare('SELECT value_json, updated_at FROM criterios_rrll_records WHERE id = ?')
          .get('criterio-1') as { value_json: string; updated_at: string };
        expect(saved.updated_at).toBe('v1');
        expect(JSON.parse(saved.value_json).title).toBe('Consulta');
        expect(saveDetachedCriteriaRecord(reopened, f.record('v2', 'v1'))).toEqual({ ok: true, updatedAt: 'v2' });
      } finally { reopened.close(); }
    } finally { if (!initialConnectionClosed) f.db.close(); }
  });

  it('rechaza alta duplicada y revisión obsoleta sin modificar datos', () => {
    const f = setup();
    try {
      saveDetachedCriteriaRecord(f.db, f.record('v1', null));
      expect(saveDetachedCriteriaRecord(f.db, f.record('v2', null)))
        .toEqual({ ok: false, conflict: true, currentUpdatedAt: 'v1' });
      saveDetachedCriteriaRecord(f.db, f.record('v2', 'v1'));
      expect(saveDetachedCriteriaRecord(f.db, f.record('v3', 'v1')))
        .toEqual({ ok: false, conflict: true, currentUpdatedAt: 'v2' });
      expect((f.db.prepare('SELECT updated_at FROM criterios_rrll_records WHERE id = ?')
        .get('criterio-1') as { updated_at: string }).updated_at).toBe('v2');
    } finally { f.db.close(); }
  });

  it('rechaza JSON inválido e identidad distinta sin insertar', () => {
    const f = setup();
    try {
      expect(() => saveDetachedCriteriaRecord(f.db, { id: 'a', value: '{', expectedUpdatedAt: null })).toThrow();
      expect(() => saveDetachedCriteriaRecord(f.db, {
        id: 'otro', expectedUpdatedAt: null,
        value: JSON.stringify({ id: 'no-coincide', updatedAt: 'v1' }),
      })).toThrow();
      const count = f.db.prepare('SELECT COUNT(*) AS n FROM criterios_rrll_records').get() as { n: number };
      expect(count.n).toBe(0);
    } finally { f.db.close(); }
  });
});

describe('Contrato del proceso auxiliar escritor', () => {
  it('solo acepta comandos cerrados; no SQL arbitrario', () => {
    const expected = { databaseUuid: 'uuid-1', applicationId: 'TrAccion', environment: 'production', schemaVersion: 1 };
    expect(isDetachedWriterRequest({ kind: 'detached:open', databasePath: 'test.sqlite', expected })).toBe(true);
    expect(isDetachedWriterRequest({ kind: 'detached:open', databasePath: 'test.sqlite', expected: { ...expected, databaseUuid: '' } })).toBe(false);
    expect(isDetachedWriterRequest({ kind: 'detached:sql', sql: 'DROP TABLE criterios_rrll_records' })).toBe(false);
    expect(isDetachedWriterRequest({ kind: 'detached:save', operationId: 'op-1', record: {
      id: 'a', value: '{}', expectedUpdatedAt: null,
    } })).toBe(true);
    expect(isDetachedWriterResponse({ kind: 'detached:saved', operationId: 'op-1',
      result: { ok: false, conflict: true, currentUpdatedAt: null } })).toBe(true);
  });
});

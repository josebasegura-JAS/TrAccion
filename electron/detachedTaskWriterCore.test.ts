import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { saveDetachedTaskRecord } from './detachedTaskWriterCore.js';
import { isDetachedWriterRequest, isDetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';

function setup() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE task_records (
      id TEXT PRIMARY KEY, value_json TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE persisted_records (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT);
    CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE editing_locks (
      module TEXT NOT NULL, record_id TEXT NOT NULL, owner_id TEXT NOT NULL,
      owner_name TEXT NOT NULL, machine_name TEXT NOT NULL,
      acquired_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      PRIMARY KEY (module, record_id)
    );
  `);
  return db;
}
function payload(id: string, revision: string, expectedUpdatedAt: string | null, ownerId = 'owner-a') {
  return {
    ownerId,
    record: {
      id, expectedUpdatedAt,
      value: JSON.stringify({ id, estado: 'pendiente', createdAt: '2026-11-16T08:00:00.000Z', updatedAt: revision }),
    },
  };
}
function lock(db: SqliteDatabase, recordId: string, ownerId = 'owner-b', expiresAt = '2099-01-01T00:00:00.000Z') {
  db.prepare(
    'INSERT INTO editing_locks (module,record_id,owner_id,owner_name,machine_name,acquired_at,expires_at) VALUES (?,?,?,?,?,?,?)',
  ).run('tareas', recordId, ownerId, 'Otra persona', 'PC-B', '2026-11-16T08:00:00.000Z', expiresAt);
}

describe('PR449 · guardar Tareas con el MISMO repositorio de producción en worker', () => {
  it('alta, OCC y token de sincronización se preservan en SQLite real', async () => {
    const db = setup();
    try {
      const first = await saveDetachedTaskRecord(db, payload('task-1', 'rev-1', null));
      expect(first.ok).toBe(true);
      const stale = await saveDetachedTaskRecord(db, payload('task-1', 'rev-2', null));
      expect(stale).toMatchObject({ ok: false, currentUpdatedAt: 'rev-1' });
      const updated = await saveDetachedTaskRecord(db, payload('task-1', 'rev-2', 'rev-1'));
      expect(updated).toMatchObject({ ok: true, currentUpdatedAt: 'rev-2' });
      const stored = db.prepare('SELECT updated_at FROM task_records WHERE id = ?').get('task-1') as { updated_at: string };
      expect(stored.updated_at).toBe('rev-2');
      const token = db.prepare("SELECT value FROM app_metadata WHERE key = 'persisted_records_refresh_token'").get() as {value:string};
      expect(token.value).toBe('rev-2:owner-a');
    } finally { db.close(); }
  });

  it('no sobrescribe una tarea bloqueada por otro usuario, incluso con revisión válida', async () => {
    const db = setup();
    try {
      await saveDetachedTaskRecord(db, payload('task-2', 'rev-1', null));
      lock(db, 'task-2');
      const blocked = await saveDetachedTaskRecord(db, payload('task-2', 'rev-2', 'rev-1'));
      expect(blocked.ok).toBe(false);
      expect(blocked.message).toContain('Otra persona@PC-B');
      const stored = db.prepare('SELECT updated_at FROM task_records WHERE id = ?').get('task-2') as {updated_at:string};
      expect(stored.updated_at).toBe('rev-1');
    } finally { db.close(); }
  });

  it('también respeta el bloqueo de todo el módulo y los locks caducados', async () => {
    const db = setup();
    try {
      lock(db, '__module__');
      const blocked = await saveDetachedTaskRecord(db, payload('task-3', 'rev-1', null));
      expect(blocked.ok).toBe(false);
      db.prepare('DELETE FROM editing_locks').run();
      lock(db, 'task-3', 'owner-b', '2000-01-01T00:00:00.000Z');
      expect((await saveDetachedTaskRecord(db, payload('task-3', 'rev-1', null))).ok).toBe(true);
    } finally { db.close(); }
  });

  it('mantiene el procedimiento de migración legacy, sin perder registros', async () => {
    const db = setup();
    try {
      const oldTask = { id:'legacy-1', updatedAt:'2026-01-01T00:00:00.000Z', createdAt:'2026-01-01T00:00:00.000Z' };
      db.prepare('INSERT INTO persisted_records (key,value_json,updated_at) VALUES (?,?,?)')
        .run('traccion.v1.tareas.tasks', JSON.stringify([oldTask]), oldTask.updatedAt);
      const result = await saveDetachedTaskRecord(db, payload('new-1','rev-1',null));
      expect(result.ok).toBe(true);
      const rows = db.prepare('SELECT id FROM task_records ORDER BY id').all() as Array<{id:string}>;
      expect(rows.map(row => row.id)).toEqual(['legacy-1','new-1']);
    } finally { db.close(); }
  });

  it('rechaza solicitud malformada y no admite SQL ni omite propietario', async () => {
    const db = setup();
    try {
      await expect(saveDetachedTaskRecord(db, { ...payload('task-1','rev-1',null),ownerId:'' }))
        .rejects.toThrow('inválida');
      const valid = {kind:'detached:save-task',operationId:'op-1',payload:payload('task-1','rev-1',null)};
      expect(isDetachedWriterRequest(valid)).toBe(true);
      expect(isDetachedWriterRequest({...valid,payload:{...valid.payload,ownerId:''}})).toBe(false);
      expect(isDetachedWriterRequest({kind:'detached:raw-sql',sql:'DELETE FROM task_records'})).toBe(false);
      expect(isDetachedWriterResponse({kind:'detached:task-saved',operationId:'op-1',
        result:{ok:true,message:'ok',currentUpdatedAt:'rev-1',status:{ready:true}}})).toBe(true);
    } finally { db.close(); }
  });
});

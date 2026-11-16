import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { closeSessionWorkflowTransaction } from './atomicSessionWorkflow.js';
import type { AtomicSessionWorkflowPayload, DatabaseStatus } from '../sqlitePersistence.js';

const status: DatabaseStatus = {
  ready: true, engine: 'better-sqlite3', phase: 'active',
  path: ':memory:', schemaVersion: 0, isDefaultPath: false, lockPath: ':test-lock:',
};
function fixture(module: 'comite' | 'paritaria') {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE comite_session_records (id TEXT PRIMARY KEY, value_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE paritaria_session_records (id TEXT PRIMARY KEY, value_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE task_records (id TEXT PRIMARY KEY, value_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE acta_records (id TEXT PRIMARY KEY, value_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE editing_locks (module TEXT NOT NULL, record_id TEXT NOT NULL, owner_id TEXT NOT NULL,
      owner_name TEXT NOT NULL, machine_name TEXT NOT NULL, acquired_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      PRIMARY KEY(module,record_id));
    CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
  `);
  const original = JSON.stringify({id:'session-1',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'rev-1'});
  const taskOriginal = JSON.stringify({id:'task-1',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'rev-1'});
  const table = module === 'comite' ? 'comite_session_records' : 'paritaria_session_records';
  const insert = (tableName: string, id: string, value: string) =>
    db.prepare(`INSERT INTO ${tableName} (id,value_json,created_at,updated_at,deleted_at) VALUES (?,?,?,? ,NULL)`)
      .run(id,value,'2026-01-01T00:00:00.000Z','rev-1');
  insert(table,'session-1',original);
  insert('task_records','task-1',taskOriginal);
  const nextValue = (id: string) => JSON.stringify({id,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'rev-2'});
  const payload: AtomicSessionWorkflowPayload = {
    module,
    session:{id:'session-1',value:nextValue('session-1'),expectedUpdatedAt:'rev-1'},
    tasks:[{id:'task-1',value:nextValue('task-1'),expectedUpdatedAt:'rev-1'}],
    acta:{id:'acta-1',sourceSessionId:'session-1',
      value:JSON.stringify({id:'acta-1',sourceSessionId:'session-1',updatedAt:'rev-2'})},
  };
  const metadata = (database: SqliteDatabase, revision: string) => {
    database.prepare("INSERT INTO app_metadata (key,value,updated_at) VALUES ('persisted_records_refresh_token',?,?)")
      .run(revision,revision);
  };
  return {db,table,payload,metadata};
}
function revision(db: SqliteDatabase, table: string, id: string): string {
  return (db.prepare(`SELECT updated_at FROM ${table} WHERE id = ?`).get(id) as {updated_at:string}).updated_at;
}
describe('PR453A · cierre transaccional compartido Comité/Paritaria', () => {
  for (const module of ['comite','paritaria'] as const) {
    it(module + ': actualiza sesión y tareas, crea acta y token como una transacción', () => {
      const f=fixture(module);
      try {
        const out=closeSessionWorkflowTransaction(f.db,f.payload,status,'owner-a',f.metadata);
        expect(out.ok).toBe(true);
        expect(revision(f.db,f.table,'session-1')).toBe('rev-2');
        expect(revision(f.db,'task_records','task-1')).toBe('rev-2');
        expect(revision(f.db,'acta_records','acta-1')).toBe('rev-2');
        expect(f.db.prepare('SELECT COUNT(*) AS n FROM app_metadata').get()).toMatchObject({n:1});
      } finally { f.db.close(); }
    });
    it(module + ': conflicto de tarea impide todo el cierre', () => {
      const f=fixture(module);
      try {
        f.payload.tasks[0].expectedUpdatedAt='stale';
        expect(closeSessionWorkflowTransaction(f.db,f.payload,status,'owner-a',f.metadata).ok).toBe(false);
        expect(revision(f.db,f.table,'session-1')).toBe('rev-1');
        expect(revision(f.db,'task_records','task-1')).toBe('rev-1');
        expect(f.db.prepare('SELECT COUNT(*) AS n FROM acta_records').get()).toMatchObject({n:0});
      } finally { f.db.close(); }
    });
    it(module + ': lock de otro usuario impide escritura', () => {
      const f=fixture(module);
      try {
        f.db.prepare('INSERT INTO editing_locks VALUES (?,?,?,?,?,?,?)')
          .run('tareas','task-1','owner-b','Otra persona','PC-B','2026-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z');
        const out=closeSessionWorkflowTransaction(f.db,f.payload,status,'owner-a',f.metadata);
        expect(out.ok).toBe(false);
        expect(out.message).toContain('Otra persona@PC-B');
        expect(revision(f.db,f.table,'session-1')).toBe('rev-1');
      } finally { f.db.close(); }
    });
    it(module + ': rollback si falla la inserción del acta', () => {
      const f=fixture(module);
      try {
        f.db.exec("CREATE TRIGGER fail_acta BEFORE INSERT ON acta_records BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END;");
        expect(() => closeSessionWorkflowTransaction(f.db,f.payload,status,'owner-a',f.metadata)).toThrow('fallo simulado');
        expect(revision(f.db,f.table,'session-1')).toBe('rev-1');
        expect(revision(f.db,'task_records','task-1')).toBe('rev-1');
        expect(f.db.prepare('SELECT COUNT(*) AS n FROM app_metadata').get()).toMatchObject({n:0});
      } finally { f.db.close(); }
    });
  }
});

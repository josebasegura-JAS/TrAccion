import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { AtomicSessionHistoryImportPayload, DatabaseStatus } from '../sqlitePersistence.js';
import { importSessionHistoryTransaction } from './atomicSessionHistoryImport.js';

const status: DatabaseStatus = {
  ready: true, engine: 'better-sqlite3', phase: 'active',
  path: ':memory:', schemaVersion: 0, isDefaultPath: false, lockPath: ':test:',
};
function setup(module: 'comite' | 'paritaria') {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE task_records (id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE comite_session_records (id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE paritaria_session_records (id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
  `);
  const table = module === 'comite' ? 'comite_session_records' : 'paritaria_session_records';
  const key = 'history-1';
  const taskKey = 'task-history-1';
  const taskValue = JSON.stringify({ id: 'task-1', observaciones: 'ImportKey:' + taskKey,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  const sessionValue = JSON.stringify({ id: 'session-1', code: 'A1', date: '2026-02-01',
    notes: 'ImportKey:' + key,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  const payload: AtomicSessionHistoryImportPayload = {
    module,
    tasks: [{ externalKey: taskKey, id: 'task-1', value: taskValue }],
    sessions: [{ externalKey: key, id: 'session-1', value: sessionValue, taskExternalKeys: [taskKey] }],
  };
  const updateToken = (database: SqliteDatabase, updatedAt: string) => {
    database.prepare("INSERT INTO app_metadata (key,value,updated_at) VALUES ('refresh',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
      .run(updatedAt,updatedAt);
  };
  const run = () => importSessionHistoryTransaction(db,payload,status,updateToken);
  const count = (name: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get() as {n:number}).n;
  return {db,table,payload,run,count};
}

describe('PR453C · historial atómico compartido en SQLite real', () => {
  for (const module of ['comite','paritaria'] as const) {
    it(module + ': importa tareas y sesión enlazadas en una sola transacción', () => {
      const f=setup(module);
      try {
        expect(f.run()).toMatchObject({ok:true,importedSessionCount:1,createdTaskCount:1});
        const row=f.db.prepare(`SELECT value_json FROM ${f.table} WHERE id=?`).get('session-1') as {value_json:string};
        expect(JSON.parse(row.value_json)).toMatchObject({items:['task-1'],treatedTaskIds:['task-1'],untreatedTaskIds:[]});
        expect(f.count('task_records')).toBe(1);
        expect(f.count('app_metadata')).toBe(1);
      } finally {f.db.close();}
    });

    it(module + ': repetir importación no duplica sesiones ni puntos', () => {
      const f=setup(module);
      try {
        expect(f.run().ok).toBe(true);
        expect(f.run()).toMatchObject({ok:true,importedSessionCount:0,createdTaskCount:0});
        expect(f.count(f.table)).toBe(1);
        expect(f.count('task_records')).toBe(1);
      } finally {f.db.close();}
    });

    it(module + ': ignora duplicados dentro del mismo lote sin puntos huérfanos', () => {
      const f=setup(module);
      try {
        f.payload.sessions.push({...f.payload.sessions[0],id:'session-duplicated'});
        expect(f.run()).toMatchObject({ok:true,importedSessionCount:1,createdTaskCount:1});
        expect(f.count(f.table)).toBe(1);
        expect(f.count('task_records')).toBe(1);
      } finally {f.db.close();}
    });

    it(module + ': una referencia histórica irresoluble provoca rollback de sesión y puntos', () => {
      const f=setup(module);
      try {
        f.payload.sessions[0].taskExternalKeys.push('missing');
        expect(() => f.run()).toThrow('No se han podido resolver');
        expect(f.count(f.table)).toBe(0);
        expect(f.count('task_records')).toBe(0);
        expect(f.count('app_metadata')).toBe(0);
      } finally {f.db.close();}
    });

    it(module + ': fallo SQL después de crear puntos deshace el lote completo', () => {
      const f=setup(module);
      try {
        f.db.exec(`CREATE TRIGGER fail_session BEFORE INSERT ON ${f.table}
          BEGIN SELECT RAISE(ABORT,'fallo simulado'); END;`);
        expect(() => f.run()).toThrow('fallo simulado');
        expect(f.count('task_records')).toBe(0);
        expect(f.count(f.table)).toBe(0);
        expect(f.count('app_metadata')).toBe(0);
      } finally {f.db.close();}
    });
  }
});

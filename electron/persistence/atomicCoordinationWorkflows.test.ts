import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import type {
  AtomicCoordinationWorkflowPayload,
  AtomicCoordinationTaskCreationPayload, DatabaseStatus,
} from '../sqlitePersistence.js';
import {
  closeCoordinationWorkflowTransaction, createCoordinationTaskTransaction,
} from './atomicCoordinationWorkflows.js';

const status: DatabaseStatus = {
  ready: true, engine: 'better-sqlite3', phase: 'active', path: ':memory:',
  schemaVersion: 0, isDefaultPath: false, lockPath: ':test:',
};
const old = '2026-01-01T00:00:00.000Z';
function setup() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE persisted_records (
      key TEXT PRIMARY KEY, value_json TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'sqlite-primary',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE task_records (
      id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE app_metadata (key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
  `);
  const insert = db.prepare('INSERT INTO persisted_records (key,value_json,source,created_at,updated_at) VALUES (?, ?, ?, ?, ?)');
  insert.run('meeting-1', JSON.stringify({id:'meeting-1'}), 'sqlite-primary',old,old);
  insert.run('index-1', JSON.stringify({id:'index-1'}), 'sqlite-primary',old,old);
  db.prepare('INSERT INTO task_records (id,value_json,created_at,updated_at,deleted_at) VALUES (?,?,?,?,NULL)')
    .run('task-1',JSON.stringify({id:'task-1',updatedAt:old}),old,old);
  const read = (table: 'persisted_records'|'task_records',key: string) =>
    db.prepare(`SELECT updated_at FROM ${table} WHERE ${table === 'persisted_records' ? 'key' : 'id'} = ?`)
      .get(key) as {updated_at:string}|undefined;
  const count = (table: 'task_records'|'app_metadata') =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {n:number}).n;
  const updateToken = (database: SqliteDatabase, revision: string) =>
    database.prepare("INSERT INTO app_metadata (key,value,updated_at) VALUES ('refresh',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
      .run(revision,revision);
  const meeting = {key:'meeting-1',value:'{"id":"meeting-1","closed":true}',expectedUpdatedAt:old};
  const index = {key:'index-1',value:'{"id":"index-1","closed":true}',expectedUpdatedAt:old};
  const closePayload: AtomicCoordinationWorkflowPayload = {
    meeting, index, tasks:[{id:'task-1',value:'{"id":"task-1","closed":true}',expectedUpdatedAt:old}],
  };
  const createPayload: AtomicCoordinationTaskCreationPayload = {
    meeting, index, task:{id:'new-task',value:'{"id":"new-task","createdAt":"2026-01-02T00:00:00.000Z"}'},
  };
  return {db,read,count,updateToken,closePayload,createPayload};
}

describe('PR457 · Coordinación, cierre atómico', () => {
  it('actualiza reunión, índice, tarea y token en una transacción', () => {
    const f=setup();
    try {
      expect(closeCoordinationWorkflowTransaction(f.db,f.closePayload,status,f.updateToken).ok).toBe(true);
      expect(f.read('persisted_records','meeting-1')?.updated_at).not.toBe(old);
      expect(f.read('persisted_records','index-1')?.updated_at).not.toBe(old);
      expect(f.read('task_records','task-1')?.updated_at).not.toBe(old);
      expect(f.count('app_metadata')).toBe(1);
    } finally {f.db.close();}
  });
  it('rechaza conflicto de índice sin modificar sesión ni tareas', () => {
    const f=setup();
    try {
      f.closePayload.index.expectedUpdatedAt='obsoleto';
      expect(closeCoordinationWorkflowTransaction(f.db,f.closePayload,status,f.updateToken).ok).toBe(false);
      expect(f.read('persisted_records','meeting-1')?.updated_at).toBe(old);
      expect(f.read('task_records','task-1')?.updated_at).toBe(old);
      expect(f.count('app_metadata')).toBe(0);
    } finally {f.db.close();}
  });
  it('revierte reunión e índice si falla la tarea al final del cierre', () => {
    const f=setup();
    try {
      f.db.exec("CREATE TRIGGER fail_close BEFORE UPDATE ON task_records BEGIN SELECT RAISE(ABORT,'fallo simulado'); END;");
      expect(() => closeCoordinationWorkflowTransaction(f.db,f.closePayload,status,f.updateToken)).toThrow('fallo simulado');
      expect(f.read('persisted_records','meeting-1')?.updated_at).toBe(old);
      expect(f.read('persisted_records','index-1')?.updated_at).toBe(old);
      expect(f.count('app_metadata')).toBe(0);
    } finally {f.db.close();}
  });
});

describe('PR457 · Coordinación, creación de tarea atómica', () => {
  it('crea tarea y actualiza reunión/índice/token juntos', () => {
    const f=setup();
    try {
      expect(createCoordinationTaskTransaction(f.db,f.createPayload,status,f.updateToken).ok).toBe(true);
      expect(f.read('task_records','new-task')).toBeDefined();
      expect(f.read('persisted_records','meeting-1')?.updated_at).not.toBe(old);
      expect(f.count('app_metadata')).toBe(1);
    } finally {f.db.close();}
  });
  it('rechaza tarea con identificador ya existente', () => {
    const f=setup();
    try {
      f.createPayload.task.id='task-1';
      expect(createCoordinationTaskTransaction(f.db,f.createPayload,status,f.updateToken).ok).toBe(false);
      expect(f.read('persisted_records','meeting-1')?.updated_at).toBe(old);
      expect(f.count('app_metadata')).toBe(0);
    } finally {f.db.close();}
  });
  it('revierte reunión/índice si INSERT de tarea falla', () => {
    const f=setup();
    try {
      f.db.exec("CREATE TRIGGER fail_create BEFORE INSERT ON task_records BEGIN SELECT RAISE(ABORT,'fallo simulado'); END;");
      expect(() => createCoordinationTaskTransaction(f.db,f.createPayload,status,f.updateToken)).toThrow('fallo simulado');
      expect(f.read('persisted_records','meeting-1')?.updated_at).toBe(old);
      expect(f.read('persisted_records','index-1')?.updated_at).toBe(old);
      expect(f.read('task_records','new-task')).toBeUndefined();
      expect(f.count('app_metadata')).toBe(0);
    } finally {f.db.close();}
  });
});

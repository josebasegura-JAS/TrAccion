import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type {
  AtomicCoordinationWorkflowPayload, AtomicCoordinationTaskCreationPayload,
} from './sqlitePersistence.js';
import { executeDetachedCoordinationWorkflow, isDetachedCoordinationWorkflow } from './detachedCoordinationWorkflowCore.js';
import { isDetachedWriterRequest, isDetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';

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
  const meeting = {key:'meeting-1',value:'{"id":"meeting-1","closed":true}',expectedUpdatedAt:old};
  const index = {key:'index-1',value:'{"id":"index-1","closed":true}',expectedUpdatedAt:old};
  const closePayload: AtomicCoordinationWorkflowPayload = {
    meeting, index, tasks:[{id:'task-1',value:'{"id":"task-1","closed":true}',expectedUpdatedAt:old}],
  };
  const createPayload: AtomicCoordinationTaskCreationPayload = {
    meeting, index, task:{id:'new-task',value:'{"id":"new-task","createdAt":"2026-01-02T00:00:00.000Z"}'},
  };
  return {db,read,count,closePayload,createPayload};
}

describe('PR458 · Coordinación aislada, cierre atómico', () => {
  it('actualiza reunión, índice, tarea y token en una transacción', () => {
    const f=setup();
    try {
      expect(executeDetachedCoordinationWorkflow(f.db,{ownerId:'owner-a',operation:'close',payload:f.closePayload}).ok).toBe(true);
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
      expect(executeDetachedCoordinationWorkflow(f.db,{ownerId:'owner-a',operation:'close',payload:f.closePayload}).ok).toBe(false);
      expect(f.read('persisted_records','meeting-1')?.updated_at).toBe(old);
      expect(f.read('task_records','task-1')?.updated_at).toBe(old);
      expect(f.count('app_metadata')).toBe(0);
    } finally {f.db.close();}
  });
  it('revierte reunión e índice si falla la tarea al final del cierre', () => {
    const f=setup();
    try {
      f.db.exec("CREATE TRIGGER fail_close BEFORE UPDATE ON task_records BEGIN SELECT RAISE(ABORT,'fallo simulado'); END;");
      expect(() => executeDetachedCoordinationWorkflow(f.db,{ownerId:'owner-a',operation:'close',payload:f.closePayload})).toThrow('fallo simulado');
      expect(f.read('persisted_records','meeting-1')?.updated_at).toBe(old);
      expect(f.read('persisted_records','index-1')?.updated_at).toBe(old);
      expect(f.count('app_metadata')).toBe(0);
    } finally {f.db.close();}
  });
});

describe('PR458 · Coordinación aislada, creación de tarea atómica', () => {
  it('crea tarea y actualiza reunión/índice/token juntos', () => {
    const f=setup();
    try {
      expect(executeDetachedCoordinationWorkflow(f.db,{ownerId:'owner-a',operation:'create-task',payload:f.createPayload}).ok).toBe(true);
      expect(f.read('task_records','new-task')).toBeDefined();
      expect(f.read('persisted_records','meeting-1')?.updated_at).not.toBe(old);
      expect(f.count('app_metadata')).toBe(1);
    } finally {f.db.close();}
  });
  it('rechaza tarea con identificador ya existente', () => {
    const f=setup();
    try {
      f.createPayload.task.id='task-1';
      expect(executeDetachedCoordinationWorkflow(f.db,{ownerId:'owner-a',operation:'create-task',payload:f.createPayload}).ok).toBe(false);
      expect(f.read('persisted_records','meeting-1')?.updated_at).toBe(old);
      expect(f.count('app_metadata')).toBe(0);
    } finally {f.db.close();}
  });
  it('revierte reunión/índice si INSERT de tarea falla', () => {
    const f=setup();
    try {
      f.db.exec("CREATE TRIGGER fail_create BEFORE INSERT ON task_records BEGIN SELECT RAISE(ABORT,'fallo simulado'); END;");
      expect(() => executeDetachedCoordinationWorkflow(f.db,{ownerId:'owner-a',operation:'create-task',payload:f.createPayload})).toThrow('fallo simulado');
      expect(f.read('persisted_records','meeting-1')?.updated_at).toBe(old);
      expect(f.read('persisted_records','index-1')?.updated_at).toBe(old);
      expect(f.read('task_records','new-task')).toBeUndefined();
      expect(f.count('app_metadata')).toBe(0);
    } finally {f.db.close();}
  });
});

describe('PR458 · validación del protocolo del writer', () => {
  const meeting = {key:'meeting',value:'{}',expectedUpdatedAt:'revision-1'};
  const index = {key:'index',value:'{}',expectedUpdatedAt:'revision-1'};
  const close = {ownerId:'owner',operation:'close' as const,payload:{meeting,index,tasks:[{id:'task',value:'{}',expectedUpdatedAt:'revision-1'}]}};
  const create = {ownerId:'owner',operation:'create-task' as const,payload:{meeting,index,task:{id:'new',value:'{}'}}};
  it('admite cierre y creación, pero no operaciones o claves arbitrarias', () => {
    expect(isDetachedCoordinationWorkflow(close)).toBe(true);
    expect(isDetachedCoordinationWorkflow(create)).toBe(true);
    expect(isDetachedWriterRequest({kind:'detached:coordination-workflow',operationId:'op1',payload:close})).toBe(true);
    expect(isDetachedWriterRequest({kind:'detached:coordination-workflow',operationId:'op2',payload:create})).toBe(true);
    expect(isDetachedCoordinationWorkflow({...close,operation:'delete-all'})).toBe(false);
    expect(isDetachedCoordinationWorkflow({...close,ownerId:''})).toBe(false);
    expect(isDetachedCoordinationWorkflow({...close,payload:{...close.payload,index:meeting}})).toBe(false);
    expect(isDetachedCoordinationWorkflow({...close,payload:{...close.payload,tasks:[...close.payload.tasks,...close.payload.tasks]}})).toBe(false);
    expect(isDetachedWriterRequest({kind:'detached:coordination-workflow',operationId:'',payload:close})).toBe(false);
  });
  it('solo acepta respuesta tipada con estado y revisiones válidas', () => {
    const result = {ok:true,status:{ready:true},message:'Completado',meetingUpdatedAt:'now',indexUpdatedAt:'now'};
    expect(isDetachedWriterResponse({kind:'detached:coordination-workflow-done',operationId:'op1',result})).toBe(true);
    expect(isDetachedWriterResponse({kind:'detached:coordination-workflow-done',operationId:'op1',result:{...result,message:42}})).toBe(false);
    expect(isDetachedWriterResponse({kind:'detached:coordination-workflow-done',operationId:'',result})).toBe(false);
  });
});

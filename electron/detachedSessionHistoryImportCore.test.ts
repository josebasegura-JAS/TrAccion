import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { AtomicSessionHistoryImportPayload } from '../sqlitePersistence.js';
import { importDetachedSessionHistory, isDetachedSessionHistoryImport } from '../detachedSessionHistoryImportCore.js';
import { isDetachedWriterRequest, isDetachedWriterResponse } from '../detachedCriteriaWriterProtocol.js';

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
  const run = () => importDetachedSessionHistory(db,{ownerId:'owner-a',payload});
  const count = (name: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get() as {n:number}).n;
  return {db,table,payload,run,count};
}

describe('PR456 · historial atómico desde adaptador del utilityProcess', () => {
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

describe('PR456 · validación estricta del mensaje de importación', () => {
  const payload = {ownerId:'owner-a',payload:{
    module:'comite' as const,
    tasks:[{id:'t1',externalKey:'key-t1',value:'{}'}],
    sessions:[{id:'s1',externalKey:'key-s1',value:'{}',taskExternalKeys:['key-t1']}],
  }};
  it('admite petición y respuesta con contadores enteros', () => {
    expect(isDetachedSessionHistoryImport(payload)).toBe(true);
    expect(isDetachedWriterRequest({kind:'detached:import-session-history',operationId:'op-1',payload})).toBe(true);
    expect(isDetachedWriterResponse({kind:'detached:session-history-imported',operationId:'op-1',
      result:{ok:true,message:'ok',status:{ready:true},importedSessionCount:1,createdTaskCount:1}})).toBe(true);
  });
  it('rechaza módulos ajenos, duplicados de tareas, referencias inválidas y respuesta sin contadores', () => {
    expect(isDetachedSessionHistoryImport({...payload,ownerId:''})).toBe(false);
    expect(isDetachedSessionHistoryImport({...payload,payload:{...payload.payload,module:'actas'}})).toBe(false);
    expect(isDetachedSessionHistoryImport({...payload,payload:{...payload.payload,tasks:[...payload.payload.tasks,...payload.payload.tasks]}})).toBe(false);
    expect(isDetachedSessionHistoryImport({...payload,payload:{...payload.payload,sessions:[{...payload.payload.sessions[0],taskExternalKeys:[null]}]}})).toBe(false);
    expect(isDetachedWriterRequest({kind:'detached:import-session-history',operationId:'',payload})).toBe(false);
    expect(isDetachedWriterResponse({kind:'detached:session-history-imported',operationId:'op-1',
      result:{ok:true,message:'ok',status:{ready:true}}})).toBe(false);
  });
});

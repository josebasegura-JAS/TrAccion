import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { saveDetachedTaskRecord } from './detachedTaskWriterCore.js';
import { saveDetachedSessionRecord, type DetachedSessionModule } from './detachedSessionWriterCore.js';
import { verifyDetachedSqliteCommit } from './detachedWriterCommitReceipt.js';
import { isDetachedWriterRequest, isDetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';

const expected = { databaseUuid: 'pr486-db', applicationId: 'TrAccion', environment: 'test', schemaVersion: 1 };
const op = (operationId: string) => ({ operationId, generation: 6, databaseUuid: expected.databaseUuid });
function setup() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES (1, '2026-11-17');
    CREATE TABLE task_records (id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE comite_session_records (id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE paritaria_session_records (id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE acta_records (id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE persisted_records (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT);
    CREATE TABLE editing_locks (
      module TEXT NOT NULL, record_id TEXT NOT NULL, owner_id TEXT NOT NULL,
      owner_name TEXT NOT NULL, machine_name TEXT NOT NULL,
      acquired_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      PRIMARY KEY (module,record_id));
  `);
  for (const [key,value] of [
    ['database_uuid', expected.databaseUuid], ['application_id', expected.applicationId],
    ['environment', expected.environment], ['database_created_at', '2026-11-17'],
  ]) db.prepare('INSERT INTO app_metadata VALUES (?,?,?)').run(key,value,'2026-11-17');
  return db;
}
function task(id: string, rev: string, previous: string | null = null) {
  return { ownerId: 'owner-a', record: { id, expectedUpdatedAt: previous,
    value: JSON.stringify({ id, estado: 'pendiente', updatedAt: rev, createdAt: '2026-11-17' }) } };
}
function meeting(module: DetachedSessionModule, id: string, rev: string, previous: string | null = null) {
  return { module, ownerId: 'owner-a', record: { id, expectedUpdatedAt: previous,
    value: JSON.stringify({ id, updatedAt: rev, createdAt: '2026-11-17' }) } };
}
describe('PR486 · recibos dentro de transacciones Tareas/Sesiones', () => {
  it('Tareas confirma fila, token y recibo de forma atómica', async () => {
    const db=setup();try {
      const result=await saveDetachedTaskRecord(db,task('t1','v1'),op('task-a'));
      expect(result.ok).toBe(true);
      expect(verifyDetachedSqliteCommit(db,expected,op('task-a')).outcome).toBe('committed');
      expect(db.prepare("SELECT value FROM app_metadata WHERE key='persisted_records_refresh_token'").get()).toBeDefined();
      const stale=await saveDetachedTaskRecord(db,task('t1','v2'),op('task-stale'));
      expect(stale.ok).toBe(false);
      expect(verifyDetachedSqliteCommit(db,expected,op('task-stale')).outcome).toBe('not-committed');
      expect((db.prepare("SELECT updated_at FROM task_records WHERE id='t1'").get() as {updated_at:string}).updated_at).toBe('v1');
    }finally{db.close();}
  });
  it('Tareas no crea recibo ni sobrescribe bloqueos de otro usuario',async()=>{
    const db=setup();try{
      await saveDetachedTaskRecord(db,task('t2','v1'),op('task-seed'));
      db.prepare('INSERT INTO editing_locks VALUES (?,?,?,?,?,?,?)').run(
        'tareas','t2','owner-b','Otra persona','PC-B','2026-11-17','2099-01-01');
      const result=await saveDetachedTaskRecord(db,task('t2','v2','v1'),op('task-locked'));
      expect(result.ok).toBe(false);
      expect(verifyDetachedSqliteCommit(db,expected,op('task-locked')).outcome).toBe('not-committed');
      expect((db.prepare("SELECT updated_at FROM task_records WHERE id='t2'").get() as {updated_at:string}).updated_at).toBe('v1');
    }finally{db.close();}
  });
  for(const [module,table] of [
    ['comite','comite_session_records'],['paritaria','paritaria_session_records'],['actas','acta_records'],
  ] as const){
    it(module+' confirma recibo y evita conflictos OCC',async()=>{
      const db=setup();try{
        expect((await saveDetachedSessionRecord(db,meeting(module,'s1','v1'),op(module+'-one'))).ok).toBe(true);
        expect(verifyDetachedSqliteCommit(db,expected,op(module+'-one')).outcome).toBe('committed');
        expect((await saveDetachedSessionRecord(db,meeting(module,'s1','v2'),op(module+'-stale'))).ok).toBe(false);
        expect(verifyDetachedSqliteCommit(db,expected,op(module+'-stale')).outcome).toBe('not-committed');
        expect((db.prepare(`SELECT updated_at FROM ${table} WHERE id='s1'`).get() as {updated_at:string}).updated_at).toBe('v1');
      }finally{db.close();}
    });
  }
  it('un mismo operationId no se puede reutilizar entre Tareas y Comité',async()=>{
    const db=setup();try{
      expect((await saveDetachedTaskRecord(db,task('t3','v1'),op('shared-id'))).ok).toBe(true);
      const second=await saveDetachedSessionRecord(db,meeting('comite','s3','v1'),op('shared-id'));
      expect(second.ok).toBe(false);
      expect(db.prepare("SELECT id FROM comite_session_records WHERE id='s3'").get()).toBeUndefined();
    }finally{db.close();}
  });
  it('valida generación, UUID y resultados de las peticiones optativas',()=>{
    const payload=task('t4','v1');
    const req={kind:'detached:save-task-receipted',...op('id'),payload};
    expect(isDetachedWriterRequest(req)).toBe(true);
    expect(isDetachedWriterRequest({...req,generation:0})).toBe(false);
    expect(isDetachedWriterRequest({...req,databaseUuid:''})).toBe(false);
    expect(isDetachedWriterRequest({kind:'detached:save-session-receipted',...op('id2'),
      payload:meeting('paritaria','s1','v1')})).toBe(true);
    expect(isDetachedWriterResponse({kind:'detached:task-receipted',operationId:'id',
      result:{ok:true,message:'ok',currentUpdatedAt:'v1',status:{ready:true}}})).toBe(true);
    expect(isDetachedWriterResponse({kind:'detached:session-receipted',operationId:'id',
      result:{ok:true,message:'ok',currentUpdatedAt:'v1',status:{ready:true}}})).toBe(true);
  });
});

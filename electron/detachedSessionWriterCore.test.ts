import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { saveDetachedSessionRecord, type DetachedSessionModule } from './detachedSessionWriterCore.js';
import { isDetachedWriterRequest, isDetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';

function setup() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE comite_session_records (id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE paritaria_session_records (id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE acta_records (id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE persisted_records (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT);
    CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
  `);
  return db;
}
function payload(module: DetachedSessionModule, revision: string, expectedUpdatedAt: string | null, id = 'sesion-1') {
  return {
    module, ownerId: 'owner-a',
    record: { id, expectedUpdatedAt,
      value: JSON.stringify({ id, createdAt:'2026-11-16T08:00:00.000Z', updatedAt:revision }),
    },
  };
}
describe('PR451 · repositorio real de sesiones en escritor aislado', () => {
  for (const [module, table] of [
    ['comite', 'comite_session_records'],
    ['paritaria', 'paritaria_session_records'],
    ['actas', 'acta_records'],
  ] as const) {
    it(module + ': crea, detecta conflicto OCC y actualiza token', async () => {
      const db = setup();
      try {
        expect((await saveDetachedSessionRecord(db, payload(module, 'rev-1', null))).ok).toBe(true);
        const stale = await saveDetachedSessionRecord(db, payload(module, 'rev-2', null));
        expect(stale).toMatchObject({ ok: false, currentUpdatedAt: 'rev-1' });
        const updated = await saveDetachedSessionRecord(db, payload(module, 'rev-2', 'rev-1'));
        expect(updated).toMatchObject({ ok: true, currentUpdatedAt: 'rev-2' });
        const row = db.prepare(`SELECT updated_at FROM ${table} WHERE id = ?`).get('sesion-1') as { updated_at: string };
        expect(row.updated_at).toBe('rev-2');
        const token = db.prepare("SELECT value FROM app_metadata WHERE key = 'persisted_records_refresh_token'").get() as {value:string};
        expect(token.value).toBe('rev-2:owner-a');
      } finally { db.close(); }
    });
    it(module + ': migra registros legacy antes de guardar', async () => {
      const db = setup();
      try {
        const old = {id:'legacy-1',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'};
        const key = module === 'comite' ? 'traccion.v1.comite.sessions'
          : module === 'paritaria' ? 'traccion.v1.paritaria.sessions' : 'traccion.v1.actas.records';
        db.prepare('INSERT INTO persisted_records (key,value_json,updated_at) VALUES (?,?,?)')
          .run(key,JSON.stringify([old]),old.updatedAt);
        expect((await saveDetachedSessionRecord(db, payload(module,'rev-1',null,'new-1'))).ok).toBe(true);
        const rows = db.prepare(`SELECT id FROM ${table} ORDER BY id`).all() as Array<{id:string}>;
        expect(rows.map(row => row.id)).toEqual(['legacy-1','new-1']);
      } finally { db.close(); }
    });
  }
  it('rechaza módulos desconocidos y peticiones sin propietario', async () => {
    const db=setup();
    try {
      const valid={kind:'detached:save-session',operationId:'one',payload:payload('comite','v1',null)};
      expect(isDetachedWriterRequest(valid)).toBe(true);
      expect(isDetachedWriterRequest({...valid,payload:{...valid.payload,module:'otro'}})).toBe(false);
      expect(isDetachedWriterRequest({...valid,payload:{...valid.payload,ownerId:''}})).toBe(false);
      await expect(saveDetachedSessionRecord(db,{...valid.payload,ownerId:''})).rejects.toThrow('inválida');
      expect(isDetachedWriterResponse({kind:'detached:session-saved',operationId:'one',result:{
        ok:true,message:'ok',currentUpdatedAt:'v1',status:{ready:true},
      }})).toBe(true);
    } finally { db.close(); }
  });
});

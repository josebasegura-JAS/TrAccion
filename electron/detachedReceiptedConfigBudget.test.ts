import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { saveDetachedConfiguracion } from './detachedConfiguracionWriterCore.js';
import { saveDetachedPresupuestos } from './detachedPresupuestosWriterCore.js';
import { saveWithDetachedCommitReceipt, verifyDetachedSqliteCommit } from './detachedWriterCommitReceipt.js';
import { isDetachedWriterRequest, isDetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';

const expected = { databaseUuid: 'pr485-sqlite', applicationId: 'TrAccion',
  environment: 'test', schemaVersion: 1 };
const op = (operationId: string) => ({ operationId, generation: 5, databaseUuid: expected.databaseUuid });
const budgetTables = ['presupuesto_scenario_records', 'presupuesto_manual_item_records',
  'presupuesto_ticket_group_records', 'presupuesto_actual_records'] as const;
function fixture() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES (1, '2026-11-17');
    CREATE TABLE persisted_records (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE configuracion_state (id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
  `);
  for (const table of budgetTables) db.exec(`CREATE TABLE ${table}
    (id TEXT PRIMARY KEY, value_json TEXT NOT NULL, created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL, deleted_at TEXT)`);
  for (const [key, value] of [
    ['database_uuid', expected.databaseUuid], ['application_id', expected.applicationId],
    ['environment', expected.environment], ['database_created_at', '2026-11-17'],
  ]) db.prepare('INSERT INTO app_metadata VALUES (?, ?, ?)').run(key, value, '2026-11-17');
  const config = { ownerId: 'operator-a', record: { value: '{"setting":true}', expectedUpdatedAt: null as string|null } };
  const budgets = { ownerId: 'operator-a', snapshot: {
    scenarios: [{ id: 's1', value: '{"id":"s1"}' }],
    manualItems: [{ id: 'm1', value: '{"id":"m1"}' }],
    ticketGroups: [{ id: 't1', value: '{"id":"t1"}' }],
    actuals: [{ id: 'a1', value: '{"id":"a1"}' }],
    expectedUpdatedAt: null as string|null,
  }};
  return { db, config, budgets };
}

describe('PR485 · recibos para Configuración y Presupuestos', () => {
  it('Configuración confirma el registro, token y recibo en una transacción', () => {
    const f = fixture();
    try {
      const result = saveWithDetachedCommitReceipt(f.db, op('config-save'), () =>
        saveDetachedConfiguracion(f.db, f.config));
      expect(result.ok).toBe(true);
      expect(f.db.prepare('SELECT id FROM configuracion_state').get()).toBeDefined();
      expect(verifyDetachedSqliteCommit(f.db, expected, op('config-save')).outcome).toBe('committed');
      expect(f.db.prepare("SELECT value FROM app_metadata WHERE key='persisted_records_refresh_token'").get()).toBeDefined();
      const conflict = saveWithDetachedCommitReceipt(f.db, op('config-conflict'), () =>
        saveDetachedConfiguracion(f.db, f.config));
      expect(conflict.ok).toBe(false);
      expect(verifyDetachedSqliteCommit(f.db, expected, op('config-conflict')).outcome)
        .toBe('not-committed');
    } finally { f.db.close(); }
  });

  it('Presupuestos confirma sus cuatro tablas y recibo y rechaza OCC obsoleto', () => {
    const f = fixture();
    try {
      const result = saveWithDetachedCommitReceipt(f.db, op('budget-save'), () =>
        saveDetachedPresupuestos(f.db, f.budgets));
      expect(result.ok).toBe(true);
      for (const table of budgetTables) {
        expect((f.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n:number }).n).toBe(1);
      }
      expect(verifyDetachedSqliteCommit(f.db, expected, op('budget-save')).outcome).toBe('committed');
      const conflict = saveWithDetachedCommitReceipt(f.db, op('budget-stale'), () =>
        saveDetachedPresupuestos(f.db, f.budgets));
      expect(conflict.ok).toBe(false);
      expect(verifyDetachedSqliteCommit(f.db, expected, op('budget-stale')).outcome)
        .toBe('not-committed');
      for (const table of budgetTables) {
        expect((f.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n:number }).n).toBe(1);
      }
    } finally { f.db.close(); }
  });

  it('rechaza repetir el operationId previamente confirmado sin ejecutar otra operación', () => {
    const f = fixture();
    try {
      saveWithDetachedCommitReceipt(f.db, op('same-id'), () =>
        saveDetachedConfiguracion(f.db, f.config));
      expect(() => saveWithDetachedCommitReceipt(f.db, op('same-id'), () =>
        saveDetachedPresupuestos(f.db, f.budgets))).toThrow('prohibido repetir');
      for (const table of budgetTables) {
        expect((f.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n:number }).n).toBe(0);
      }
    } finally { f.db.close(); }
  });

  it('no deja recibos ni registros de Presupuestos ante error SQL', () => {
    const f = fixture();
    try {
      saveWithDetachedCommitReceipt(f.db, op('baseline'), () => ({ ok: true }));
      f.db.exec("CREATE TRIGGER fail_budget BEFORE INSERT ON presupuesto_actual_records BEGIN SELECT RAISE(ABORT,'falla intencionada'); END;");
      expect(() => saveWithDetachedCommitReceipt(f.db, op('broken'), () =>
        saveDetachedPresupuestos(f.db, f.budgets))).toThrow('falla intencionada');
      for (const table of budgetTables) {
        expect((f.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n:number }).n).toBe(0);
      }
      expect(verifyDetachedSqliteCommit(f.db, expected, op('broken')).outcome)
        .toBe('not-committed');
    } finally { f.db.close(); }
  });

  it('protocolo restringe UUID, generación y cargas y valida respuestas', () => {
    const f = fixture();
    try {
      const configRequest = { kind: 'detached:save-configuracion-receipted',
        ...op('cfg'), payload: f.config };
      const budgetRequest = { kind: 'detached:save-presupuestos-receipted',
        ...op('bdg'), payload: f.budgets };
      expect(isDetachedWriterRequest(configRequest)).toBe(true);
      expect(isDetachedWriterRequest(budgetRequest)).toBe(true);
      expect(isDetachedWriterRequest({ ...configRequest, generation: 0 })).toBe(false);
      expect(isDetachedWriterRequest({ ...budgetRequest, databaseUuid: '' })).toBe(false);
      expect(isDetachedWriterRequest({ ...budgetRequest,
        payload: { ...f.budgets, ownerId: '' } })).toBe(false);
      const result = { ok: true, message: 'ok', currentUpdatedAt: 'v1', status: { ready: true } };
      expect(isDetachedWriterResponse({ kind: 'detached:configuracion-receipted',
        operationId: 'cfg', result })).toBe(true);
      expect(isDetachedWriterResponse({ kind: 'detached:presupuestos-receipted',
        operationId: 'bdg', result })).toBe(true);
    } finally { f.db.close(); }
  });
});

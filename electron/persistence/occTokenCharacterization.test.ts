import { createRequire } from 'node:module';
import type { Database, DatabaseConstructor } from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createTaskRepository, type TaskRepositoryDeps } from './taskRepository';
import { saveTaskRecordsInTransaction } from './taskBatchPersistence';
import { getDirectStoreUpdatedAtSnapshot } from './directStoreUpdatedAt';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as DatabaseConstructor;
const EARLY = '2026-11-10T09:00:00.000Z';
const LATE = '2026-11-10T10:00:00.000Z';

const status = {
  ready: true as const,
  engine: 'better-sqlite3' as const,
  phase: 'active' as const,
  path: ':memory:',
  schemaVersion: 19,
  isDefaultPath: false,
  lockPath: ':memory:.lockdir',
};

function createDb(): Database {
  const db = new BetterSqlite3(':memory:');
  db.exec(`
    CREATE TABLE task_records (
      id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE app_metadata (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE comite_session_records (
      id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE paritaria_session_records (
      id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE ticket_restaurante_person_records (
      id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE ticket_restaurante_manutencion_records (
      id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
  `);
  return db;
}

function taskValue(id: string, title: string, updatedAt: string): string {
  return JSON.stringify({ id, titulo: title, createdAt: EARLY, updatedAt, deletedAt: null });
}

function insertTask(db: Database, id: string, title: string, updatedAt: string): void {
  db.prepare('INSERT INTO task_records (id, value_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)')
    .run(id, taskValue(id, title, updatedAt), EARLY, updatedAt);
}

function repository(db: Database) {
  const deps: TaskRepositoryDeps = {
    safeDatabaseOperation: async <T>(operation: () => T) => operation(),
    getSqliteStatus: () => status,
    requireDatabase: () => db,
    readPersistedRecordByKey: () => null,
    isJsonObjectWithStringId: (value): value is { id: string; createdAt?: unknown; updatedAt?: unknown; deletedAt?: unknown } =>
      Boolean(value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string'),
    isCountRow: (value): value is { count: number } =>
      Boolean(value && typeof value === 'object' && typeof (value as { count?: unknown }).count === 'number'),
    isUpdatedAtRow: (value): value is { updated_at: string } =>
      Boolean(value && typeof value === 'object' && typeof (value as { updated_at?: unknown }).updated_at === 'string'),
    updateRefreshMetadata: () => undefined,
    enqueueLocalBackup: () => undefined,
    assertDatabaseWritesAllowed: () => undefined,
    isDatabaseWriteBlockedByHeartbeat: () => false,
    findForeignTaskEditingLock: () => null,
  };
  return createTaskRepository(deps);
}

function readTask(db: Database, id: string): { value_json: string; updated_at: string } {
  return db.prepare('SELECT value_json, updated_at FROM task_records WHERE id = ?')
    .get(id) as { value_json: string; updated_at: string };
}

/**
 * CARACTERIZACIÓN DEL COMPORTAMIENTO ACTUAL, no especificación deseada.
 * Las aserciones documentan defectos reproducibles sin dejar la CI roja.
 * Al implementar un token monotónico/inmutable, sustituir estas aserciones
 * por pruebas que exijan rechazo OCC y avance de la versión.
 */
describe('caracterización de tokens OCC y sincronización con SQLite real', () => {
  it('dos escritores pueden confirmar versiones sucesivas con un mismo updatedAt', async () => {
    const db = createDb();
    try {
      insertTask(db, 'same-clock', 'Original', EARLY);
      // Instancias independientes del repositorio sobre la misma SQLite;
      // los guardados se ejecutan secuencialmente, como los IPC serializados.
      const clientA = repository(db);
      const clientB = repository(db);
      const first = await clientA.saveTaskRecordIfUnchanged({
        id: 'same-clock', value: taskValue('same-clock', 'A', EARLY), expectedUpdatedAt: EARLY,
      });
      const second = await clientB.saveTaskRecordIfUnchanged({
        id: 'same-clock', value: taskValue('same-clock', 'B', EARLY), expectedUpdatedAt: EARLY,
      });
      expect(first.ok).toBe(true);
      // Defecto existente: B tenía un token anterior a la edición de A,
      // pero el servidor lo acepta porque el token de A no avanzó.
      expect(second.ok).toBe(true);
      expect(JSON.parse(readTask(db, 'same-clock').value_json) as { titulo: string })
        .toMatchObject({ titulo: 'B' });
      expect(readTask(db, 'same-clock').updated_at).toBe(EARLY);
    } finally { db.close(); }
  });

  it('el token MAX(updated_at) de Tareas no se mueve si otro equipo guarda con reloj retrasado', async () => {
    const db = createDb();
    try {
      insertTask(db, 'newest', 'Referencia', LATE);
      insertTask(db, 'older', 'Antes', EARLY);
      const before = getDirectStoreUpdatedAtSnapshot(db).tareas;
      const result = await repository(db).saveTaskRecordIfUnchanged({
        id: 'older', value: taskValue('older', 'Después', EARLY), expectedUpdatedAt: EARLY,
      });
      expect(result.ok).toBe(true);
      expect((JSON.parse(readTask(db, 'older').value_json) as { titulo: string }).titulo).toBe('Después');
      expect(getDirectStoreUpdatedAtSnapshot(db).tareas).toBe(before);
      expect(before).toBe(LATE);
    } finally { db.close(); }
  });

  it('un guardado por lote puede mantener el mismo token OCC que recibió', () => {
    const db = createDb();
    try {
      insertTask(db, 'batch', 'Antes', EARLY);
      const result = saveTaskRecordsInTransaction(db, [{
        id: 'batch', value: taskValue('batch', 'Después', EARLY), expectedUpdatedAt: EARLY,
      }], status);
      expect(result.ok).toBe(true);
      expect(readTask(db, 'batch').updated_at).toBe(EARLY);
      expect((JSON.parse(readTask(db, 'batch').value_json) as { titulo: string }).titulo).toBe('Después');
    } finally { db.close(); }
  });

  it('los tokens de Comité y Paritaria no avanzan si cambia un registro que no era el más reciente', () => {
    const db = createDb();
    try {
      for (const table of ['comite_session_records', 'paritaria_session_records']) {
        const insert = db.prepare(`INSERT INTO ${table} (id, value_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)`);
        insert.run('newest', '{"title":"Más reciente"}', EARLY, LATE);
        insert.run('older', '{"title":"Original"}', EARLY, EARLY);
      }
      const before = getDirectStoreUpdatedAtSnapshot(db);
      for (const table of ['comite_session_records', 'paritaria_session_records']) {
        db.prepare(`UPDATE ${table} SET value_json = ?, updated_at = ? WHERE id = ?`)
          .run('{"title":"Nuevo contenido"}', EARLY, 'older');
      }
      const after = getDirectStoreUpdatedAtSnapshot(db);
      expect(after['comite-sesiones']).toBe(before['comite-sesiones']);
      expect(after['paritaria-sesiones']).toBe(before['paritaria-sesiones']);
      expect(after['comite-sesiones']).toBe(LATE);
      expect(after['paritaria-sesiones']).toBe(LATE);
    } finally { db.close(); }
  });

  it('Ticket Restaurante, con varias tablas, tampoco detecta una fecha inferior al máximo', () => {
    const db = createDb();
    try {
      db.prepare('INSERT INTO ticket_restaurante_person_records (id, value_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)')
        .run('person-1', '{"value":"original"}', EARLY, LATE);
      db.prepare('INSERT INTO ticket_restaurante_manutencion_records (id, value_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)')
        .run('expense-1', '{"value":"original"}', EARLY, EARLY);
      const before = getDirectStoreUpdatedAtSnapshot(db)['ticket-restaurante'];
      db.prepare('UPDATE ticket_restaurante_manutencion_records SET value_json = ?, updated_at = ? WHERE id = ?')
        .run('{"value":"changed"}', EARLY, 'expense-1');
      expect(getDirectStoreUpdatedAtSnapshot(db)['ticket-restaurante']).toBe(before);
      expect(before).toBe(LATE);
    } finally { db.close(); }
  });

  it('rechaza correctamente OCC cuando el updatedAt realmente es distinto', async () => {
    const db = createDb();
    try {
      insertTask(db, 'different', 'Original', LATE);
      const result = await repository(db).saveTaskRecordIfUnchanged({
        id: 'different', value: taskValue('different', 'No permitido', EARLY), expectedUpdatedAt: EARLY,
      });
      expect(result.ok).toBe(false);
      expect((JSON.parse(readTask(db, 'different').value_json) as { titulo: string }).titulo).toBe('Original');
    } finally { db.close(); }
  });
});

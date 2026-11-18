import { describe, expect, it, vi } from 'vitest';
import SqliteDatabase from 'better-sqlite3';
import { createSimpleJsonModuleRepository, type SimpleDatabaseStatus } from './simpleJsonModuleRepository.js';

function setup(tableName: string) {
  const db = new SqliteDatabase(':memory:');
  db.exec(`
    CREATE TABLE persisted_records (
      key TEXT PRIMARY KEY, value_json TEXT NOT NULL, source TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE ${tableName} (
      id TEXT PRIMARY KEY, value_json TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, deleted_at TEXT
    );
  `);
  const status: SimpleDatabaseStatus = {
    ready: true, engine: 'better-sqlite3', phase: 'active',
    path: ':memory:', schemaVersion: 1, isDefaultPath: false, lockPath: ':memory:.lockdir',
  };
  const repository = createSimpleJsonModuleRepository(
    {
      tableName, legacyKey: 'test.ticket.people', moduleLabel: 'Persona de Ticket Restaurante',
      getMigrationDone: () => false, setMigrationDone: () => undefined,
    },
    {
      safeDatabaseOperation: async <T>(operation: () => T) => operation(),
      safeDatabaseMigrationOperation: async <T>(operation: () => T) => operation(),
      getSqliteStatus: () => status,
      requireDatabase: () => db,
      isUpdatedAtRow: (row): row is { updated_at: string } =>
        Boolean(row && typeof row === 'object' && typeof (row as { updated_at?: unknown }).updated_at === 'string'),
      updateRefreshMetadata: vi.fn(), enqueueLocalBackup: vi.fn(),
      assertDatabaseWritesAllowed: vi.fn(), isDatabaseWriteBlockedByHeartbeat: () => false,
    },
  );
  const save = (id: string, updatedAt: string, expectedUpdatedAt: string | null, calendarId = 'servicios-centrales') =>
    repository.saveIfUnchanged({
      id, expectedUpdatedAt,
      value: JSON.stringify({ empleado: id, calendarId, createdAt: updatedAt, updatedAt, deletedAt: null }),
    });
  return { db, repository, save };
}

describe('Ticket Restaurante: alta sobre registro dado de baja', () => {
  it('guarda altas nuevas y asocia el calendario de Servicios Centrales', async () => {
    const { db, repository, save } = setup('ticket_restaurante_person_records');
    try {
      expect((await save('105', '2026-10-19T09:00:00Z', null)).ok).toBe(true);
      const records = (await repository.loadSnapshot()).records;
      expect(records).toHaveLength(1);
      expect(JSON.parse(records[0]!.value).calendarId).toBe('servicios-centrales');
    } finally { db.close(); }
  });

  it('reactiva una persona eliminada sin borrar otras personas', async () => {
    const { db, repository, save } = setup('ticket_restaurante_person_records');
    try {
      await save('105', '2026-10-19T08:00:00Z', null);
      await save('106', '2026-10-19T08:00:00Z', null);
      db.prepare(`UPDATE ticket_restaurante_person_records SET deleted_at = ?, updated_at = ? WHERE id = ?`)
        .run('2026-10-19T08:30:00Z', '2026-10-19T08:30:00Z', '105');
      expect((await repository.loadSnapshot()).records.map((r) => r.id)).toEqual(['106']);
      const restored = await save('105', '2026-10-19T09:00:00Z', null);
      expect(restored.ok).toBe(true);
      expect((await repository.loadSnapshot()).records.map((r) => r.id).sort()).toEqual(['105', '106']);
    } finally { db.close(); }
  });

  it('no sobrescribe una persona activa aunque el alta envíe expectedUpdatedAt=null', async () => {
    const { db, save } = setup('ticket_restaurante_person_records');
    try {
      await save('105', '2026-10-19T08:00:00Z', null);
      expect((await save('105', '2026-10-19T09:00:00Z', null)).ok).toBe(false);
    } finally { db.close(); }
  });

  it('no acepta una versión obsoleta al editar una persona activa', async () => {
    const { db, save } = setup('ticket_restaurante_person_records');
    try {
      await save('105', '2026-10-19T08:00:00Z', null);
      await save('105', '2026-10-19T08:30:00Z', '2026-10-19T08:00:00Z');
      expect((await save('105', '2026-10-19T09:00:00Z', '2026-10-19T08:00:00Z')).ok).toBe(false);
    } finally { db.close(); }
  });

  it('no reabre tombstones en otros módulos', async () => {
    const { db, save } = setup('another_module_records');
    try {
      await save('105', '2026-10-19T08:00:00Z', null);
      db.prepare(`UPDATE another_module_records SET deleted_at = ?, updated_at = ? WHERE id = ?`)
        .run('2026-10-19T08:30:00Z', '2026-10-19T08:30:00Z', '105');
      expect((await save('105', '2026-10-19T09:00:00Z', null)).ok).toBe(false);
    } finally { db.close(); }
  });
});

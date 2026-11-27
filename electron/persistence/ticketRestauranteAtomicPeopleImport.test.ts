import { afterEach, describe, expect, it, vi } from 'vitest';
import SqliteDatabase from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { importTicketRestaurantePeopleAtomically } from './ticketRestauranteAtomicPeopleImport.js';

const tempDirectories: string[] = [];

async function createDatabase() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'traccion-ticket-import-'));
  tempDirectories.push(directory);
  const databasePath = path.join(directory, 'traccion.sqlite');
  const db = new SqliteDatabase(databasePath);
  db.exec(`
    CREATE TABLE ticket_restaurante_calendar_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE ticket_restaurante_person_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.close();
  return databasePath;
}

function record(id: string, updatedAt: string, expectedUpdatedAt: string | null) {
  return {
    id,
    value: JSON.stringify({
      id,
      empleado: id,
      createdAt: updatedAt,
      updatedAt,
      deletedAt: null,
    }),
    expectedUpdatedAt,
  };
}

function status(databasePath: string) {
  return {
    ready: true,
    phase: 'active' as const,
    path: databasePath,
    message: 'SQLite activo',
  };
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('importTicketRestaurantePeopleAtomically', () => {
  it('inserta calendarios y personas dentro de una única transacción', async () => {
    const databasePath = await createDatabase();
    const result = await importTicketRestaurantePeopleAtomically(status(databasePath), {
      calendars: [record('calendar-1', '2026-10-09T08:20:00.000Z', null)],
      people: [record('100', '2026-10-09T08:20:00.000Z', null)],
    });

    expect(result.ok).toBe(true);
    const db = new SqliteDatabase(databasePath, { fileMustExist: true });
    expect(db.prepare('SELECT COUNT(*) AS count FROM ticket_restaurante_calendar_records').get()).toEqual({ count: 1 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM ticket_restaurante_person_records').get()).toEqual({ count: 1 });
    db.close();
  });

  it('si una persona tiene conflicto OCC no crea los calendarios nuevos', async () => {
    const databasePath = await createDatabase();
    const db = new SqliteDatabase(databasePath, { fileMustExist: true });
    const existing = record('100', '2026-10-09T08:00:00.000Z', null);
    db.prepare(
      'INSERT INTO ticket_restaurante_person_records (id, value_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)',
    ).run(existing.id, existing.value, '2026-10-09T08:00:00.000Z', '2026-10-09T08:00:00.000Z');
    db.close();

    const result = await importTicketRestaurantePeopleAtomically(status(databasePath), {
      calendars: [record('calendar-1', '2026-10-09T08:20:00.000Z', null)],
      people: [record('100', '2026-10-09T08:20:00.000Z', '2026-10-09T07:59:00.000Z')],
    });

    expect(result.ok).toBe(false);
    expect(result.failedRecordId).toBe('100');
    const verify = new SqliteDatabase(databasePath, { fileMustExist: true });
    expect(verify.prepare('SELECT COUNT(*) AS count FROM ticket_restaurante_calendar_records').get()).toEqual({ count: 0 });
    expect(verify.prepare('SELECT updated_at FROM ticket_restaurante_person_records WHERE id = ?').get('100')).toEqual({
      updated_at: '2026-10-09T08:00:00.000Z',
    });
    verify.close();
  });

  it('revierte el calendario si falla la escritura de una persona después de empezar', async () => {
    const databasePath = await createDatabase();
    const db = new SqliteDatabase(databasePath, { fileMustExist: true });
    db.exec(`
      CREATE TRIGGER fail_person_insert
      BEFORE INSERT ON ticket_restaurante_person_records
      BEGIN
        SELECT RAISE(ABORT, 'forced person failure');
      END;
    `);
    db.close();

    const result = await importTicketRestaurantePeopleAtomically(status(databasePath), {
      calendars: [record('calendar-1', '2026-10-09T08:20:00.000Z', null)],
      people: [record('100', '2026-10-09T08:20:00.000Z', null)],
    });

    expect(result.ok).toBe(false);
    const verify = new SqliteDatabase(databasePath, { fileMustExist: true });
    expect(verify.prepare('SELECT COUNT(*) AS count FROM ticket_restaurante_calendar_records').get()).toEqual({ count: 0 });
    expect(verify.prepare('SELECT COUNT(*) AS count FROM ticket_restaurante_person_records').get()).toEqual({ count: 0 });
    verify.close();
  });
});

describe('T2: importaciones concurrentes de Ticket Restaurante', () => {
  const v1 = '2026-10-09T08:00:00.000Z';
  const v2 = '2026-10-09T09:00:00.000Z';

  it('dos importaciones incompatibles no mezclan calendarios ni personas y solo notifican el commit ganador', async () => {
    const databasePath = await createDatabase();
    const committedA = vi.fn();
    const committedB = vi.fn();
    const [a, b] = await Promise.all([
      importTicketRestaurantePeopleAtomically(status(databasePath), {
        calendars: [record('calendar-a', v1, null)], people: [record('100', v1, null)],
      }, committedA),
      importTicketRestaurantePeopleAtomically(status(databasePath), {
        calendars: [record('calendar-b', v2, null)], people: [record('100', v2, null)],
      }, committedB),
    ]);
    expect(Number(a.ok) + Number(b.ok)).toBe(1);
    expect(committedA).toHaveBeenCalledTimes(a.ok ? 1 : 0);
    expect(committedB).toHaveBeenCalledTimes(b.ok ? 1 : 0);
    const db = new SqliteDatabase(databasePath, { readonly: true, fileMustExist: true });
    try {
      expect(db.prepare('SELECT id FROM ticket_restaurante_calendar_records').all()).toEqual([{ id: a.ok ? 'calendar-a' : 'calendar-b' }]);
      expect(db.prepare('SELECT id, updated_at FROM ticket_restaurante_person_records').all()).toEqual([{ id: '100', updated_at: a.ok ? v1 : v2 }]);
      expect(db.prepare('SELECT COUNT(*) AS count FROM app_metadata').get()).toEqual({ count: 1 });
      expect(db.pragma('quick_check')).toEqual([{ quick_check: 'ok' }]);
    } finally { db.close(); }
  });

  it('dos importaciones independientes conservan ambos lotes y notifican cada commit una vez', async () => {
    const databasePath = await createDatabase();
    const committed = vi.fn();
    const results = await Promise.all([
      importTicketRestaurantePeopleAtomically(status(databasePath), {
        calendars: [record('calendar-a', v1, null)], people: [record('100', v1, null)],
      }, committed),
      importTicketRestaurantePeopleAtomically(status(databasePath), {
        calendars: [record('calendar-b', v2, null)], people: [record('200', v2, null)],
      }, committed),
    ]);
    expect(results.map(result => result.ok)).toEqual([true, true]);
    expect(committed).toHaveBeenCalledTimes(2);
    const db = new SqliteDatabase(databasePath, { readonly: true, fileMustExist: true });
    try {
      expect(db.prepare('SELECT id FROM ticket_restaurante_calendar_records ORDER BY id').all()).toEqual([{ id: 'calendar-a' }, { id: 'calendar-b' }]);
      expect(db.prepare('SELECT id FROM ticket_restaurante_person_records ORDER BY id').all()).toEqual([{ id: '100' }, { id: '200' }]);
    } finally { db.close(); }
  });
});

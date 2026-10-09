import SqliteDatabase from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  removeTicketRestauranteCalendarWithPeopleAtomically,
  type AtomicTicketDatabaseStatus,
} from './ticketRestauranteAtomicCalendarRemoval.js';

const tempDirectories: string[] = [];

function createDatabase() {
  const directory = mkdtempSync(path.join(tmpdir(), 'traccion-ticket-atomic-'));
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
  return { db, databasePath };
}

function statusFor(databasePath: string): AtomicTicketDatabaseStatus {
  return {
    ready: true,
    phase: 'active',
    path: databasePath,
  };
}

function seedRecord(
  db: Database,
  tableName: string,
  id: string,
  updatedAt: string,
): void {
  const value = JSON.stringify({ id, activo: true, createdAt: updatedAt, updatedAt });
  db.prepare(
    `INSERT INTO ${tableName} (id, value_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, NULL)`,
  ).run(id, value, updatedAt, updatedAt);
}

function deletedValue(id: string, updatedAt: string): string {
  return JSON.stringify({
    id,
    activo: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
    deletedAt: updatedAt,
  });
}

afterEach(() => {
  while (tempDirectories.length > 0) {
    rmSync(tempDirectories.pop()!, { recursive: true, force: true });
  }
});

describe('removeTicketRestauranteCalendarWithPeopleAtomically', () => {
  it('elimina calendario y personas asociadas en una sola transacción', () => {
    const { db, databasePath } = createDatabase();
    seedRecord(db, 'ticket_restaurante_calendar_records', 'cal-1', '2026-01-01T10:00:00.000Z');
    seedRecord(db, 'ticket_restaurante_person_records', '100', '2026-01-01T10:01:00.000Z');
    seedRecord(db, 'ticket_restaurante_person_records', '200', '2026-01-01T10:02:00.000Z');
    db.close();

    const deletedAt = '2026-01-02T10:00:00.000Z';
    const result = removeTicketRestauranteCalendarWithPeopleAtomically(statusFor(databasePath), {
      calendar: {
        id: 'cal-1',
        value: deletedValue('cal-1', deletedAt),
        expectedUpdatedAt: '2026-01-01T10:00:00.000Z',
      },
      people: [
        {
          id: '100',
          value: deletedValue('100', deletedAt),
          expectedUpdatedAt: '2026-01-01T10:01:00.000Z',
        },
        {
          id: '200',
          value: deletedValue('200', deletedAt),
          expectedUpdatedAt: '2026-01-01T10:02:00.000Z',
        },
      ],
    });

    expect(result.ok).toBe(true);

    const check = new SqliteDatabase(databasePath, { readonly: true });
    expect(
      check.prepare('SELECT deleted_at FROM ticket_restaurante_calendar_records WHERE id = ?').get('cal-1'),
    ).toEqual({ deleted_at: deletedAt });
    expect(
      check.prepare('SELECT COUNT(*) AS count FROM ticket_restaurante_person_records WHERE deleted_at = ?').get(deletedAt),
    ).toEqual({ count: 2 });
    expect(
      check.prepare("SELECT value FROM app_metadata WHERE key = 'persisted_records_refresh_token'").get(),
    ).toBeTruthy();
    check.close();
  });

  it('si una persona tiene conflicto OCC no modifica tampoco el calendario', () => {
    const { db, databasePath } = createDatabase();
    const calendarUpdatedAt = '2026-01-01T10:00:00.000Z';
    const personUpdatedAt = '2026-01-01T10:01:00.000Z';
    seedRecord(db, 'ticket_restaurante_calendar_records', 'cal-1', calendarUpdatedAt);
    seedRecord(db, 'ticket_restaurante_person_records', '100', personUpdatedAt);
    db.close();

    const result = removeTicketRestauranteCalendarWithPeopleAtomically(statusFor(databasePath), {
      calendar: {
        id: 'cal-1',
        value: deletedValue('cal-1', '2026-01-02T10:00:00.000Z'),
        expectedUpdatedAt: calendarUpdatedAt,
      },
      people: [
        {
          id: '100',
          value: deletedValue('100', '2026-01-02T10:00:00.000Z'),
          expectedUpdatedAt: 'token-obsoleto',
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.failedRecordId).toBe('100');

    const check = new SqliteDatabase(databasePath, { readonly: true });
    expect(
      check.prepare('SELECT updated_at, deleted_at FROM ticket_restaurante_calendar_records WHERE id = ?').get('cal-1'),
    ).toEqual({ updated_at: calendarUpdatedAt, deleted_at: null });
    expect(
      check.prepare('SELECT updated_at, deleted_at FROM ticket_restaurante_person_records WHERE id = ?').get('100'),
    ).toEqual({ updated_at: personUpdatedAt, deleted_at: null });
    check.close();
  });

  it('revierte el calendario si falla una actualización después de empezar la transacción', () => {
    const { db, databasePath } = createDatabase();
    const calendarUpdatedAt = '2026-01-01T10:00:00.000Z';
    const personUpdatedAt = '2026-01-01T10:01:00.000Z';
    seedRecord(db, 'ticket_restaurante_calendar_records', 'cal-1', calendarUpdatedAt);
    seedRecord(db, 'ticket_restaurante_person_records', '100', personUpdatedAt);
    db.exec(`
      CREATE TRIGGER fail_person_update
      BEFORE UPDATE ON ticket_restaurante_person_records
      WHEN OLD.id = '100'
      BEGIN
        SELECT RAISE(ABORT, 'fallo forzado');
      END;
    `);
    db.close();

    const result = removeTicketRestauranteCalendarWithPeopleAtomically(statusFor(databasePath), {
      calendar: {
        id: 'cal-1',
        value: deletedValue('cal-1', '2026-01-02T10:00:00.000Z'),
        expectedUpdatedAt: calendarUpdatedAt,
      },
      people: [
        {
          id: '100',
          value: deletedValue('100', '2026-01-02T10:00:00.000Z'),
          expectedUpdatedAt: personUpdatedAt,
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/fallo forzado/i);

    const check = new SqliteDatabase(databasePath, { readonly: true });
    expect(
      check.prepare('SELECT updated_at, deleted_at FROM ticket_restaurante_calendar_records WHERE id = ?').get('cal-1'),
    ).toEqual({ updated_at: calendarUpdatedAt, deleted_at: null });
    expect(
      check.prepare('SELECT updated_at, deleted_at FROM ticket_restaurante_person_records WHERE id = ?').get('100'),
    ).toEqual({ updated_at: personUpdatedAt, deleted_at: null });
    check.close();
  });
});

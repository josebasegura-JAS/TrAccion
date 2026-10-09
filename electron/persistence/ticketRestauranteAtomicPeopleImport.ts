import SqliteDatabase from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  createDatabaseLockManager,
  DATABASE_HEARTBEAT_BLOCKED_MESSAGE,
} from './databaseLockManager.js';
import { extractJsonRecordTimestamps } from './jsonRecordRepository.js';

export interface AtomicTicketImportDatabaseStatus {
  ready: boolean;
  phase: 'prepared' | 'active' | 'fallback' | 'error' | 'locked';
  path: string;
  message?: string;
}

export interface AtomicTicketImportRecord {
  id: string;
  value: string;
  expectedUpdatedAt: string | null;
}

export interface AtomicTicketPeopleImportPayload {
  calendars: AtomicTicketImportRecord[];
  people: AtomicTicketImportRecord[];
}

export interface AtomicTicketPeopleImportResult {
  ok: boolean;
  status: AtomicTicketImportDatabaseStatus;
  message: string;
  failedRecordId?: string;
}

function readUpdatedAt(db: Database, tableName: string, id: string): string | null {
  const row = db.prepare(`SELECT updated_at FROM ${tableName} WHERE id = ?`).get(id);
  if (!row || typeof row !== 'object' || typeof (row as { updated_at?: unknown }).updated_at !== 'string') {
    return null;
  }
  return (row as { updated_at: string }).updated_at;
}

function validateExpectedVersion(
  db: Database,
  tableName: string,
  record: AtomicTicketImportRecord,
): boolean {
  return readUpdatedAt(db, tableName, record.id) === record.expectedUpdatedAt;
}

function saveRecord(
  db: Database,
  tableName: string,
  record: AtomicTicketImportRecord,
): void {
  const { createdAt, updatedAt, deletedAt } = extractJsonRecordTimestamps(record.value);

  if (record.expectedUpdatedAt === null) {
    const inserted = db
      .prepare(
        `INSERT OR IGNORE INTO ${tableName} (id, value_json, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(record.id, record.value, createdAt, updatedAt, deletedAt);
    if (inserted.changes !== 1) {
      throw new Error(`El registro ${record.id} ya existe en la base compartida.`);
    }
    return;
  }

  const updated = db
    .prepare(
      `UPDATE ${tableName}
       SET value_json = ?, updated_at = ?, deleted_at = ?
       WHERE id = ? AND updated_at = ?`,
    )
    .run(record.value, updatedAt, deletedAt, record.id, record.expectedUpdatedAt);
  if (updated.changes !== 1) {
    throw new Error(`El registro ${record.id} ha cambiado durante la importación.`);
  }
}

function updateRefreshMetadata(db: Database): void {
  const updatedAt = new Date().toISOString();
  const token = `${updatedAt}:ticket-people-import-atomic:${randomUUID()}`;
  db.prepare(
    `INSERT INTO app_metadata (key, value, updated_at)
     VALUES ('persisted_records_refresh_token', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(token, updatedAt);
}

export async function importTicketRestaurantePeopleAtomically(
  status: AtomicTicketImportDatabaseStatus,
  payload: AtomicTicketPeopleImportPayload,
): Promise<AtomicTicketPeopleImportResult> {
  if (
    !status.ready ||
    status.phase !== 'active' ||
    status.message === DATABASE_HEARTBEAT_BLOCKED_MESSAGE
  ) {
    return {
      ok: false,
      status,
      message:
        status.message ??
        'SQLite no está activo. No se puede importar personas de Ticket Restaurante de forma segura.',
    };
  }

  if (payload.calendars.length === 0 && payload.people.length === 0) {
    return { ok: true, status, message: 'No hay cambios que importar.' };
  }

  const operationOwnerId = `ticket-people-import-${randomUUID()}`;
  const lockManager = createDatabaseLockManager({ getOwnerId: () => operationOwnerId });

  try {
    return await lockManager.withDatabaseOperationLock(status.path, async () => {
      const db = new SqliteDatabase(status.path, { fileMustExist: true, timeout: 15_000 });
      try {
        const transaction = db.transaction((): AtomicTicketPeopleImportResult => {
          for (const calendar of payload.calendars) {
            if (!validateExpectedVersion(db, 'ticket_restaurante_calendar_records', calendar)) {
              return {
                ok: false,
                status,
                failedRecordId: calendar.id,
                message:
                  'Un calendario de Ticket Restaurante ha cambiado mientras importabas. Recarga antes de continuar.',
              };
            }
          }

          for (const person of payload.people) {
            if (!validateExpectedVersion(db, 'ticket_restaurante_person_records', person)) {
              return {
                ok: false,
                status,
                failedRecordId: person.id,
                message:
                  'Una persona de Ticket Restaurante ha cambiado mientras importabas. Recarga antes de continuar.',
              };
            }
          }

          for (const calendar of payload.calendars) {
            saveRecord(db, 'ticket_restaurante_calendar_records', calendar);
          }
          for (const person of payload.people) {
            saveRecord(db, 'ticket_restaurante_person_records', person);
          }
          updateRefreshMetadata(db);

          return {
            ok: true,
            status,
            message: `${payload.people.length} persona(s) y ${payload.calendars.length} calendario(s) guardados de forma atómica.`,
          };
        });

        return transaction();
      } finally {
        db.close();
      }
    });
  } catch (error) {
    return {
      ok: false,
      status,
      message:
        error instanceof Error
          ? `No se ha podido importar Ticket Restaurante de forma atómica: ${error.message}`
          : 'No se ha podido importar Ticket Restaurante de forma atómica.',
    };
  }
}

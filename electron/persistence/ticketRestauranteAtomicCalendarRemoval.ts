import SqliteDatabase from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  createDatabaseLockManager,
  DATABASE_HEARTBEAT_BLOCKED_MESSAGE,
} from './databaseLockManager.js';

export interface AtomicTicketDatabaseStatus {
  ready: boolean;
  phase: 'prepared' | 'active' | 'fallback' | 'error' | 'locked';
  path: string;
  message?: string;
}

export interface AtomicTicketRecordMutation {
  id: string;
  value: string;
  expectedUpdatedAt: string | null;
}

export interface AtomicTicketCalendarRemovalPayload {
  calendar: AtomicTicketRecordMutation;
  people: AtomicTicketRecordMutation[];
}

export interface AtomicTicketCalendarRemovalResult {
  ok: boolean;
  status: AtomicTicketDatabaseStatus;
  message: string;
  failedRecordId?: string;
}

interface RecordMeta {
  updatedAt: string;
  deletedAt: string;
}

function parseDeletedRecordMeta(value: string, label: string): RecordMeta {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label}: JSON inválido.`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`${label}: contenido inválido.`);
  }

  const candidate = parsed as { updatedAt?: unknown; deletedAt?: unknown };
  if (typeof candidate.updatedAt !== 'string' || typeof candidate.deletedAt !== 'string') {
    throw new Error(`${label}: la baja debe incluir updatedAt y deletedAt.`);
  }

  return { updatedAt: candidate.updatedAt, deletedAt: candidate.deletedAt };
}

function readUpdatedAt(db: Database, tableName: string, id: string): string | null {
  const row = db.prepare(`SELECT updated_at FROM ${tableName} WHERE id = ?`).get(id);
  if (!row || typeof row !== 'object' || typeof (row as { updated_at?: unknown }).updated_at !== 'string') {
    return null;
  }
  return (row as { updated_at: string }).updated_at;
}

function updateDeletedRecord(
  db: Database,
  tableName: string,
  record: AtomicTicketRecordMutation,
  label: string,
): void {
  const meta = parseDeletedRecordMeta(record.value, label);
  const updateResult = db
    .prepare(
      `UPDATE ${tableName}
       SET value_json = ?, updated_at = ?, deleted_at = ?
       WHERE id = ? AND updated_at = ?`,
    )
    .run(record.value, meta.updatedAt, meta.deletedAt, record.id, record.expectedUpdatedAt);

  if (updateResult.changes !== 1) {
    throw new Error(`${label}: conflicto de concurrencia durante la actualización.`);
  }
}

function updateRefreshMetadata(db: Database): void {
  const updatedAt = new Date().toISOString();
  const token = `${updatedAt}:ticket-calendar-atomic:${randomUUID()}`;
  db.prepare(
    `INSERT INTO app_metadata (key, value, updated_at)
     VALUES ('persisted_records_refresh_token', ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  ).run(token, updatedAt);
}

export async function removeTicketRestauranteCalendarWithPeopleAtomically(
  status: AtomicTicketDatabaseStatus,
  payload: AtomicTicketCalendarRemovalPayload,
): Promise<AtomicTicketCalendarRemovalResult> {
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
        'SQLite no está activo. No se puede eliminar el calendario de Ticket Restaurante de forma segura.',
    };
  }

  const operationOwnerId = `ticket-calendar-atomic-${randomUUID()}`;
  const lockManager = createDatabaseLockManager({ getOwnerId: () => operationOwnerId });

  try {
    return await lockManager.withDatabaseOperationLock(status.path, async () => {
      const db = new SqliteDatabase(status.path, { fileMustExist: true, timeout: 15_000 });

      try {
        const transaction = db.transaction((): AtomicTicketCalendarRemovalResult => {
          const currentCalendarUpdatedAt = readUpdatedAt(
            db,
            'ticket_restaurante_calendar_records',
            payload.calendar.id,
          );
          if (
            currentCalendarUpdatedAt === null ||
            currentCalendarUpdatedAt !== payload.calendar.expectedUpdatedAt
          ) {
            return {
              ok: false,
              status,
              failedRecordId: payload.calendar.id,
              message:
                'El calendario ha sido modificado por otro usuario. Recarga antes de eliminarlo.',
            };
          }

          for (const person of payload.people) {
            const currentPersonUpdatedAt = readUpdatedAt(
              db,
              'ticket_restaurante_person_records',
              person.id,
            );
            if (
              currentPersonUpdatedAt === null ||
              currentPersonUpdatedAt !== person.expectedUpdatedAt
            ) {
              return {
                ok: false,
                status,
                failedRecordId: person.id,
                message:
                  'Una persona asociada al calendario ha sido modificada por otro usuario. Recarga antes de eliminar el calendario.',
              };
            }
          }

          updateDeletedRecord(
            db,
            'ticket_restaurante_calendar_records',
            payload.calendar,
            'Calendario de Ticket Restaurante',
          );
          for (const person of payload.people) {
            updateDeletedRecord(
              db,
              'ticket_restaurante_person_records',
              person,
              `Persona ${person.id} de Ticket Restaurante`,
            );
          }
          updateRefreshMetadata(db);

          return {
            ok: true,
            status,
            message:
              payload.people.length === 0
                ? 'Calendario eliminado de forma atómica.'
                : `Calendario y ${payload.people.length} persona(s) asociada(s) eliminados de forma atómica.`,
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
          ? `No se ha podido eliminar el calendario de Ticket Restaurante de forma atómica: ${error.message}`
          : 'No se ha podido eliminar el calendario de Ticket Restaurante de forma atómica.',
    };
  }
}

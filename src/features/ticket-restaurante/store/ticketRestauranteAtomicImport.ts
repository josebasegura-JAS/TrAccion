import {
  clearPersistenceBusy,
  publishPersistenceBusy,
  waitForNextPaint,
} from '../../../services/persistence';
import { publishDatabaseStatus } from '../../../services/databaseStatus';

const ATOMIC_IMPORT_KEY = 'traccion.v1.ticketRestaurante.atomic-people-import';
const TEMPORARY_SQLITE_BUSY_RETRIES = 6;
const TEMPORARY_SQLITE_BUSY_RETRY_MS = 250;

export interface AtomicTicketImportRecord {
  id: string;
  serializedValue: string;
  expectedUpdatedAt: string | null;
}

export interface AtomicTicketImportResult {
  ok: boolean;
  message: string;
  failedRecordId?: string;
}

function isTemporarySqliteBusyError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  return (
    message.includes('base ocupada') ||
    message.includes('bloqueo temporal') ||
    message.includes('sqlite_busy') ||
    message.includes('database is locked') ||
    message.includes('temporarily unavailable')
  );
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function withTemporarySqliteRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= TEMPORARY_SQLITE_BUSY_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTemporarySqliteBusyError(error) || attempt === TEMPORARY_SQLITE_BUSY_RETRIES) break;
      await delay(
        Math.min(
          TEMPORARY_SQLITE_BUSY_RETRY_MS * 2 ** attempt + Math.trunc(Math.random() * 100),
          3000,
        ),
      );
    }
  }
  throw lastError;
}

export function hasAtomicTicketPeopleImport(): boolean {
  return Boolean(window.traccion?.importTicketRestaurantePeopleAtomically);
}

export async function importTicketPeopleAtomically(
  calendars: AtomicTicketImportRecord[],
  people: AtomicTicketImportRecord[],
): Promise<AtomicTicketImportResult | null> {
  const importer = window.traccion?.importTicketRestaurantePeopleAtomically;
  if (!importer) return null;

  publishPersistenceBusy(ATOMIC_IMPORT_KEY, 'Importando personas y calendarios en SQLite…');
  await waitForNextPaint();

  try {
    const result = await withTemporarySqliteRetry(() =>
      importer({
        calendars: calendars.map((record) => ({
          id: record.id,
          value: record.serializedValue,
          expectedUpdatedAt: record.expectedUpdatedAt,
        })),
        people: people.map((record) => ({
          id: record.id,
          value: record.serializedValue,
          expectedUpdatedAt: record.expectedUpdatedAt,
        })),
      }),
    );
    publishDatabaseStatus(result.status);
    clearPersistenceBusy(ATOMIC_IMPORT_KEY, result.message);
    return {
      ok: result.ok,
      message: result.message,
      failedRecordId: result.failedRecordId,
    };
  } catch (error) {
    clearPersistenceBusy(
      ATOMIC_IMPORT_KEY,
      'No se ha podido importar Ticket Restaurante de forma atómica.',
    );
    throw error;
  }
}

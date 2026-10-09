import {
  clearPersistenceBusy,
  publishPersistenceBusy,
  waitForNextPaint,
} from '../../../services/persistence';
import { publishDatabaseStatus } from '../../../services/databaseStatus';

const TICKET_RESTAURANTE_ATOMIC_REMOVE_KEY =
  'traccion.v1.ticketRestaurante.atomic-calendar-removal';
const TEMPORARY_SQLITE_BUSY_RETRIES = 6;
const TEMPORARY_SQLITE_BUSY_RETRY_MS = 250;

export interface AtomicTicketRemovalRecord {
  id: string;
  serializedValue: string;
  expectedUpdatedAt: string | null;
}

export interface AtomicTicketRemovalResult {
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
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function withTemporarySqliteRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= TEMPORARY_SQLITE_BUSY_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTemporarySqliteBusyError(error) || attempt === TEMPORARY_SQLITE_BUSY_RETRIES) {
        break;
      }
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

export function hasAtomicTicketCalendarRemoval(): boolean {
  return Boolean(window.traccion?.removeTicketRestauranteCalendarWithPeopleAtomically);
}

export async function removeTicketCalendarWithPeopleAtomically(
  calendar: AtomicTicketRemovalRecord,
  people: AtomicTicketRemovalRecord[],
): Promise<AtomicTicketRemovalResult | null> {
  const remover = window.traccion?.removeTicketRestauranteCalendarWithPeopleAtomically;
  if (!remover) {
    return null;
  }

  publishPersistenceBusy(
    TICKET_RESTAURANTE_ATOMIC_REMOVE_KEY,
    'Eliminando calendario y personas asociadas en SQLite…',
  );
  await waitForNextPaint();

  try {
    const result = await withTemporarySqliteRetry(() =>
      remover({
        calendar: {
          id: calendar.id,
          value: calendar.serializedValue,
          expectedUpdatedAt: calendar.expectedUpdatedAt,
        },
        people: people.map((person) => ({
          id: person.id,
          value: person.serializedValue,
          expectedUpdatedAt: person.expectedUpdatedAt,
        })),
      }),
    );

    publishDatabaseStatus(result.status);
    clearPersistenceBusy(TICKET_RESTAURANTE_ATOMIC_REMOVE_KEY, result.message);
    return {
      ok: result.ok,
      message: result.message,
      failedRecordId: result.failedRecordId,
    };
  } catch (error) {
    clearPersistenceBusy(
      TICKET_RESTAURANTE_ATOMIC_REMOVE_KEY,
      'No se ha podido eliminar el calendario de Ticket Restaurante en SQLite.',
    );
    throw error;
  }
}

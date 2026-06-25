import {
  clearPersistenceBusy,
  publishPersistenceBusy,
  waitForNextPaint,
} from '../../../services/persistence';
import { publishDatabaseStatus } from '../../../services/databaseStatus';

const TICKET_RESTAURANTE_CALENDARS_STORAGE_KEY = 'traccion.v1.ticketRestaurante.calendars';
const TICKET_RESTAURANTE_PEOPLE_STORAGE_KEY = 'traccion.v1.ticketRestaurante.people';
const TEMPORARY_SQLITE_BUSY_RETRIES = 6;
const TEMPORARY_SQLITE_BUSY_RETRY_MS = 250;

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
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

export interface TicketRestauranteSqliteRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TicketRestauranteSqliteSaveResult {
  ok: boolean;
  message: string;
  currentUpdatedAt: string | null;
}

export interface TicketRestauranteSqliteBatchSaveResult {
  ok: boolean;
  message: string;
  failedRecordId?: string;
}

// -- Calendars ---------------------------------------------------------------

export function hasTicketRestauranteCalendarsSqliteRepository(): boolean {
  return Boolean(
    window.traccion?.loadTicketRestauranteCalendarRecords &&
      window.traccion?.saveTicketRestauranteCalendarRecordIfUnchanged,
  );
}

export async function loadTicketRestauranteCalendarRecordsFromSqlite(): Promise<
  TicketRestauranteSqliteRecord[] | null
> {
  const loader = window.traccion?.loadTicketRestauranteCalendarRecords;
  if (!loader) {
    return null;
  }

  const snapshot = await withTemporarySqliteRetry(() => loader());
  publishDatabaseStatus(snapshot.status);
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    return null;
  }

  return snapshot.records;
}

export async function saveTicketRestauranteCalendarToSqlite(
  record: { id: string },
  serializedValue: string,
  expectedUpdatedAt: string | null,
): Promise<TicketRestauranteSqliteSaveResult | null> {
  const saver = window.traccion?.saveTicketRestauranteCalendarRecordIfUnchanged;
  if (!saver) {
    return null;
  }

  publishPersistenceBusy(
    TICKET_RESTAURANTE_CALENDARS_STORAGE_KEY,
    'Guardando calendario de Ticket Restaurante en SQLite…',
  );
  await waitForNextPaint();

  try {
    const result = await withTemporarySqliteRetry(() =>
      saver({ id: record.id, value: serializedValue, expectedUpdatedAt }),
    );

    publishDatabaseStatus(result.status);
    clearPersistenceBusy(TICKET_RESTAURANTE_CALENDARS_STORAGE_KEY, result.message);

    return {
      ok: result.ok,
      message: result.message,
      currentUpdatedAt: result.currentUpdatedAt,
    };
  } catch (error) {
    clearPersistenceBusy(
      TICKET_RESTAURANTE_CALENDARS_STORAGE_KEY,
      'No se ha podido guardar el calendario de Ticket Restaurante en SQLite.',
    );
    throw error;
  }
}

/**
 * Guarda varios calendarios en una sola llamada IPC / transacción SQLite.
 * Pensado para la siembra inicial desde localStorage, que puede traer varios
 * calendarios a la vez.
 */
export async function saveTicketRestauranteCalendarsToSqlite(
  records: Array<{ id: string; serializedValue: string; expectedUpdatedAt: string | null }>,
): Promise<TicketRestauranteSqliteBatchSaveResult | null> {
  const saver = window.traccion?.saveTicketRestauranteCalendarRecordsIfUnchanged;
  if (!saver) {
    return null;
  }

  if (records.length === 0) {
    return { ok: true, message: 'Nada que importar.' };
  }

  publishPersistenceBusy(
    TICKET_RESTAURANTE_CALENDARS_STORAGE_KEY,
    `Guardando ${records.length} calendarios de Ticket Restaurante en SQLite…`,
  );
  await waitForNextPaint();

  try {
    const result = await withTemporarySqliteRetry(() =>
      saver(
        records.map(({ id, serializedValue, expectedUpdatedAt }) => ({
          id,
          value: serializedValue,
          expectedUpdatedAt,
        })),
      ),
    );

    publishDatabaseStatus(result.status);
    clearPersistenceBusy(TICKET_RESTAURANTE_CALENDARS_STORAGE_KEY, result.message);

    return {
      ok: result.ok,
      message: result.message,
      failedRecordId: result.failedRecordId,
    };
  } catch (error) {
    clearPersistenceBusy(
      TICKET_RESTAURANTE_CALENDARS_STORAGE_KEY,
      'No se ha podido importar los calendarios de Ticket Restaurante en SQLite.',
    );
    throw error;
  }
}

// -- People -------------------------------------------------------------------

export function hasTicketRestaurantePeopleSqliteRepository(): boolean {
  return Boolean(
    window.traccion?.loadTicketRestaurantePersonRecords &&
      window.traccion?.saveTicketRestaurantePersonRecordIfUnchanged,
  );
}

export async function loadTicketRestaurantePersonRecordsFromSqlite(): Promise<
  TicketRestauranteSqliteRecord[] | null
> {
  const loader = window.traccion?.loadTicketRestaurantePersonRecords;
  if (!loader) {
    return null;
  }

  const snapshot = await withTemporarySqliteRetry(() => loader());
  publishDatabaseStatus(snapshot.status);
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    return null;
  }

  return snapshot.records;
}

export async function saveTicketRestaurantePersonToSqlite(
  record: { id: string },
  serializedValue: string,
  expectedUpdatedAt: string | null,
): Promise<TicketRestauranteSqliteSaveResult | null> {
  const saver = window.traccion?.saveTicketRestaurantePersonRecordIfUnchanged;
  if (!saver) {
    return null;
  }

  publishPersistenceBusy(
    TICKET_RESTAURANTE_PEOPLE_STORAGE_KEY,
    'Guardando persona de Ticket Restaurante en SQLite…',
  );
  await waitForNextPaint();

  try {
    const result = await withTemporarySqliteRetry(() =>
      saver({ id: record.id, value: serializedValue, expectedUpdatedAt }),
    );

    publishDatabaseStatus(result.status);
    clearPersistenceBusy(TICKET_RESTAURANTE_PEOPLE_STORAGE_KEY, result.message);

    return {
      ok: result.ok,
      message: result.message,
      currentUpdatedAt: result.currentUpdatedAt,
    };
  } catch (error) {
    clearPersistenceBusy(
      TICKET_RESTAURANTE_PEOPLE_STORAGE_KEY,
      'No se ha podido guardar la persona de Ticket Restaurante en SQLite.',
    );
    throw error;
  }
}

/**
 * Guarda varias personas en una sola llamada IPC / transacción SQLite.
 * Pensado para la siembra inicial desde localStorage y para importPeople,
 * que puede traer decenas de personas a la vez (antes una llamada IPC por
 * fila).
 */
export async function saveTicketRestaurantePeopleToSqlite(
  records: Array<{ id: string; serializedValue: string; expectedUpdatedAt: string | null }>,
): Promise<TicketRestauranteSqliteBatchSaveResult | null> {
  const saver = window.traccion?.saveTicketRestaurantePersonRecordsIfUnchanged;
  if (!saver) {
    return null;
  }

  if (records.length === 0) {
    return { ok: true, message: 'Nada que importar.' };
  }

  publishPersistenceBusy(
    TICKET_RESTAURANTE_PEOPLE_STORAGE_KEY,
    `Guardando ${records.length} personas de Ticket Restaurante en SQLite…`,
  );
  await waitForNextPaint();

  try {
    const result = await withTemporarySqliteRetry(() =>
      saver(
        records.map(({ id, serializedValue, expectedUpdatedAt }) => ({
          id,
          value: serializedValue,
          expectedUpdatedAt,
        })),
      ),
    );

    publishDatabaseStatus(result.status);
    clearPersistenceBusy(TICKET_RESTAURANTE_PEOPLE_STORAGE_KEY, result.message);

    return {
      ok: result.ok,
      message: result.message,
      failedRecordId: result.failedRecordId,
    };
  } catch (error) {
    clearPersistenceBusy(
      TICKET_RESTAURANTE_PEOPLE_STORAGE_KEY,
      'No se ha podido importar las personas de Ticket Restaurante en SQLite.',
    );
    throw error;
  }
}

import {
  clearPersistenceBusy,
  publishPersistenceBusy,
  waitForNextPaint,
} from '../../../services/persistence';
import { publishDatabaseStatus } from '../../../services/databaseStatus';
import {
  registerPendingWriteReplayer,
  saveRecordWithPendingFallback,
} from '../../../services/pendingRecordWrites';

const TICKET_RESTAURANTE_CALENDARS_STORAGE_KEY = 'traccion.v1.ticketRestaurante.calendars';
const TICKET_RESTAURANTE_PEOPLE_STORAGE_KEY = 'traccion.v1.ticketRestaurante.people';
const TICKET_RESTAURANTE_ABSENCES_STORAGE_KEY = 'traccion.v1.ticketRestaurante.absences';
const TICKET_RESTAURANTE_CONFIG_STORAGE_KEY = 'traccion.v1.ticketRestaurante.config';
const TICKET_RESTAURANTE_MANUTENCIONES_STORAGE_KEY = 'traccion.v1.ticketRestaurante.manutenciones';
// Ticket Restaurante tiene 5 entidades independientes en el mismo repositorio:
// cada una necesita su propio nombre de módulo para la cola de pendientes,
// para que un calendario encolado no se confunda con una persona encolada
// con el mismo id.
const TICKET_RESTAURANTE_CALENDARS_PENDING_WRITE_MODULE = 'ticket-restaurante-calendarios';
const TICKET_RESTAURANTE_PEOPLE_PENDING_WRITE_MODULE = 'ticket-restaurante-personas';
const TICKET_RESTAURANTE_ABSENCES_PENDING_WRITE_MODULE = 'ticket-restaurante-ausencias';
const TICKET_RESTAURANTE_CONFIG_PENDING_WRITE_MODULE = 'ticket-restaurante-config';
const TICKET_RESTAURANTE_MANUTENCIONES_PENDING_WRITE_MODULE = 'ticket-restaurante-manutenciones';
const TEMPORARY_SQLITE_BUSY_RETRIES = 6;
const TEMPORARY_SQLITE_BUSY_RETRY_MS = 250;

registerPendingWriteReplayer(
  TICKET_RESTAURANTE_CALENDARS_PENDING_WRITE_MODULE,
  async (recordId, value, expectedUpdatedAt) => {
    const saver = window.traccion?.saveTicketRestauranteCalendarRecordIfUnchanged;
    if (!saver) {
      return null;
    }
    const result = await saver({ id: recordId, value, expectedUpdatedAt });
    publishDatabaseStatus(result.status);
    return { ok: result.ok, message: result.message, currentUpdatedAt: result.currentUpdatedAt };
  },
);

registerPendingWriteReplayer(
  TICKET_RESTAURANTE_PEOPLE_PENDING_WRITE_MODULE,
  async (recordId, value, expectedUpdatedAt) => {
    const saver = window.traccion?.saveTicketRestaurantePersonRecordIfUnchanged;
    if (!saver) {
      return null;
    }
    const result = await saver({ id: recordId, value, expectedUpdatedAt });
    publishDatabaseStatus(result.status);
    return { ok: result.ok, message: result.message, currentUpdatedAt: result.currentUpdatedAt };
  },
);

registerPendingWriteReplayer(
  TICKET_RESTAURANTE_ABSENCES_PENDING_WRITE_MODULE,
  async (recordId, value, expectedUpdatedAt) => {
    const saver = window.traccion?.saveTicketRestauranteAbsenceRecordIfUnchanged;
    if (!saver) {
      return null;
    }
    const result = await saver({ id: recordId, value, expectedUpdatedAt });
    publishDatabaseStatus(result.status);
    return { ok: result.ok, message: result.message, currentUpdatedAt: result.currentUpdatedAt };
  },
);

registerPendingWriteReplayer(
  TICKET_RESTAURANTE_CONFIG_PENDING_WRITE_MODULE,
  async (recordId, value, expectedUpdatedAt) => {
    const saver = window.traccion?.saveTicketRestauranteConfigRecordIfUnchanged;
    if (!saver) {
      return null;
    }
    const result = await saver({ id: recordId, value, expectedUpdatedAt });
    publishDatabaseStatus(result.status);
    return { ok: result.ok, message: result.message, currentUpdatedAt: result.currentUpdatedAt };
  },
);

registerPendingWriteReplayer(
  TICKET_RESTAURANTE_MANUTENCIONES_PENDING_WRITE_MODULE,
  async (recordId, value, expectedUpdatedAt) => {
    const saver = window.traccion?.saveTicketRestauranteManutencionRecordIfUnchanged;
    if (!saver) {
      return null;
    }
    const result = await saver({ id: recordId, value, expectedUpdatedAt });
    publishDatabaseStatus(result.status);
    return { ok: result.ok, message: result.message, currentUpdatedAt: result.currentUpdatedAt };
  },
);

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
    const result = await saveRecordWithPendingFallback({
      module: TICKET_RESTAURANTE_CALENDARS_PENDING_WRITE_MODULE,
      recordId: record.id,
      value: serializedValue,
      expectedUpdatedAt,
      save: async () => {
        const rawResult = await withTemporarySqliteRetry(() =>
          saver({ id: record.id, value: serializedValue, expectedUpdatedAt }),
        );
        publishDatabaseStatus(rawResult.status);
        return { ok: rawResult.ok, message: rawResult.message, currentUpdatedAt: rawResult.currentUpdatedAt };
      },
    });

    clearPersistenceBusy(TICKET_RESTAURANTE_CALENDARS_STORAGE_KEY, result.message);

    return result;
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
    const result = await saveRecordWithPendingFallback({
      module: TICKET_RESTAURANTE_PEOPLE_PENDING_WRITE_MODULE,
      recordId: record.id,
      value: serializedValue,
      expectedUpdatedAt,
      save: async () => {
        const rawResult = await withTemporarySqliteRetry(() =>
          saver({ id: record.id, value: serializedValue, expectedUpdatedAt }),
        );
        publishDatabaseStatus(rawResult.status);
        return { ok: rawResult.ok, message: rawResult.message, currentUpdatedAt: rawResult.currentUpdatedAt };
      },
    });

    clearPersistenceBusy(TICKET_RESTAURANTE_PEOPLE_STORAGE_KEY, result.message);

    return result;
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

// -- Absences -----------------------------------------------------------------

export function hasTicketRestauranteAbsencesSqliteRepository(): boolean {
  return Boolean(
    window.traccion?.loadTicketRestauranteAbsenceRecords &&
      window.traccion?.saveTicketRestauranteAbsenceRecordIfUnchanged,
  );
}

export async function loadTicketRestauranteAbsenceRecordsFromSqlite(): Promise<
  TicketRestauranteSqliteRecord[] | null
> {
  const loader = window.traccion?.loadTicketRestauranteAbsenceRecords;
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

export async function saveTicketRestauranteAbsenceToSqlite(
  record: { id: string },
  serializedValue: string,
  expectedUpdatedAt: string | null,
): Promise<TicketRestauranteSqliteSaveResult | null> {
  const saver = window.traccion?.saveTicketRestauranteAbsenceRecordIfUnchanged;
  if (!saver) {
    return null;
  }

  publishPersistenceBusy(
    TICKET_RESTAURANTE_ABSENCES_STORAGE_KEY,
    'Guardando ausencia de Ticket Restaurante en SQLite…',
  );
  await waitForNextPaint();

  try {
    const result = await saveRecordWithPendingFallback({
      module: TICKET_RESTAURANTE_ABSENCES_PENDING_WRITE_MODULE,
      recordId: record.id,
      value: serializedValue,
      expectedUpdatedAt,
      save: async () => {
        const rawResult = await withTemporarySqliteRetry(() =>
          saver({ id: record.id, value: serializedValue, expectedUpdatedAt }),
        );
        publishDatabaseStatus(rawResult.status);
        return { ok: rawResult.ok, message: rawResult.message, currentUpdatedAt: rawResult.currentUpdatedAt };
      },
    });

    clearPersistenceBusy(TICKET_RESTAURANTE_ABSENCES_STORAGE_KEY, result.message);

    return result;
  } catch (error) {
    clearPersistenceBusy(
      TICKET_RESTAURANTE_ABSENCES_STORAGE_KEY,
      'No se ha podido guardar la ausencia de Ticket Restaurante en SQLite.',
    );
    throw error;
  }
}

/**
 * Guarda varias ausencias en una sola llamada IPC / transacción SQLite.
 * Pensado para saveAbsences, que reemplaza el listado completo de golpe
 * (igual patrón que el resto de importadores/siembras de este repositorio).
 */
export async function saveTicketRestauranteAbsencesToSqlite(
  records: Array<{ id: string; serializedValue: string; expectedUpdatedAt: string | null }>,
): Promise<TicketRestauranteSqliteBatchSaveResult | null> {
  const saver = window.traccion?.saveTicketRestauranteAbsenceRecordsIfUnchanged;
  if (!saver) {
    return null;
  }

  if (records.length === 0) {
    return { ok: true, message: 'Nada que importar.' };
  }

  publishPersistenceBusy(
    TICKET_RESTAURANTE_ABSENCES_STORAGE_KEY,
    `Guardando ${records.length} ausencias de Ticket Restaurante en SQLite…`,
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
    clearPersistenceBusy(TICKET_RESTAURANTE_ABSENCES_STORAGE_KEY, result.message);

    return {
      ok: result.ok,
      message: result.message,
      failedRecordId: result.failedRecordId,
    };
  } catch (error) {
    clearPersistenceBusy(
      TICKET_RESTAURANTE_ABSENCES_STORAGE_KEY,
      'No se ha podido importar las ausencias de Ticket Restaurante en SQLite.',
    );
    throw error;
  }
}

// -- Config (objeto único, migrado como colección de un solo registro) -------

/**
 * Id fijo del único registro de configuración. config no es una colección
 * — es un objeto único — pero se migra reutilizando
 * createJsonModuleRepository (igual tabla value_json que el resto de
 * entidades de este módulo) en vez de una tabla singleton a medida como
 * configuracion_state, para no duplicar lógica SQL nueva.
 */
export const TICKET_RESTAURANTE_CONFIG_RECORD_ID = 'ticket-restaurante-config';

export function hasTicketRestauranteConfigSqliteRepository(): boolean {
  return Boolean(
    window.traccion?.loadTicketRestauranteConfigRecords &&
      window.traccion?.saveTicketRestauranteConfigRecordIfUnchanged,
  );
}

export async function loadTicketRestauranteConfigRecordFromSqlite(): Promise<
  TicketRestauranteSqliteRecord | null
> {
  const loader = window.traccion?.loadTicketRestauranteConfigRecords;
  if (!loader) {
    return null;
  }

  const snapshot = await withTemporarySqliteRetry(() => loader());
  publishDatabaseStatus(snapshot.status);
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    return null;
  }

  return snapshot.records.find((record) => record.id === TICKET_RESTAURANTE_CONFIG_RECORD_ID) ?? null;
}

export async function saveTicketRestauranteConfigToSqlite(
  serializedValue: string,
  expectedUpdatedAt: string | null,
): Promise<TicketRestauranteSqliteSaveResult | null> {
  const saver = window.traccion?.saveTicketRestauranteConfigRecordIfUnchanged;
  if (!saver) {
    return null;
  }

  publishPersistenceBusy(
    TICKET_RESTAURANTE_CONFIG_STORAGE_KEY,
    'Guardando configuración de Ticket Restaurante en SQLite…',
  );
  await waitForNextPaint();

  try {
    const result = await saveRecordWithPendingFallback({
      module: TICKET_RESTAURANTE_CONFIG_PENDING_WRITE_MODULE,
      recordId: TICKET_RESTAURANTE_CONFIG_RECORD_ID,
      value: serializedValue,
      expectedUpdatedAt,
      save: async () => {
        const rawResult = await withTemporarySqliteRetry(() =>
          saver({ id: TICKET_RESTAURANTE_CONFIG_RECORD_ID, value: serializedValue, expectedUpdatedAt }),
        );
        publishDatabaseStatus(rawResult.status);
        return { ok: rawResult.ok, message: rawResult.message, currentUpdatedAt: rawResult.currentUpdatedAt };
      },
    });

    clearPersistenceBusy(TICKET_RESTAURANTE_CONFIG_STORAGE_KEY, result.message);

    return result;
  } catch (error) {
    clearPersistenceBusy(
      TICKET_RESTAURANTE_CONFIG_STORAGE_KEY,
      'No se ha podido guardar la configuración de Ticket Restaurante en SQLite.',
    );
    throw error;
  }
}


// -- Manutenciones -----------------------------------------------------------

export function hasTicketRestauranteManutencionesSqliteRepository(): boolean {
  return Boolean(
    window.traccion?.loadTicketRestauranteManutencionRecords &&
      window.traccion?.saveTicketRestauranteManutencionRecordIfUnchanged &&
      window.traccion?.saveTicketRestauranteManutencionRecordsIfUnchanged,
  );
}

export async function loadTicketRestauranteManutencionRecordsFromSqlite(): Promise<
  TicketRestauranteSqliteRecord[] | null
> {
  const loader = window.traccion?.loadTicketRestauranteManutencionRecords;
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

export async function saveTicketRestauranteManutencionToSqlite(
  record: { id: string },
  serializedValue: string,
  expectedUpdatedAt: string | null,
): Promise<TicketRestauranteSqliteSaveResult | null> {
  const saver = window.traccion?.saveTicketRestauranteManutencionRecordIfUnchanged;
  if (!saver) {
    return null;
  }

  publishPersistenceBusy(
    TICKET_RESTAURANTE_MANUTENCIONES_STORAGE_KEY,
    'Guardando manutención de Ticket Restaurante en SQLite…',
  );
  await waitForNextPaint();

  try {
    const result = await saveRecordWithPendingFallback({
      module: TICKET_RESTAURANTE_MANUTENCIONES_PENDING_WRITE_MODULE,
      recordId: record.id,
      value: serializedValue,
      expectedUpdatedAt,
      save: async () => {
        const rawResult = await withTemporarySqliteRetry(() =>
          saver({ id: record.id, value: serializedValue, expectedUpdatedAt }),
        );
        publishDatabaseStatus(rawResult.status);
        return { ok: rawResult.ok, message: rawResult.message, currentUpdatedAt: rawResult.currentUpdatedAt };
      },
    });

    clearPersistenceBusy(TICKET_RESTAURANTE_MANUTENCIONES_STORAGE_KEY, result.message);

    return result;
  } catch (error) {
    clearPersistenceBusy(
      TICKET_RESTAURANTE_MANUTENCIONES_STORAGE_KEY,
      'No se ha podido guardar la manutención de Ticket Restaurante en SQLite.',
    );
    throw error;
  }
}

export async function saveTicketRestauranteManutencionesToSqlite(
  records: Array<{ id: string; serializedValue: string; expectedUpdatedAt: string | null }>,
): Promise<TicketRestauranteSqliteBatchSaveResult | null> {
  const saver = window.traccion?.saveTicketRestauranteManutencionRecordsIfUnchanged;
  if (!saver) {
    return null;
  }

  if (records.length === 0) {
    return { ok: true, message: 'Nada que importar.' };
  }

  publishPersistenceBusy(
    TICKET_RESTAURANTE_MANUTENCIONES_STORAGE_KEY,
    `Guardando ${records.length} manutenciones de Ticket Restaurante en SQLite…`,
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
    clearPersistenceBusy(TICKET_RESTAURANTE_MANUTENCIONES_STORAGE_KEY, result.message);

    return {
      ok: result.ok,
      message: result.message,
      failedRecordId: result.failedRecordId,
    };
  } catch (error) {
    clearPersistenceBusy(
      TICKET_RESTAURANTE_MANUTENCIONES_STORAGE_KEY,
      'No se han podido importar las manutenciones de Ticket Restaurante en SQLite.',
    );
    throw error;
  }
}

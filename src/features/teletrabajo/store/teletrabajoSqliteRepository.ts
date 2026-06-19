import {
  clearPersistenceBusy,
  publishPersistenceBusy,
  waitForNextPaint,
} from '../../../services/persistence';
import { publishDatabaseStatus } from '../../../services/databaseStatus';
import type { TeletrabajoSolicitud } from '../domain/solicitud';

const TELETRABAJO_STORAGE_KEY = 'traccion.v1.teletrabajo.solicitudes';
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

export interface TeletrabajoSqliteRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TeletrabajoSqliteSaveResult {
  ok: boolean;
  message: string;
  currentUpdatedAt: string | null;
}

export function hasTeletrabajoSqliteRepository(): boolean {
  return Boolean(
    window.traccion?.loadTeletrabajoRecords &&
      window.traccion?.saveTeletrabajoRecordIfUnchanged,
  );
}

export async function loadTeletrabajoSolicitudesFromSqlite(
  parseSolicitudes: (storageValue: string | null) => TeletrabajoSolicitud[],
): Promise<TeletrabajoSolicitud[] | null> {
  const loader = window.traccion?.loadTeletrabajoRecords;
  if (!loader) {
    return null;
  }

  const snapshot = await withTemporarySqliteRetry(() => loader());
  publishDatabaseStatus(snapshot.status);
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    return null;
  }

  return snapshot.records.flatMap((record) => parseSolicitudes(`[${record.value}]`));
}

export async function loadTeletrabajoRecordsFromSqlite(): Promise<TeletrabajoSqliteRecord[] | null> {
  const loader = window.traccion?.loadTeletrabajoRecords;
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

export async function saveTeletrabajoSolicitudToSqlite(
  solicitud: TeletrabajoSolicitud,
  expectedUpdatedAt: string | null,
): Promise<TeletrabajoSqliteSaveResult | null> {
  const saver = window.traccion?.saveTeletrabajoRecordIfUnchanged;
  if (!saver) {
    return null;
  }

  publishPersistenceBusy(TELETRABAJO_STORAGE_KEY, 'Guardando solicitud de Teletrabajo en SQLite…');
  await waitForNextPaint();

  try {
    const result = await withTemporarySqliteRetry(() =>
      saver({
        id: solicitud.id,
        value: JSON.stringify(solicitud),
        expectedUpdatedAt,
      }),
    );

    publishDatabaseStatus(result.status);
    clearPersistenceBusy(TELETRABAJO_STORAGE_KEY, result.message);

    return {
      ok: result.ok,
      message: result.message,
      currentUpdatedAt: result.currentUpdatedAt,
    };
  } catch (error) {
    clearPersistenceBusy(
      TELETRABAJO_STORAGE_KEY,
      'No se ha podido guardar la solicitud de Teletrabajo en SQLite.',
    );
    throw error;
  }
}

export async function deleteTeletrabajoSolicitudInSqlite(
  solicitud: TeletrabajoSolicitud,
  expectedUpdatedAt: string | null,
): Promise<TeletrabajoSqliteSaveResult | null> {
  const now = new Date().toISOString();
  return saveTeletrabajoSolicitudToSqlite(
    { ...solicitud, updatedAt: now, deletedAt: now },
    expectedUpdatedAt,
  );
}

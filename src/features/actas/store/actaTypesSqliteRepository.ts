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
import type { ActaTypeDefinition } from '../domain/acta';

const ACTA_TYPES_STORAGE_KEY = 'traccion.v1.actas.types';
const ACTA_TYPES_PENDING_WRITE_MODULE = 'actas-tipos';
const TEMPORARY_SQLITE_BUSY_RETRIES = 6;
const TEMPORARY_SQLITE_BUSY_RETRY_MS = 250;

registerPendingWriteReplayer(ACTA_TYPES_PENDING_WRITE_MODULE, async (recordId, value, expectedUpdatedAt) => {
  const saver = window.traccion?.saveActaTypeRecordIfUnchanged;
  if (!saver) {
    return null;
  }

  const result = await saver({ id: recordId, value, expectedUpdatedAt });
  publishDatabaseStatus(result.status);
  return { ok: result.ok, message: result.message, currentUpdatedAt: result.currentUpdatedAt };
});

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

export interface ActaTypeSqliteRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ActaTypeSqliteSaveResult {
  ok: boolean;
  message: string;
  currentUpdatedAt: string | null;
}

export function hasActaTypesSqliteRepository(): boolean {
  return Boolean(
    window.traccion?.loadActaTypeRecords && window.traccion?.saveActaTypeRecordIfUnchanged,
  );
}

export async function loadActaTypesFromSqlite(
  parseRecords: (storageValue: string | null) => ActaTypeDefinition[],
): Promise<ActaTypeDefinition[] | null> {
  const loader = window.traccion?.loadActaTypeRecords;
  if (!loader) {
    return null;
  }

  const snapshot = await withTemporarySqliteRetry(() => loader());
  publishDatabaseStatus(snapshot.status);
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    return null;
  }

  return snapshot.records.flatMap((record) => parseRecords(`[${record.value}]`));
}

export async function loadActaTypeRecordsFromSqlite(): Promise<ActaTypeSqliteRecord[] | null> {
  const loader = window.traccion?.loadActaTypeRecords;
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

export async function saveActaTypeToSqlite(
  record: ActaTypeDefinition,
  expectedUpdatedAt: string | null,
): Promise<ActaTypeSqliteSaveResult | null> {
  const saver = window.traccion?.saveActaTypeRecordIfUnchanged;
  if (!saver) {
    return null;
  }

  publishPersistenceBusy(ACTA_TYPES_STORAGE_KEY, 'Guardando tipo de acta en SQLite…');
  await waitForNextPaint();

  const value = JSON.stringify(record);

  try {
    const result = await saveRecordWithPendingFallback({
      module: ACTA_TYPES_PENDING_WRITE_MODULE,
      recordId: record.id,
      value,
      expectedUpdatedAt,
      save: async () => {
        const rawResult = await withTemporarySqliteRetry(() =>
          saver({ id: record.id, value, expectedUpdatedAt }),
        );
        publishDatabaseStatus(rawResult.status);
        return { ok: rawResult.ok, message: rawResult.message, currentUpdatedAt: rawResult.currentUpdatedAt };
      },
    });

    clearPersistenceBusy(ACTA_TYPES_STORAGE_KEY, result.message);

    return result;
  } catch (error) {
    clearPersistenceBusy(ACTA_TYPES_STORAGE_KEY, 'No se ha podido guardar el tipo de acta en SQLite.');
    throw error;
  }
}

export interface ActaTypeBatchSaveResult {
  ok: boolean;
  message: string;
  failedRecordId?: string;
}

/**
 * Guarda varios tipos de acta en una sola llamada IPC / transacción SQLite,
 * en vez de uno por uno. Pensado para la migración inicial desde
 * createDefaultActaTypes() / localStorage, que puede traer varios tipos a la vez.
 *
 * Deliberadamente fuera de la cola de pendientes: es una operación de
 * importación puntual, no una edición del día a día, y encolar un lote
 * completo complicaría la reconciliación sin aportar nada — si falla, el
 * usuario repite la importación.
 */
export async function saveActaTypesToSqlite(
  records: Array<{ record: ActaTypeDefinition; expectedUpdatedAt: string | null }>,
): Promise<ActaTypeBatchSaveResult | null> {
  const saver = window.traccion?.saveActaTypeRecordsIfUnchanged;
  if (!saver) {
    return null;
  }

  if (records.length === 0) {
    return { ok: true, message: 'Nada que importar.' };
  }

  publishPersistenceBusy(ACTA_TYPES_STORAGE_KEY, `Guardando ${records.length} tipos de acta en SQLite…`);
  await waitForNextPaint();

  try {
    const result = await withTemporarySqliteRetry(() =>
      saver(
        records.map(({ record, expectedUpdatedAt }) => ({
          id: record.id,
          value: JSON.stringify(record),
          expectedUpdatedAt,
        })),
      ),
    );

    publishDatabaseStatus(result.status);
    clearPersistenceBusy(ACTA_TYPES_STORAGE_KEY, result.message);

    return {
      ok: result.ok,
      message: result.message,
      failedRecordId: result.failedRecordId,
    };
  } catch (error) {
    clearPersistenceBusy(ACTA_TYPES_STORAGE_KEY, 'No se ha podido importar los tipos de acta en SQLite.');
    throw error;
  }
}

export async function deleteActaTypeInSqlite(
  record: ActaTypeDefinition,
  expectedUpdatedAt: string | null,
): Promise<ActaTypeSqliteSaveResult | null> {
  const now = new Date().toISOString();
  return saveActaTypeToSqlite({ ...record, updatedAt: now, deletedAt: now }, expectedUpdatedAt);
}

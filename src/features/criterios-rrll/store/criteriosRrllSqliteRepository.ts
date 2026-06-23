import {
  clearPersistenceBusy,
  publishPersistenceBusy,
  waitForNextPaint,
} from '../../../services/persistence';
import { publishDatabaseStatus } from '../../../services/databaseStatus';
import type { CriterioRrll } from '../domain/criterioRrll';

const CRITERIOS_RRLL_STORAGE_KEY = 'traccion.v1.criterios-rrll.criterios';
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

export interface CriterioRrllSqliteRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CriterioRrllSqliteSaveResult {
  ok: boolean;
  message: string;
  currentUpdatedAt: string | null;
}

export function hasCriteriosRrllSqliteRepository(): boolean {
  return Boolean(
    window.traccion?.loadCriteriosRrllRecords &&
      window.traccion?.saveCriteriosRrllRecordIfUnchanged,
  );
}

export async function loadCriteriosRrllFromSqlite(
  parseRecords: (storageValue: string | null) => CriterioRrll[],
): Promise<CriterioRrll[] | null> {
  const loader = window.traccion?.loadCriteriosRrllRecords;
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

export async function loadCriteriosRrllRecordsFromSqlite(): Promise<
  CriterioRrllSqliteRecord[] | null
> {
  const loader = window.traccion?.loadCriteriosRrllRecords;
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

export async function saveCriterioRrllToSqlite(
  record: CriterioRrll,
  expectedUpdatedAt: string | null,
): Promise<CriterioRrllSqliteSaveResult | null> {
  const saver = window.traccion?.saveCriteriosRrllRecordIfUnchanged;
  if (!saver) {
    return null;
  }

  publishPersistenceBusy(CRITERIOS_RRLL_STORAGE_KEY, 'Guardando criterio en SQLite…');
  await waitForNextPaint();

  try {
    const result = await withTemporarySqliteRetry(() =>
      saver({
        id: record.id,
        value: JSON.stringify(record),
        expectedUpdatedAt,
      }),
    );

    publishDatabaseStatus(result.status);
    clearPersistenceBusy(CRITERIOS_RRLL_STORAGE_KEY, result.message);

    return {
      ok: result.ok,
      message: result.message,
      currentUpdatedAt: result.currentUpdatedAt,
    };
  } catch (error) {
    clearPersistenceBusy(CRITERIOS_RRLL_STORAGE_KEY, 'No se ha podido guardar el criterio en SQLite.');
    throw error;
  }
}

export interface CriterioRrllBatchSaveResult {
  ok: boolean;
  message: string;
  failedRecordId?: string;
}

/**
 * Guarda varios criterios en una sola llamada IPC / transacción SQLite, en
 * vez de uno por uno. Pensado para importaciones masivas desde Excel: antes
 * disparaba N llamadas IPC secuenciales (una por fila), ahora dispara 1.
 */
export async function saveCriteriosRrllToSqlite(
  records: Array<{ record: CriterioRrll; expectedUpdatedAt: string | null }>,
): Promise<CriterioRrllBatchSaveResult | null> {
  const saver = window.traccion?.saveCriteriosRrllRecordsIfUnchanged;
  if (!saver) {
    return null;
  }

  if (records.length === 0) {
    return { ok: true, message: 'Nada que importar.' };
  }

  publishPersistenceBusy(CRITERIOS_RRLL_STORAGE_KEY, `Guardando ${records.length} criterios en SQLite…`);
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
    clearPersistenceBusy(CRITERIOS_RRLL_STORAGE_KEY, result.message);

    return {
      ok: result.ok,
      message: result.message,
      failedRecordId: result.failedRecordId,
    };
  } catch (error) {
    clearPersistenceBusy(CRITERIOS_RRLL_STORAGE_KEY, 'No se ha podido importar los criterios en SQLite.');
    throw error;
  }
}

export async function deleteCriterioRrllInSqlite(
  record: CriterioRrll,
  expectedUpdatedAt: string | null,
): Promise<CriterioRrllSqliteSaveResult | null> {
  const now = new Date().toISOString();
  return saveCriterioRrllToSqlite(
    { ...record, updatedAt: now, deletedAt: now },
    expectedUpdatedAt,
  );
}

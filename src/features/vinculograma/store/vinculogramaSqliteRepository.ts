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
import type { Vinculograma } from '../domain/vinculograma';

const VINCULOGRAMA_STORAGE_KEY = 'traccion.v1.vinculograma.records';
const VINCULOGRAMA_PENDING_WRITE_MODULE = 'vinculograma';
const TEMPORARY_SQLITE_BUSY_RETRIES = 6;
const TEMPORARY_SQLITE_BUSY_RETRY_MS = 250;

registerPendingWriteReplayer(VINCULOGRAMA_PENDING_WRITE_MODULE, async (recordId, value, expectedUpdatedAt) => {
  const saver = window.traccion?.saveVinculogramaRecordIfUnchanged;
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

export interface VinculogramaSqliteRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface VinculogramaSqliteSaveResult {
  ok: boolean;
  message: string;
  currentUpdatedAt: string | null;
}

export function hasVinculogramaSqliteRepository(): boolean {
  return Boolean(
    window.traccion?.loadVinculogramaRecords &&
      window.traccion?.saveVinculogramaRecordIfUnchanged,
  );
}

export async function loadVinculogramasFromSqlite(
  parseRecords: (storageValue: string | null) => Vinculograma[],
): Promise<Vinculograma[] | null> {
  const loader = window.traccion?.loadVinculogramaRecords;
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

export async function loadVinculogramaRecordsFromSqlite(): Promise<
  VinculogramaSqliteRecord[] | null
> {
  const loader = window.traccion?.loadVinculogramaRecords;
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

export async function saveVinculogramaToSqlite(
  record: Vinculograma,
  expectedUpdatedAt: string | null,
): Promise<VinculogramaSqliteSaveResult | null> {
  const saver = window.traccion?.saveVinculogramaRecordIfUnchanged;
  if (!saver) {
    return null;
  }

  publishPersistenceBusy(VINCULOGRAMA_STORAGE_KEY, 'Guardando vínculo en SQLite…');
  await waitForNextPaint();

  const value = JSON.stringify(record);

  try {
    const result = await saveRecordWithPendingFallback({
      module: VINCULOGRAMA_PENDING_WRITE_MODULE,
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

    clearPersistenceBusy(VINCULOGRAMA_STORAGE_KEY, result.message);

    return result;
  } catch (error) {
    clearPersistenceBusy(VINCULOGRAMA_STORAGE_KEY, 'No se ha podido guardar el vínculo en SQLite.');
    throw error;
  }
}

export async function deleteVinculogramaInSqlite(
  record: Vinculograma,
  expectedUpdatedAt: string | null,
): Promise<VinculogramaSqliteSaveResult | null> {
  const now = new Date().toISOString();
  return saveVinculogramaToSqlite(
    { ...record, updatedAt: now, deletedAt: now },
    expectedUpdatedAt,
  );
}

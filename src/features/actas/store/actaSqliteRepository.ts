import { clearPersistenceBusy, publishPersistenceBusy, waitForNextPaint } from '../../../services/persistence';
import { publishDatabaseStatus } from '../../../services/databaseStatus';
import {
  registerPendingWriteReplayer,
  saveRecordWithPendingFallback,
} from '../../../services/pendingRecordWrites';
import type { Acta } from '../domain/acta';

const ACTAS_STORAGE_KEY = 'traccion.v1.actas.records';
const ACTAS_PENDING_WRITE_MODULE = 'actas';
const TEMPORARY_SQLITE_BUSY_RETRIES = 6;
const TEMPORARY_SQLITE_BUSY_RETRY_MS = 250;

registerPendingWriteReplayer(ACTAS_PENDING_WRITE_MODULE, async (recordId, value, expectedUpdatedAt) => {
  const saver = window.traccion?.saveActaRecordIfUnchanged;
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
      await delay(Math.min(TEMPORARY_SQLITE_BUSY_RETRY_MS * (2 ** attempt) + Math.trunc(Math.random() * 100), 3000));
    }
  }

  throw lastError;
}

export interface ActaSqliteRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ActaSqliteSaveResult {
  ok: boolean;
  message: string;
  currentUpdatedAt: string | null;
}

export function hasActaSqliteRepository(): boolean {
  return Boolean(window.traccion?.loadActaRecords && window.traccion?.saveActaRecordIfUnchanged);
}

export async function loadActasFromSqlite(
  parseActas: (storageValue: string | null) => Acta[],
): Promise<Acta[] | null> {
  const loader = window.traccion?.loadActaRecords;
  if (!loader) {
    return null;
  }

  const snapshot = await withTemporarySqliteRetry(() => loader());
  publishDatabaseStatus(snapshot.status);
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    return null;
  }

  return snapshot.records.flatMap((record) => parseActas(`[${record.value}]`));
}

export async function loadActaRecordsFromSqlite(): Promise<ActaSqliteRecord[] | null> {
  const loader = window.traccion?.loadActaRecords;
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

export async function saveActaToSqlite(
  acta: Acta,
  expectedUpdatedAt: string | null,
): Promise<ActaSqliteSaveResult | null> {
  const saver = window.traccion?.saveActaRecordIfUnchanged;
  if (!saver) {
    return null;
  }

  publishPersistenceBusy(ACTAS_STORAGE_KEY, 'Guardando acta en SQLite…');
  await waitForNextPaint();

  const value = JSON.stringify(acta);

  try {
    const result = await saveRecordWithPendingFallback({
      module: ACTAS_PENDING_WRITE_MODULE,
      recordId: acta.id,
      value,
      expectedUpdatedAt,
      save: async () => {
        const rawResult = await withTemporarySqliteRetry(() =>
          saver({ id: acta.id, value, expectedUpdatedAt }),
        );
        publishDatabaseStatus(rawResult.status);
        return { ok: rawResult.ok, message: rawResult.message, currentUpdatedAt: rawResult.currentUpdatedAt };
      },
    });

    clearPersistenceBusy(ACTAS_STORAGE_KEY, result.message);

    return result;
  } catch (error) {
    clearPersistenceBusy(ACTAS_STORAGE_KEY, 'No se ha podido guardar el acta en SQLite.');
    throw error;
  }
}

export async function deleteActaInSqlite(
  acta: Acta,
  expectedUpdatedAt: string | null,
): Promise<ActaSqliteSaveResult | null> {
  const now = new Date().toISOString();
  return saveActaToSqlite(
    { ...acta, updatedAt: now, deletedAt: now } as Acta & { deletedAt: string },
    expectedUpdatedAt,
  );
}

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
import type { LicenciaSinSueldoRecord } from '../domain/licenciaSinSueldo';

const LICENCIA_SIN_SUELDO_STORAGE_KEY = 'traccion.v1.licenciasSinSueldo.records';
const LICENCIA_SIN_SUELDO_PENDING_WRITE_MODULE = 'licencias-sin-sueldo';
const TEMPORARY_SQLITE_BUSY_RETRIES = 6;
const TEMPORARY_SQLITE_BUSY_RETRY_MS = 250;

// Réplica "cruda" del guardado, sin pasar por saveRecordWithPendingFallback,
// para que el flush de la cola no vuelva a encolarse sobre sí mismo.
registerPendingWriteReplayer(
  LICENCIA_SIN_SUELDO_PENDING_WRITE_MODULE,
  async (recordId, value, expectedUpdatedAt) => {
    const saver = window.traccion?.saveLicenciaSinSueldoRecordIfUnchanged;
    if (!saver) {
      return null;
    }

    const result = await saver({ id: recordId, value, expectedUpdatedAt });
    publishDatabaseStatus(result.status);
    return result;
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

export interface LicenciaSinSueldoSqliteRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface LicenciaSinSueldoSqliteSaveResult {
  ok: boolean;
  message: string;
  currentUpdatedAt: string | null;
}

export function hasLicenciaSinSueldoSqliteRepository(): boolean {
  return Boolean(
    window.traccion?.loadLicenciaSinSueldoRecords &&
      window.traccion?.saveLicenciaSinSueldoRecordIfUnchanged,
  );
}

export async function loadLicenciasSinSueldoFromSqlite(
  parseRecords: (storageValue: string | null) => LicenciaSinSueldoRecord[],
): Promise<LicenciaSinSueldoRecord[] | null> {
  const loader = window.traccion?.loadLicenciaSinSueldoRecords;
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

export async function loadLicenciaSinSueldoRecordsFromSqlite(): Promise<
  LicenciaSinSueldoSqliteRecord[] | null
> {
  const loader = window.traccion?.loadLicenciaSinSueldoRecords;
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

export async function saveLicenciaSinSueldoToSqlite(
  record: LicenciaSinSueldoRecord,
  expectedUpdatedAt: string | null,
): Promise<LicenciaSinSueldoSqliteSaveResult | null> {
  const saver = window.traccion?.saveLicenciaSinSueldoRecordIfUnchanged;
  if (!saver) {
    return null;
  }

  publishPersistenceBusy(LICENCIA_SIN_SUELDO_STORAGE_KEY, 'Guardando licencia en SQLite…');
  await waitForNextPaint();

  const value = JSON.stringify(record);

  try {
    const result = await saveRecordWithPendingFallback({
      module: LICENCIA_SIN_SUELDO_PENDING_WRITE_MODULE,
      recordId: record.id,
      value,
      expectedUpdatedAt,
      save: async () => {
        const rawResult = await withTemporarySqliteRetry(() =>
          saver({ id: record.id, value, expectedUpdatedAt }),
        );
        publishDatabaseStatus(rawResult.status);
        return rawResult;
      },
    });

    clearPersistenceBusy(LICENCIA_SIN_SUELDO_STORAGE_KEY, result.message);

    return result;
  } catch (error) {
    clearPersistenceBusy(LICENCIA_SIN_SUELDO_STORAGE_KEY, 'No se ha podido guardar la licencia en SQLite.');
    throw error;
  }
}

export async function deleteLicenciaSinSueldoInSqlite(
  record: LicenciaSinSueldoRecord,
  expectedUpdatedAt: string | null,
): Promise<LicenciaSinSueldoSqliteSaveResult | null> {
  const now = new Date().toISOString();
  return saveLicenciaSinSueldoToSqlite(
    { ...record, updatedAt: now, deletedAt: now },
    expectedUpdatedAt,
  );
}

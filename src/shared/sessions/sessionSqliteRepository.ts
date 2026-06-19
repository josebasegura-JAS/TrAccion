import { clearPersistenceBusy, publishPersistenceBusy, waitForNextPaint } from '../../services/persistence';
import { publishDatabaseStatus } from '../../services/databaseStatus';

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
      await delay(Math.min(TEMPORARY_SQLITE_BUSY_RETRY_MS * (2 ** attempt) + Math.trunc(Math.random() * 100), 3000));
    }
  }

  throw lastError;
}

export interface SessionSqliteRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SessionSqliteSaveResult {
  ok: boolean;
  message: string;
  currentUpdatedAt: string | null;
}

/**
 * Repositorio SQLite genérico para módulos basados en sesiones gestionadas
 * (comité, paritaria). Cada módulo con tabla nativa expone load/save por
 * registro individual, con concurrencia fina (expectedUpdatedAt por sesión,
 * no por blob completo).
 *
 * Comité y Paritaria tienen tabla nativa propia.
 * Para módulos sin tabla nativa, hasSessionSqliteRepository devuelve false
 * y el store cae al patrón de blob compartido (saveSharedArrayRecord).
 */
export type SessionSqliteModuleId = 'comite' | 'paritaria';

interface SessionSqliteBindings {
  load: () => Promise<{ status: TraccionDatabaseStatus; records: SessionSqliteRecord[] }>;
  save: (record: {
    id: string;
    value: string;
    expectedUpdatedAt: string | null;
  }) => Promise<TraccionConditionalTaskSaveResult>;
}

function resolveBindings(moduleId: SessionSqliteModuleId): SessionSqliteBindings | null {
  if (moduleId === 'comite') {
    const load = window.traccion?.loadComiteSessionRecords;
    const save = window.traccion?.saveComiteSessionRecordIfUnchanged;
    if (!load || !save) {
      return null;
    }
    return { load, save };
  }

  if (moduleId === 'paritaria') {
    const load = window.traccion?.loadParitariaSessionRecords;
    const save = window.traccion?.saveParitariaSessionRecordIfUnchanged;
    if (!load || !save) {
      return null;
    }
    return { load, save };
  }

  return null;
}

export function hasSessionSqliteRepository(moduleId: SessionSqliteModuleId): boolean {
  return resolveBindings(moduleId) !== null;
}

/**
 * Carga todas las sesiones (no eliminadas) de la tabla nativa del módulo.
 * Devuelve null si el módulo no tiene tabla nativa o SQLite no está activo.
 */
export async function loadAllSessionRecordsFromSqlite(
  moduleId: SessionSqliteModuleId,
): Promise<SessionSqliteRecord[] | null> {
  const bindings = resolveBindings(moduleId);
  if (!bindings) {
    return null;
  }

  const snapshot = await withTemporarySqliteRetry(() => bindings.load());
  publishDatabaseStatus(snapshot.status);
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    return null;
  }

  return snapshot.records;
}

/**
 * Guarda (crea o actualiza) un registro de sesión individual en la tabla
 * nativa, con control de concurrencia por expectedUpdatedAt propio de la
 * sesión (no del array completo).
 */
export async function saveSessionRecordToSqlite(
  moduleId: SessionSqliteModuleId,
  storageKeyForFeedback: string,
  sessionId: string,
  value: string,
  expectedUpdatedAt: string | null,
): Promise<SessionSqliteSaveResult> {
  const bindings = resolveBindings(moduleId);
  if (!bindings) {
    throw new Error('SQLite compartido no disponible para este módulo. No se permite guardar.');
  }

  publishPersistenceBusy(storageKeyForFeedback, 'Guardando sesión en SQLite…');
  await waitForNextPaint();

  try {
    const result = await withTemporarySqliteRetry(() =>
      bindings.save({ id: sessionId, value, expectedUpdatedAt }),
    );
    publishDatabaseStatus(result.status);
    clearPersistenceBusy(storageKeyForFeedback, result.message);

    if (!result.ok) {
      throw new Error(result.message);
    }

    return {
      ok: result.ok,
      message: result.message,
      currentUpdatedAt: result.currentUpdatedAt,
    };
  } catch (error) {
    clearPersistenceBusy(storageKeyForFeedback, 'No se ha podido guardar la sesión en SQLite.');
    throw error;
  }
}

/**
 * Marca un registro como eliminado (soft-delete) escribiendo deletedAt en
 * el value_json y guardándolo con el mismo flujo de saveSessionRecordToSqlite.
 * La tabla nativa no tiene un IPC de borrado dedicado; el soft-delete vive
 * dentro del propio value_json, igual que en task_records.
 */
export async function deleteSessionRecordInSqlite(
  moduleId: SessionSqliteModuleId,
  storageKeyForFeedback: string,
  sessionId: string,
  currentValue: string,
  expectedUpdatedAt: string | null,
): Promise<SessionSqliteSaveResult> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(currentValue) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const nowIso = new Date().toISOString();
  const withDeletedAt = JSON.stringify({ ...parsed, deletedAt: nowIso, updatedAt: nowIso });
  return saveSessionRecordToSqlite(moduleId, storageKeyForFeedback, sessionId, withDeletedAt, expectedUpdatedAt);
}


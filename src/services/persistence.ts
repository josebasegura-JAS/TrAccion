import {
  PERSISTED_STORAGE_KEYS,
  SQLITE_HYDRATION_METADATA_KEY,
  SQLITE_MIGRATION_FLAG_KEY,
  SQLITE_PENDING_WRITES_KEY,
  type PersistedStorageKey,
  isPersistedStorageKey as isKnownPersistedStorageKey,
} from './persistenceKeys';
import { getCachedDatabaseStatus, publishDatabaseStatus } from './databaseStatus';

export type PersistenceFeedbackKind = 'saving' | 'saved' | 'error';

export interface PersistenceFeedback {
  kind: PersistenceFeedbackKind;
  updatedAt: string;
  key?: string;
  message: string;
}

const PERSISTENCE_FEEDBACK_EVENT = 'traccion:persistence-feedback';

let latestPersistenceFeedback: PersistenceFeedback | null = null;

const NON_JSON_PERSISTED_STORAGE_KEYS = new Set<string>([
  'traccion.v1.tareas.peticionesMigrated',
  'traccion.v1.vinculograma.showExpired',
]);

const reportedCorruptStorageKeys = new Set<string>();

function isTemporarySqliteLockMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('base ocupada temporalmente') || normalized.includes('bloqueo temporal de operación sqlite');
}

function shouldValidatePersistedJson(key: string): boolean {
  if (!isPersistedStorageKey(key)) {
    return false;
  }

  if (NON_JSON_PERSISTED_STORAGE_KEYS.has(key)) {
    return false;
  }

  return true;
}


function reportCorruptPersistedValue(key: string, error: unknown, source: 'localStorage' | 'sqlite'): void {
  const message = `Dato persistido corrupto en ${source}. Clave afectada: ${key}. Se omite para permitir el arranque.`;
  console.warn(message, error);

  const reportKey = `${source}:${key}`;
  if (reportedCorruptStorageKeys.has(reportKey)) {
    return;
  }

  reportedCorruptStorageKeys.add(reportKey);
  emitPersistenceFeedback({
    kind: 'error',
    updatedAt: new Date().toISOString(),
    key,
    message,
  });
}

function isRecoverablePersistedValue(key: string, value: string, source: 'localStorage' | 'sqlite'): boolean {
  if (!shouldValidatePersistedJson(key)) {
    return true;
  }

  try {
    JSON.parse(value);
    return true;
  } catch (error) {
    reportCorruptPersistedValue(key, error, source);
    return false;
  }
}

function emitPersistenceFeedback(feedback: PersistenceFeedback): void {
  latestPersistenceFeedback = feedback;
  window.dispatchEvent(
    new CustomEvent<PersistenceFeedback>(PERSISTENCE_FEEDBACK_EVENT, { detail: feedback }),
  );
}

export function subscribeToPersistenceFeedback(
  listener: (feedback: PersistenceFeedback) => void,
): () => void {
  const handler = (event: Event) => {
    listener((event as CustomEvent<PersistenceFeedback>).detail);
  };

  window.addEventListener(PERSISTENCE_FEEDBACK_EVENT, handler);
  if (latestPersistenceFeedback) {
    listener(latestPersistenceFeedback);
  }
  return () => window.removeEventListener(PERSISTENCE_FEEDBACK_EVENT, handler);
}

function formatPersistenceTime(date = new Date()): string {
  return date.toLocaleTimeString('es-ES', { hour12: false });
}

export interface HydrationMetadata {
  lastUpdatedAt: string;
  sqlitePath: string | null;
  refreshToken: string | null;
  strategy: 'sqlite' | 'localStorage';
}

export interface HydrationResult {
  status: 'hydrated-from-sqlite' | 'kept-localStorage' | 'sqlite-unavailable';
  reason: string;
}

interface PendingSqliteWrite {
  key: string;
  value: string;
  updatedAt: string;
  attempts: number;
  lastError: string | null;
}

function isPendingSqliteWrite(value: unknown): value is PendingSqliteWrite {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PendingSqliteWrite>;
  return (
    typeof candidate.key === 'string' &&
    typeof candidate.value === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    typeof candidate.attempts === 'number' &&
    Number.isFinite(candidate.attempts) &&
    (typeof candidate.lastError === 'string' || candidate.lastError === null)
  );
}

function readPendingSqliteWrites(): PendingSqliteWrite[] {
  const stored = window.localStorage.getItem(SQLITE_PENDING_WRITES_KEY);
  if (!stored) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isPendingSqliteWrite) : [];
  } catch {
    return [];
  }
}

function writePendingSqliteWrites(writes: PendingSqliteWrite[]): void {
  if (writes.length === 0) {
    window.localStorage.removeItem(SQLITE_PENDING_WRITES_KEY);
    return;
  }

  window.localStorage.setItem(SQLITE_PENDING_WRITES_KEY, JSON.stringify(writes));
}

function upsertPendingSqliteWrite(key: string, value: string, lastError: string): void {
  if (!isPersistedStorageKey(key)) {
    return;
  }

  const now = new Date().toISOString();
  const writes = readPendingSqliteWrites();
  const existingIndex = writes.findIndex((write) => write.key === key);
  const nextWrite: PendingSqliteWrite = {
    key,
    value,
    updatedAt: now,
    attempts: existingIndex >= 0 ? writes[existingIndex].attempts + 1 : 1,
    lastError,
  };

  if (existingIndex >= 0) {
    writes[existingIndex] = nextWrite;
  } else {
    writes.push(nextWrite);
  }

  writePendingSqliteWrites(writes);
}

function removePendingSqliteWrite(key: string): void {
  const writes = readPendingSqliteWrites().filter((write) => write.key !== key);
  writePendingSqliteWrites(writes);
}

export function getPendingSqliteWriteCount(): number {
  return readPendingSqliteWrites().length;
}

async function saveRecordToSqlite(record: TraccionStorageRecord): Promise<boolean> {
  const saveLocalStorageRecord = window.traccion?.saveLocalStorageRecord;
  if (!saveLocalStorageRecord) {
    throw new Error('SQLite no disponible: IPC de guardado no expuesto.');
  }

  const status = await saveLocalStorageRecord(record);
  publishDatabaseStatus(status);
  if (!status.ready || status.phase !== 'active') {
    throw new Error(
      status.message ?? 'SQLite no está activo; el cambio queda pendiente de sincronización.',
    );
  }

  return true;
}

export async function flushPendingSqliteWrites(): Promise<number> {
  const pendingWrites = readPendingSqliteWrites();
  if (pendingWrites.length === 0) {
    return 0;
  }

  let flushedCount = 0;
  for (const pendingWrite of pendingWrites.sort((left, right) =>
    Date.parse(left.updatedAt) - Date.parse(right.updatedAt),
  )) {
    try {
      window.localStorage.setItem(pendingWrite.key, pendingWrite.value);
      await saveRecordToSqlite({ key: pendingWrite.key, value: pendingWrite.value });
      removePendingSqliteWrite(pendingWrite.key);
      flushedCount += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se ha podido sincronizar un cambio pendiente.';
      upsertPendingSqliteWrite(pendingWrite.key, pendingWrite.value, message);
      if (!isTemporarySqliteLockMessage(message)) {
        emitPersistenceFeedback({
          kind: 'error',
          updatedAt: new Date().toISOString(),
          key: pendingWrite.key,
          message: `SQLite pendiente: ${message}`,
        });
      }
      break;
    }
  }

  if (flushedCount > 0) {
    emitPersistenceFeedback({
      kind: 'saved',
      updatedAt: new Date().toISOString(),
      message: `Sincronizados ${flushedCount} cambios pendientes en SQLite ${formatPersistenceTime()}`,
    });
  }

  return flushedCount;
}

export function isPersistedStorageKey(key: string): key is PersistedStorageKey {
  return isKnownPersistedStorageKey(key);
}

function isHydrationMetadata(value: unknown): value is HydrationMetadata {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<HydrationMetadata>;
  return (
    typeof candidate.lastUpdatedAt === 'string' &&
    (typeof candidate.sqlitePath === 'string' || candidate.sqlitePath === null) &&
    (typeof candidate.refreshToken === 'string' || candidate.refreshToken === null) &&
    (candidate.strategy === 'sqlite' || candidate.strategy === 'localStorage')
  );
}

export function readHydrationMetadata(): HydrationMetadata | null {
  const stored = window.localStorage.getItem(SQLITE_HYDRATION_METADATA_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    return isHydrationMetadata(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeHydrationMetadata(metadata: HydrationMetadata): void {
  window.localStorage.setItem(SQLITE_HYDRATION_METADATA_KEY, JSON.stringify(metadata));
}

function currentLocalRecords(): TraccionStorageRecord[] {
  const records: TraccionStorageRecord[] = [];
  const seenKeys = new Set<string>();

  for (const key of PERSISTED_STORAGE_KEYS) {
    const value = window.localStorage.getItem(key);
    if (value !== null) {
      if (isRecoverablePersistedValue(key, value, 'localStorage')) {
        records.push({ key, value });
      }
      seenKeys.add(key);
    }
  }

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || seenKeys.has(key) || !isPersistedStorageKey(key)) {
      continue;
    }

    const value = window.localStorage.getItem(key);
    if (value !== null && isRecoverablePersistedValue(key, value, 'localStorage')) {
      records.push({ key, value });
    }
  }

  return records;
}


function shouldBlockSharedWrite(): string | null {
  if (import.meta.env.MODE === 'test') {
    return null;
  }

  if (!window.traccion) {
    return null;
  }

  const status = getCachedDatabaseStatus();
  if (!status) {
    return 'Estado SQLite desconocido. Recarga la app o espera a que termine la conexión antes de editar.';
  }

  if (!status.ready || status.phase !== 'active') {
    return status.message ?? 'SQLite no está activo. Edición bloqueada para evitar cambios locales divergentes.';
  }

  return null;
}

function mirrorToSqlite(key: string, value: string): void {
  if (!isPersistedStorageKey(key)) {
    return;
  }

  const now = new Date();
  emitPersistenceFeedback({
    kind: 'saving',
    updatedAt: now.toISOString(),
    key,
    message: 'Guardando en SQLite...',
  });

  saveRecordToSqlite({ key, value })
    .then(() => {
      removePendingSqliteWrite(key);
      emitPersistenceFeedback({
        kind: 'saved',
        updatedAt: new Date().toISOString(),
        key,
        message: `Guardado en SQLite ${formatPersistenceTime()}`,
      });
    })
    .catch((error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : 'Error de guardado SQLite: cambio mantenido como caché local pendiente.';
      const messageWithKey = `${message} Clave afectada: ${key}.`;
      console.warn(messageWithKey, error);
      upsertPendingSqliteWrite(key, value, messageWithKey);
      if (!isTemporarySqliteLockMessage(message)) {
        emitPersistenceFeedback({
          kind: 'error',
          updatedAt: new Date().toISOString(),
          key,
          message: `${messageWithKey} Cambio pendiente de sincronizar.`,
        });
      }
    });
}

export function readStorageItem(key: string): string | null {
  const value = window.localStorage.getItem(key);
  if (value === null) {
    return null;
  }

  return isRecoverablePersistedValue(key, value, 'localStorage') ? value : null;
}

export function writeStorageItem(key: string, value: string): void {
  if (isPersistedStorageKey(key)) {
    const blockReason = shouldBlockSharedWrite();
    if (blockReason) {
      const message = `${blockReason} Clave afectada: ${key}.`;
      console.warn(message);
      emitPersistenceFeedback({
        kind: 'error',
        updatedAt: new Date().toISOString(),
        key,
        message,
      });
      return;
    }
  }

  window.localStorage.setItem(key, value);
  writeHydrationMetadata({
    lastUpdatedAt: new Date().toISOString(),
    sqlitePath: null,
    refreshToken: null,
    strategy: 'localStorage',
  });
  mirrorToSqlite(key, value);
}

export function readJsonStorage<T>(
  key: string,
  fallback: T,
  guard: (value: unknown) => value is T,
): T {
  const stored = readStorageItem(key);
  if (!stored) {
    return fallback;
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    return guard(parsed) ? parsed : fallback;
  } catch (error) {
    console.warn(`Dato persistido inválido para ${key}; se usará el valor por defecto.`, error);
    return fallback;
  }
}

export function writeJsonStorage<T>(key: string, value: T): void {
  writeStorageItem(key, JSON.stringify(value));
}

export function applyPersistedRecordsSnapshotToLocalStorage(
  snapshot: TraccionPersistedRecordsSnapshot,
  options: { preservePendingWrites?: boolean } = {},
): void {
  void options;
  const sqliteRecords = snapshot.records.filter((record) => isPersistedStorageKey(record.key));

  for (const record of sqliteRecords) {
    if (!isRecoverablePersistedValue(record.key, record.value, 'sqlite')) {
      const existingValue = window.localStorage.getItem(record.key);
      if (existingValue !== null && isRecoverablePersistedValue(record.key, existingValue, 'localStorage')) {
        continue;
      }

      window.localStorage.removeItem(record.key);
      continue;
    }

    window.localStorage.setItem(record.key, record.value);
  }

  writeHydrationMetadata({
    lastUpdatedAt: snapshot.latestUpdatedAt ?? new Date().toISOString(),
    sqlitePath: snapshot.status.path ?? null,
    refreshToken: snapshot.refreshToken,
    strategy: 'sqlite',
  });
}

export async function hydrateLocalStorageFromSqlite(): Promise<HydrationResult> {
  if (!window.traccion?.loadPersistedRecords) {
    return { status: 'sqlite-unavailable', reason: 'IPC SQLite no disponible.' };
  }

  try {
    const snapshot = await window.traccion.loadPersistedRecords();
    publishDatabaseStatus(snapshot.status);
    if (!snapshot.status.ready || snapshot.status.phase === 'locked') {
      return {
        status: 'sqlite-unavailable',
        reason: snapshot.status.message ?? 'SQLite no preparado.',
      };
    }

    const localRecords = currentLocalRecords();
    const sqliteRecords = snapshot.records.filter((record) => isPersistedStorageKey(record.key));

    if (sqliteRecords.length === 0) {
      if (localRecords.length > 0) {
        await window.traccion.backupLocalStorage?.(localRecords);
        await window.traccion.migrateLocalStorage?.(localRecords);
        await flushPendingSqliteWrites();
      }
      return {
        status: 'kept-localStorage',
        reason: 'SQLite está vacío; se mantiene caché local y se respalda en SQLite.',
      };
    }

    const hasLocalRecords = localRecords.length > 0;

    // SQLite es la fuente principal de arranque. Si contiene datos, se aplica siempre
    // sobre la caché local, guardando antes un backup del estado local para poder recuperar.
    if (hasLocalRecords) {
      await window.traccion.backupLocalStorage?.(localRecords);
    }

    applyPersistedRecordsSnapshotToLocalStorage(snapshot);
    await flushPendingSqliteWrites();

    return {
      status: 'hydrated-from-sqlite',
      reason:
        snapshot.status.isDefaultPath === false
          ? 'SQLite parametrizada aplicada como fuente principal.'
          : 'SQLite local aplicada como fuente principal.',
    };
  } catch (error) {
    console.warn('No se ha podido rehidratar localStorage desde SQLite.', error);
    return {
      status: 'sqlite-unavailable',
      reason: 'Error leyendo SQLite; se mantiene localStorage.',
    };
  }
}


export function reportStartupHydrationResult(result: HydrationResult): void {
  if (result.status !== 'sqlite-unavailable') {
    return;
  }

  emitPersistenceFeedback({
    kind: 'error',
    updatedAt: new Date().toISOString(),
    message: `Arranque sin SQLite activo: ${result.reason} Los cambios pueden quedar solo en caché local hasta recuperar la persistencia.`,
  });
}

export function bootstrapSqlitePersistence(force = false): void {
  if (!window.traccion?.migrateLocalStorage) {
    return;
  }

  if (!force && window.localStorage.getItem(SQLITE_MIGRATION_FLAG_KEY) === 'true') {
    return;
  }

  const records = currentLocalRecords();

  window.traccion
    .migrateLocalStorage(records)
    .then((status) => {
      if (status.ready) {
        window.localStorage.setItem(SQLITE_MIGRATION_FLAG_KEY, 'true');
      }
    })
    .catch((error: unknown) => {
      console.warn('No se ha podido crear el backup inicial SQLite de localStorage.', error);
    });
}

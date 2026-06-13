import {
  PERSISTED_STORAGE_KEYS,
  SQLITE_HYDRATION_METADATA_KEY,
  SQLITE_MIGRATION_FLAG_KEY,
  SQLITE_PENDING_WRITES_KEY,
  SQLITE_RECORD_METADATA_KEY,
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
const DATABASE_CONNECTIVITY_RECOVERED_EVENT = 'traccion:database-connectivity-recovered';

let sharedWritesBlockedByConnectivity = false;
let latestPersistenceFeedback: PersistenceFeedback | null = null;

let unsubscribeDatabaseConnectivityIssue: (() => void) | null = null;

function isDatabaseConnectivityIssue(value: unknown): value is TraccionDatabaseConnectivityIssue {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TraccionDatabaseConnectivityIssue>;
  return (
    typeof candidate.blocked === 'boolean' &&
    typeof candidate.message === 'string' &&
    typeof candidate.failedHeartbeatCount === 'number' &&
    typeof candidate.updatedAt === 'string'
  );
}

export function startDatabaseConnectivityIssueListener(): void {
  if (unsubscribeDatabaseConnectivityIssue || !window.traccion?.onDatabaseConnectivityIssue) {
    return;
  }

  unsubscribeDatabaseConnectivityIssue = window.traccion.onDatabaseConnectivityIssue((payload) => {
    if (!isDatabaseConnectivityIssue(payload)) {
      return;
    }

    sharedWritesBlockedByConnectivity = payload.blocked;
    emitPersistenceFeedback({
      kind: payload.blocked ? 'error' : 'saved',
      updatedAt: payload.updatedAt,
      message: payload.message,
    });

    if (!payload.blocked) {
      window.dispatchEvent(new CustomEvent(DATABASE_CONNECTIVITY_RECOVERED_EVENT));
    }
  });
}

export function stopDatabaseConnectivityIssueListener(): void {
  unsubscribeDatabaseConnectivityIssue?.();
  unsubscribeDatabaseConnectivityIssue = null;
  sharedWritesBlockedByConnectivity = false;
}

const NON_JSON_PERSISTED_STORAGE_KEYS = new Set<string>([
  'traccion.v1.tareas.peticionesMigrated',
  'traccion.v1.vinculograma.showExpired',
]);

const reportedCorruptStorageKeys = new Set<string>();


function logPersistenceMetric(message: string, data?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) {
    return;
  }

  if (data) {
    console.debug(`[persistencia] ${message}`, data);
    return;
  }

  console.debug(`[persistencia] ${message}`);
}

function summarizeStorageRecordSizes(records: TraccionStorageRecord[]): Array<{
  key: string;
  bytes: number;
}> {
  return records
    .map((record) => ({ key: record.key, bytes: new Blob([record.value]).size }))
    .sort((left, right) => right.bytes - left.bytes);
}

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
  expectedUpdatedAt: string | null;
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
    (typeof candidate.expectedUpdatedAt === 'string' ||
      candidate.expectedUpdatedAt === null ||
      typeof candidate.expectedUpdatedAt === 'undefined') &&
    typeof candidate.attempts === 'number' &&
    Number.isFinite(candidate.attempts) &&
    (typeof candidate.lastError === 'string' || candidate.lastError === null)
  );
}

type SqliteRecordMetadata = Record<string, string | null>;

function readSqliteRecordMetadata(): SqliteRecordMetadata {
  const stored = window.localStorage.getItem(SQLITE_RECORD_METADATA_KEY);
  if (!stored) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const metadata: SqliteRecordMetadata = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isPersistedStorageKey(key) && (typeof value === 'string' || value === null)) {
        metadata[key] = value;
      }
    }

    return metadata;
  } catch {
    return {};
  }
}

function writeSqliteRecordMetadata(metadata: SqliteRecordMetadata): void {
  window.localStorage.setItem(SQLITE_RECORD_METADATA_KEY, JSON.stringify(metadata));
}

function updateSqliteRecordMetadata(key: string, updatedAt: string | null): void {
  if (!isPersistedStorageKey(key)) {
    return;
  }

  const metadata = readSqliteRecordMetadata();
  metadata[key] = updatedAt;
  writeSqliteRecordMetadata(metadata);
}

function replaceSqliteRecordMetadata(records: TraccionStorageRecordSnapshot[]): void {
  const metadata: SqliteRecordMetadata = {};
  for (const record of records) {
    if (isPersistedStorageKey(record.key)) {
      metadata[record.key] = record.updatedAt;
    }
  }

  writeSqliteRecordMetadata(metadata);
}

function isConcurrencyConflictMessage(message: string): boolean {
  return message.toLowerCase().includes('han cambiado mientras guardabas');
}

function readPendingSqliteWrites(): PendingSqliteWrite[] {
  const stored = window.localStorage.getItem(SQLITE_PENDING_WRITES_KEY);
  if (!stored) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter(isPendingSqliteWrite).map((write) => ({
          ...write,
          expectedUpdatedAt:
            typeof write.expectedUpdatedAt === 'undefined' ? null : write.expectedUpdatedAt,
        }))
      : [];
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

function upsertPendingSqliteWrite(
  key: string,
  value: string,
  lastError: string,
  expectedUpdatedAt: string | null,
): void {
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
    expectedUpdatedAt,
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

async function saveRecordToSqliteIfUnchanged(
  record: TraccionStorageRecord,
  expectedUpdatedAt: string | null,
): Promise<string | null> {
  const saveLocalStorageRecordIfUnchanged = window.traccion?.saveLocalStorageRecordIfUnchanged;
  if (!saveLocalStorageRecordIfUnchanged) {
    await saveRecordToSqlite(record);
    return null;
  }

  const result = await saveLocalStorageRecordIfUnchanged({
    ...record,
    expectedUpdatedAt,
  });
  publishDatabaseStatus(result.status);

  if (!result.ok || !result.status.ready || result.status.phase !== 'active') {
    throw new Error(result.message ?? 'No se ha confirmado el guardado en SQLite compartido.');
  }

  return result.currentUpdatedAt;
}

async function resolveExpectedUpdatedAtForWrite(
  key: string,
  previousValue: string | null,
): Promise<string | null> {
  const knownUpdatedAt = readSqliteRecordMetadata()[key];
  if (typeof knownUpdatedAt !== 'undefined') {
    return knownUpdatedAt;
  }

  const getPersistedRecord = window.traccion?.getPersistedRecord;
  if (getPersistedRecord) {
    const snapshot = await getPersistedRecord(key);
    publishDatabaseStatus(snapshot.status);
    if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
      throw new Error(
        snapshot.status.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
      );
    }

    if (!snapshot.record) {
      return null;
    }

    if (previousValue !== snapshot.record.value) {
      throw new Error(
        'Los datos compartidos han cambiado mientras editabas. Recarga antes de guardar para no pisar cambios de otro usuario.',
      );
    }

    return snapshot.record.updatedAt;
  }

  const loadPersistedRecords = window.traccion?.loadPersistedRecords;
  if (!loadPersistedRecords) {
    return null;
  }

  const snapshot = await loadPersistedRecords();
  publishDatabaseStatus(snapshot.status);
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    throw new Error(
      snapshot.status.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
    );
  }

  const latestRecord = snapshot.records.find((record) => record.key === key) ?? null;
  if (!latestRecord) {
    return null;
  }

  if (previousValue !== latestRecord.value) {
    throw new Error(
      'Los datos compartidos han cambiado mientras editabas. Recarga antes de guardar para no pisar cambios de otro usuario.',
    );
  }

  return latestRecord.updatedAt;
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
      const savedUpdatedAt = await saveRecordToSqliteIfUnchanged(
        { key: pendingWrite.key, value: pendingWrite.value },
        pendingWrite.expectedUpdatedAt,
      );
      updateSqliteRecordMetadata(pendingWrite.key, savedUpdatedAt);
      removePendingSqliteWrite(pendingWrite.key);
      flushedCount += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se ha podido sincronizar un cambio pendiente.';
      if (!isConcurrencyConflictMessage(message)) {
        upsertPendingSqliteWrite(
          pendingWrite.key,
          pendingWrite.value,
          message,
          pendingWrite.expectedUpdatedAt,
        );
      }
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

  if (sharedWritesBlockedByConnectivity) {
    return 'Escritura bloqueada: la conexión con la carpeta compartida SQLite está en recuperación.';
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

function mirrorToSqlite(key: string, value: string, previousValue: string | null): void {
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

  let expectedUpdatedAt: string | null = null;

  resolveExpectedUpdatedAtForWrite(key, previousValue)
    .then((resolvedExpectedUpdatedAt) => {
      expectedUpdatedAt = resolvedExpectedUpdatedAt;
      return saveRecordToSqliteIfUnchanged({ key, value }, expectedUpdatedAt);
    })
    .then((savedUpdatedAt) => {
      updateSqliteRecordMetadata(key, savedUpdatedAt);
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
      if (isConcurrencyConflictMessage(message)) {
        emitPersistenceFeedback({
          kind: 'error',
          updatedAt: new Date().toISOString(),
          key,
          message:
            'Cambio no guardado — otro usuario modificó estos datos. Recarga la página para ver la versión actual antes de volver a editar.',
        });
        return;
      }

      upsertPendingSqliteWrite(key, value, messageWithKey, expectedUpdatedAt);
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

  const previousValue = window.localStorage.getItem(key);
  window.localStorage.setItem(key, value);
  writeHydrationMetadata({
    lastUpdatedAt: new Date().toISOString(),
    sqlitePath: null,
    refreshToken: null,
    strategy: 'localStorage',
  });
  mirrorToSqlite(key, value, previousValue);
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
  replaceSqliteRecordMetadata(sqliteRecords);

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
    const hydrationStartedAt = performance.now();
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
    logPersistenceMetric('hidratación SQLite: snapshot recibido', {
      records: sqliteRecords.length,
      elapsedMs: Math.round(performance.now() - hydrationStartedAt),
      largestKeys: summarizeStorageRecordSizes(sqliteRecords).slice(0, 10),
    });
    replaceSqliteRecordMetadata(sqliteRecords);

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

    const applyStartedAt = performance.now();
    applyPersistedRecordsSnapshotToLocalStorage(snapshot);
    logPersistenceMetric('hidratación SQLite: localStorage actualizado', {
      records: sqliteRecords.length,
      elapsedMs: Math.round(performance.now() - applyStartedAt),
    });
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

import {
  PERSISTED_STORAGE_KEYS,
  SQLITE_HYDRATION_METADATA_KEY,
  SQLITE_MIGRATION_FLAG_KEY,
  SQLITE_PENDING_WRITES_KEY,
  SQLITE_RECORD_METADATA_KEY,
  type PersistedStorageKey,
  isPersistedStorageKey as isKnownPersistedStorageKey,
} from './persistenceKeys';
import { publishDatabaseStatus } from './databaseStatus';
import { getEditingAvailability } from './editingAvailability';

import {
  emitPersistenceFeedback,
  isTemporarySqliteLockMessage,
  waitForNextPaint,
} from './persistenceFeedback';

import {
  isRecoverablePersistedValue,
  logPersistenceMetric,
  summarizeStorageRecordSizes,
} from './persistenceStorageSupport';

export {
  clearPersistenceBusy,
  emitPersistenceFeedback,
  isPersistenceFeedbackSilent,
  isTemporarySqliteLockMessage,
  publishPersistenceBusy,
  runSyncWithSilentPersistenceFeedback,
  runWithSilentPersistenceFeedback,
  startDatabaseConnectivityIssueListener,
  stopDatabaseConnectivityIssueListener,
  subscribeToPersistenceFeedback,
  waitForNextPaint,
} from './persistenceFeedback';
export type {
  PersistenceFeedback,
  PersistenceFeedbackKind,
  PersistenceFeedbackVisibility,
} from './persistenceFeedback';

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


async function saveRecordToSqlite(record: TraccionStorageRecord): Promise<boolean> {
  const saveLocalStorageRecord = window.traccion?.saveLocalStorageRecord;
  if (!saveLocalStorageRecord) {
    throw new Error('SQLite no disponible: IPC de guardado no expuesto.');
  }

  const status = await saveLocalStorageRecord(record);
  publishDatabaseStatus(status);
  if (!status.ready || status.phase !== 'active' || status.isDefaultPath !== false) {
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

  if (!result.ok || !result.status.ready || result.status.phase !== 'active' || result.status.isDefaultPath !== false) {
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
    if (!snapshot.status.ready || snapshot.status.phase !== 'active' || snapshot.status.isDefaultPath !== false) {
      throw new Error(
        snapshot.status.message ??
          'SQLite no está activo. No se permite guardar sin base compartida.',
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
  if (!snapshot.status.ready || snapshot.status.phase !== 'active' || snapshot.status.isDefaultPath !== false) {
    throw new Error(
      snapshot.status.message ??
        'SQLite no está activo. No se permite guardar sin base compartida.',
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


function clearLegacyPendingSqliteWrites(): void {
  window.localStorage.removeItem(SQLITE_PENDING_WRITES_KEY);
}

export function getPendingSqliteWriteCount(): number {
  clearLegacyPendingSqliteWrites();
  return 0;
}

/**
 * TrAcción ya no reproduce escrituras offline. Las colas heredadas se purgan
 * para evitar aplicar cambios obsoletos al recuperar conectividad.
 */
export async function flushPendingSqliteWrites(): Promise<number> {
  clearLegacyPendingSqliteWrites();
  return 0;
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

function shouldBlockSharedWrite(): string | null {
  if (import.meta.env.MODE === 'test') {
    return null;
  }

  const availability = getEditingAvailability();
  return availability.allowed ? null : availability.reason;
}

export interface WriteSharedStorageItemResult {
  ok: boolean;
  message: string;
  updatedAt: string | null;
}

export async function writeSharedStorageItemAsync(
  key: string,
  value: string,
): Promise<WriteSharedStorageItemResult> {
  if (!isPersistedStorageKey(key)) {
    writeRendererStorageCache(key, value, 'localStorage');
    return { ok: true, message: 'Guardado local.', updatedAt: null };
  }

  if (import.meta.env.MODE === 'test') {
    writeRendererStorageCache(key, value, 'localStorage');
    return { ok: true, message: 'Guardado local en test.', updatedAt: null };
  }

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
    return { ok: false, message, updatedAt: null };
  }

  const previousValue = window.localStorage.getItem(key);
  const now = new Date();
  emitPersistenceFeedback({
    kind: 'saving',
    updatedAt: now.toISOString(),
    key,
    message: 'Guardando en SQLite...',
  });
  await waitForNextPaint();

  try {
    const expectedUpdatedAt = await resolveExpectedUpdatedAtForWrite(key, previousValue);
    const savedUpdatedAt = await saveRecordToSqliteIfUnchanged({ key, value }, expectedUpdatedAt);
    updateSqliteRecordMetadata(key, savedUpdatedAt);
    writeRendererStorageCache(key, value, 'sqlite');
    const message = `Guardado en SQLite ${formatPersistenceTime()}`;
    emitPersistenceFeedback({
      kind: 'saved',
      updatedAt: new Date().toISOString(),
      key,
      message,
    });
    return { ok: true, message, updatedAt: savedUpdatedAt };
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error de guardado SQLite: el cambio no se ha confirmado.';
    const messageWithKey = `${message} Clave afectada: ${key}.`;
    console.warn(messageWithKey, error);

    if (isConcurrencyConflictMessage(message)) {
      const conflictMessage =
        'Cambio no guardado — otro usuario modificó estos datos. Recarga la página para ver la versión actual antes de volver a editar.';
      // Un conflicto de versión no es una caída de persistencia: es protección multiusuario.
      // El resultado sigue devolviendo ok=false para que el módulo muestre el aviso contextual,
      // pero no se pinta el banner global rojo como si la BBDD estuviera fallando.
      emitPersistenceFeedback({
        kind: 'saved',
        updatedAt: new Date().toISOString(),
        key,
        message: 'Conflicto de versión detectado; no se ha sobrescrito el cambio compartido.',
      });
      return { ok: false, message: conflictMessage, updatedAt: null };
    }

    if (!isTemporarySqliteLockMessage(message)) {
      emitPersistenceFeedback({
        kind: 'error',
        updatedAt: new Date().toISOString(),
        key,
        message: `${messageWithKey} El cambio no se ha guardado en la base compartida.`,
      });
    }

    return {
      ok: false,
      message: `${messageWithKey} El cambio no se ha guardado en la base compartida.`,
      updatedAt: null,
    };
  }
}

function getRendererStorageCacheValue(key: string): string | null {
  return isPersistedStorageKey(key) && import.meta.env.MODE !== 'test'
    ? window.sessionStorage.getItem(key)
    : window.localStorage.getItem(key);
}

export function writeRendererStorageCache(
  key: string,
  value: string,
  strategy: HydrationMetadata['strategy'] = 'sqlite',
): void {
  // Los datos de negocio compartidos solo se mantienen como snapshot efímero
  // de la sesión. SQLite es la única persistencia duradera.
  if (isPersistedStorageKey(key) && import.meta.env.MODE !== 'test') {
    window.sessionStorage.setItem(key, value);
    window.localStorage.removeItem(key);
  } else {
    window.localStorage.setItem(key, value);
  }
  writeHydrationMetadata({
    lastUpdatedAt: new Date().toISOString(),
    sqlitePath: null,
    refreshToken: null,
    strategy,
  });
}

export function removeRendererStorageCache(key: string): void {
  window.sessionStorage.removeItem(key);
  if (isPersistedStorageKey(key)) {
    window.localStorage.removeItem(key);
  }
}

export function readStorageItem(key: string): string | null {
  const value = getRendererStorageCacheValue(key);
  if (value === null) {
    return null;
  }

  return isRecoverablePersistedValue(key, value, isPersistedStorageKey(key) ? 'sqlite' : 'localStorage')
    ? value
    : null;
}

export function writeStorageItem(
  key: string,
  value: string,
): Promise<WriteSharedStorageItemResult> {
  return writeSharedStorageItemAsync(key, value);
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

export async function writeJsonStorageAsync<T>(
  key: string,
  value: T,
): Promise<WriteSharedStorageItemResult> {
  return writeSharedStorageItemAsync(key, JSON.stringify(value));
}

interface AppliedPersistedRecordsStats {
  applied: number;
  skippedUnchanged: number;
  removed: number;
}

function hasFreshHydrationCache(tokenSnapshot: TraccionPersistedRecordsTokenSnapshot): boolean {
  // Los metadatos sobreviven a un reinicio, la caché de negocio no. Si la
  // sesión no contiene ningún snapshot compartido debemos reconstruirlo desde SQLite.
  if (PERSISTED_STORAGE_KEYS.every((key) => window.sessionStorage.getItem(key) === null)) {
    return false;
  }

  const metadata = readHydrationMetadata();
  if (!metadata || metadata.strategy !== 'sqlite') {
    return false;
  }


  const sqlitePath = tokenSnapshot.status.path ?? null;
  if (metadata.sqlitePath !== sqlitePath) {
    return false;
  }

  if (tokenSnapshot.refreshToken) {
    return metadata.refreshToken === tokenSnapshot.refreshToken;
  }

  return Boolean(
    tokenSnapshot.latestUpdatedAt && metadata.lastUpdatedAt === tokenSnapshot.latestUpdatedAt,
  );
}

export function applyPersistedRecordsSnapshotToLocalStorage(
  snapshot: TraccionPersistedRecordsSnapshot,
  options: { preservePendingWrites?: boolean } = {},
): AppliedPersistedRecordsStats {
  void options;
  const sqliteRecords = snapshot.records.filter((record) => isPersistedStorageKey(record.key));
  let applied = 0;
  let skippedUnchanged = 0;
  let removed = 0;

  replaceSqliteRecordMetadata(sqliteRecords);

  const sqliteKeys = new Set(sqliteRecords.map((record) => record.key));
  for (const key of PERSISTED_STORAGE_KEYS) {
    if (!sqliteKeys.has(key) && (getRendererStorageCacheValue(key) !== null || window.localStorage.getItem(key) !== null)) {
      window.sessionStorage.removeItem(key);
      window.localStorage.removeItem(key);
      removed += 1;
    }
  }

  for (const record of sqliteRecords) {
    if (!isRecoverablePersistedValue(record.key, record.value, 'sqlite')) {
      // Nunca conservar una versión local si el valor autoritativo de SQLite
      // es inválido. Se elimina la representación de sesión y el módulo deberá
      // tratar el dato como ausente/erróneo hasta que SQLite sea reparada.
      if (getRendererStorageCacheValue(record.key) !== null || window.localStorage.getItem(record.key) !== null) {
        window.sessionStorage.removeItem(record.key);
        window.localStorage.removeItem(record.key);
        removed += 1;
      }
      continue;
    }

    if (getRendererStorageCacheValue(record.key) === record.value) {
      skippedUnchanged += 1;
      continue;
    }

    writeRendererStorageCache(record.key, record.value, 'sqlite');
    applied += 1;
  }

  writeHydrationMetadata({
    lastUpdatedAt: snapshot.latestUpdatedAt ?? new Date().toISOString(),
    sqlitePath: snapshot.status.path ?? null,
    refreshToken: snapshot.refreshToken,
    strategy: 'sqlite',
  });

  return { applied, skippedUnchanged, removed };
}

export async function hydrateLocalStorageFromSqlite(): Promise<HydrationResult> {
  if (!window.traccion?.loadPersistedRecords) {
    return { status: 'sqlite-unavailable', reason: 'IPC SQLite no disponible.' };
  }

  try {
    const hydrationStartedAt = performance.now();

    if (window.traccion.getPersistedRecordsToken) {
      const tokenSnapshot = await window.traccion.getPersistedRecordsToken();
      publishDatabaseStatus(tokenSnapshot.status);
      if (!tokenSnapshot.status.ready || tokenSnapshot.status.phase !== 'active' || tokenSnapshot.status.isDefaultPath !== false) {
        return {
          status: 'sqlite-unavailable',
          reason: tokenSnapshot.status.message ?? 'SQLite no preparado.',
        };
      }

      if (hasFreshHydrationCache(tokenSnapshot)) {
        logPersistenceMetric('hidratación SQLite: omitida por token sin cambios', {
          elapsedMs: Math.round(performance.now() - hydrationStartedAt),
          refreshToken: tokenSnapshot.refreshToken,
          latestUpdatedAt: tokenSnapshot.latestUpdatedAt,
        });
        writeHydrationMetadata({
          lastUpdatedAt: tokenSnapshot.latestUpdatedAt ?? new Date().toISOString(),
          sqlitePath: tokenSnapshot.status.path ?? null,
          refreshToken: tokenSnapshot.refreshToken,
          strategy: 'sqlite',
        });
        return {
          status: 'hydrated-from-sqlite',
          reason: 'SQLite sin cambios desde la última hidratación; se mantiene la caché de sesión.',
        };
      }
    }

    const snapshot = await window.traccion.loadPersistedRecords();
    publishDatabaseStatus(snapshot.status);
    if (!snapshot.status.ready || snapshot.status.phase !== 'active' || snapshot.status.isDefaultPath !== false) {
      return {
        status: 'sqlite-unavailable',
        reason: snapshot.status.message ?? 'SQLite no preparado.',
      };
    }

    const sqliteRecords = snapshot.records.filter((record) => isPersistedStorageKey(record.key));
    logPersistenceMetric('hidratación SQLite: snapshot recibido', {
      records: sqliteRecords.length,
      elapsedMs: Math.round(performance.now() - hydrationStartedAt),
      largestKeys: summarizeStorageRecordSizes(sqliteRecords).slice(0, 10),
    });
    replaceSqliteRecordMetadata(sqliteRecords);

    if (sqliteRecords.length === 0) {
      // SQLite compartida es la única fuente de verdad. Una base vacía no se
      // rellena nunca de forma implícita con datos conservados en este equipo.
      for (const key of PERSISTED_STORAGE_KEYS) {
        window.localStorage.removeItem(key);
        window.sessionStorage.removeItem(key);
      }
      replaceSqliteRecordMetadata([]);
      writeHydrationMetadata({
        lastUpdatedAt: snapshot.latestUpdatedAt ?? new Date().toISOString(),
        sqlitePath: snapshot.status.path ?? null,
        refreshToken: snapshot.refreshToken,
        strategy: 'sqlite',
      });
      return {
        status: 'hydrated-from-sqlite',
        reason: 'SQLite compartida está vacía; se ha descartado cualquier caché local de negocio.',
      };
    }

    // SQLite es la única fuente principal de arranque. El snapshot se aplica
    // directamente a una caché efímera de sesión; no se conserva copia local de negocio.

    const applyStartedAt = performance.now();
    const applyStats = applyPersistedRecordsSnapshotToLocalStorage(snapshot);
    logPersistenceMetric('hidratación SQLite: caché de sesión actualizada', {
      records: sqliteRecords.length,
      applied: applyStats.applied,
      skippedUnchanged: applyStats.skippedUnchanged,
      removed: applyStats.removed,
      elapsedMs: Math.round(performance.now() - applyStartedAt),
    });

    return {
      status: 'hydrated-from-sqlite',
      reason:
        snapshot.status.isDefaultPath === false
          ? 'SQLite parametrizada aplicada como fuente principal.'
          : 'SQLite local aplicada como fuente principal.',
    };
  } catch (error) {
    console.warn('No se ha podido rehidratar la caché de sesión desde SQLite.', error);
    const detail = error instanceof Error ? error.message : String(error);
    return {
      status: 'sqlite-unavailable',
      reason: detail
        ? `Error leyendo SQLite: ${detail}`
        : 'Error leyendo SQLite; TrAcción permanece bloqueada.',
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
    message: `SQLite compartida no disponible: ${result.reason} TrAcción ha bloqueado la edición. No se guardará ningún cambio local mientras la base compartida no esté activa.`,
  });
}

export function bootstrapSqlitePersistence(_force = false): void {
  // Deshabilitado: una SQLite vacía o nueva nunca debe sembrarse automáticamente
  // desde datos locales de un puesto. La inicialización debe ser explícita.
  window.localStorage.removeItem(SQLITE_MIGRATION_FLAG_KEY);
}

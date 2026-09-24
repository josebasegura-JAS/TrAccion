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
    writeLocalStorageCache(key, value, 'localStorage');
    return { ok: true, message: 'Guardado local.', updatedAt: null };
  }

  if (import.meta.env.MODE === 'test') {
    writeLocalStorageCache(key, value, 'localStorage');
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
    writeLocalStorageCache(key, value, 'sqlite');
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

function writeLocalStorageCache(
  key: string,
  value: string,
  strategy: HydrationMetadata['strategy'],
): void {
  window.localStorage.setItem(key, value);
  writeHydrationMetadata({
    lastUpdatedAt: new Date().toISOString(),
    sqlitePath: null,
    refreshToken: null,
    strategy,
  });
}

export function readStorageItem(key: string): string | null {
  const value = window.localStorage.getItem(key);
  if (value === null) {
    return null;
  }

  return isRecoverablePersistedValue(key, value, 'localStorage') ? value : null;
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
    if (!sqliteKeys.has(key) && window.localStorage.getItem(key) !== null) {
      window.localStorage.removeItem(key);
      removed += 1;
    }
  }

  for (const record of sqliteRecords) {
    if (!isRecoverablePersistedValue(record.key, record.value, 'sqlite')) {
      const existingValue = window.localStorage.getItem(record.key);
      if (
        existingValue !== null &&
        isRecoverablePersistedValue(record.key, existingValue, 'localStorage')
      ) {
        skippedUnchanged += 1;
        continue;
      }

      if (existingValue !== null) {
        window.localStorage.removeItem(record.key);
        removed += 1;
      }
      continue;
    }

    if (window.localStorage.getItem(record.key) === record.value) {
      skippedUnchanged += 1;
      continue;
    }

    window.localStorage.setItem(record.key, record.value);
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
          reason: 'SQLite sin cambios desde la última hidratación; se mantiene la caché local.',
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

    const localRecords = currentLocalRecords();
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

    const hasLocalRecords = localRecords.length > 0;

    // SQLite es la fuente principal de arranque. Si contiene datos, se aplica siempre
    // sobre la caché local, guardando antes un backup del estado local para poder recuperar.
    if (hasLocalRecords) {
      await window.traccion.backupLocalStorage?.(localRecords);
    }

    const applyStartedAt = performance.now();
    const applyStats = applyPersistedRecordsSnapshotToLocalStorage(snapshot);
    logPersistenceMetric('hidratación SQLite: localStorage actualizado', {
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
    console.warn('No se ha podido rehidratar localStorage desde SQLite.', error);
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

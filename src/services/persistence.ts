export const PERSISTED_STORAGE_KEYS = [
  'traccion.v1.plantilla.employees',
  'traccion.v1.plantilla.jobPositionTranslations',
  'traccion.v1.tareas.tasks',
  'traccion.v1.peticiones.peticiones',
  'traccion.v1.tareas.peticionesMigrated',
  'traccion.v1.teletrabajo.solicitudes',
  'traccion.v1.comite.sessions',
  'traccion.v1.ticketRestaurante.calendars',
  'traccion.v1.ticketRestaurante.absences',
  'traccion.v1.ticketRestaurante.people',
  'traccion.v1.ticketRestaurante.config',
  'traccion.v1.ticketRestaurante.debtLedger',
  'rrll_especiales_destinatarios',
  'traccion.v1.sorteos.draws',
  'traccion.v1.sorteos.exclusions',
  'traccion.v1.criterios-rrll.criterios',
  'traccion.v1.vinculograma.records',
  'traccion.v1.configuracion',
  'traccion.sidebar.pinned',
  'traccion.sidebar.activeGroup',
  'traccion.v1.vinculograma.showExpired',
] as const;


export type PersistenceFeedbackKind = 'saving' | 'saved' | 'error';

export interface PersistenceFeedback {
  kind: PersistenceFeedbackKind;
  updatedAt: string;
  key?: string;
  message: string;
}

const PERSISTENCE_FEEDBACK_EVENT = 'traccion:persistence-feedback';

function emitPersistenceFeedback(feedback: PersistenceFeedback): void {
  window.dispatchEvent(new CustomEvent<PersistenceFeedback>(PERSISTENCE_FEEDBACK_EVENT, { detail: feedback }));
}

export function subscribeToPersistenceFeedback(
  listener: (feedback: PersistenceFeedback) => void,
): () => void {
  const handler = (event: Event) => {
    listener((event as CustomEvent<PersistenceFeedback>).detail);
  };

  window.addEventListener(PERSISTENCE_FEEDBACK_EVENT, handler);
  return () => window.removeEventListener(PERSISTENCE_FEEDBACK_EVENT, handler);
}

function formatPersistenceTime(date = new Date()): string {
  return date.toLocaleTimeString('es-ES', { hour12: false });
}

const SQLITE_MIGRATION_FLAG_KEY = 'traccion.v1.sqlite.localStorageBackupCreated';
const SQLITE_HYDRATION_METADATA_KEY = 'traccion.v1.sqlite.hydrationMetadata';

type PersistedStorageKey = (typeof PERSISTED_STORAGE_KEYS)[number];

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

export function isPersistedStorageKey(key: string): key is PersistedStorageKey {
  return PERSISTED_STORAGE_KEYS.includes(key as PersistedStorageKey);
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
  return PERSISTED_STORAGE_KEYS.flatMap((key) => {
    const value = window.localStorage.getItem(key);
    return value === null ? [] : [{ key, value }];
  });
}

function hasNewerSqliteSnapshot(
  sqliteUpdatedAt: string | null,
  localMetadata: HydrationMetadata | null,
): boolean {
  if (!sqliteUpdatedAt || !localMetadata) {
    return false;
  }

  const sqliteTime = Date.parse(sqliteUpdatedAt);
  const localTime = Date.parse(localMetadata.lastUpdatedAt);
  return !Number.isNaN(sqliteTime) && !Number.isNaN(localTime) && sqliteTime > localTime;
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
    message: 'Guardando datos...',
  });

  const saveLocalStorageRecord = window.traccion?.saveLocalStorageRecord;
  if (!saveLocalStorageRecord) {
    emitPersistenceFeedback({
      kind: 'error',
      updatedAt: new Date().toISOString(),
      key,
      message: 'Error de guardado: SQLite no disponible.',
    });
    return;
  }

  saveLocalStorageRecord({ key, value })
    .then((status) => {
      const statusIsWritable = status.ready && status.phase === 'active';
      if (!statusIsWritable) {
        emitPersistenceFeedback({
          kind: 'error',
          updatedAt: new Date().toISOString(),
          key,
          message: status.message ?? 'Error de guardado: SQLite no está activo.',
        });
        return;
      }

      emitPersistenceFeedback({
        kind: 'saved',
        updatedAt: new Date().toISOString(),
        key,
        message: `Guardado ${formatPersistenceTime()}`,
      });
    })
    .catch((error: unknown) => {
      console.warn('No se ha podido sincronizar la persistencia con SQLite.', error);
      emitPersistenceFeedback({
        kind: 'error',
        updatedAt: new Date().toISOString(),
        key,
        message: 'Error de guardado.',
      });
    });
}

export function readStorageItem(key: string): string | null {
  return window.localStorage.getItem(key);
}

export function writeStorageItem(key: string, value: string): void {
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

  const parsed: unknown = JSON.parse(stored);
  return guard(parsed) ? parsed : fallback;
}

export function writeJsonStorage<T>(key: string, value: T): void {
  writeStorageItem(key, JSON.stringify(value));
}


export function applyPersistedRecordsSnapshotToLocalStorage(
  snapshot: TraccionPersistedRecordsSnapshot,
): void {
  const sqliteRecords = snapshot.records.filter((record) => isPersistedStorageKey(record.key));

  for (const record of sqliteRecords) {
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
        bootstrapSqlitePersistence();
      }
      return {
        status: 'kept-localStorage',
        reason: 'SQLite está vacío; se mantiene localStorage.',
      };
    }

    const localMetadata = readHydrationMetadata();
    const hasLocalRecords = localRecords.length > 0;
    // Regla anti-pérdida: una SQLite compartida/personalizada se considera fuente de arranque;
    // en la ruta local por defecto solo gana si su updated_at supera la metadata local.
    // Si no existe metadata comparable, se mantiene localStorage y se respalda en SQLite.
    const shouldHydrateFromSqlite =
      !hasLocalRecords ||
      snapshot.status.isDefaultPath === false ||
      hasNewerSqliteSnapshot(snapshot.latestUpdatedAt, localMetadata);

    if (!shouldHydrateFromSqlite) {
      if (hasLocalRecords) {
        await window.traccion.backupLocalStorage?.(localRecords);
      }
      return {
        status: 'kept-localStorage',
        reason:
          'SQLite no usa ruta compartida y no consta más reciente que localStorage; no se sobrescribe.',
      };
    }

    if (hasLocalRecords) {
      await window.traccion.backupLocalStorage?.(localRecords);
    }

    applyPersistedRecordsSnapshotToLocalStorage(snapshot);

    return {
      status: 'hydrated-from-sqlite',
      reason:
        snapshot.status.isDefaultPath === false
          ? 'Ruta SQLite personalizada.'
          : 'SQLite más reciente.',
    };
  } catch (error) {
    console.warn('No se ha podido rehidratar localStorage desde SQLite.', error);
    return {
      status: 'sqlite-unavailable',
      reason: 'Error leyendo SQLite; se mantiene localStorage.',
    };
  }
}

export function bootstrapSqlitePersistence(): void {
  if (!window.traccion?.migrateLocalStorage) {
    return;
  }

  if (window.localStorage.getItem(SQLITE_MIGRATION_FLAG_KEY) === 'true') {
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

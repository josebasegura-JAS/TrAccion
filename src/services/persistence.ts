export const PERSISTED_STORAGE_KEYS = [
  'traccion.v1.plantilla.employees',
  'traccion.v1.plantilla.jobPositionTranslations',
  'traccion.v1.tareas.tasks',
  'traccion.v1.peticiones.peticiones',
  'traccion.v1.tareas.peticionesMigrated',
  'traccion.v1.teletrabajo.solicitudes',
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

const SQLITE_MIGRATION_FLAG_KEY = 'traccion.v1.sqlite.localStorageBackupCreated';

type PersistedStorageKey = (typeof PERSISTED_STORAGE_KEYS)[number];

function isPersistedStorageKey(key: string): key is PersistedStorageKey {
  return PERSISTED_STORAGE_KEYS.includes(key as PersistedStorageKey);
}

function mirrorToSqlite(key: string, value: string): void {
  if (!isPersistedStorageKey(key)) {
    return;
  }

  window.traccion?.saveLocalStorageRecord?.({ key, value }).catch((error: unknown) => {
    console.warn('No se ha podido sincronizar la persistencia con SQLite.', error);
  });
}

export function readStorageItem(key: string): string | null {
  return window.localStorage.getItem(key);
}

export function writeStorageItem(key: string, value: string): void {
  window.localStorage.setItem(key, value);
  mirrorToSqlite(key, value);
}

export function readJsonStorage<T>(key: string, fallback: T, guard: (value: unknown) => value is T): T {
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

export function bootstrapSqlitePersistence(): void {
  if (!window.traccion?.migrateLocalStorage) {
    return;
  }

  if (window.localStorage.getItem(SQLITE_MIGRATION_FLAG_KEY) === 'true') {
    return;
  }

  const records = PERSISTED_STORAGE_KEYS.flatMap((key) => {
    const value = window.localStorage.getItem(key);
    return value === null ? [] : [{ key, value }];
  });

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

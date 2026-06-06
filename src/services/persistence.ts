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

function readCompleteLocalStorageSnapshot(): { key: string; value: string }[] {
  return Array.from({ length: window.localStorage.length }, (_value, index) => {
    const key = window.localStorage.key(index);
    if (!key) {
      return null;
    }

    const value = window.localStorage.getItem(key);
    return value === null ? null : { key, value };
  }).filter((record): record is { key: string; value: string } => record !== null);
}

export function bootstrapSqlitePersistence(): void {
  if (!window.traccion?.migrateLocalStorage) {
    return;
  }

  window.traccion.migrateLocalStorage(readCompleteLocalStorageSnapshot()).catch((error: unknown) => {
    console.warn('No se ha podido crear el backup SQLite de localStorage.', error);
  });
}

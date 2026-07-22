export const PERSISTED_STORAGE_KEYS = [
  'traccion.v1.plantilla.employees',
  'traccion.v1.plantilla.jobPositionTranslations',
  'traccion.v1.tareas.tasks',
  'traccion.v1.peticiones.peticiones',
  'traccion.v1.tareas.peticionesMigrated',
  'traccion.v1.auditTrail.events',
  'traccion.v1.teletrabajo.solicitudes',
  'traccion.v1.teletrabajo.puestos',
  'traccion.v1.teletrabajo.puestos.translationAliases',
  'traccion.v1.licenciasSinSueldo.records',
  'traccion.v1.comite.sessions',
  'traccion.v1.actas.records',
  'traccion.v1.actas.types',
  'traccion.v1.actas.outlookTemplate',
  'traccion.v1.actas.table',
  'traccion.v1.paritaria.sessions',
  'traccion.v1.ticketRestaurante.calendars',
  'traccion.v1.ticketRestaurante.absences',
  'traccion.v1.ticketRestaurante.people',
  'traccion.v1.ticketRestaurante.config',
  'traccion.v1.ticketRestaurante.manutenciones',
  'traccion.v1.presupuestos.scenarios',
  'traccion.v1.presupuestos.manualItems',
  'traccion.v1.presupuestos.ticketGroups',
  'traccion.v1.presupuestos.actuals',
  'rrll_especiales_destinatarios',
  'traccion.v1.sorteos.draws',
  'traccion.v1.sorteos.exclusions',
  'traccion.v1.criterios-rrll.criterios',
  'traccion.v1.vinculograma.records',
  'traccion.v1.configuracion',
  'traccion.v1.vinculograma.showExpired',
] as const;

export type PersistedStorageKey = (typeof PERSISTED_STORAGE_KEYS)[number];

export const SQLITE_MIGRATION_FLAG_KEY = 'traccion.v1.sqlite.localStorageBackupCreated';
export const SQLITE_HYDRATION_METADATA_KEY = 'traccion.v1.sqlite.hydrationMetadata';
export const SQLITE_PENDING_WRITES_KEY = 'traccion.v1.sqlite.pendingWrites';
export const SQLITE_PENDING_RECORD_WRITES_KEY = 'traccion.v1.sqlite.pendingRecordWrites';
export const SQLITE_RECORD_METADATA_KEY = 'traccion.v1.sqlite.recordMetadata';

const PERSISTED_STORAGE_PREFIXES = [] as const;

function shouldPersistDynamicKey(key: string): boolean {
  if (key.startsWith('traccion.v1.sqlite.')) {
    return false;
  }

  return PERSISTED_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function isPersistedStorageKey(key: string): key is PersistedStorageKey {
  return (
    PERSISTED_STORAGE_KEYS.includes(key as PersistedStorageKey) || shouldPersistDynamicKey(key)
  );
}

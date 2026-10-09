import type {
  ConditionalSimpleJsonRecord,
  SimpleJsonBatchSaveResult,
  SimpleJsonRecordsSnapshot,
  SimpleJsonSaveResult,
} from './simpleJsonModuleRepository.js';

/**
 * Forma de createJsonModuleRepository tal y como vive en
 * sqlitePersistence.ts (ver el comentario más largo en
 * vinculogramaRepository.ts, el primer módulo extraído con este patrón):
 * se inyecta como dependencia ya construida, en vez de importarla
 * directamente, para no crear una dependencia circular con
 * sqlitePersistence.ts.
 */
export type CreateJsonModuleRepository = (
  tableName: string,
  legacyKey: string,
  moduleLabel: string,
  getMigrationDone: () => boolean,
  setMigrationDone: (value: boolean) => void,
) => {
  loadSnapshot: () => Promise<SimpleJsonRecordsSnapshot>;
  saveIfUnchanged: (record: ConditionalSimpleJsonRecord) => Promise<SimpleJsonSaveResult>;
  saveManyIfUnchanged: (records: ConditionalSimpleJsonRecord[]) => Promise<SimpleJsonBatchSaveResult>;
};

export interface SimpleDomainRepositoryApi {
  loadSnapshot: () => Promise<SimpleJsonRecordsSnapshot>;
  saveIfUnchanged: (record: ConditionalSimpleJsonRecord) => Promise<SimpleJsonSaveResult>;
}

export interface BatchDomainRepositoryApi extends SimpleDomainRepositoryApi {
  saveManyIfUnchanged: (records: ConditionalSimpleJsonRecord[]) => Promise<SimpleJsonBatchSaveResult>;
}

/**
 * El antiguo flag de migración quedaba ligado a la vida del proceso, no a la
 * conexión SQLite. Tras trabajar con la base A podía quedarse a true y hacer
 * que una base B recién activada omitiera su migración legacy.
 *
 * No disponemos aquí de la conexión concreta (la resuelve la fachada de
 * sqlitePersistence dentro de createJsonModuleRepository), así que antes de
 * cada operación invalidamos únicamente esta caché de migración. La capa SQL
 * comprueba de forma idempotente si la tabla ya contiene datos antes de leer
 * el registro legacy; por tanto no repite escrituras ya aplicadas, pero sí
 * vuelve a evaluar correctamente la base que esté activa en ese momento.
 */
function createMigrationState(): {
  getMigrationDone: () => boolean;
  setMigrationDone: (value: boolean) => void;
  invalidate: () => void;
} {
  let migrationDone = false;

  return {
    getMigrationDone: () => migrationDone,
    setMigrationDone: (value) => {
      migrationDone = value;
    },
    invalidate: () => {
      migrationDone = false;
    },
  };
}

/**
 * Factoría compartida para los módulos de dominio "simples": una tabla,
 * sin guardado por lotes. La comprobación de migración se invalida antes de
 * cada operación para que nunca se reutilice el estado de una conexión SQLite
 * anterior.
 * No cubre Presupuestos (transacción combinada sobre 4 tablas, sin pasar
 * por createJsonModuleRepository en absoluto): ese módulo tiene forma
 * propia y se extrae aparte.
 */
export function createSimpleDomainRepository(
  createJsonModuleRepository: CreateJsonModuleRepository,
  tableName: string,
  legacyKey: string,
  moduleLabel: string,
): SimpleDomainRepositoryApi {
  const migrationState = createMigrationState();

  const repository = createJsonModuleRepository(
    tableName,
    legacyKey,
    moduleLabel,
    migrationState.getMigrationDone,
    migrationState.setMigrationDone,
  );

  return {
    loadSnapshot: () => {
      migrationState.invalidate();
      return repository.loadSnapshot();
    },
    saveIfUnchanged: (record) => {
      migrationState.invalidate();
      return repository.saveIfUnchanged(record);
    },
  };
}

/**
 * Misma factoría, pero para los módulos que sí necesitan guardado por
 * lotes (importaciones, reemplazo del listado completo de golpe, etc.):
 * Criterios RRLL, ActaTypes, y los tres módulos de Ticket Restaurante con
 * batch (Calendars, People, Absences, Manutenciones).
 */
export function createBatchDomainRepository(
  createJsonModuleRepository: CreateJsonModuleRepository,
  tableName: string,
  legacyKey: string,
  moduleLabel: string,
): BatchDomainRepositoryApi {
  const migrationState = createMigrationState();

  const repository = createJsonModuleRepository(
    tableName,
    legacyKey,
    moduleLabel,
    migrationState.getMigrationDone,
    migrationState.setMigrationDone,
  );

  return {
    loadSnapshot: () => {
      migrationState.invalidate();
      return repository.loadSnapshot();
    },
    saveIfUnchanged: (record) => {
      migrationState.invalidate();
      return repository.saveIfUnchanged(record);
    },
    saveManyIfUnchanged: (records) => {
      migrationState.invalidate();
      return repository.saveManyIfUnchanged(records);
    },
  };
}

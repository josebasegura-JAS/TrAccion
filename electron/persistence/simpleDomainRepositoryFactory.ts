import type {
  ConditionalSimpleJsonRecord,
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
  saveManyIfUnchanged: (records: ConditionalSimpleJsonRecord[]) => Promise<unknown>;
};

export interface SimpleDomainRepositoryApi {
  loadSnapshot: () => Promise<SimpleJsonRecordsSnapshot>;
  saveIfUnchanged: (record: ConditionalSimpleJsonRecord) => Promise<SimpleJsonSaveResult>;
}

/**
 * Factoría compartida para los módulos de dominio "simples": una tabla,
 * sin guardado por lotes, con su propio flag de migración encapsulado (en
 * vez de una variable suelta a nivel de módulo en sqlitePersistence.ts).
 * No cubre los módulos con saveManyIfUnchanged (Ticket Restaurante,
 * Actas/ActaTypes, Criterios RRLL) ni Presupuestos (transacción combinada
 * sobre 4 tablas, sin pasar por createJsonModuleRepository en absoluto):
 * esos tienen forma propia y se extraen aparte.
 */
export function createSimpleDomainRepository(
  createJsonModuleRepository: CreateJsonModuleRepository,
  tableName: string,
  legacyKey: string,
  moduleLabel: string,
): SimpleDomainRepositoryApi {
  let migrationDone = false;

  const repository = createJsonModuleRepository(
    tableName,
    legacyKey,
    moduleLabel,
    () => migrationDone,
    (value) => {
      migrationDone = value;
    },
  );

  return {
    loadSnapshot: () => repository.loadSnapshot(),
    saveIfUnchanged: (record) => repository.saveIfUnchanged(record),
  };
}

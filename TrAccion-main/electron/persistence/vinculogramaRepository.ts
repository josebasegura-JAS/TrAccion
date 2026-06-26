import type {
  ConditionalSimpleJsonRecord,
  SimpleJsonRecordsSnapshot,
  SimpleJsonSaveResult,
} from './simpleJsonModuleRepository.js';

/**
 * Forma de createJsonModuleRepository tal y como vive hoy en
 * sqlitePersistence.ts: ese wrapper inyecta dependencias de orquestación
 * (safeDatabaseOperation, getSqliteStatus, requireDatabase, etc.) que no
 * tiene sentido mover aquí — siguen viviendo en sqlitePersistence.ts y se
 * pasan a este módulo como una función ya construida, en vez de que este
 * módulo dependa directamente de sqlitePersistence.ts (lo que crearía una
 * dependencia circular: sqlitePersistence.ts ya reexporta las funciones de
 * este fichero para que main.ts las siga importando del mismo sitio).
 */
type CreateJsonModuleRepository = (
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

export interface VinculogramaRepositoryApi {
  loadVinculogramaRecordsSnapshot: () => Promise<SimpleJsonRecordsSnapshot>;
  saveVinculogramaRecordIfUnchanged: (record: ConditionalSimpleJsonRecord) => Promise<SimpleJsonSaveResult>;
}

/**
 * El flag de migración (antes una variable suelta a nivel de módulo en
 * sqlitePersistence.ts, vinculogramaMigrationDone) vive ahora encapsulado
 * en el closure de esta factoría: ya no es accesible ni modificable desde
 * fuera salvo a través de las funciones que se devuelven.
 */
export function createVinculogramaRepository(
  createJsonModuleRepository: CreateJsonModuleRepository,
): VinculogramaRepositoryApi {
  let vinculogramaMigrationDone = false;

  const repository = createJsonModuleRepository(
    'vinculograma_records',
    'traccion.v1.vinculograma.records',
    'Vinculograma',
    () => vinculogramaMigrationDone,
    (value) => {
      vinculogramaMigrationDone = value;
    },
  );

  return {
    loadVinculogramaRecordsSnapshot: () => repository.loadSnapshot(),
    saveVinculogramaRecordIfUnchanged: (record) => repository.saveIfUnchanged(record),
  };
}

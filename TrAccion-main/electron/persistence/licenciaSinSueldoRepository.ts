import type {
  ConditionalSimpleJsonRecord,
  SimpleJsonRecordsSnapshot,
  SimpleJsonSaveResult,
} from './simpleJsonModuleRepository.js';

/**
 * Ver el comentario equivalente en vinculogramaRepository.ts: mismo motivo
 * para inyectar createJsonModuleRepository en vez de importarlo.
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

export interface LicenciaSinSueldoRepositoryApi {
  loadLicenciaSinSueldoRecordsSnapshot: () => Promise<SimpleJsonRecordsSnapshot>;
  saveLicenciaSinSueldoRecordIfUnchanged: (
    record: ConditionalSimpleJsonRecord,
  ) => Promise<SimpleJsonSaveResult>;
}

export function createLicenciaSinSueldoRepository(
  createJsonModuleRepository: CreateJsonModuleRepository,
): LicenciaSinSueldoRepositoryApi {
  let licenciaSinSueldoMigrationDone = false;

  const repository = createJsonModuleRepository(
    'licencia_sin_sueldo_records',
    'traccion.v1.licenciasSinSueldo.records',
    'Licencia sin sueldo',
    () => licenciaSinSueldoMigrationDone,
    (value) => {
      licenciaSinSueldoMigrationDone = value;
    },
  );

  return {
    loadLicenciaSinSueldoRecordsSnapshot: () => repository.loadSnapshot(),
    saveLicenciaSinSueldoRecordIfUnchanged: (record) => repository.saveIfUnchanged(record),
  };
}

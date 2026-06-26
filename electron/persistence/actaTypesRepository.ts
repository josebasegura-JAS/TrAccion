import {
  createBatchDomainRepository,
  type CreateJsonModuleRepository,
} from './simpleDomainRepositoryFactory.js';
import type {
  ConditionalSimpleJsonRecord,
  SimpleJsonBatchSaveResult,
  SimpleJsonRecordsSnapshot,
  SimpleJsonSaveResult,
} from './simpleJsonModuleRepository.js';

export interface ActaTypesRepositoryApi {
  loadActaTypeRecordsSnapshot: () => Promise<SimpleJsonRecordsSnapshot>;
  saveActaTypeRecordIfUnchanged: (record: ConditionalSimpleJsonRecord) => Promise<SimpleJsonSaveResult>;
  saveActaTypeRecordsIfUnchanged: (
    records: ConditionalSimpleJsonRecord[],
  ) => Promise<SimpleJsonBatchSaveResult>;
}

export function createActaTypesRepository(
  createJsonModuleRepository: CreateJsonModuleRepository,
): ActaTypesRepositoryApi {
  const repository = createBatchDomainRepository(
    createJsonModuleRepository,
    'acta_type_records',
    'traccion.v1.actas.types',
    'Tipo de acta',
  );

  return {
    loadActaTypeRecordsSnapshot: () => repository.loadSnapshot(),
    saveActaTypeRecordIfUnchanged: (record) => repository.saveIfUnchanged(record),
    saveActaTypeRecordsIfUnchanged: (records) => repository.saveManyIfUnchanged(records),
  };
}

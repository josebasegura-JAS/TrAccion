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

export interface CriteriosRrllRepositoryApi {
  loadCriteriosRrllRecordsSnapshot: () => Promise<SimpleJsonRecordsSnapshot>;
  saveCriteriosRrllRecordIfUnchanged: (record: ConditionalSimpleJsonRecord) => Promise<SimpleJsonSaveResult>;
  saveCriteriosRrllRecordsIfUnchanged: (
    records: ConditionalSimpleJsonRecord[],
  ) => Promise<SimpleJsonBatchSaveResult>;
}

export function createCriteriosRrllRepository(
  createJsonModuleRepository: CreateJsonModuleRepository,
): CriteriosRrllRepositoryApi {
  const repository = createBatchDomainRepository(
    createJsonModuleRepository,
    'criterios_rrll_records',
    'traccion.v1.criterios-rrll.criterios',
    'Criterio RRLL',
  );

  return {
    loadCriteriosRrllRecordsSnapshot: () => repository.loadSnapshot(),
    saveCriteriosRrllRecordIfUnchanged: (record) => repository.saveIfUnchanged(record),
    saveCriteriosRrllRecordsIfUnchanged: (records) => repository.saveManyIfUnchanged(records),
  };
}

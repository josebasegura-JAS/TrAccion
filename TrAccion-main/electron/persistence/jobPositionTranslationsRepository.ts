import {
  createSimpleDomainRepository,
  type CreateJsonModuleRepository,
} from './simpleDomainRepositoryFactory.js';
import type {
  ConditionalSimpleJsonRecord,
  SimpleJsonRecordsSnapshot,
  SimpleJsonSaveResult,
} from './simpleJsonModuleRepository.js';

export interface JobPositionTranslationsRepositoryApi {
  loadJobPositionTranslationRecordsSnapshot: () => Promise<SimpleJsonRecordsSnapshot>;
  saveJobPositionTranslationRecordIfUnchanged: (
    record: ConditionalSimpleJsonRecord,
  ) => Promise<SimpleJsonSaveResult>;
}

export function createJobPositionTranslationsRepository(
  createJsonModuleRepository: CreateJsonModuleRepository,
): JobPositionTranslationsRepositoryApi {
  const repository = createSimpleDomainRepository(
    createJsonModuleRepository,
    'job_position_translation_records',
    'traccion.v1.plantilla.jobPositionTranslations',
    'Traducción de puesto',
  );

  return {
    loadJobPositionTranslationRecordsSnapshot: () => repository.loadSnapshot(),
    saveJobPositionTranslationRecordIfUnchanged: (record) => repository.saveIfUnchanged(record),
  };
}

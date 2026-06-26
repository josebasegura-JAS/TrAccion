import {
  createSimpleDomainRepository,
  type CreateJsonModuleRepository,
} from './simpleDomainRepositoryFactory.js';
import type {
  ConditionalSimpleJsonRecord,
  SimpleJsonRecordsSnapshot,
  SimpleJsonSaveResult,
} from './simpleJsonModuleRepository.js';

export interface EspecialesRecipientRepositoryApi {
  loadEspecialesRecipientRecordsSnapshot: () => Promise<SimpleJsonRecordsSnapshot>;
  saveEspecialesRecipientRecordIfUnchanged: (
    record: ConditionalSimpleJsonRecord,
  ) => Promise<SimpleJsonSaveResult>;
}

export function createEspecialesRecipientRepository(
  createJsonModuleRepository: CreateJsonModuleRepository,
): EspecialesRecipientRepositoryApi {
  const repository = createSimpleDomainRepository(
    createJsonModuleRepository,
    'especiales_recipient_records',
    'rrll_especiales_destinatarios',
    'Destinatario especial',
  );

  return {
    loadEspecialesRecipientRecordsSnapshot: () => repository.loadSnapshot(),
    saveEspecialesRecipientRecordIfUnchanged: (record) => repository.saveIfUnchanged(record),
  };
}

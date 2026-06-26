import {
  createSimpleDomainRepository,
  type CreateJsonModuleRepository,
} from './simpleDomainRepositoryFactory.js';
import type {
  ConditionalSimpleJsonRecord,
  SimpleJsonRecordsSnapshot,
  SimpleJsonSaveResult,
} from './simpleJsonModuleRepository.js';

export interface TeletrabajoPuestosRepositoryApi {
  loadTeletrabajoPuestoRecordsSnapshot: () => Promise<SimpleJsonRecordsSnapshot>;
  saveTeletrabajoPuestoRecordIfUnchanged: (
    record: ConditionalSimpleJsonRecord,
  ) => Promise<SimpleJsonSaveResult>;
}

export function createTeletrabajoPuestosRepository(
  createJsonModuleRepository: CreateJsonModuleRepository,
): TeletrabajoPuestosRepositoryApi {
  const repository = createSimpleDomainRepository(
    createJsonModuleRepository,
    'teletrabajo_puesto_records',
    'traccion.v1.teletrabajo.puestos',
    'Puesto teletrabajable',
  );

  return {
    loadTeletrabajoPuestoRecordsSnapshot: () => repository.loadSnapshot(),
    saveTeletrabajoPuestoRecordIfUnchanged: (record) => repository.saveIfUnchanged(record),
  };
}

import {
  createSimpleDomainRepository,
  type CreateJsonModuleRepository,
} from './simpleDomainRepositoryFactory.js';
import type {
  ConditionalSimpleJsonRecord,
  SimpleJsonRecordsSnapshot,
  SimpleJsonSaveResult,
} from './simpleJsonModuleRepository.js';

export interface TeletrabajoGruposCoberturaRepositoryApi {
  loadTeletrabajoGrupoCoberturaRecordsSnapshot: () => Promise<SimpleJsonRecordsSnapshot>;
  saveTeletrabajoGrupoCoberturaRecordIfUnchanged: (
    record: ConditionalSimpleJsonRecord,
  ) => Promise<SimpleJsonSaveResult>;
}

export function createTeletrabajoGruposCoberturaRepository(
  createJsonModuleRepository: CreateJsonModuleRepository,
): TeletrabajoGruposCoberturaRepositoryApi {
  const repository = createSimpleDomainRepository(
    createJsonModuleRepository,
    'teletrabajo_grupo_cobertura_records',
    'traccion.v1.teletrabajo.gruposCobertura',
    'Grupo de cobertura de teletrabajo',
  );

  return {
    loadTeletrabajoGrupoCoberturaRecordsSnapshot: () => repository.loadSnapshot(),
    saveTeletrabajoGrupoCoberturaRecordIfUnchanged: (record) => repository.saveIfUnchanged(record),
  };
}

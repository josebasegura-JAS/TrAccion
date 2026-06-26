import {
  createSimpleDomainRepository,
  type CreateJsonModuleRepository,
} from './simpleDomainRepositoryFactory.js';
import type {
  ConditionalSimpleJsonRecord,
  SimpleJsonRecordsSnapshot,
  SimpleJsonSaveResult,
} from './simpleJsonModuleRepository.js';

export interface TicketRestauranteConfigRepositoryApi {
  loadTicketRestauranteConfigRecordsSnapshot: () => Promise<SimpleJsonRecordsSnapshot>;
  saveTicketRestauranteConfigRecordIfUnchanged: (
    record: ConditionalSimpleJsonRecord,
  ) => Promise<SimpleJsonSaveResult>;
}

export function createTicketRestauranteConfigRepository(
  createJsonModuleRepository: CreateJsonModuleRepository,
): TicketRestauranteConfigRepositoryApi {
  const repository = createSimpleDomainRepository(
    createJsonModuleRepository,
    'ticket_restaurante_config_records',
    'traccion.v1.ticketRestaurante.config',
    'Configuración de Ticket Restaurante',
  );

  return {
    loadTicketRestauranteConfigRecordsSnapshot: () => repository.loadSnapshot(),
    saveTicketRestauranteConfigRecordIfUnchanged: (record) => repository.saveIfUnchanged(record),
  };
}

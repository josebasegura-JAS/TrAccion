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

export interface TicketRestaurantePeopleRepositoryApi {
  loadTicketRestaurantePersonRecordsSnapshot: () => Promise<SimpleJsonRecordsSnapshot>;
  saveTicketRestaurantePersonRecordIfUnchanged: (
    record: ConditionalSimpleJsonRecord,
  ) => Promise<SimpleJsonSaveResult>;
  saveTicketRestaurantePersonRecordsIfUnchanged: (
    records: ConditionalSimpleJsonRecord[],
  ) => Promise<SimpleJsonBatchSaveResult>;
}

export function createTicketRestaurantePeopleRepository(
  createJsonModuleRepository: CreateJsonModuleRepository,
): TicketRestaurantePeopleRepositoryApi {
  const repository = createBatchDomainRepository(
    createJsonModuleRepository,
    'ticket_restaurante_person_records',
    'traccion.v1.ticketRestaurante.people',
    'Persona de Ticket Restaurante',
  );

  return {
    loadTicketRestaurantePersonRecordsSnapshot: () => repository.loadSnapshot(),
    saveTicketRestaurantePersonRecordIfUnchanged: (record) => repository.saveIfUnchanged(record),
    saveTicketRestaurantePersonRecordsIfUnchanged: (records) => repository.saveManyIfUnchanged(records),
  };
}

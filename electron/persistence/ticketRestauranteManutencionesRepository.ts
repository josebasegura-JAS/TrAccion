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

export interface TicketRestauranteManutencionesRepositoryApi {
  loadTicketRestauranteManutencionRecordsSnapshot: () => Promise<SimpleJsonRecordsSnapshot>;
  saveTicketRestauranteManutencionRecordIfUnchanged: (
    record: ConditionalSimpleJsonRecord,
  ) => Promise<SimpleJsonSaveResult>;
  saveTicketRestauranteManutencionRecordsIfUnchanged: (
    records: ConditionalSimpleJsonRecord[],
  ) => Promise<SimpleJsonBatchSaveResult>;
}

export function createTicketRestauranteManutencionesRepository(
  createJsonModuleRepository: CreateJsonModuleRepository,
): TicketRestauranteManutencionesRepositoryApi {
  const repository = createBatchDomainRepository(
    createJsonModuleRepository,
    'ticket_restaurante_manutencion_records',
    'traccion.v1.ticketRestaurante.manutenciones',
    'Manutención de Ticket Restaurante',
  );

  return {
    loadTicketRestauranteManutencionRecordsSnapshot: () => repository.loadSnapshot(),
    saveTicketRestauranteManutencionRecordIfUnchanged: (record) => repository.saveIfUnchanged(record),
    saveTicketRestauranteManutencionRecordsIfUnchanged: (records) => repository.saveManyIfUnchanged(records),
  };
}

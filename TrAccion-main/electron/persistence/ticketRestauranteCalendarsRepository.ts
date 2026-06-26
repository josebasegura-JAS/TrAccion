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

export interface TicketRestauranteCalendarsRepositoryApi {
  loadTicketRestauranteCalendarRecordsSnapshot: () => Promise<SimpleJsonRecordsSnapshot>;
  saveTicketRestauranteCalendarRecordIfUnchanged: (
    record: ConditionalSimpleJsonRecord,
  ) => Promise<SimpleJsonSaveResult>;
  saveTicketRestauranteCalendarRecordsIfUnchanged: (
    records: ConditionalSimpleJsonRecord[],
  ) => Promise<SimpleJsonBatchSaveResult>;
}

export function createTicketRestauranteCalendarsRepository(
  createJsonModuleRepository: CreateJsonModuleRepository,
): TicketRestauranteCalendarsRepositoryApi {
  const repository = createBatchDomainRepository(
    createJsonModuleRepository,
    'ticket_restaurante_calendar_records',
    'traccion.v1.ticketRestaurante.calendars',
    'Calendario de Ticket Restaurante',
  );

  return {
    loadTicketRestauranteCalendarRecordsSnapshot: () => repository.loadSnapshot(),
    saveTicketRestauranteCalendarRecordIfUnchanged: (record) => repository.saveIfUnchanged(record),
    saveTicketRestauranteCalendarRecordsIfUnchanged: (records) => repository.saveManyIfUnchanged(records),
  };
}

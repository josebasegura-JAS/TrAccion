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

export interface TicketRestauranteAbsencesRepositoryApi {
  loadTicketRestauranteAbsenceRecordsSnapshot: () => Promise<SimpleJsonRecordsSnapshot>;
  saveTicketRestauranteAbsenceRecordIfUnchanged: (
    record: ConditionalSimpleJsonRecord,
  ) => Promise<SimpleJsonSaveResult>;
  saveTicketRestauranteAbsenceRecordsIfUnchanged: (
    records: ConditionalSimpleJsonRecord[],
  ) => Promise<SimpleJsonBatchSaveResult>;
}

export function createTicketRestauranteAbsencesRepository(
  createJsonModuleRepository: CreateJsonModuleRepository,
): TicketRestauranteAbsencesRepositoryApi {
  const repository = createBatchDomainRepository(
    createJsonModuleRepository,
    'ticket_restaurante_absence_records',
    'traccion.v1.ticketRestaurante.absences',
    'Ausencia de Ticket Restaurante',
  );

  return {
    loadTicketRestauranteAbsenceRecordsSnapshot: () => repository.loadSnapshot(),
    saveTicketRestauranteAbsenceRecordIfUnchanged: (record) => repository.saveIfUnchanged(record),
    saveTicketRestauranteAbsenceRecordsIfUnchanged: (records) => repository.saveManyIfUnchanged(records),
  };
}

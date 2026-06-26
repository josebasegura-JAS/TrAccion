import { describe, expect, it, vi } from 'vitest';
import { createTicketRestauranteAbsencesRepository } from './ticketRestauranteAbsencesRepository';

describe('createTicketRestauranteAbsencesRepository', () => {
  it('configura la tabla, key legacy y label correctos, y expone las 3 funciones con el nombre esperado', async () => {
    const snapshot = { status: { ready: true, engine: 'sqlite', phase: 'active' }, records: [] };
    const batchResult = { ok: true, status: { ready: true, engine: 'sqlite', phase: 'active' }, results: [], message: 'ok' };
    const repository = {
      loadSnapshot: vi.fn(async () => snapshot),
      saveIfUnchanged: vi.fn(),
      saveManyIfUnchanged: vi.fn(async () => batchResult),
    };
    const createJsonModuleRepository = vi.fn(() => repository);

    const api = createTicketRestauranteAbsencesRepository(createJsonModuleRepository);

    const [tableName, legacyKey, moduleLabel] = createJsonModuleRepository.mock.calls[0];
    expect(tableName).toBe('ticket_restaurante_absence_records');
    expect(legacyKey).toBe('traccion.v1.ticketRestaurante.absences');
    expect(moduleLabel).toBe('Ausencia de Ticket Restaurante');

    expect(await api.loadTicketRestauranteAbsenceRecordsSnapshot()).toBe(snapshot);
    expect(await api.saveTicketRestauranteAbsenceRecordsIfUnchanged([])).toBe(batchResult);
  });
});

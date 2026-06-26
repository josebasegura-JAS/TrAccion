import { describe, expect, it, vi } from 'vitest';
import { createTicketRestauranteManutencionesRepository } from './ticketRestauranteManutencionesRepository';

describe('createTicketRestauranteManutencionesRepository', () => {
  it('configura la tabla, key legacy y label correctos, y expone las 3 funciones con el nombre esperado', async () => {
    const snapshot = { status: { ready: true, engine: 'sqlite', phase: 'active' }, records: [] };
    const batchResult = { ok: true, status: { ready: true, engine: 'sqlite', phase: 'active' }, results: [], message: 'ok' };
    const repository = {
      loadSnapshot: vi.fn(async () => snapshot),
      saveIfUnchanged: vi.fn(),
      saveManyIfUnchanged: vi.fn(async () => batchResult),
    };
    const createJsonModuleRepository = vi.fn(() => repository);

    const api = createTicketRestauranteManutencionesRepository(createJsonModuleRepository);

    const [tableName, legacyKey, moduleLabel] = createJsonModuleRepository.mock.calls[0];
    expect(tableName).toBe('ticket_restaurante_manutencion_records');
    expect(legacyKey).toBe('traccion.v1.ticketRestaurante.manutenciones');
    expect(moduleLabel).toBe('Manutención de Ticket Restaurante');

    expect(await api.loadTicketRestauranteManutencionRecordsSnapshot()).toBe(snapshot);
    expect(await api.saveTicketRestauranteManutencionRecordsIfUnchanged([])).toBe(batchResult);
  });
});

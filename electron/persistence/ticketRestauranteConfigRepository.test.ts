import { describe, expect, it, vi } from 'vitest';
import { createTicketRestauranteConfigRepository } from './ticketRestauranteConfigRepository';

describe('createTicketRestauranteConfigRepository', () => {
  it('configura la tabla, key legacy y label correctos, y expone las funciones con el nombre esperado', async () => {
    const snapshot = { status: { ready: true, engine: 'sqlite', phase: 'active' }, records: [] };
    const repository = { loadSnapshot: vi.fn(async () => snapshot), saveIfUnchanged: vi.fn(), saveManyIfUnchanged: vi.fn() };
    const createJsonModuleRepository = vi.fn(() => repository);

    const api = createTicketRestauranteConfigRepository(createJsonModuleRepository);

    const [tableName, legacyKey, moduleLabel] = createJsonModuleRepository.mock.calls[0];
    expect(tableName).toBe('ticket_restaurante_config_records');
    expect(legacyKey).toBe('traccion.v1.ticketRestaurante.config');
    expect(moduleLabel).toBe('Configuración de Ticket Restaurante');

    expect(await api.loadTicketRestauranteConfigRecordsSnapshot()).toBe(snapshot);
  });
});

import { describe, expect, it } from 'vitest';
import { parsePersistedTicketConfig } from './useTicketRestauranteStore';
import { DEFAULT_TICKET_RESTAURANT_CONFIG } from '../domain/ticketRestaurante';

describe('lectura segura de configuración Ticket Restaurante', () => {
  it('acepta configuración SQLite válida', () => {
    expect(parsePersistedTicketConfig(JSON.stringify(DEFAULT_TICKET_RESTAURANT_CONFIG))).toBeDefined();
  });
  it('no sustituye silenciosamente JSON corrupto por valores por defecto', () => {
    expect(() => parsePersistedTicketConfig('{rota')).toThrow('JSON ilegible');
    expect(() => parsePersistedTicketConfig('null')).toThrow('estructura inválida');
    expect(() => parsePersistedTicketConfig('[]')).toThrow('estructura inválida');
    expect(() => parsePersistedTicketConfig('{}')).toThrow('campos económicos básicos');
    expect(() => parsePersistedTicketConfig('{"importeTicket":-2,"pedidoMensual":0}')).toThrow('campos económicos básicos');
  });
});

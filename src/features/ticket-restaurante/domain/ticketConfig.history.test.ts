import { describe, expect, it } from 'vitest';
import { DEFAULT_TICKET_RESTAURANT_CONFIG, normalizeTicketRestaurantConfig } from './ticketConfig';
import type { TicketRestaurantConfig } from './ticketRestauranteTypes';

function restore(fields: Record<string, unknown>) {
  // Frontera de deserialización: el contenido persistido puede ser incompleto.
  return normalizeTicketRestaurantConfig({ ...DEFAULT_TICKET_RESTAURANT_CONFIG, ...fields } as TicketRestaurantConfig);
}

describe('configuración histórica de Ticket: datos persistidos y correcciones', () => {
  it('deduplica exclusiones por empleado y mes, conservando las de otro año y su deuda entregada', () => {
    const result = restore({ monthlyOrderExclusions: [null, 1, {},
      { empleado: '000100', year: 2026, month: 12, deliveredTickets: 5, reason: 'Ya entregado' },
      { empleado: '100', year: 2026, month: 12, deliveredTickets: 99 },
      { empleado: '100', year: 2027, month: 12, deliveredTickets: -1 },
      { empleado: '100', year: 2026, month: 13 },
      { empleado: '', year: 2026, month: 12 },
    ] });
    expect(result.monthlyOrderExclusions).toEqual([
      { empleado: '100', year: 2026, month: 12, deliveredTickets: 5, reason: 'Ya entregado', createdAt: '' },
      { empleado: '100', year: 2027, month: 12, deliveredTickets: 0, reason: '', createdAt: '' },
    ]);
  });

  it('aísla ajustes por mes y descarta entradas incompletas sin duplicar el ajuste histórico', () => {
    const result = restore({ monthlyOrderAdjustments: [null, 1, {},
      { empleado: '000100', year: 2026, month: 12, tickets: 8, reason: 'Corrección' },
      { empleado: '100', year: 2026, month: 12, tickets: 99 },
      { empleado: '100', year: 2027, month: 1, tickets: 2 },
      { empleado: '100', year: 2026, month: 0, tickets: 2 },
      { empleado: '', year: 2026, month: 12, tickets: 2 },
    ] });
    expect(result.monthlyOrderAdjustments).toEqual([
      { empleado: '100', year: 2026, month: 12, tickets: 8, reason: 'Corrección', createdAt: '' },
      { empleado: '100', year: 2027, month: 1, tickets: 2, reason: '', createdAt: '' },
    ]);
  });

  it('recupera pedidos válidos aunque haya meses y filas corruptos en el mismo fichero', () => {
    const result = restore({ monthlyOrders: {
      invalid: {}, '2026-10': null, '2026-11': { year: 2026, month: 11 },
      '2026-12': { year: 2026, month: 12, rows: [null, {}, { empleado: '100', tickets: '12' },
        { empleado: '000100', tickets: 12, unitPrice: 10 },
        { empleado: '200', tickets: 0, nombreApellidos: ' Sin carga ', amount: 0 }], totalTickets: 999 },
    } });
    expect(Object.keys(result.monthlyOrders ?? {})).toEqual(['2026-12']);
    expect(result.monthlyOrders?.['2026-12']).toEqual({ year: 2026, month: 12, orderedAt: '',
      rows: [{ empleado: '100', nombreApellidos: '', tickets: 12, unitPrice: 10, amount: 120 },
        { empleado: '200', nombreApellidos: 'Sin carga', tickets: 0, unitPrice: undefined, amount: 0 }],
      totalTickets: 12, totalAmount: 0 });
  });

  it('mantiene devoluciones negativas y sus importes al recuperar movimientos, omitiendo los vacíos', () => {
    const result = restore({ orderMovements: [null, 1, {},
      { id: 'empty', year: 2026, month: 12, tickets: 0 },
      { id: 'return', year: 2026, month: 12, tickets: -2, unitPrice: 10 },
      { id: 'legacy', year: 2026, month: 12, tickets: 1 },
    ] });
    expect(result.orderMovements).toHaveLength(2);
    expect(result.orderMovements?.[0]).toMatchObject({ id: 'return', tickets: -2, amount: -20 });
    expect(result.orderMovements?.[1]).toMatchObject({ id: 'legacy', tickets: 1, amount: undefined, empleado: '' });
  });

  it('conserva snapshots de cierre y descarta meses inválidos sin afectar los pedidos de otros meses', () => {
    const result = restore({ monthlySnapshots: {
      invalid: {}, '2026-13': { rows: [] }, '2026-11': {},
      '2026-12': { closedAt: '2026-12-31T23:00:00Z', rows: [null, {},
        { empleado: '000100', nombreApellidos: ' Persona ', tickets: 12, importe: 120, area: ' RRLL ', manual: true },
        { empleado: '200', nombreApellidos: 'Sin carga', tickets: -1, importe: -5 }], },
    }, annualClosures: { invalid: {}, '2025': null, '2026': {}, '2027': { closedAt: '2027-12-31' } } });
    expect(Object.keys(result.monthlySnapshots ?? {})).toEqual(['2026-12']);
    expect(result.monthlySnapshots?.['2026-12'].rows).toEqual([
      { empleado: '100', nombreApellidos: 'Persona', tickets: 12, importe: 120, area: 'RRLL', manual: true },
      { empleado: '200', nombreApellidos: 'Sin carga', tickets: 0, importe: 0, area: 'Sin área', manual: false },
    ]);
    expect(result.annualClosures).toEqual({ '2026': { year: 2026, closedAt: '' }, '2027': { year: 2027, closedAt: '2027-12-31' } });
  });
});

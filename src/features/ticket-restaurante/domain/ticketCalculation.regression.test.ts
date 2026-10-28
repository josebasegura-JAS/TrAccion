import { describe, expect, it } from 'vitest';
import { calculateMonthlyTicketOrder, calculateTicketContribution } from './ticketCalculation';
import { DEFAULT_TICKET_RESTAURANT_CONFIG } from './ticketConfig';
import type { TicketCalendar, TicketManualPerson, TicketPerson, TicketRestaurantAbsence, TicketRestaurantConfig } from './ticketRestauranteTypes';

const now = '2026-03-01T00:00:00.000Z';
const calendar: TicketCalendar = {
  id: 'sscc', nombre: 'SSCC', activo: true, diasSinTicket: [],
  ticketIsoWeekdays: [1, 2, 3, 4, 5], createdAt: now, updatedAt: now, deletedAt: null,
};
const person: TicketPerson = {
  empleado: '123', nombre: 'Ana', apellido1: 'Metro', apellido2: '', dni: '',
  nombreApellidos: 'Ana Metro', puesto: 'SSCC', calendarId: 'sscc',
  activo: true, createdAt: now, updatedAt: now, deletedAt: null,
};
function config(overrides: Partial<TicketRestaurantConfig>): TicketRestaurantConfig {
  return { ...DEFAULT_TICKET_RESTAURANT_CONFIG, ...overrides };
}
function manual(overrides: Partial<TicketManualPerson> = {}): TicketManualPerson {
  return {
    id: 'manual-1', empleado: '456', nombreApellidos: 'Pedro Manual', dni: '',
    activo: true, includeContribution: true, monthlyTickets: { '2026-04': 3, '2026-05': 5 },
    createdAt: now, updatedAt: now, ...overrides,
  };
}

describe('Ticket Restaurante — regresiones de cálculo mensual', () => {
  it('el ajuste se aplica únicamente al empleado y mes indicados, con totales coherentes', () => {
    const settings = config({ monthlyOrderAdjustments: [{
      empleado: '000123', year: 2026, month: 4, tickets: 7,
      reason: 'Ajuste acordado', createdAt: now,
    }] });
    const april = calculateMonthlyTicketOrder([person], [calendar], [], settings, 2026, 4);
    const may = calculateMonthlyTicketOrder([person], [calendar], [], settings, 2026, 5);
    expect(april.rows[0]).toMatchObject({
      diasTeoricos: 22, automaticTickets: 22, ticketsFinales: 7,
      manuallyAdjusted: true, adjustmentReason: 'Ajuste acordado',
    });
    expect(april.totals).toMatchObject({ personas: 1, ticketsFinales: 7, importe: 101.99 });
    expect(may.rows[0]).toMatchObject({ manuallyAdjusted: false, ticketsFinales: 21 });
  });

  it('la exclusión prevalece sobre un ajuste del mismo mes', () => {
    const settings = config({
      monthlyOrderAdjustments: [{
        empleado: '123', year: 2026, month: 4, tickets: 8, reason: 'Ajuste', createdAt: now,
      }],
      monthlyOrderExclusions: [{
        empleado: '000123', year: 2026, month: 4, reason: 'Baja', createdAt: now,
      }],
    });
    const order = calculateMonthlyTicketOrder([person], [calendar], [], settings, 2026, 4);
    expect(order.rows[0]).toMatchObject({
      excludedFromOrder: true, exclusionReason: 'Baja',
      manuallyAdjusted: false, ticketsFinales: 0, importe: 0,
    });
    expect(order.totals.ticketsFinales).toBe(0);
  });

  it('manuales: aparecen en pedido, pero en cotización solo los marcados', () => {
    const settings = config({ manualPeople: [
      manual(),
      manual({ id: 'manual-2', empleado: '789', nombreApellidos: 'Otra Manual', includeContribution: false }),
    ] });
    const order = calculateMonthlyTicketOrder([], [], [], settings, 2026, 4);
    const contribution = calculateTicketContribution([], [], [], settings, 2026, 4);
    expect(order.rows.map((row) => row.empleado)).toEqual(['456', '789']);
    expect(order.rows.every((row) => row.manualEntry)).toBe(true);
    expect(order.totals).toMatchObject({ personas: 2, ticketsFinales: 6 });
    expect(contribution.rows).toHaveLength(1);
    expect(contribution.rows[0]).toMatchObject({
      empleado: '456', manualEntry: true, manualIncludeContribution: true, ticketsFinales: 3,
    });
  });

  it('la baja manual se aplica desde el mes indicado, no retroactivamente', () => {
    const settings = config({ manualPeople: [manual({ inactiveFromMonth: '2026-05' })] });
    expect(calculateMonthlyTicketOrder([], [], [], settings, 2026, 4).rows).toHaveLength(1);
    expect(calculateMonthlyTicketOrder([], [], [], settings, 2026, 5).rows).toHaveLength(0);
    expect(calculateTicketContribution([], [], [], settings, 2026, 5).rows).toHaveLength(0);
  });

  it('la regla maestra TEX protege el histórico aunque el registro original marque descuento', () => {
    const absence: TicketRestaurantAbsence = {
      id: 'tex-legacy', empleado: '123', nombreApellidos: 'Ana Metro',
      desde: '2026-03-02', hasta: '2026-03-06', motivo: 'tex', totalDias: 5,
      afectaTicket: true, createdAt: now, updatedAt: now, deletedAt: null,
    };
    const april = calculateMonthlyTicketOrder([person], [calendar], [absence],
      DEFAULT_TICKET_RESTAURANT_CONFIG, 2026, 4);
    const march = calculateTicketContribution([person], [calendar], [absence],
      DEFAULT_TICKET_RESTAURANT_CONFIG, 2026, 3);
    expect(april.rows[0]).toMatchObject({ deudaEntrante: 0, ausenciasAplicadas: 0, ticketsFinales: 22 });
    expect(march.rows[0]).toMatchObject({ ausenciasMes: 0, ticketsFinales: 22 });
    expect(absence.afectaTicket).toBe(true);
  });
});

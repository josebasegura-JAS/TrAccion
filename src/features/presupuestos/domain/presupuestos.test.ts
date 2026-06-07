import { describe, expect, it } from 'vitest';
import {
  buildBudgetActualDashboardData,
  buildBudgetComparisonData,
  calculateBudgetManualItemYear,
  calculateBudgetTicketGroupMonth,
  calculateBudgetTicketGroupYear,
  type BudgetActual,
  type BudgetManualItem,
  type BudgetScenario,
  type BudgetTicketGroup,
} from './presupuestos';
import type { TicketCalendar } from '../../ticket-restaurante/domain/ticketRestaurante';

const now = '2026-01-01T00:00:00.000Z';
const scenarioA: BudgetScenario = { id: 'a', name: 'A', year: 2026, ticketAmount: 10, notes: '', createdAt: now, updatedAt: now, deletedAt: null };
const scenarioB: BudgetScenario = { id: 'b', name: 'B', year: 2026, ticketAmount: 10, notes: '', createdAt: now, updatedAt: now, deletedAt: null };
const calendar: TicketCalendar = { id: 'cal-1', nombre: 'SSCC', activo: true, diasSinTicket: ['2026-01-01'], ticketIsoWeekdays: [1, 2, 3, 4, 5], createdAt: now, updatedAt: now, deletedAt: null };

function manual(overrides: Partial<BudgetManualItem>): BudgetManualItem {
  return { id: 'm', scenarioId: 'a', concept: 'Manual', category: 'General', monthlyAmount: 0, annualAmount: 0, notes: '', displayOrder: 1, createdAt: now, updatedAt: now, deletedAt: null, ...overrides };
}

function ticket(overrides: Partial<BudgetTicketGroup>): BudgetTicketGroup {
  return { id: 't', scenarioId: 'a', name: 'Ticket', peopleCount: 0, ticketCalendar: 'SSCC', absenceRate: 0, ticketAmount: 10, calculationType: 'manual_tickets', manualTickets: 0, annualTickets: 0, manualMonthlyAmount: 0, notes: '', displayOrder: 1, createdAt: now, updatedAt: now, deletedAt: null, ...overrides };
}

describe('presupuestos domain', () => {
  it('prioriza la partida anual frente al mensual × 12', () => {
    expect(calculateBudgetManualItemYear(manual({ monthlyAmount: 100, annualAmount: 900 }))).toBe(900);
  });

  it('calcula partida mensual × 12 si no hay anual informado', () => {
    expect(calculateBudgetManualItemYear(manual({ monthlyAmount: 100, annualAmount: 0 }))).toBe(1200);
  });

  it('calcula Ticket por tickets mensuales', () => {
    expect(calculateBudgetTicketGroupMonth(ticket({ calculationType: 'manual_tickets', manualTickets: 20 }), 2026, 1, 10)).toBe(200);
  });

  it('calcula Ticket por tickets anuales', () => {
    expect(calculateBudgetTicketGroupYear(ticket({ calculationType: 'annual_tickets', annualTickets: 120 }), 2026, 10)).toBe(1200);
    expect(calculateBudgetTicketGroupMonth(ticket({ calculationType: 'annual_tickets', annualTickets: 120 }), 2026, 1, 10)).toBe(100);
  });

  it('calcula Ticket por importe manual mensual', () => {
    expect(calculateBudgetTicketGroupMonth(ticket({ calculationType: 'manual_amount', manualMonthlyAmount: 333.33 }), 2026, 1, 10)).toBe(333.33);
    expect(calculateBudgetTicketGroupYear(ticket({ calculationType: 'manual_amount', manualMonthlyAmount: 333.33 }), 2026, 10)).toBe(3999.96);
  });

  it('calcula Ticket por calendario/personas/días/absentismo', () => {
    // Enero 2026 tiene 22 días laborables lunes-viernes; quitando 2026-01-01 quedan 21.
    expect(calculateBudgetTicketGroupMonth(ticket({ calculationType: 'calendar_people', peopleCount: 2, absenceRate: 0.1 }), 2026, 1, 10, [calendar])).toBe(378);
  });

  it('compara escenarios por diferencia en euros y porcentaje', () => {
    const rows = buildBudgetComparisonData(
      scenarioA,
      scenarioB,
      [manual({ scenarioId: 'a', monthlyAmount: 100 }), manual({ id: 'm2', scenarioId: 'b', monthlyAmount: 150 })],
      [],
      2026,
    );
    expect(rows[0]).toMatchObject({ scenarioATotal: 100, scenarioBTotal: 150, difference: 50, differenceRate: 0.5 });
  });

  it('calcula presupuesto vs real acumulado por mes de corte', () => {
    const actuals: BudgetActual[] = [
      { id: 'r1', year: 2026, month: 1, block: 'Formación', concept: 'Curso', amount: 80, notes: '', createdAt: now, updatedAt: now, deletedAt: null },
      { id: 'r2', year: 2026, month: 3, block: 'Formación', concept: 'Fuera corte', amount: 1000, notes: '', createdAt: now, updatedAt: now, deletedAt: null },
      { id: 'r3', year: 2026, month: 2, block: 'Ticket Restaurante', concept: 'Pedido', amount: 50, notes: '', createdAt: now, updatedAt: now, deletedAt: null },
    ];
    const dashboard = buildBudgetActualDashboardData(
      scenarioA,
      [manual({ monthlyAmount: 100 })],
      [ticket({ calculationType: 'manual_tickets', manualTickets: 10 })],
      actuals,
      2026,
      2,
    );
    expect(dashboard.budgetTotal).toBe(400);
    expect(dashboard.actualTotal).toBe(130);
    expect(dashboard.difference).toBe(270);
  });
});

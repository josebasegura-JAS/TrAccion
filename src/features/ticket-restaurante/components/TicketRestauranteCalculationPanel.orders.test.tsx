import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui/Toast';
import { CalculationPanel } from './TicketRestauranteCalculationPanel';
import {
  calculateMonthlyTicketOrder,
  DEFAULT_TICKET_RESTAURANT_CONFIG,
  normalizeTicketRestaurantConfig,
  type TicketOrderMovement,
  type TicketRestaurantConfig,
} from '../domain/ticketRestaurante';

function movement(id: string, month: number, tickets: number): TicketOrderMovement {
  return { id, year: 2026, month, tickets, unitPrice: 10, amount: tickets * 10,
    date: '2026-12-15', empleado: '100', nombreApellidos: 'Persona de prueba',
    reason: id, observations: '', createdAt: '2026-12-15T10:00:00.000Z' };
}
function configuration(): TicketRestaurantConfig {
  return normalizeTicketRestaurantConfig({
    ...DEFAULT_TICKET_RESTAURANT_CONFIG,
    monthlyOrders: {
      '2026-12': { year: 2026, month: 12, orderedAt: '2026-12-01T10:00:00.000Z',
        rows: [{ empleado: '100', nombreApellidos: 'Persona de prueba', tickets: 12, unitPrice: 10, amount: 120 }],
        totalTickets: 12, totalAmount: 120 },
    },
    orderMovements: [movement('alta posterior', 12, 2), movement('devolución', 12, -1), movement('otro mes', 11, 100)],
  });
}
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
beforeAll(() => Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() }));
afterAll(() => {
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe('pedido registrado e histórico Ticket Restaurante', () => {
  it('conserva fotografía y movimientos con signo tras serializar y cambiar de año/precio', () => {
    const initial = configuration();
    const saved = JSON.stringify(initial.monthlyOrders);
    const restored = normalizeTicketRestaurantConfig(JSON.parse(JSON.stringify({ ...initial,
      importeTicket: 15, priceHistory: [...initial.priceHistory, { effectiveFrom: '2027-01-01', amount: 15 }],
    })));
    expect(JSON.stringify(restored.monthlyOrders)).toBe(saved);
    expect(restored.orderMovements?.map(({ tickets, amount }) => ({ tickets, amount })))
      .toEqual([{ tickets: 2, amount: 20 }, { tickets: -1, amount: -10 }, { tickets: 100, amount: 1000 }]);
    expect(restored.monthlyOrders?.['2027-12']).toBeUndefined();
    expect(initial.monthlyOrders?.['2026-12'].totalAmount).toBe(120);
  });

  it('recalcular no sobrescribe el pedido y suma solo movimientos del mes seleccionado', () => {
    const config = configuration();
    const onUpdateConfig = vi.fn(async () => ({ ok: true }));
    const calculation = calculateMonthlyTicketOrder([], [], [], config, 2026, 12);
    const props = {
      absences: [], calendars: [], calculation, config, mode: 'monthly' as const, month: 12, year: 2026,
      exportPayload: { title: 'Pedido', filename: 'pedido', columns: [], rows: calculation.rows },
      onUpdateConfig, onMonthChange: vi.fn(), onNextMonth: vi.fn(), onPreviousMonth: vi.fn(), onYearChange: vi.fn(),
    };
    const { rerender } = render(<CalculationPanel {...props} />, { wrapper: ToastProvider });
    expect(screen.getByText(/12 tickets en el pedido inicial · 2 movimiento\(s\) posterior\(es\) · total real 13/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar pedido realizado' })).not.toBeInTheDocument();
    rerender(<CalculationPanel {...props} calculation={{ ...calculation, totals: { ...calculation.totals, ticketsFinales: 99 } }} />);
    expect(screen.getByText(/total real 13/)).toBeInTheDocument();
    expect(onUpdateConfig).not.toHaveBeenCalled();
    expect(config.monthlyOrders?.['2026-12'].totalTickets).toBe(12);
  });

  it('eliminar un movimiento conserva el pedido original y los de otros meses', () => {
    const config = configuration();
    const onUpdateConfig = vi.fn(async () => ({ ok: true }));
    const calculation = calculateMonthlyTicketOrder([], [], [], config, 2026, 12);
    render(<CalculationPanel absences={[]} calendars={[]} calculation={calculation} config={config}
      mode="monthly" month={12} year={2026}
      exportPayload={{ title: 'Pedido', filename: 'pedido', columns: [], rows: calculation.rows }}
      onUpdateConfig={onUpdateConfig} onMonthChange={vi.fn()} onNextMonth={vi.fn()} onPreviousMonth={vi.fn()} onYearChange={vi.fn()} />, { wrapper: ToastProvider });
    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar movimiento' })[0]);
    expect(onUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({
      monthlyOrders: config.monthlyOrders,
      orderMovements: [expect.objectContaining({ id: 'devolución' }), expect.objectContaining({ id: 'otro mes' })],
    }));
    expect(config.orderMovements).toHaveLength(3);
  });
});

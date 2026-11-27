import { describe, expect, it } from 'vitest';
import { buildTicketManualDebt, buildTicketDebtRegularization, splitManualDebtInstallments } from './ticketDebt';
import { DEFAULT_TICKET_RESTAURANT_CONFIG, getEffectiveTicketPrice, normalizeTicketPriceHistory, normalizeTicketCalculationRules } from './ticketConfig';
import { TICKET_RESTAURANT_MIN_ABSENCE_DATE } from './ticketAbsences';

const stamp = '2026-01-01T00:00:00.000Z';
describe('T7B: deuda y precios de Ticket Restaurante', () => {
  it.each([[10, 3, [4, 3, 3]], [2, 5, [1, 1]], [0, 3, [0]], [7, 1, [7]]] as const)('reparte %s tickets en %s mensualidades sin perder unidades', (total, months, expected) => {
    const result = splitManualDebtInstallments(total, months);
    expect(result).toEqual(expected);
    expect(result.reduce((sum, value) => sum + value, 0)).toBe(total);
  });
  it('normaliza deuda manual sin crear mensualidades superiores al número de tickets', () => {
    expect(buildTicketManualDebt({ empleado: '00100', nombreApellidos: ' Persona ficticia ', totalTickets: 3.9, originYear: 2026, originMonth: 0, startYear: 2026, startMonth: 13, months: 10, reason: ' Ajuste ', observations: ' Nota ' }, stamp, 'd')).toMatchObject({ id: 'd', empleado: '100', totalTickets: 3, months: 3, originMonth: 1, startMonth: 12, reason: 'Ajuste', observations: 'Nota', cancelledAt: null });
  });
  it('normaliza regularización sin permitir tickets negativos', () => {
    expect(buildTicketDebtRegularization({ empleado: '00100', nombreApellidos: 'Persona ficticia', year: 2026, month: 13, calculatedTickets: 4.9, targetTickets: -2, reason: ' Ajuste ', observations: '' }, stamp, 'r')).toMatchObject({ id: 'r', empleado: '100', month: 12, calculatedTickets: 4, targetTickets: 0, reason: 'Ajuste' });
  });
  it('aplica el precio de cada mes sin trasladar una subida a meses anteriores', () => {
    const config = { ...DEFAULT_TICKET_RESTAURANT_CONFIG, importeTicket: 15.25, priceHistory: [{ amount: 15.25, effectiveFrom: '2027-01-01' }, { amount: 14.57, effectiveFrom: '2026-03-01' }] };
    expect(getEffectiveTicketPrice(config, 2026, 12)).toBe(14.57);
    expect(getEffectiveTicketPrice(config, 2027, 1)).toBe(15.25);
    expect(getEffectiveTicketPrice(config, 2027, 2)).toBe(15.25);
  });
  it('descarta precios negativos y fechas sin formato ISO y ordena el histórico', () => {
    expect(normalizeTicketPriceHistory([{ amount: -1, effectiveFrom: '2026-01-01' }, { amount: 20, effectiveFrom: 'ayer' }, { amount: 15, effectiveFrom: '2027-01-01' }, { amount: 14.57, effectiveFrom: '2026-03-01' }], 10)).toEqual([{ amount: 14.57, effectiveFrom: '2026-03-01' }, { amount: 15, effectiveFrom: '2027-01-01' }]);
  });
  it('recupera precio base si no queda histórico válido', () => {
    expect(normalizeTicketPriceHistory([], 14.57)).toEqual([{ amount: 14.57, effectiveFrom: '2026-03-01' }]);
  });
  it('impide generar deuda previa al inicio gestionado y normaliza motivos exentos', () => {
    expect(normalizeTicketCalculationRules({ debtStartDate: '2020-01-01', nonDiscountableMotivesByCalendar: { ' Liberados ': [' SIN ', ''] } })).toEqual({ debtStartDate: TICKET_RESTAURANT_MIN_ABSENCE_DATE, nonDiscountableMotivesByCalendar: { Liberados: ['SIN'] } });
  });
});

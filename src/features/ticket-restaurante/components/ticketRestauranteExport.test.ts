import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildTicketPerson, calculateMonthlyTicketOrder, calculateTicketContribution,
  DEFAULT_TICKET_RESTAURANT_CONFIG, type TicketCalendar, type TicketRestaurantAbsence,
} from '../domain/ticketRestaurante';
import {
  monthlyCalculationExportColumns, contributionCalculationExportColumns, exportTicketRestaurantLoadWorkbook,
} from './ticketRestauranteExport';

const timestamp = '2026-01-01T00:00:00.000Z';
const calendar: TicketCalendar = { id: 'calendar', nombre: 'General', activo: true,
  diasSinTicket: [], ticketIsoWeekdays: [1, 2, 3, 4, 5], createdAt: timestamp, updatedAt: timestamp, deletedAt: null };
const people = ['10', '2'].map(empleado => buildTicketPerson({ empleado, nombre: 'Ana', apellido1: 'García',
  apellido2: 'López', dni: '12345678Z', calendarId: 'calendar', activo: true, puesto: 'RRLL' }, timestamp));
const absence: TicketRestaurantAbsence = { id: 'absence', empleado: '10', nombreApellidos: 'Ana García López',
  desde: '2026-03-02', hasta: '2026-03-02', motivo: 'VAC', totalDias: 1, afectaTicket: true,
  createdAt: timestamp, updatedAt: timestamp, deletedAt: null };
const config = { ...DEFAULT_TICKET_RESTAURANT_CONFIG, pedidoMensual: 123,
  priceHistory: [{ amount: 10, effectiveFrom: '2026-03-01' }, { amount: 20, effectiveFrom: '2027-01-01' }] };
const originalTraccion = window.traccion;
afterEach(() => Object.defineProperty(window, 'traccion', { configurable: true, value: originalTraccion }));

describe('exportaciones de Ticket Restaurante', () => {
  it('exporta el cálculo mensual con su precio histórico, fecha y ausencias aplicadas', () => {
    const row = calculateMonthlyTicketOrder(people, [calendar], [absence], config, 2026, 4).rows.find(row => row.empleado === '10')!;
    const columns = monthlyCalculationExportColumns(config, 2026, 4, [absence]);
    const exported = Object.fromEntries(columns.map(column => [column.key, column.value(row)]));
    expect(exported).toEqual({
      nombre: 'Ana', apellido1: 'García', apellido2: 'López', dni: '12345678Z', pedido: 123,
      empleado: '10', numeroTickets: row.ticketsFinales, importe: 10, total: row.importe,
      fecInicio: '01/04/2026', fecCad: '01/01/2100', hojaGastos: row.hojasGastoMes,
      ausencias: 'VAC 02/03/2026-02/03/2026 (1 días ticket)', deudaManual: '', regularizacionDeuda: '',
    });
    expect(exported.total).toBe(Number(exported.numeroTickets) * Number(exported.importe));
  });

  it('exporta la cotización desde su cálculo específico sin mezclar columnas del pedido mensual', () => {
    const row = calculateTicketContribution(people, [calendar], [absence], config, 2026, 3).rows.find(row => row.empleado === '10')!;
    const columns = contributionCalculationExportColumns(10);
    expect(Object.fromEntries(columns.map(column => [column.key, column.value(row)]))).toEqual({
      codigo: '10', apellidos: row.nombreApellidos, activo: '', ticketsInicioMes: '', valorFacial: 10,
      ticketsCotizacion: row.ticketsFinales,
    });
  });

  it('envía todas las personas a cargar en orden numérico sin modificar el cálculo original', async () => {
    const openTicketRestaurantLoadWorkbook = vi.fn(async () => ({ ok: true }));
    Object.defineProperty(window, 'traccion', { configurable: true, value: { openTicketRestaurantLoadWorkbook } });
    const rows = calculateMonthlyTicketOrder(people, [calendar], [absence], config, 2026, 3).rows;
    const calculationRows = [rows.find(row => row.empleado === '10')!, rows.find(row => row.empleado === '2')!];
    const original = structuredClone(calculationRows);
    await exportTicketRestaurantLoadWorkbook({ calculationRows, config, year: 2026, month: 3 });
    expect(openTicketRestaurantLoadWorkbook).toHaveBeenCalledWith({ fileName: 'A_cargar_2026-03.xlsx',
      rows: [...calculationRows].reverse().map(row => ({ nombre: row.nombre, apellido1: row.apellido1,
        apellido2: row.apellido2, dni: row.dni, pedido: '123', ceco: row.empleado, importeTotal: row.importe,
        fechaInicio: '01/03/2026', fechaCaducidad: '01/01/2100' })),
    });
    expect(calculationRows).toEqual(original);
  });

  it('propaga un error del generador de carga conservando el cálculo para reintentar', async () => {
    const openTicketRestaurantLoadWorkbook = vi.fn(async () => ({ ok: false, message: 'Plantilla Excel no disponible' }));
    Object.defineProperty(window, 'traccion', { configurable: true, value: { openTicketRestaurantLoadWorkbook } });
    const calculationRows = calculateMonthlyTicketOrder(people, [calendar], [], config, 2026, 3).rows;
    const original = structuredClone(calculationRows);
    await expect(exportTicketRestaurantLoadWorkbook({ calculationRows, config, year: 2026, month: 3 }))
      .rejects.toThrow('Plantilla Excel no disponible');
    expect(calculationRows).toEqual(original);
  });
});

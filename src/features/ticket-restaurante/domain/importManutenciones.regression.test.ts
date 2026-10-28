import { describe, expect, it } from 'vitest';
import {
  applyTicketManutencionEligibility,
  evaluateTicketManutencionEligibility,
  importTicketManutenciones,
  validateTicketManutencionPreviewRows,
  type TicketManutencionPreviewRow,
} from './importManutenciones';
import type { TicketCalendar, TicketPerson } from './ticketRestauranteTypes';

const now = '2026-04-01T00:00:00.000Z';
const calendar: TicketCalendar = {
  id: 'sscc', nombre: 'SSCC', activo: true,
  diasSinTicket: ['2026-04-07'], ticketIsoWeekdays: [1, 2, 3, 4, 5],
  createdAt: now, updatedAt: now, deletedAt: null,
};
const person: TicketPerson = {
  empleado: '123', nombre: 'Ana', apellido1: 'Metro', apellido2: '',
  nombreApellidos: 'Ana Metro', puesto: 'SSCC', dni: '',
  calendarId: calendar.id, activo: true,
  createdAt: now, updatedAt: now, deletedAt: null,
};
function preview(overrides: Partial<TicketManutencionPreviewRow> = {}): TicketManutencionPreviewRow {
  return {
    id: 'row-1', empleado: '123', nombreApellidos: 'Ana Metro',
    fechaGasto: '2026-04-06', origen: 'Pagador', importar: true,
    afectaTicket: true, errors: [], ...overrides,
  };
}
const header = ['Empleado/a', 'Nombre', 'Id Hoja', 'Fecha Gasto', 'Importe', 'Repartido Entre', 'Nombre repartido'];

describe('importación estructurada de manutenciones (Excel/CSV)', () => {
  it('reconoce pagador y persona entre quienes se reparte, normalizando números', () => {
    const rows = importTicketManutenciones([
      header,
      ['00123', 'Nombre antiguo', '1', '06/04/2026', '15', '00456', 'Compañera'],
    ], [person, { ...person, empleado: '456', nombreApellidos: 'Bea Metro' }]);
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ empleado: '123', nombreApellidos: 'Ana Metro', origen: 'Pagador', fechaGasto: '2026-04-06' }),
      expect.objectContaining({ empleado: '456', nombreApellidos: 'Bea Metro', origen: 'Repartido entre', fechaGasto: '2026-04-06' }),
    ]));
  });

  it('muestra un pagador sin derecho, pero no lo marca para importar', () => {
    const rows = importTicketManutenciones([
      header, ['00999', 'Persona no incluida', '1', '06/04/2026', '15', '', ''],
    ], [person]);
    expect(rows).toMatchObject([{ empleado: '999', importar: false, afectaTicket: false }]);
  });

  it('elimina duplicados del mismo empleado y día sin eliminar personas diferentes', () => {
    const rows = importTicketManutenciones([
      header,
      ['123', 'Ana', '1', '06/04/2026', '15', '', ''],
      ['00123', 'Ana', '2', '06/04/2026', '15', '', ''],
      ['123', 'Ana', '3', '08/04/2026', '15', '', ''],
    ], [person]);
    expect(rows.map((row) => row.fechaGasto)).toEqual(['2026-04-06', '2026-04-08']);
  });

  it('no incorpora el bloque Relaciones Externas posterior', () => {
    const rows = importTicketManutenciones([
      header,
      ['123', 'Ana', '1', '06/04/2026', '15', '', ''],
      ['RELACIONES EXTERNAS'],
      ['123', 'Ana', '2', '08/04/2026', '15', '', ''],
    ], [person]);
    expect(rows).toHaveLength(1);
  });

  it('valida los campos obligatorios antes de guardar', () => {
    const [row] = validateTicketManutencionPreviewRows([preview({
      empleado: 'ABC', nombreApellidos: '', fechaGasto: '2026-02-30',
    })]);
    expect(row.errors).toEqual([
      'Nº empleado obligatorio y numérico.',
      'Nombre obligatorio.',
      'Fecha de gasto obligatoria.',
    ]);
  });
});

describe('derecho al descuento por manutención, individual y por día', () => {
  it.each([
    ['2026-04-06', 'ok', true],
    ['2026-04-07', 'no_ticket_day', false],
    ['2026-04-05', 'no_ticket_day', false],
    ['2026-02-30', 'invalid_date', false],
  ] as const)('fecha %s: %s', (date, reason, eligible) => {
    expect(evaluateTicketManutencionEligibility(
      { empleado: '000123', fechaGasto: date }, [person], [calendar],
    )).toMatchObject({ eligible, reason });
  });

  it('separa persona sin derecho, calendario inexistente y empleado inválido', () => {
    expect(evaluateTicketManutencionEligibility(
      { empleado: 'ABC', fechaGasto: '2026-04-06' }, [person], [calendar],
    ).reason).toBe('invalid_employee');
    expect(evaluateTicketManutencionEligibility(
      { empleado: '999', fechaGasto: '2026-04-06' }, [person], [calendar],
    ).reason).toBe('inactive_ticket_person');
    expect(evaluateTicketManutencionEligibility(
      { empleado: '123', fechaGasto: '2026-04-06' }, [person], [],
    ).reason).toBe('missing_calendar');
  });

  it('respeta el check importar y marca sin descuento los días no elegibles', () => {
    const result = applyTicketManutencionEligibility([
      preview({ id: 'eligible', importar: false }),
      preview({ id: 'holiday', fechaGasto: '2026-04-07' }),
    ], [person], [calendar]);
    expect(result).toMatchObject([
      { id: 'eligible', importar: false, afectaTicket: true },
      { id: 'holiday', importar: false, afectaTicket: false },
    ]);
  });
});

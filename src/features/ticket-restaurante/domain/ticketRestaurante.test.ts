import { describe, expect, it } from 'vitest';
import type { Employee } from '../../plantilla/domain/employee';
import {
  assignPersonaCalendario,
  calculateDerechosTicketMes,
  countTicketDaysInMonth,
  type AusenciaTicket,
  type PersonaCalendario,
  type TicketCalendar,
} from './ticketRestaurante';

const timestamp = '2026-01-01T00:00:00.000Z';

function buildCalendar(overrides: Partial<TicketCalendar>): TicketCalendar {
  return {
    id: 'calendar-base',
    nombre: 'Calendario base',
    activo: true,
    diasTicket: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

function buildEmployee(overrides: Partial<Employee>): Employee {
  return {
    empleado: '1001',
    nombreApellidos: 'Persona Base',
    puestoNomina: '',
    puestoOrganizativo: '',
    residencia: '',
    nivelRetributivo: '',
    sexo: '',
    calle: '',
    numero: '',
    piso: '',
    codigoPostal: '',
    poblacion: '',
    provincia: '',
    nif: '',
    dni: '',
    residenciaCast: '',
    residenciaEus: '',
    direccionTeletrabajo: '',
    deletedAt: null,
    ...overrides,
  };
}

function buildAusencia(overrides: Partial<AusenciaTicket>): AusenciaTicket {
  return {
    id: 'ausencia-base',
    empleado: '1001',
    fecha: '2026-01-02',
    tipo: 'IT',
    afectaTicket: true,
    observaciones: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

function calculateSingleRight(
  ausencias: AusenciaTicket[],
  calendarOverrides?: Partial<TicketCalendar>,
) {
  const assignments: PersonaCalendario[] = [
    { empleado: '1001', calendarId: 'calendar-base', createdAt: timestamp },
  ];
  const calendars = [
    buildCalendar({
      diasTicket: [
        { fecha: '2026-01-02', tieneTicket: true },
        { fecha: '2026-01-03', tieneTicket: false },
      ],
      ...calendarOverrides,
    }),
  ];
  const employees = [buildEmployee({ empleado: '1001', nombreApellidos: 'Persona Uno' })];

  return calculateDerechosTicketMes({
    assignments,
    calendars,
    employees,
    month: '2026-01',
    ausencias,
  })[0];
}

describe('ticket restaurante domain', () => {
  it('asigna una persona a un calendario', () => {
    const assignments = assignPersonaCalendario([], '1001', 'calendar-a', timestamp);

    expect(assignments).toEqual([
      { empleado: '1001', calendarId: 'calendar-a', createdAt: timestamp },
    ]);
  });

  it('cuenta solo días con ticket del mes seleccionado', () => {
    const calendar = buildCalendar({
      diasTicket: [
        { fecha: '2026-01-02', tieneTicket: true },
        { fecha: '2026-01-03', tieneTicket: false },
        { fecha: '2026-01-04', tieneTicket: true },
        { fecha: '2026-02-01', tieneTicket: true },
      ],
    });

    expect(countTicketDaysInMonth(calendar, '2026-01')).toBe(2);
  });

  it('excluye calendarios borrados de la visualización de derechos', () => {
    const assignments: PersonaCalendario[] = [
      { empleado: '1001', calendarId: 'calendar-deleted', createdAt: timestamp },
    ];
    const calendars = [
      buildCalendar({
        id: 'calendar-deleted',
        nombre: 'Calendario borrado',
        deletedAt: '2026-01-05T00:00:00.000Z',
        diasTicket: [{ fecha: '2026-01-02', tieneTicket: true }],
      }),
    ];
    const employees = [buildEmployee({ empleado: '1001', nombreApellidos: 'Persona Uno' })];

    expect(
      calculateDerechosTicketMes({ assignments, calendars, employees, month: '2026-01' }),
    ).toEqual([]);
  });

  it('no calcula descuento para una ausencia de una persona sin calendario asignado', () => {
    const calendars = [
      buildCalendar({
        diasTicket: [{ fecha: '2026-01-02', tieneTicket: true }],
      }),
    ];
    const employees = [buildEmployee({ empleado: '1001', nombreApellidos: 'Persona Uno' })];

    expect(
      calculateDerechosTicketMes({
        assignments: [],
        calendars,
        employees,
        month: '2026-01',
        ausencias: [buildAusencia({ fecha: '2026-01-02' })],
      }),
    ).toEqual([]);
  });

  it('cambia el calendario de una persona manteniendo una única asignación', () => {
    const assignments = assignPersonaCalendario(
      [{ empleado: '1001', calendarId: 'calendar-a', createdAt: timestamp }],
      '1001',
      'calendar-b',
      '2026-01-02T00:00:00.000Z',
    );

    expect(assignments).toEqual([
      { empleado: '1001', calendarId: 'calendar-b', createdAt: '2026-01-02T00:00:00.000Z' },
    ]);
  });

  it('descuenta una ausencia afectaTicket si cae en un día con ticket', () => {
    expect(calculateSingleRight([buildAusencia({ fecha: '2026-01-02' })])).toMatchObject({
      diasTicketMes: 1,
      ausenciasDescontadas: 1,
      ticketsFinales: 0,
    });
  });

  it('no descuenta una ausencia sin afectaTicket', () => {
    expect(
      calculateSingleRight([buildAusencia({ fecha: '2026-01-02', afectaTicket: false })]),
    ).toMatchObject({
      diasTicketMes: 1,
      ausenciasDescontadas: 0,
      ticketsFinales: 1,
    });
  });

  it('no descuenta una ausencia en día sin ticket', () => {
    expect(calculateSingleRight([buildAusencia({ fecha: '2026-01-03' })])).toMatchObject({
      diasTicketMes: 1,
      ausenciasDescontadas: 0,
      ticketsFinales: 1,
    });
  });

  it('descuenta una sola vez ausencias duplicadas del mismo empleado y fecha', () => {
    expect(
      calculateSingleRight([
        buildAusencia({ id: 'ausencia-1', fecha: '2026-01-02' }),
        buildAusencia({ id: 'ausencia-2', fecha: '2026-01-02', tipo: 'VAC' }),
      ]),
    ).toMatchObject({
      diasTicketMes: 1,
      ausenciasDescontadas: 1,
      ticketsFinales: 0,
    });
  });

  it('no descuenta una ausencia borrada lógicamente', () => {
    expect(
      calculateSingleRight([
        buildAusencia({ fecha: '2026-01-02', deletedAt: '2026-01-04T00:00:00.000Z' }),
      ]),
    ).toMatchObject({
      diasTicketMes: 1,
      ausenciasDescontadas: 0,
      ticketsFinales: 1,
    });
  });

  it('no deja los ticketsFinales por debajo de cero', () => {
    expect(
      calculateSingleRight(
        [
          buildAusencia({ id: 'ausencia-1', fecha: '2026-01-02' }),
          buildAusencia({ id: 'ausencia-2', fecha: '2026-01-04' }),
        ],
        { diasTicket: [{ fecha: '2026-01-02', tieneTicket: true }] },
      ),
    ).toMatchObject({
      diasTicketMes: 1,
      ausenciasDescontadas: 1,
      ticketsFinales: 0,
    });
  });
});

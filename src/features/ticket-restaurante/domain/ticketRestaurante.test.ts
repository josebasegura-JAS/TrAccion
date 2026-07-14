import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TICKET_RESTAURANT_CONFIG,
  buildTicketRestaurantAbsence,
  buildTicketPerson,
  buildYearCalendar,
  calculateTicketAbsenceMonthImpact,
  calculateTicketContribution,
  calculateMonthlyTicketOrder,
  calculateTicketMonth,
  filterTicketRestaurantAbsencesByMonth,
  nextCalendarYear,
  normalizeTicketCalendarName,
  normalizeTicketEmployeeNumber,
  normalizeTicketIsoWeekdays,
  previousCalendarYear,
  toggleDiaSinTicket,
  visibleTicketCalendars,
  type TicketCalendar,
  type TicketManutencionImpact,
  type TicketRestaurantAbsence,
} from './ticketRestaurante';

const timestamp = '2026-01-01T00:00:00.000Z';

function buildCalendar(overrides: Partial<TicketCalendar> = {}): TicketCalendar {
  return {
    id: 'calendar-base',
    nombre: 'Calendario base',
    activo: true,
    diasSinTicket: [],
    ticketIsoWeekdays: [1, 2, 3, 4, 5],
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

describe('ticket restaurante calendar domain', () => {
  it('marca un día sin ticket', () => {
    const calendar = toggleDiaSinTicket(buildCalendar(), '2026-01-15');

    expect(calendar.diasSinTicket).toEqual(['2026-01-15']);
    expect(buildYearCalendar(calendar, 2026)[0].dias[14]).toMatchObject({
      fecha: '2026-01-15',
      sinTicket: true,
    });
  });

  it('desmarca un día sin ticket', () => {
    const calendar = toggleDiaSinTicket(
      buildCalendar({ diasSinTicket: ['2026-01-15'] }),
      '2026-01-15',
    );

    expect(calendar.diasSinTicket).toEqual([]);
    expect(buildYearCalendar(calendar, 2026)[0].dias[14]).toMatchObject({
      fecha: '2026-01-15',
      sinTicket: false,
    });
  });

  it('cambia de año', () => {
    expect(previousCalendarYear(2026)).toBe(2025);
    expect(nextCalendarYear(2026)).toBe(2027);
    expect(buildYearCalendar(buildCalendar(), 2027)[0].dias[0]).toMatchObject({
      fecha: '2027-01-01',
      diaMes: 1,
    });
  });

  it('normaliza alias históricos de calendarios', () => {
    expect(normalizeTicketCalendarName('SSCC')).toBe(
      normalizeTicketCalendarName('Servicios Centrales'),
    );
    expect(normalizeTicketCalendarName('Ariz')).toBe(
      normalizeTicketCalendarName('Ingeniería Ariz'),
    );
    expect(normalizeTicketCalendarName('Sopela')).toBe(
      normalizeTicketCalendarName('Instalaciones Sopela'),
    );
    expect(normalizeTicketCalendarName('Liberado')).toBe(normalizeTicketCalendarName('Liberados'));
  });

  it('excluye calendarios borrados', () => {
    const calendars = [
      buildCalendar({ id: 'calendar-visible', nombre: 'Visible' }),
      buildCalendar({
        id: 'calendar-deleted',
        nombre: 'Borrado',
        deletedAt: '2026-01-05T00:00:00.000Z',
      }),
    ];

    expect(visibleTicketCalendars(calendars).map((calendar) => calendar.id)).toEqual([
      'calendar-visible',
    ]);
  });
});

import {
  detectTicketRestaurantAbsenceFormat,
  importTicketRestaurantAbsences,
  normalizeTicketRestaurantAbsenceRow,
  saveTicketRestaurantAbsencePreviewRows,
} from './importAbsences';

const realZerkosRows = [
  [
    'EMPLEADO',
    'PUESTO ORGANIZATIVO',
    'RESIDENCIA',
    'NIVEL.',
    'AUS.',
    'AÑO',
    'DESDE',
    'HASTA',
    'DIAS',
    'J',
  ],
  ['31', 'Rodríguez Corral, Fernando', 'Ingeniería', 'Ariz Taller', 'N-F'],
  ['DDA', '2026', '04/05/2026', '04/05/2026', '1', '--'],
  ['Total días', '', '', '', '1'],
  ['46', 'Empleado Cuarenta y Seis', 'Ingeniería', 'Ariz Taller', 'N-F'],
  ['DDA', '2026', '11/05/2026', '15/05/2026', '5', '--'],
  ['VAC', '2026', '05/05/2026', '08/05/2026', '4', '--'],
  ['Total días', '', '', '', '9'],
  ['639', 'Empleado Seiscientos Treinta y Nueve', 'Ingeniería', 'Ariz Taller', 'N-F'],
  ['DDA', '2026', '13/05/2026', '13/05/2026', '1', '--'],
  ['642', 'Empleado Seiscientos Cuarenta y Dos', 'Ingeniería', 'Ariz Taller', 'N-F'],
  ['DDA', '2026', '07/05/2026', '07/05/2026', '1', '--'],
  ['ENF', '2026', '11/05/2026', '22/05/2026', '12', 'SI'],
  ['861', 'Empleado Ochocientos Sesenta y Uno', 'Ingeniería', 'Ariz Taller', 'N-F'],
  ['HOS', '2026', '15/05/2026', '15/05/2026', '1', 'NO'],
  ['931', 'Empleado Novecientos Treinta y Uno', 'Ingeniería', 'Ariz Taller', 'N-F'],
  ['DDA', '2026', '27/05/2026', '27/05/2026', '1', '--'],
  ['Ausencia.rpt'],
  ['ZERKOS'],
  ['Página', '1'],
];

it('nunca considera sábado o domingo como día con ticket aunque el calendario los tenga marcados', () => {
  expect(normalizeTicketIsoWeekdays([1, 2, 3, 4, 5, 6, 7])).toEqual([1, 2, 3, 4, 5]);
});

describe('ticket restaurante calculation domain', () => {
  it('normaliza el número de empleado y elimina ceros a la izquierda', () => {
    expect(normalizeTicketEmployeeNumber('000123')).toBe('123');
    expect(normalizeTicketEmployeeNumber('000000')).toBe('0');
    expect(normalizeTicketEmployeeNumber(' 00123.0 ')).toBe('123');

    const person = buildTicketPerson(
      {
        empleado: '000123',
        nombreApellidos: 'Ana Metro',
        puesto: 'SSCC',
        calendarId: 'calendar-base',
        activo: true,
      },
      timestamp,
    );

    expect(person.empleado).toBe('123');
  });

  it('cruza personas y ausencias aunque uno de los números tenga ceros a la izquierda', () => {
    const calendar = buildCalendar();
    const person = buildTicketPerson(
      {
        empleado: '000123',
        nombreApellidos: 'Ana Metro',
        puesto: 'SSCC',
        calendarId: calendar.id,
        activo: true,
      },
      timestamp,
    );
    const absence = buildTicketRestaurantAbsence(
      {
        empleado: '123',
        nombreApellidos: 'Ana Metro',
        desde: '2026-03-02',
        hasta: '2026-03-06',
        motivo: 'IT',
        totalDias: 5,
        afectaTicket: true,
      },
      timestamp,
      'absence-leading-zero',
    );

    const result = calculateTicketContribution(
      [person],
      [calendar],
      [absence],
      DEFAULT_TICKET_RESTAURANT_CONFIG,
      2026,
      3,
    );

    expect(result.rows[0]).toMatchObject({
      empleado: '123',
      ausenciasAplicadas: 5,
      ticketsFinales: 17,
    });
    expect(
      calculateTicketAbsenceMonthImpact(
        { ...absence, empleado: '000123' },
        [{ ...person, empleado: '123' }],
        [calendar],
        DEFAULT_TICKET_RESTAURANT_CONFIG,
        2026,
        3,
      ).diasTicketMes,
    ).toBe(5);
  });

  it('un calendario inactivo no genera tickets ni impacto de ausencias', () => {
    const calendar = buildCalendar({ activo: false });
    const person = buildTicketPerson(
      {
        empleado: '123',
        nombreApellidos: 'Ana Metro',
        puesto: 'SSCC',
        calendarId: calendar.id,
        activo: true,
      },
      timestamp,
    );
    const absence = buildTicketRestaurantAbsence(
      {
        empleado: '123',
        nombreApellidos: 'Ana Metro',
        desde: '2026-03-02',
        hasta: '2026-03-06',
        motivo: 'IT',
        totalDias: 5,
        afectaTicket: true,
      },
      timestamp,
      'absence-inactive-calendar',
    );

    const monthlyOrder = calculateMonthlyTicketOrder(
      [person],
      [calendar],
      [absence],
      DEFAULT_TICKET_RESTAURANT_CONFIG,
      2026,
      3,
    );
    const contribution = calculateTicketContribution(
      [person],
      [calendar],
      [absence],
      DEFAULT_TICKET_RESTAURANT_CONFIG,
      2026,
      3,
    );

    expect(monthlyOrder.rows[0]).toMatchObject({
      calendario: 'Sin calendario',
      diasTeoricos: 0,
      ausenciasAplicadas: 0,
      ticketsFinales: 0,
      importe: 0,
    });
    expect(contribution.rows[0]).toMatchObject({
      calendario: 'Sin calendario',
      diasTeoricos: 0,
      ausenciasAplicadas: 0,
      ticketsFinales: 0,
      importe: 0,
    });
    expect(
      calculateTicketAbsenceMonthImpact(
        absence,
        [person],
        [calendar],
        DEFAULT_TICKET_RESTAURANT_CONFIG,
        2026,
        3,
      ),
    ).toMatchObject({ diasTicketMes: 0, descuentaTicket: false });
  });

  it('arrastra deuda desde marzo cuando no hay tickets suficientes en meses anteriores', () => {
    const calendar = buildCalendar({
      diasSinTicket: Array.from(
        { length: 30 },
        (_, index) => `2026-04-${String(index + 1).padStart(2, '0')}`,
      ),
    });
    const person = buildTicketPerson(
      {
        empleado: '123',
        nombreApellidos: 'Ana Metro',
        puesto: 'SSCC',
        calendarId: calendar.id,
        activo: true,
      },
      timestamp,
    );
    const absence = buildTicketRestaurantAbsence(
      {
        empleado: '123',
        nombreApellidos: 'Ana Metro',
        desde: '2026-03-02',
        hasta: '2026-03-06',
        motivo: 'IT',
        totalDias: 5,
        afectaTicket: true,
      },
      timestamp,
      'absence-1',
    );
    const config = {
      ...DEFAULT_TICKET_RESTAURANT_CONFIG,
      importeTicket: 16,
      pedidoMensual: 0,
    };

    const march = calculateTicketMonth([person], [calendar], [absence], config, 2026, 3);
    const april = calculateTicketMonth([person], [calendar], [absence], config, 2026, 4);
    const may = calculateTicketMonth([person], [calendar], [absence], config, 2026, 5);

    expect(march.rows[0]).toMatchObject({
      deudaEntrante: 0,
      ausenciasAplicadas: 0,
      deudaPendiente: 0,
      ticketsFinales: 22,
    });
    expect(april.rows[0]).toMatchObject({
      diasTeoricos: 0,
      deudaEntrante: 5,
      ausenciasAplicadas: 0,
      deudaPendiente: 5,
      ticketsFinales: 0,
    });
    expect(may.rows[0]).toMatchObject({
      deudaEntrante: 5,
      ausenciasAplicadas: 5,
      deudaPendiente: 0,
    });
  });

  it('arrastra al mes siguiente las hojas de gasto que no caben tras aplicar la deuda', () => {
    const calendar = buildCalendar();
    const person = buildTicketPerson(
      {
        empleado: '123',
        nombreApellidos: 'Ana Metro',
        puesto: 'SSCC',
        calendarId: calendar.id,
        activo: true,
      },
      timestamp,
    );
    const fullMarchAbsence = buildTicketRestaurantAbsence(
      {
        empleado: '123',
        nombreApellidos: 'Ana Metro',
        desde: '2026-03-01',
        hasta: '2026-03-31',
        motivo: 'IT',
        totalDias: 31,
        afectaTicket: true,
      },
      timestamp,
      'absence-full-march',
    );
    const manutenciones: TicketManutencionImpact[] = ['2026-04-01', '2026-04-02', '2026-04-03'].map(
      (fechaGasto, index) => ({
        id: `manutencion-${index + 1}`,
        empleado: '123',
        nombreApellidos: 'Ana Metro',
        fechaGasto,
        afectaTicket: true,
        imputacionYear: 2026,
        imputacionMonth: 4,
        deletedAt: null,
      }),
    );

    const april = calculateMonthlyTicketOrder(
      [person],
      [calendar],
      [fullMarchAbsence],
      DEFAULT_TICKET_RESTAURANT_CONFIG,
      2026,
      4,
      manutenciones,
    );
    const may = calculateMonthlyTicketOrder(
      [person],
      [calendar],
      [fullMarchAbsence],
      DEFAULT_TICKET_RESTAURANT_CONFIG,
      2026,
      5,
      manutenciones,
    );

    expect(april.rows[0]).toMatchObject({
      diasTeoricos: 22,
      deudaEntrante: 22,
      ausenciasAplicadas: 22,
      hojasGastoMes: 0,
      deudaPendiente: 3,
      ticketsFinales: 0,
    });
    expect(april.rows[0].deudaAplicadaDetalle).toHaveLength(22);
    expect(april.rows[0].deudaPendienteDetalle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ motivo: 'Hoja de gasto', mesOrigen: '2026-04' }),
      ]),
    );

    expect(may.rows[0]).toMatchObject({
      deudaEntrante: 3,
      ausenciasAplicadas: 3,
      hojasGastoMes: 3,
      deudaPendiente: 0,
      ticketsFinales: 18,
    });
    expect(may.rows[0].hojaGastoDetalle).toHaveLength(3);
  });

  it('ignora ausencias con fecha de inicio anterior al 1 de marzo de 2026', () => {
    const calendar = buildCalendar();
    const person = buildTicketPerson(
      {
        empleado: '123',
        nombreApellidos: 'Ana Metro',
        puesto: 'SSCC',
        calendarId: calendar.id,
        activo: true,
      },
      timestamp,
    );
    const previousAbsence = buildTicketRestaurantAbsence(
      {
        empleado: '123',
        nombreApellidos: 'Ana Metro',
        desde: '2026-02-20',
        hasta: '2026-03-10',
        motivo: 'IT',
        totalDias: 19,
        afectaTicket: true,
      },
      timestamp,
      'absence-before-minimum',
    );

    const april = calculateTicketMonth(
      [person],
      [calendar],
      [previousAbsence],
      DEFAULT_TICKET_RESTAURANT_CONFIG,
      2026,
      4,
    );

    expect(april.rows[0]).toMatchObject({
      deudaEntrante: 0,
      ausenciasAplicadas: 0,
      deudaPendiente: 0,
    });
    expect(filterTicketRestaurantAbsencesByMonth([previousAbsence], 2026, 3)).toEqual([]);
  });

  it('resuelve solapes por día usando la ausencia más reciente antes de decidir si descuenta', () => {
    const calendar = buildCalendar({ nombre: 'Liberados' });
    const person = buildTicketPerson(
      {
        empleado: '123',
        nombreApellidos: 'Ana Metro',
        puesto: 'SSCC',
        calendarId: calendar.id,
        activo: true,
      },
      timestamp,
    );
    const olderDiscountableAbsence = buildTicketRestaurantAbsence(
      {
        empleado: '123',
        nombreApellidos: 'Ana Metro',
        desde: '2026-03-02',
        hasta: '2026-03-04',
        motivo: 'IT',
        totalDias: 3,
        afectaTicket: true,
      },
      '2026-03-01T00:00:00.000Z',
      'absence-old',
    );
    const newerNonDiscountableAbsence = buildTicketRestaurantAbsence(
      {
        empleado: '123',
        nombreApellidos: 'Ana Metro',
        desde: '2026-03-03',
        hasta: '2026-03-03',
        motivo: 'SIN',
        totalDias: 1,
        afectaTicket: true,
      },
      '2026-03-05T00:00:00.000Z',
      'absence-new',
    );

    const calculation = calculateTicketContribution(
      [person],
      [calendar],
      [olderDiscountableAbsence, newerNonDiscountableAbsence],
      DEFAULT_TICKET_RESTAURANT_CONFIG,
      2026,
      3,
    );

    expect(calculation.rows[0]).toMatchObject({
      ausenciasMes: 2,
      ausenciasAplicadas: 2,
    });
    expect(calculation.rows[0]?.ausenciaIds).toEqual(['absence-old']);
  });
});

it('calcula el impacto de una ausencia solo sobre días ticket del calendario en el mes', () => {
  const calendar = buildCalendar({
    diasSinTicket: ['2026-05-11'],
    ticketIsoWeekdays: [1, 2, 3, 4, 5],
  });
  const person = buildTicketPerson(
    {
      empleado: '123',
      nombreApellidos: 'Ana Metro',
      puesto: 'SSCC',
      calendarId: calendar.id,
      activo: true,
    },
    timestamp,
  );
  const absence = buildTicketRestaurantAbsence(
    {
      empleado: '123',
      nombreApellidos: 'Ana Metro',
      desde: '2026-05-08',
      hasta: '2026-05-12',
      motivo: 'IT',
      totalDias: 5,
      afectaTicket: true,
    },
    timestamp,
    'absence-weekend-and-no-ticket',
  );

  expect(
    calculateTicketAbsenceMonthImpact(
      absence,
      [person],
      [calendar],
      DEFAULT_TICKET_RESTAURANT_CONFIG,
      2026,
      5,
    ),
  ).toMatchObject({ diasTicketMes: 2, descuentaTicket: true });
});

it('en cotización descuenta una ausencia larga solo en días ticket del calendario de la persona', () => {
  const calendar = buildCalendar({
    nombre: 'Ingeniería Ariz',
    diasSinTicket: ['2026-05-13', '2026-05-20'],
    ticketIsoWeekdays: [1, 2, 3, 4, 5],
  });
  const person = buildTicketPerson(
    {
      empleado: '456',
      nombreApellidos: 'Hidalgo, Ana Isabel',
      puesto: 'Ingeniería Ariz',
      calendarId: calendar.id,
      activo: true,
    },
    timestamp,
  );
  const absence = buildTicketRestaurantAbsence(
    {
      empleado: '456',
      nombreApellidos: 'Hidalgo, Ana Isabel',
      desde: '2026-05-11',
      hasta: '2026-05-22',
      motivo: 'ENF',
      totalDias: 12,
      afectaTicket: true,
    },
    timestamp,
    'absence-ana-hidalgo-enf',
  );

  const calculation = calculateTicketContribution(
    [person],
    [calendar],
    [absence],
    DEFAULT_TICKET_RESTAURANT_CONFIG,
    2026,
    5,
  );

  expect(calculation.rows[0]).toMatchObject({
    ausenciasMes: 8,
    ausenciasAplicadas: 8,
    ausenciaDiasDescontados: { 'absence-ana-hidalgo-enf': 8 },
  });
});

describe('ticket restaurante absence importer domain', () => {
  const cleanRows = [
    ['Informe'],
    ['Nº empleado', 'Nombre y apellidos', 'Desde', 'Hasta', 'Motivo', 'Total días'],
    ['00123', '  Ana   Metro  ', '01/03/2026', '03/03/2026', 'IT', '3'],
  ];

  it('detecta formato limpio', () => {
    expect(detectTicketRestaurantAbsenceFormat(cleanRows)).toBe('clean');
  });

  it('detecta formato ZERKOS', () => {
    expect(
      detectTicketRestaurantAbsenceFormat([
        ['EMPLEADO', '123 Ana Metro'],
        ['PUESTO ORGANIZATIVO', 'Metro'],
        ['RESIDENCIA', 'Madrid'],
        ['NIVEL', '7'],
        ['AUS.', 'AÑO', 'DESDE', 'HASTA', 'DÍAS'],
      ]),
    ).toBe('zerkos');
  });

  it('detecta cabecera limpia desplazada', () => {
    const rows = importTicketRestaurantAbsences(cleanRows);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ empleado: '123', nombreApellidos: 'Ana Metro' });
  });

  it('normaliza fechas', () => {
    expect(
      normalizeTicketRestaurantAbsenceRow(
        { empleado: '1', desde: '15/03/2026', motivo: 'IT' },
        'a',
      ),
    ).toMatchObject({
      desde: '2026-03-15',
    });
  });

  it('usa Desde cuando Hasta está vacío', () => {
    expect(
      normalizeTicketRestaurantAbsenceRow(
        { empleado: '1', desde: '15/03/2026', motivo: 'IT' },
        'a',
      ),
    ).toMatchObject({
      hasta: '2026-03-15',
    });
  });

  it('calcula totalDias inclusivo', () => {
    expect(
      normalizeTicketRestaurantAbsenceRow(
        { empleado: '1', desde: '15/03/2026', hasta: '17/03/2026', motivo: 'IT' },
        'a',
      ),
    ).toMatchObject({ totalDias: '3' });
  });

  it('rechaza hasta anterior a desde', () => {
    expect(
      normalizeTicketRestaurantAbsenceRow(
        { empleado: '1', desde: '17/03/2026', hasta: '15/03/2026', motivo: 'IT' },
        'a',
      ).errors,
    ).toContain('Hasta no puede ser anterior a Desde.');
  });

  it('rechaza empleado vacío/no numérico', () => {
    expect(
      normalizeTicketRestaurantAbsenceRow({ empleado: '', desde: '15/03/2026', motivo: 'IT' }, 'a')
        .errors,
    ).toContain('Nº empleado obligatorio.');
    expect(
      normalizeTicketRestaurantAbsenceRow(
        { empleado: 'ABC', desde: '15/03/2026', motivo: 'IT' },
        'a',
      ).errors,
    ).toContain('Nº empleado debe ser numérico.');
  });

  it('rechaza motivo vacío', () => {
    expect(
      normalizeTicketRestaurantAbsenceRow({ empleado: '1', desde: '15/03/2026', motivo: '' }, 'a')
        .errors,
    ).toContain('Motivo obligatorio.');
  });

  it('afectaTicket Sí/S/J → true', () => {
    expect(
      normalizeTicketRestaurantAbsenceRow(
        { empleado: '1', desde: '01/02/2026', motivo: 'IT', afectaTicket: 'Sí' },
        'a',
      ).afectaTicket,
    ).toBe(true);
    expect(
      normalizeTicketRestaurantAbsenceRow(
        { empleado: '1', desde: '01/02/2026', motivo: 'IT', afectaTicket: 'S' },
        'a',
      ).afectaTicket,
    ).toBe(true);
    expect(
      normalizeTicketRestaurantAbsenceRow(
        { empleado: '1', desde: '01/02/2026', motivo: 'IT', afectaTicket: 'J' },
        'a',
      ).afectaTicket,
    ).toBe(true);
  });

  it('afectaTicket No/N → false', () => {
    expect(
      normalizeTicketRestaurantAbsenceRow(
        { empleado: '1', desde: '15/03/2026', motivo: 'IT', afectaTicket: 'No' },
        'a',
      ).afectaTicket,
    ).toBe(false);
    expect(
      normalizeTicketRestaurantAbsenceRow(
        { empleado: '1', desde: '15/03/2026', motivo: 'IT', afectaTicket: 'N' },
        'a',
      ).afectaTicket,
    ).toBe(false);
  });

  it('afectaTicket por defecto desde 2026-03-01', () => {
    expect(
      normalizeTicketRestaurantAbsenceRow({ empleado: '1', desde: '01/03/2026', motivo: 'IT' }, 'a')
        .afectaTicket,
    ).toBe(true);
  });

  it('fecha anterior a 2026-03-01 no afecta por defecto', () => {
    expect(
      normalizeTicketRestaurantAbsenceRow({ empleado: '1', desde: '28/02/2026', motivo: 'IT' }, 'a')
        .afectaTicket,
    ).toBe(false);
  });

  it('ignora duplicado exacto', () => {
    const row = normalizeTicketRestaurantAbsenceRow(
      { empleado: '1', desde: '01/03/2026', hasta: '02/03/2026', motivo: 'IT' },
      'a',
    );
    const first = saveTicketRestaurantAbsencePreviewRows([], [row], new Date(timestamp));
    const second = saveTicketRestaurantAbsencePreviewRows(
      first.absences,
      [row],
      new Date(timestamp),
    );

    expect(second.summary.duplicadas).toBe(1);
    expect(second.absences).toHaveLength(1);
  });

  it('sustituye ausencia solapada del mismo empleado/motivo', () => {
    const initial = normalizeTicketRestaurantAbsenceRow(
      { empleado: '1', desde: '01/03/2026', hasta: '05/03/2026', motivo: 'IT' },
      'a',
    );
    const replacement = normalizeTicketRestaurantAbsenceRow(
      { empleado: '1', desde: '03/03/2026', hasta: '06/03/2026', motivo: 'IT' },
      'b',
    );
    const first = saveTicketRestaurantAbsencePreviewRows([], [initial], new Date(timestamp));
    const second = saveTicketRestaurantAbsencePreviewRows(
      first.absences,
      [replacement],
      new Date(timestamp),
    );

    expect(second.summary.sustituidas).toBe(1);
    expect(second.absences).toHaveLength(1);
    expect(second.absences[0]).toMatchObject({ desde: '2026-03-03', hasta: '2026-03-06' });
  });

  it('preview no guarda filas inválidas', () => {
    const invalid = normalizeTicketRestaurantAbsenceRow(
      { empleado: '', desde: '03/03/2026', motivo: 'IT' },
      'a',
    );
    const result = saveTicketRestaurantAbsencePreviewRows([], [invalid], new Date(timestamp));

    expect(result.summary.invalidas).toBe(1);
    expect(result.absences).toHaveLength(0);
  });

  it('parsea ZERKOS asociando empleado activo y motivo en mayúsculas', () => {
    const rows = importTicketRestaurantAbsences([
      ['EMPLEADO', '123 Ana Metro'],
      ['PUESTO ORGANIZATIVO', 'Metro'],
      ['RESIDENCIA', 'Madrid'],
      ['NIVEL', '7'],
      ['AUS.', 'AÑO', 'DESDE', 'HASTA', 'DÍAS'],
      ['it', '2026', '01/03/2026', '02/03/2026', '2'],
    ]);

    expect(rows[0]).toMatchObject({ empleado: '123', motivo: 'IT', desde: '2026-03-01' });
  });

  it('detecta formato ZERKOS real', () => {
    expect(detectTicketRestaurantAbsenceFormat(realZerkosRows)).toBe('zerkos');
  });

  it('detecta fila empleado real', () => {
    const rows = importTicketRestaurantAbsences(realZerkosRows);

    expect(rows[0]).toMatchObject({
      empleado: '31',
      nombreApellidos: 'Rodríguez Corral, Fernando',
    });
  });

  it('asocia ausencias al empleado activo real', () => {
    const rows = importTicketRestaurantAbsences(realZerkosRows);

    expect(rows.filter((row) => row.empleado === '46').map((row) => row.motivo)).toEqual([
      'DDA',
      'VAC',
    ]);
  });

  it('ignora Total días en ZERKOS real', () => {
    const rows = importTicketRestaurantAbsences(realZerkosRows);

    expect(rows.some((row) => row.motivo === 'Total días')).toBe(false);
  });

  it('ignora pie Ausencia.rpt en ZERKOS real', () => {
    const rows = importTicketRestaurantAbsences(realZerkosRows);

    expect(rows.every((row) => row.motivo !== 'Ausencia.rpt')).toBe(true);
  });

  it('importa DDA con -- aplicando regla por defecto', () => {
    const rows = importTicketRestaurantAbsences(realZerkosRows);

    expect(rows.find((row) => row.empleado === '31' && row.motivo === 'DDA')).toMatchObject({
      afectaTicket: true,
    });
  });

  it('importa ENF con SI como afectaTicket true', () => {
    const rows = importTicketRestaurantAbsences(realZerkosRows);

    expect(rows.find((row) => row.empleado === '642' && row.motivo === 'ENF')).toMatchObject({
      afectaTicket: true,
    });
  });

  it('importa HOS con NO como afectaTicket false', () => {
    const rows = importTicketRestaurantAbsences(realZerkosRows);

    expect(rows.find((row) => row.empleado === '861' && row.motivo === 'HOS')).toMatchObject({
      afectaTicket: false,
    });
  });

  it('detecta todas las ausencias esperadas del ZERKOS real', () => {
    const rows = importTicketRestaurantAbsences(realZerkosRows);

    expect(
      rows.map((row) => [row.empleado, row.motivo, row.desde, row.hasta, row.totalDias]),
    ).toEqual([
      ['31', 'DDA', '2026-05-04', '2026-05-04', '1'],
      ['46', 'DDA', '2026-05-11', '2026-05-15', '5'],
      ['46', 'VAC', '2026-05-05', '2026-05-08', '4'],
      ['639', 'DDA', '2026-05-13', '2026-05-13', '1'],
      ['642', 'DDA', '2026-05-07', '2026-05-07', '1'],
      ['642', 'ENF', '2026-05-11', '2026-05-22', '12'],
      ['861', 'HOS', '2026-05-15', '2026-05-15', '1'],
      ['931', 'DDA', '2026-05-27', '2026-05-27', '1'],
    ]);
  });

  it('filtra una ausencia que cruza meses en ambos meses', () => {
    const absence = buildTicketRestaurantAbsence(
      {
        empleado: '1',
        nombreApellidos: 'Ana Metro',
        desde: '2026-05-28',
        hasta: '2026-06-03',
        motivo: 'DDA',
        totalDias: 7,
        afectaTicket: true,
      },
      timestamp,
      'absence-cross-month',
    );
    const absences: TicketRestaurantAbsence[] = [absence];

    expect(filterTicketRestaurantAbsencesByMonth(absences, 2026, 5)).toHaveLength(1);
    expect(filterTicketRestaurantAbsencesByMonth(absences, 2026, 6)).toHaveLength(1);
    expect(filterTicketRestaurantAbsencesByMonth(absences, 2026, 7)).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildYearCalendar,
  nextCalendarYear,
  previousCalendarYear,
  toggleDiaSinTicket,
  visibleTicketCalendars,
  type TicketCalendar,
} from './ticketRestaurante';

const timestamp = '2026-01-01T00:00:00.000Z';

function buildCalendar(overrides: Partial<TicketCalendar> = {}): TicketCalendar {
  return {
    id: 'calendar-base',
    nombre: 'Calendario base',
    activo: true,
    diasSinTicket: [],
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
    expect(normalizeTicketRestaurantAbsenceRow({ empleado: '1', desde: '15/03/2026', motivo: 'IT' }, 'a')).toMatchObject({
      desde: '2026-03-15',
    });
  });

  it('usa Desde cuando Hasta está vacío', () => {
    expect(normalizeTicketRestaurantAbsenceRow({ empleado: '1', desde: '15/03/2026', motivo: 'IT' }, 'a')).toMatchObject({
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
      normalizeTicketRestaurantAbsenceRow({ empleado: '', desde: '15/03/2026', motivo: 'IT' }, 'a').errors,
    ).toContain('Nº empleado obligatorio.');
    expect(
      normalizeTicketRestaurantAbsenceRow({ empleado: 'ABC', desde: '15/03/2026', motivo: 'IT' }, 'a').errors,
    ).toContain('Nº empleado debe ser numérico.');
  });

  it('rechaza motivo vacío', () => {
    expect(
      normalizeTicketRestaurantAbsenceRow({ empleado: '1', desde: '15/03/2026', motivo: '' }, 'a').errors,
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
    const second = saveTicketRestaurantAbsencePreviewRows(first.absences, [row], new Date(timestamp));

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
});

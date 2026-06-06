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

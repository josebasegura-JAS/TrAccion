import type { TicketCalendar } from './ticketRestauranteTypes';
import { normalizeTicketIsoWeekdays } from './ticketCalendars';
import { toIsoDate } from './ticketDates';

export function getIsoWeekday(fecha: string): number {
  const day = new Date(`${fecha}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function calendarHasTicketRightOnDate(
  calendar: TicketCalendar,
  fecha: string,
  ticketIsoWeekdays = new Set(normalizeTicketIsoWeekdays(calendar.ticketIsoWeekdays)),
  noTicket = new Set(calendar.diasSinTicket),
): boolean {
  return ticketIsoWeekdays.has(getIsoWeekday(fecha)) && !noTicket.has(fecha);
}

export function buildMonthTicketDays(
  calendar: TicketCalendar,
  year: number,
  month: number,
): string[] {
  const noTicket = new Set(calendar.diasSinTicket);
  const ticketIsoWeekdays = new Set(normalizeTicketIsoWeekdays(calendar.ticketIsoWeekdays));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates: string[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const fecha = toIsoDate(year, month, day);
    if (calendarHasTicketRightOnDate(calendar, fecha, ticketIsoWeekdays, noTicket)) {
      dates.push(fecha);
    }
  }
  return dates;
}

export function countTicketCalendarDays(
  calendar: TicketCalendar,
  year: number,
  month: number,
): number {
  return buildMonthTicketDays(calendar, year, month).length;
}

export function countMonthNoTicketDays(
  calendar: TicketCalendar,
  year: number,
  month: number,
): number {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const ticketIsoWeekdays = new Set(normalizeTicketIsoWeekdays(calendar.ticketIsoWeekdays));
  return calendar.diasSinTicket.filter(
    (fecha) => fecha.startsWith(prefix) && ticketIsoWeekdays.has(getIsoWeekday(fecha)),
  ).length;
}

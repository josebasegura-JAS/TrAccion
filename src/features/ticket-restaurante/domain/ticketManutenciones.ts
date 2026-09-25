import type {
  TicketCalendar,
  TicketManutencionDetailDay,
  TicketManutencionImpact,
  TicketPerson,
} from './ticketRestauranteTypes';
import { normalizeTicketIsoWeekdays } from './ticketCalendars';
import { calendarHasTicketRightOnDate } from './ticketEligibility';
import { sameTicketEmployee } from './ticketPeople';

export function buildPersonManutencionTicketDays(
  person: TicketPerson,
  calendar: TicketCalendar,
  manutenciones: readonly TicketManutencionImpact[],
  year: number,
  month: number,
): Set<string> {
  const ticketIsoWeekdays = new Set(normalizeTicketIsoWeekdays(calendar.ticketIsoWeekdays));
  const noTicket = new Set(calendar.diasSinTicket);
  return new Set(
    manutenciones
      .filter(
        (row) =>
          !row.deletedAt &&
          row.afectaTicket &&
          sameTicketEmployee(row.empleado, person.empleado) &&
          row.imputacionYear === year &&
          row.imputacionMonth === month &&
          calendarHasTicketRightOnDate(calendar, row.fechaGasto, ticketIsoWeekdays, noTicket),
      )
      .map((row) => row.fechaGasto),
  );
}

export function buildPersonManutencionTicketDayDetails(
  person: TicketPerson,
  calendar: TicketCalendar,
  manutenciones: readonly TicketManutencionImpact[],
  year: number,
  month: number,
): TicketManutencionDetailDay[] {
  const ticketIsoWeekdays = new Set(normalizeTicketIsoWeekdays(calendar.ticketIsoWeekdays));
  const noTicket = new Set(calendar.diasSinTicket);
  const seenDates = new Set<string>();

  return manutenciones
    .filter(
      (row) =>
        !row.deletedAt &&
        row.afectaTicket &&
        sameTicketEmployee(row.empleado, person.empleado) &&
        row.imputacionYear === year &&
        row.imputacionMonth === month &&
        calendarHasTicketRightOnDate(calendar, row.fechaGasto, ticketIsoWeekdays, noTicket),
    )
    .sort((first, second) => first.fechaGasto.localeCompare(second.fechaGasto))
    .filter((row) => {
      if (seenDates.has(row.fechaGasto)) return false;
      seenDates.add(row.fechaGasto);
      return true;
    })
    .map((row) => ({ id: row.id, fecha: row.fechaGasto }));
}

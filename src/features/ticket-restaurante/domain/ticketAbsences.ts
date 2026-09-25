import type {
  TicketAbsenceMonthImpact,
  TicketAbsenceTicketImpactInput,
  TicketAbsenceTicketImpactResult,
  TicketCalculationRules,
  TicketCalendar,
  TicketDebtDetailDay,
  TicketPerson,
  TicketRestaurantAbsence,
  TicketRestaurantAbsenceDraft,
  TicketRestaurantConfig,
} from './ticketRestauranteTypes';
import { normalizeTicketCalendarName, normalizeTicketIsoWeekdays } from './ticketCalendars';
import { sameTicketEmployee, normalizeTicketEmployeeNumber } from './ticketPeople';
import {
  calendarHasTicketRightOnDate,
} from './ticketEligibility';
import { forEachIsoDate, maxIsoDate, minIsoDate, normalizePlainText, toIsoDate } from './ticketDates';

export const TICKET_RESTAURANT_MIN_ABSENCE_DATE = '2026-03-01';

export function absenceIsNonDiscountableByCalendar(
  absence: TicketRestaurantAbsence,
  calendar: TicketCalendar,
  rules: TicketCalculationRules,
): boolean {
  return Object.entries(rules.nonDiscountableMotivesByCalendar).some(
    ([calendarName, motives]) =>
      normalizeTicketCalendarName(calendar.nombre) === normalizeTicketCalendarName(calendarName) &&
      motives.some((motivo) => normalizePlainText(absence.motivo) === normalizePlainText(motivo)),
  );
}

function getPersonMonthAbsences(
  empleado: string,
  absences: readonly TicketRestaurantAbsence[],
  monthStart: string,
  monthEnd: string,
): TicketRestaurantAbsence[] {
  return absences.filter(
    (absence) =>
      !absence.deletedAt &&
      absence.afectaTicket &&
      absence.desde >= TICKET_RESTAURANT_MIN_ABSENCE_DATE &&
      sameTicketEmployee(absence.empleado, empleado) &&
      absence.desde <= monthEnd &&
      absence.hasta >= monthStart,
  );
}

function compareAbsencesByEffectivePriority(
  first: TicketRestaurantAbsence,
  second: TicketRestaurantAbsence,
): number {
  const updatedComparison = first.updatedAt.localeCompare(second.updatedAt);
  if (updatedComparison !== 0) return updatedComparison;
  const createdComparison = first.createdAt.localeCompare(second.createdAt);
  if (createdComparison !== 0) return createdComparison;
  return first.id.localeCompare(second.id);
}

export function buildEffectiveAbsenceByTicketDay(
  person: TicketPerson,
  calendar: TicketCalendar,
  absences: readonly TicketRestaurantAbsence[],
  monthStart: string,
  monthEnd: string,
): Map<string, TicketRestaurantAbsence> {
  const absenceByDate = new Map<string, TicketRestaurantAbsence>();
  const noTicket = new Set(calendar.diasSinTicket);
  const ticketIsoWeekdays = new Set(normalizeTicketIsoWeekdays(calendar.ticketIsoWeekdays));

  getPersonMonthAbsences(person.empleado, absences, monthStart, monthEnd)
    .sort(compareAbsencesByEffectivePriority)
    .forEach((absence) => {
      forEachIsoDate(
        maxIsoDate(absence.desde, monthStart),
        minIsoDate(absence.hasta, monthEnd),
        (fecha) => {
          if (calendarHasTicketRightOnDate(calendar, fecha, ticketIsoWeekdays, noTicket)) {
            absenceByDate.set(fecha, absence);
          }
        },
      );
    });
  return absenceByDate;
}

export function buildPersonAbsenceTicketDays(
  person: TicketPerson,
  calendar: TicketCalendar,
  absences: readonly TicketRestaurantAbsence[],
  monthStart: string,
  monthEnd: string,
  rules: TicketCalculationRules,
): Set<string> {
  return new Set(
    Array.from(buildEffectiveAbsenceByTicketDay(person, calendar, absences, monthStart, monthEnd).entries())
      .filter(([, absence]) => !absenceIsNonDiscountableByCalendar(absence, calendar, rules))
      .map(([fecha]) => fecha),
  );
}

export function getAppliedAbsenceIdsForTicketDays(
  person: TicketPerson,
  calendar: TicketCalendar | undefined,
  absences: readonly TicketRestaurantAbsence[],
  monthStart: string,
  monthEnd: string,
  rules: TicketCalculationRules,
): string[] {
  if (!calendar) return [];
  return Array.from(new Set(
    Array.from(buildEffectiveAbsenceByTicketDay(person, calendar, absences, monthStart, monthEnd).values())
      .filter((absence) => !absenceIsNonDiscountableByCalendar(absence, calendar, rules))
      .map((absence) => absence.id),
  ));
}

export function getAppliedAbsenceDiscountedDaysById(
  person: TicketPerson,
  calendar: TicketCalendar | undefined,
  absences: readonly TicketRestaurantAbsence[],
  monthStart: string,
  monthEnd: string,
  rules: TicketCalculationRules,
): Record<string, number> {
  if (!calendar) return {};
  const discountedDaysByAbsenceId = new Map<string, number>();
  Array.from(buildEffectiveAbsenceByTicketDay(person, calendar, absences, monthStart, monthEnd).values())
    .filter((absence) => !absenceIsNonDiscountableByCalendar(absence, calendar, rules))
    .forEach((absence) => {
      discountedDaysByAbsenceId.set(absence.id, (discountedDaysByAbsenceId.get(absence.id) ?? 0) + 1);
    });
  return Object.fromEntries(discountedDaysByAbsenceId);
}

export function buildPersonAbsenceTicketDayDetails(
  person: TicketPerson,
  calendar: TicketCalendar,
  absences: readonly TicketRestaurantAbsence[],
  monthStart: string,
  monthEnd: string,
  rules: TicketCalculationRules,
): TicketDebtDetailDay[] {
  return Array.from(buildEffectiveAbsenceByTicketDay(person, calendar, absences, monthStart, monthEnd).entries())
    .filter(([, absence]) => !absenceIsNonDiscountableByCalendar(absence, calendar, rules))
    .map(([fecha, absence]) => ({
      id: absence.id,
      fecha,
      motivo: absence.motivo,
      mesOrigen: fecha.slice(0, 7),
    }))
    .sort((first, second) => first.fecha.localeCompare(second.fecha) || first.id.localeCompare(second.id));
}

export function calculateTicketAbsenceMonthImpact(
  absence: TicketRestaurantAbsence,
  people: readonly TicketPerson[],
  calendars: readonly TicketCalendar[],
  config: TicketRestaurantConfig,
  year: number,
  month: number,
): TicketAbsenceMonthImpact {
  const person = people.find(
    (item) => !item.deletedAt && item.activo && sameTicketEmployee(item.empleado, absence.empleado),
  );
  const calendar = person
    ? calendars.find((item) => !item.deletedAt && item.activo && item.id === person.calendarId)
    : undefined;

  if (!person || !calendar || !absence.afectaTicket || absence.desde < TICKET_RESTAURANT_MIN_ABSENCE_DATE) {
    return { calendario: calendar?.nombre ?? 'Sin calendario', diasTicketMes: 0, descuentaTicket: false };
  }

  const monthStart = toIsoDate(year, month, 1);
  const monthEnd = toIsoDate(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());
  if (absence.desde > monthEnd || absence.hasta < monthStart) {
    return { calendario: calendar.nombre, diasTicketMes: 0, descuentaTicket: false };
  }

  const descuentaTicket = !absenceIsNonDiscountableByCalendar(absence, calendar, config.rules);
  if (!descuentaTicket) {
    return { calendario: calendar.nombre, diasTicketMes: 0, descuentaTicket: false };
  }

  const ticketIsoWeekdays = new Set(normalizeTicketIsoWeekdays(calendar.ticketIsoWeekdays));
  const noTicket = new Set(calendar.diasSinTicket);
  let diasTicketMes = 0;
  forEachIsoDate(maxIsoDate(absence.desde, monthStart), minIsoDate(absence.hasta, monthEnd), (fecha) => {
    if (calendarHasTicketRightOnDate(calendar, fecha, ticketIsoWeekdays, noTicket)) diasTicketMes += 1;
  });
  return { calendario: calendar.nombre, diasTicketMes, descuentaTicket: diasTicketMes > 0 };
}

export function buildTicketRestaurantAbsence(
  draft: TicketRestaurantAbsenceDraft,
  now: string,
  id: string,
  previous?: TicketRestaurantAbsence,
): TicketRestaurantAbsence {
  return {
    id,
    empleado: normalizeTicketEmployeeNumber(draft.empleado),
    nombreApellidos: draft.nombreApellidos.trim().replace(/\s+/g, ' '),
    desde: draft.desde,
    hasta: draft.hasta,
    motivo: draft.motivo.trim().replace(/\s+/g, ' '),
    totalDias: draft.totalDias,
    afectaTicket: draft.afectaTicket,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    deletedAt: previous?.deletedAt ?? null,
  };
}

export function visibleTicketRestaurantAbsences(absences: TicketRestaurantAbsence[]): TicketRestaurantAbsence[] {
  return absences.filter((absence) => !absence.deletedAt && absence.desde >= TICKET_RESTAURANT_MIN_ABSENCE_DATE);
}

export function calculateTicketAbsenceTicketImpact(
  absence: TicketAbsenceTicketImpactInput,
  people: readonly TicketPerson[],
  calendars: readonly TicketCalendar[],
  config: TicketRestaurantConfig,
): TicketAbsenceTicketImpactResult {
  const person = people.find(
    (item) => !item.deletedAt && item.activo && sameTicketEmployee(item.empleado, absence.empleado),
  );
  const calendar = person
    ? calendars.find((item) => !item.deletedAt && item.activo && item.id === person.calendarId)
    : undefined;

  if (!person || !calendar || absence.desde < TICKET_RESTAURANT_MIN_ABSENCE_DATE) {
    return { diasTicket: 0, afectaTicket: false, calendario: calendar?.nombre ?? 'Sin calendario' };
  }

  const syntheticAbsence: TicketRestaurantAbsence = {
    id: 'ticket-absence-preview',
    empleado: absence.empleado,
    nombreApellidos: '',
    desde: absence.desde,
    hasta: absence.hasta,
    motivo: absence.motivo,
    totalDias: 0,
    afectaTicket: true,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  };
  if (absenceIsNonDiscountableByCalendar(syntheticAbsence, calendar, config.rules)) {
    return { diasTicket: 0, afectaTicket: false, calendario: calendar.nombre };
  }

  const ticketIsoWeekdays = new Set(normalizeTicketIsoWeekdays(calendar.ticketIsoWeekdays));
  const noTicket = new Set(calendar.diasSinTicket);
  let diasTicket = 0;
  forEachIsoDate(absence.desde, absence.hasta, (fecha) => {
    if (calendarHasTicketRightOnDate(calendar, fecha, ticketIsoWeekdays, noTicket)) diasTicket += 1;
  });
  return { diasTicket, afectaTicket: diasTicket > 0, calendario: calendar.nombre };
}

export function filterTicketRestaurantAbsencesByMonth(
  absences: TicketRestaurantAbsence[],
  year: number,
  month: number,
): TicketRestaurantAbsence[] {
  const monthStart = toIsoDate(year, month, 1);
  const monthEnd = toIsoDate(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());
  return absences.filter(
    (absence) =>
      !absence.deletedAt &&
      absence.desde >= TICKET_RESTAURANT_MIN_ABSENCE_DATE &&
      absence.desde <= monthEnd &&
      absence.hasta >= monthStart,
  );
}

import type { TicketCalendar, TicketCalendarDraft } from './ticketRestauranteTypes';

const CANONICAL_TICKET_CALENDAR_NAMES: Record<string, string> = {
  sscc: 'sscc',
  servicioscentrales: 'sscc',
  'servicios centrales': 'sscc',
  ariz: 'ingenieria ariz',
  ingenieriaariz: 'ingenieria ariz',
  'ingenieria ariz': 'ingenieria ariz',
  'ingeniería ariz': 'ingenieria ariz',
  sopela: 'instalaciones sopela',
  instalacionessopela: 'instalaciones sopela',
  'instalaciones sopela': 'instalaciones sopela',
  liberados: 'liberados',
  liberado: 'liberados',
};

function normalizePlainText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es-ES')
    .replace(/\s+/g, ' ');
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function normalizeTicketCalendarName(value: string): string {
  const normalized = normalizePlainText(value);
  return (
    CANONICAL_TICKET_CALENDAR_NAMES[normalized.replace(/\s+/g, '')] ??
    CANONICAL_TICKET_CALENDAR_NAMES[normalized] ??
    normalized
  );
}

export function normalizeDiasSinTicket(fechas: string[]): string[] {
  return Array.from(
    new Set(fechas.map((fecha) => fecha.trim()).filter((fecha) => isIsoDate(fecha))),
  ).sort((first, second) => first.localeCompare(second));
}

export function normalizeTicketIsoWeekdays(days: readonly number[] | undefined): number[] {
  const normalized = Array.from(
    new Set(
      (days ?? [1, 2, 3, 4, 5])
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 5),
    ),
  ).sort((first, second) => first - second);

  return normalized.length ? normalized : [1, 2, 3, 4, 5];
}

export function buildTicketCalendar(
  draft: TicketCalendarDraft,
  now: string,
  id: string,
  previous?: TicketCalendar,
): TicketCalendar {
  return {
    id,
    nombre: draft.nombre.trim(),
    activo: draft.activo,
    diasSinTicket: normalizeDiasSinTicket(draft.diasSinTicket),
    ticketIsoWeekdays: normalizeTicketIsoWeekdays(
      draft.ticketIsoWeekdays ?? previous?.ticketIsoWeekdays,
    ),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    deletedAt: previous?.deletedAt ?? null,
  };
}

export function visibleTicketCalendars(calendars: TicketCalendar[]): TicketCalendar[] {
  return calendars.filter((calendar) => !calendar.deletedAt);
}

export function toggleDiaSinTicket(calendar: TicketCalendar, fecha: string): TicketCalendar {
  if (!isIsoDate(fecha)) return calendar;

  const actuales = new Set(calendar.diasSinTicket);
  if (actuales.has(fecha)) actuales.delete(fecha);
  else actuales.add(fecha);

  return { ...calendar, diasSinTicket: normalizeDiasSinTicket(Array.from(actuales)) };
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function buildYearCalendar(calendar: TicketCalendar, year: number): import('./ticketRestauranteTypes').CalendarMonth[] {
  const sinTicket = new Set(calendar.diasSinTicket);
  return MONTH_NAMES.map((nombre, monthIndex) => {
    const mes = monthIndex + 1;
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const firstDay = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
    const blancosIniciales = firstDay === 0 ? 6 : firstDay - 1;
    const dias = Array.from({ length: daysInMonth }, (_, index) => {
      const diaMes = index + 1;
      const fecha = toIsoDate(year, mes, diaMes);
      const diaSemana = new Date(Date.UTC(year, monthIndex, diaMes)).getUTCDay();
      return {
        fecha,
        diaMes,
        diaSemana,
        esFinDeSemana: diaSemana === 0 || diaSemana === 6,
        sinTicket: sinTicket.has(fecha),
      };
    });
    return { mes, nombre, blancosIniciales, dias };
  });
}

export function nextCalendarYear(year: number): number {
  return year + 1;
}

export function previousCalendarYear(year: number): number {
  return year - 1;
}

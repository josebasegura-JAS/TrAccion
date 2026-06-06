export interface TicketCalendar {
  id: string;
  nombre: string;
  activo: boolean;
  diasSinTicket: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TicketCalendarDraft {
  nombre: string;
  activo: boolean;
  diasSinTicket: string[];
}

export interface TicketRestaurantAbsence {
  id: string;
  empleado: string;
  nombreApellidos: string;
  desde: string;
  hasta: string;
  motivo: string;
  totalDias: number;
  afectaTicket: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TicketRestaurantAbsenceDraft {
  empleado: string;
  nombreApellidos: string;
  desde: string;
  hasta: string;
  motivo: string;
  totalDias: number;
  afectaTicket: boolean;
}

export interface CalendarDay {
  fecha: string;
  diaMes: number;
  diaSemana: number;
  esFinDeSemana: boolean;
  sinTicket: boolean;
}

export interface CalendarMonth {
  mes: number;
  nombre: string;
  blancosIniciales: number;
  dias: CalendarDay[];
}

export const EMPTY_TICKET_CALENDAR_DRAFT: TicketCalendarDraft = {
  nombre: '',
  activo: true,
  diasSinTicket: [],
};

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function normalizeDiasSinTicket(fechas: string[]): string[] {
  return Array.from(
    new Set(
      fechas
        .map((fecha) => fecha.trim())
        .filter((fecha) => isIsoDate(fecha)),
    ),
  ).sort((first, second) => first.localeCompare(second));
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
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    deletedAt: previous?.deletedAt ?? null,
  };
}

export function visibleTicketCalendars(calendars: TicketCalendar[]): TicketCalendar[] {
  return calendars.filter((calendar) => !calendar.deletedAt);
}

export function toggleDiaSinTicket(calendar: TicketCalendar, fecha: string): TicketCalendar {
  if (!isIsoDate(fecha)) {
    return calendar;
  }

  const actuales = new Set(calendar.diasSinTicket);
  if (actuales.has(fecha)) {
    actuales.delete(fecha);
  } else {
    actuales.add(fecha);
  }

  return {
    ...calendar,
    diasSinTicket: normalizeDiasSinTicket(Array.from(actuales)),
  };
}

export function buildTicketRestaurantAbsence(
  draft: TicketRestaurantAbsenceDraft,
  now: string,
  id: string,
  previous?: TicketRestaurantAbsence,
): TicketRestaurantAbsence {
  return {
    id,
    empleado: draft.empleado.trim(),
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

export function visibleTicketRestaurantAbsences(
  absences: TicketRestaurantAbsence[],
): TicketRestaurantAbsence[] {
  return absences.filter((absence) => !absence.deletedAt);
}

export function buildYearCalendar(calendar: TicketCalendar, year: number): CalendarMonth[] {
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

    return {
      mes,
      nombre,
      blancosIniciales,
      dias,
    };
  });
}

export function nextCalendarYear(year: number): number {
  return year + 1;
}

export function previousCalendarYear(year: number): number {
  return year - 1;
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

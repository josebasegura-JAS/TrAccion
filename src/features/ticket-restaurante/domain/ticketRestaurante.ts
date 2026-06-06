import type { Employee } from '../../plantilla/domain/employee';

export interface DiaTicket {
  fecha: string;
  tieneTicket: boolean;
}

export interface TicketCalendar {
  id: string;
  nombre: string;
  activo: boolean;
  diasTicket: DiaTicket[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TicketCalendarDraft {
  nombre: string;
  activo: boolean;
  diasTicket: DiaTicket[];
}

export interface PersonaCalendario {
  empleado: string;
  calendarId: string;
  createdAt: string;
}

export interface DerechoTicketMes {
  empleado: string;
  nombreApellidos: string;
  calendario: string;
  diasTicketMes: number;
}

export const EMPTY_TICKET_CALENDAR_DRAFT: TicketCalendarDraft = {
  nombre: '',
  activo: true,
  diasTicket: [],
};

export function normalizeTicketDayRules(rules: DiaTicket[]): DiaTicket[] {
  const rulesByDate = new Map<string, DiaTicket>();

  rules.forEach((rule) => {
    const fecha = rule.fecha.trim();
    if (isIsoDate(fecha)) {
      rulesByDate.set(fecha, { fecha, tieneTicket: rule.tieneTicket });
    }
  });

  return Array.from(rulesByDate.values()).sort((first, second) =>
    first.fecha.localeCompare(second.fecha),
  );
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
    diasTicket: normalizeTicketDayRules(draft.diasTicket),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    deletedAt: previous?.deletedAt ?? null,
  };
}

export function visibleTicketCalendars(calendars: TicketCalendar[]): TicketCalendar[] {
  return calendars.filter((calendar) => !calendar.deletedAt);
}

export function activeTicketCalendars(calendars: TicketCalendar[]): TicketCalendar[] {
  return visibleTicketCalendars(calendars).filter((calendar) => calendar.activo);
}

export function assignPersonaCalendario(
  assignments: PersonaCalendario[],
  empleado: string,
  calendarId: string,
  createdAt: string,
): PersonaCalendario[] {
  const assignment: PersonaCalendario = { empleado, calendarId, createdAt };
  const exists = assignments.some((current) => current.empleado === empleado);

  if (!exists) {
    return [...assignments, assignment];
  }

  return assignments.map((current) => (current.empleado === empleado ? assignment : current));
}

export function removePersonaCalendario(
  assignments: PersonaCalendario[],
  empleado: string,
): PersonaCalendario[] {
  return assignments.filter((assignment) => assignment.empleado !== empleado);
}

export function countTicketDaysInMonth(calendar: TicketCalendar, month: string): number {
  return calendar.diasTicket.filter((day) => day.tieneTicket && day.fecha.startsWith(`${month}-`))
    .length;
}

export function calculateDerechosTicketMes({
  assignments,
  calendars,
  employees,
  month,
}: {
  assignments: PersonaCalendario[];
  calendars: TicketCalendar[];
  employees: Employee[];
  month: string;
}): DerechoTicketMes[] {
  const visibleEmployeesById = new Map(
    employees
      .filter((employee) => !employee.deletedAt)
      .map((employee) => [employee.empleado, employee]),
  );
  const calendarsById = new Map(
    visibleTicketCalendars(calendars).map((calendar) => [calendar.id, calendar]),
  );

  return assignments
    .map((assignment) => {
      const employee = visibleEmployeesById.get(assignment.empleado);
      const calendar = calendarsById.get(assignment.calendarId);

      if (!employee || !calendar) {
        return null;
      }

      return {
        empleado: employee.empleado,
        nombreApellidos: employee.nombreApellidos,
        calendario: calendar.nombre,
        diasTicketMes: countTicketDaysInMonth(calendar, month),
      };
    })
    .filter((right): right is DerechoTicketMes => right !== null)
    .sort((first, second) =>
      first.empleado.localeCompare(second.empleado, 'es', { numeric: true, sensitivity: 'base' }),
    );
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

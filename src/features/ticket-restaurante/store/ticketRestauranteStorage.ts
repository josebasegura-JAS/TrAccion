import {
  normalizeTicketEmployeeNumber,
  normalizeTicketIsoWeekdays,
  splitTicketPersonFullName,
  type TicketCalendar,
  type TicketPerson,
  type TicketRestaurantAbsence,
} from '../domain/ticketRestaurante';
import type { TicketManutencion } from '../domain/importManutenciones';
import type { TicketRestauranteSqliteRecord } from './ticketRestauranteSqliteRepository';

export function isTicketCalendar(value: unknown): value is TicketCalendar {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TicketCalendar>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.nombre === 'string' &&
    typeof candidate.activo === 'boolean' &&
    Array.isArray(candidate.diasSinTicket) &&
    candidate.diasSinTicket.every((fecha) => typeof fecha === 'string') &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    (typeof candidate.deletedAt === 'string' || candidate.deletedAt === null)
  );
}

export function isTicketPerson(value: unknown): value is TicketPerson {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TicketPerson>;
  return (
    typeof candidate.empleado === 'string' &&
    (typeof candidate.nombreApellidos === 'string' || typeof candidate.nombre === 'string') &&
    typeof candidate.puesto === 'string' &&
    typeof candidate.calendarId === 'string' &&
    typeof candidate.activo === 'boolean' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    (typeof candidate.deletedAt === 'string' || candidate.deletedAt === null)
  );
}

export function isTicketRestaurantAbsence(value: unknown): value is TicketRestaurantAbsence {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TicketRestaurantAbsence>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.empleado === 'string' &&
    typeof candidate.nombreApellidos === 'string' &&
    typeof candidate.desde === 'string' &&
    typeof candidate.hasta === 'string' &&
    typeof candidate.motivo === 'string' &&
    typeof candidate.totalDias === 'number' &&
    typeof candidate.afectaTicket === 'boolean' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    (typeof candidate.deletedAt === 'string' || candidate.deletedAt === null)
  );
}

export function isTicketManutencion(value: unknown): value is TicketManutencion {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TicketManutencion>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.empleado === 'string' &&
    typeof candidate.nombreApellidos === 'string' &&
    typeof candidate.fechaGasto === 'string' &&
    typeof candidate.origen === 'string' &&
    typeof candidate.afectaTicket === 'boolean' &&
    (typeof candidate.imputacionYear === 'number' || typeof candidate.imputacionYear === 'undefined') &&
    (typeof candidate.imputacionMonth === 'number' || typeof candidate.imputacionMonth === 'undefined') &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    (typeof candidate.deletedAt === 'string' || candidate.deletedAt === null)
  );
}

export function normalizeStoredTicketCalendar(calendar: TicketCalendar): TicketCalendar {
  return {
    ...calendar,
    ticketIsoWeekdays: normalizeTicketIsoWeekdays(calendar.ticketIsoWeekdays),
  };
}

export function normalizeStoredTicketPerson(person: TicketPerson): TicketPerson {
  const nombreApellidos =
    person.nombreApellidos ||
    [person.nombre, person.apellido1, person.apellido2].filter(Boolean).join(' ').trim();
  const splitName = splitTicketPersonFullName(nombreApellidos);

  return {
    ...person,
    empleado: normalizeTicketEmployeeNumber(person.empleado),
    nombre: person.nombre || splitName.nombre,
    apellido1: person.apellido1 || splitName.apellido1,
    apellido2: person.apellido2 || splitName.apellido2,
    dni: person.dni || '',
    nombreApellidos,
  };
}

export function normalizeStoredTicketManutencion(row: TicketManutencion, now = new Date()): TicketManutencion {
  return {
    ...row,
    imputacionYear:
      typeof row.imputacionYear === 'number' && Number.isInteger(row.imputacionYear)
        ? row.imputacionYear
        : now.getFullYear(),
    imputacionMonth:
      typeof row.imputacionMonth === 'number' && row.imputacionMonth >= 1 && row.imputacionMonth <= 12
        ? row.imputacionMonth
        : now.getMonth() + 1,
  };
}

function parseRecords<T>(
  records: readonly TicketRestauranteSqliteRecord[],
  guard: (value: unknown) => value is T,
): T[] {
  return records.flatMap((record) => {
    try {
      const parsed: unknown = JSON.parse(record.value);
      return guard(parsed) ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

export function parseTicketCalendarRecords(records: readonly TicketRestauranteSqliteRecord[]): TicketCalendar[] {
  return parseRecords(records, isTicketCalendar).map(normalizeStoredTicketCalendar);
}

export function parseTicketPersonRecords(records: readonly TicketRestauranteSqliteRecord[]): TicketPerson[] {
  return parseRecords(records, isTicketPerson).map(normalizeStoredTicketPerson);
}

export function parseTicketAbsenceRecords(records: readonly TicketRestauranteSqliteRecord[]): TicketRestaurantAbsence[] {
  return parseRecords(records, isTicketRestaurantAbsence);
}

export function parseTicketManutencionRecords(
  records: readonly TicketRestauranteSqliteRecord[],
  now = new Date(),
): TicketManutencion[] {
  return parseRecords(records, isTicketManutencion).map((row) => normalizeStoredTicketManutencion(row, now));
}

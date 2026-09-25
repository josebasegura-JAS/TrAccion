import { normalizeEmployeeNumber } from '../../plantilla/domain/employeeMaster';
import type { TicketPerson, TicketPersonDraft, TicketPersonDraftInput } from './ticketRestauranteTypes';

export function normalizeTicketEmployeeNumber(value: unknown): string {
  return normalizeEmployeeNumber(value);
}

export function sameTicketEmployee(first: string | undefined, second: string | undefined): boolean {
  return normalizeTicketEmployeeNumber(first) === normalizeTicketEmployeeNumber(second);
}

function cleanTicketPersonText(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

export function buildTicketPersonFullName(
  draft: Pick<TicketPersonDraftInput, 'nombre' | 'apellido1' | 'apellido2' | 'nombreApellidos'>,
): string {
  const partsName = [draft.nombre, draft.apellido1, draft.apellido2]
    .map(cleanTicketPersonText)
    .filter(Boolean)
    .join(' ');
  return partsName || cleanTicketPersonText(draft.nombreApellidos);
}

export function splitTicketPersonFullName(
  nombreApellidos: string,
): Pick<TicketPersonDraft, 'nombre' | 'apellido1' | 'apellido2'> {
  const cleaned = cleanTicketPersonText(nombreApellidos);
  const commaIndex = cleaned.indexOf(',');
  if (commaIndex >= 0) {
    const surnames = cleanTicketPersonText(cleaned.slice(0, commaIndex));
    const nombre = cleanTicketPersonText(cleaned.slice(commaIndex + 1));
    const surnameParts = surnames.split(' ').filter(Boolean);
    if (surnameParts.length <= 1) {
      return { nombre, apellido1: surnameParts[0] ?? '', apellido2: '' };
    }
    return {
      nombre,
      apellido1: surnameParts.slice(0, -1).join(' '),
      apellido2: surnameParts.at(-1) ?? '',
    };
  }

  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length <= 1) return { nombre: parts.join(' '), apellido1: '', apellido2: '' };
  if (parts.length === 2) return { nombre: parts[0] ?? '', apellido1: parts[1] ?? '', apellido2: '' };
  return {
    nombre: parts.slice(0, -2).join(' '),
    apellido1: parts.at(-2) ?? '',
    apellido2: parts.at(-1) ?? '',
  };
}

export function buildTicketPerson(
  draft: TicketPersonDraftInput,
  now: string,
  previous?: TicketPerson,
): TicketPerson {
  const nombre = cleanTicketPersonText(draft.nombre);
  const apellido1 = cleanTicketPersonText(draft.apellido1);
  const apellido2 = cleanTicketPersonText(draft.apellido2);
  const nombreApellidos = buildTicketPersonFullName({ ...draft, nombre, apellido1, apellido2 });

  return {
    empleado: normalizeTicketEmployeeNumber(draft.empleado),
    nombre,
    apellido1,
    apellido2,
    dni: cleanTicketPersonText(draft.dni),
    nombreApellidos,
    puesto: cleanTicketPersonText(draft.puesto),
    calendarId: draft.calendarId,
    activo: draft.activo,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function visibleTicketPeople(people: TicketPerson[]): TicketPerson[] {
  return people.filter((person) => !person.deletedAt);
}

function ticketPersonMonthFromTimestamp(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}`;
}

export function ticketPeopleExistingInMonth(
  people: readonly TicketPerson[],
  year: number,
  month: number,
): TicketPerson[] {
  const targetMonth = `${year}-${String(month).padStart(2, '0')}`;
  return people.filter((person) => {
    if (person.deletedAt) return false;
    const createdMonth = ticketPersonMonthFromTimestamp(person.createdAt);
    return createdMonth === null || createdMonth <= targetMonth;
  });
}

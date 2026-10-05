import type { CoordinationMeeting, CoordinationPointStatus } from './coordinacion';

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function pointStatusSearchText(status: CoordinationPointStatus): string {
  if (status === 'tratado') return 'tratado resuelto';
  if (status === 'seguimiento') return 'tratado seguimiento';
  if (status === 'volver') return 'volver proxima reunion';
  if (status === 'no-tratado') return 'no tratado';
  if (status === 'pendiente-rrll') return 'pendiente rrll';
  if (status === 'pendiente-sindicato') return 'pendiente sindicato';
  return 'pendiente';
}

function meetingAreaSearchText(meeting: CoordinationMeeting): string {
  if (meeting.area === 'direccion') return 'direccion';
  if (meeting.area === 'sindicatos') return `sindicatos sindicato ${meeting.unionName ?? ''}`;
  return `otras areas area ${meeting.areaName ?? ''}`;
}

export function meetingMatchesSearch(meeting: CoordinationMeeting, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const pointText = meeting.points.map((point) => [
    point.title,
    point.detail,
    point.result,
    point.responsible ?? '',
    point.dueDate ?? '',
    pointStatusSearchText(point.status),
  ].join(' ')).join(' ');

  const searchable = normalizeSearchText([
    meeting.title ?? '',
    meetingAreaSearchText(meeting),
    meeting.date,
    meeting.status === 'closed' ? 'cerrada cerrado historico' : 'abierta abierto',
    meeting.interlocutors ?? '',
    meeting.purpose ?? '',
    meeting.meetingType ?? '',
    pointText,
  ].join(' '));

  return normalizedQuery.split(/\s+/).every((term) => searchable.includes(term));
}

export function matchingMeetingPointTitles(meeting: CoordinationMeeting, query: string, limit = 2): string[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  const terms = normalizedQuery.split(/\s+/);
  return meeting.points
    .filter((point) => {
      const searchable = normalizeSearchText([
        point.title,
        point.detail,
        point.result,
        point.responsible ?? '',
        pointStatusSearchText(point.status),
      ].join(' '));
      return terms.some((term) => searchable.includes(term));
    })
    .slice(0, limit)
    .map((point) => point.title);
}

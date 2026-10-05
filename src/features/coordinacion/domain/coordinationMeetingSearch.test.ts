import { describe, expect, it } from 'vitest';
import { coordinationMeetingDisplayTitle, type CoordinationMeeting } from './coordinacion';
import { matchingMeetingPointTitles, meetingMatchesSearch } from './coordinationMeetingSearch';

const meeting: CoordinationMeeting = {
  id: 'm-1',
  title: 'Uniforme verano 2027',
  area: 'otras-areas',
  areaName: 'Prevención',
  interlocutors: 'Marta y RRLL',
  purpose: 'Revisar vestuario de verano',
  date: '2026-10-05',
  status: 'closed',
  createdAt: '2026-10-05T08:00:00.000Z',
  updatedAt: '2026-10-05T09:00:00.000Z',
  closedAt: '2026-10-05T09:00:00.000Z',
  points: [{
    id: 'p-1',
    origin: 'manual',
    taskId: null,
    title: 'Pantalón de verano',
    detail: 'Solicitar nuevas pruebas al proveedor',
    result: 'Probar tejido más transpirable',
    status: 'seguimiento',
    responsible: 'RRLL',
    dueDate: '2026-11-01',
    createdAt: '2026-10-05T08:00:00.000Z',
    updatedAt: '2026-10-05T09:00:00.000Z',
  }],
};

describe('coordinationMeetingSearch', () => {
  it('busca por el título de la reunión', () => {
    expect(meetingMatchesSearch(meeting, 'uniforme 2027')).toBe(true);
    expect(coordinationMeetingDisplayTitle(meeting)).toBe('Uniforme verano 2027');
  });
  it('busca en contexto, objetivo, interlocutores y estado de la reunión', () => {
    expect(meetingMatchesSearch(meeting, 'prevencion')).toBe(true);
    expect(meetingMatchesSearch(meeting, 'vestuario verano')).toBe(true);
    expect(meetingMatchesSearch(meeting, 'marta cerrada')).toBe(true);
  });

  it('busca dentro de títulos, detalles, acuerdos y responsables de los puntos', () => {
    expect(meetingMatchesSearch(meeting, 'pantalon transpirable')).toBe(true);
    expect(meetingMatchesSearch(meeting, 'proveedor rrll')).toBe(true);
    expect(matchingMeetingPointTitles(meeting, 'transpirable')).toEqual(['Pantalón de verano']);
  });

  it('ignora mayúsculas y tildes', () => {
    expect(meetingMatchesSearch(meeting, 'PREVENCION')).toBe(true);
  });
});


describe('coordinationMeetingDisplayTitle', () => {
  it('mantiene un fallback útil para reuniones antiguas sin título', () => {
    const legacy = { ...meeting, title: undefined, purpose: 'Objetivo histórico' };
    expect(coordinationMeetingDisplayTitle(legacy)).toBe('Objetivo histórico');
  });
});

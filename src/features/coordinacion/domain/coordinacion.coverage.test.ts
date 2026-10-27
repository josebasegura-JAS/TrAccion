import { describe, expect, it, vi } from 'vitest';
import type { CoordinationMeeting } from './coordinacion';
import { coordinationMeetingDisplayTitle, createCoordinationId, formatCoordinationDate } from './coordinacion';

function meeting(overrides: Partial<CoordinationMeeting> = {}): CoordinationMeeting {
  return {
    id: 'm-1',
    area: 'direccion',
    date: '2026-10-27',
    status: 'open',
    points: [],
    createdAt: '2026-10-27T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
    closedAt: null,
    ...overrides,
  };
}

describe('Coordinación: títulos, fechas e identificadores', () => {
  it('prioriza título explícito sobre propósito y puntos', () => {
    expect(coordinationMeetingDisplayTitle(meeting({
      title: '  Reunión especial  ', purpose: 'Propósito secundario',
      points: [{ id: 'p', origin: 'manual', taskId: null, title: 'Punto', detail: '', result: '', status: 'pendiente', createdAt: '', updatedAt: '' }],
    }))).toBe('Reunión especial');
  });

  it('usa el propósito cuando no hay título', () => {
    expect(coordinationMeetingDisplayTitle(meeting({ title: ' ', purpose: '  Negociación  ' }))).toBe('Negociación');
  });

  it('usa el primer punto si faltan título y propósito', () => {
    expect(coordinationMeetingDisplayTitle(meeting({
      points: [{ id: 'p', origin: 'manual', taskId: null, title: '  Pendientes  ', detail: '', result: '', status: 'pendiente', createdAt: '', updatedAt: '' }],
    }))).toBe('Pendientes');
  });

  it('genera títulos alternativos para dirección, sindicatos y otras áreas', () => {
    expect(coordinationMeetingDisplayTitle(meeting())).toContain('Reunión con Dirección');
    expect(coordinationMeetingDisplayTitle(meeting({ area: 'sindicatos', unionName: 'LAB' }))).toContain('Reunión con LAB');
    expect(coordinationMeetingDisplayTitle(meeting({ area: 'sindicatos' }))).toContain('Reunión con sindicato');
    expect(coordinationMeetingDisplayTitle(meeting({ area: 'otras-areas', areaName: 'Operaciones' }))).toContain('Reunión con Operaciones');
    expect(coordinationMeetingDisplayTitle(meeting({ area: 'otras-areas' }))).toContain('Reunión con otra área');
  });

  it('respeta fechas ausentes o inválidas sin inventar fechas', () => {
    expect(formatCoordinationDate('')).toBe('Sin fecha');
    expect(formatCoordinationDate('no-es-una-fecha')).toBe('no-es-una-fecha');
  });

  it('crea identificadores con el prefijo indicado', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      expect(createCoordinationId('reunion')).toMatch(/^reunion-[a-z0-9]+-[a-z0-9]+$/);
    } finally {
      random.mockRestore();
    }
  });
});

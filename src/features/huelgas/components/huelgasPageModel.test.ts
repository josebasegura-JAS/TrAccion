import { describe, expect, it } from 'vitest';
import { EMPTY_DRAFT, reconcilePreparedCommunications, validateDraft } from './huelgasPageModel';

describe('huelgasPageModel', () => {
  it('valida los campos obligatorios de la convocatoria', () => {
    expect(validateDraft(EMPTY_DRAFT)).toBe('Indica la fecha de la huelga.');

    expect(validateDraft({
      ...EMPTY_DRAFT,
      fecha: '2026-10-16',
    })).toBe('Selecciona al menos un sindicato convocante.');

    expect(validateDraft({
      ...EMPTY_DRAFT,
      fecha: '2026-10-16',
      sindicatos: ['ELA'],
    })).toBe('Selecciona al menos un circuito de recogida.');
  });

  it('valida los tramos de paros parciales', () => {
    const base = {
      ...EMPTY_DRAFT,
      fecha: '2026-10-16',
      sindicatos: ['ELA'],
      circuitosZonaIds: ['zona-a'],
      tipo: 'paros-parciales' as const,
    };

    expect(validateDraft(base)).toBe('Añade al menos un tramo horario para los paros parciales.');
    expect(validateDraft({
      ...base,
      tramos: [{ id: '1', inicio: '08:00', fin: '' }],
    })).toBe('Completa la hora de inicio y fin de todos los tramos.');
    expect(validateDraft({
      ...base,
      tramos: [{ id: '1', inicio: '09:00', fin: '08:00' }],
    })).toBe('La hora de fin de cada tramo debe ser posterior a la de inicio.');
    expect(validateDraft({
      ...base,
      tramos: [{ id: '1', inicio: '08:00', fin: '09:00' }],
    })).toBeNull();
  });

  it('rechaza tramos parciales solapados aunque estén desordenados', () => {
    expect(validateDraft({
      ...EMPTY_DRAFT,
      fecha: '2026-10-16',
      sindicatos: ['ELA'],
      circuitosZonaIds: ['zona-a'],
      tipo: 'paros-parciales',
      tramos: [
        { id: '2', inicio: '08:30', fin: '10:00' },
        { id: '1', inicio: '07:00', fin: '09:00' },
      ],
    })).toBe('Hay tramos de paro que se solapan. Revisa los horarios de la convocatoria.');
  });

  it('permite tramos parciales consecutivos sin solapamiento', () => {
    expect(validateDraft({
      ...EMPTY_DRAFT,
      fecha: '2026-10-16',
      sindicatos: ['ELA'],
      circuitosZonaIds: ['zona-a'],
      tipo: 'paros-parciales',
      tramos: [
        { id: '1', inicio: '07:00', fin: '09:00' },
        { id: '2', inicio: '09:00', fin: '10:00' },
      ],
    })).toBeNull();
  });

  it('invalida comunicaciones preparadas cuando cambian datos relevantes', () => {
    const current = {
      id: 'h1',
      fecha: '2026-10-16',
      sindicatos: ['ELA'],
      tipo: 'jornada-completa' as const,
      tramos: [],
      observaciones: '',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      circuitosZonaIds: ['zona-a'],
      correosPreparadosPorZona: { 'zona-a': '2026-10-01T00:00:00.000Z' },
    };

    expect(reconcilePreparedCommunications(current, {
      fecha: '2026-10-17',
      sindicatos: ['ELA'],
      tipo: 'jornada-completa',
      tramos: [],
      observaciones: '',
      circuitosZonaIds: ['zona-a'],
    })).toEqual({});
  });
});

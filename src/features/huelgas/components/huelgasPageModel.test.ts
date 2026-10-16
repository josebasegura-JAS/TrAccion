import { describe, expect, it } from 'vitest';
import {
  reconcilePreparedCommunications,
  validateDraft,
  type Huelga,
  type HuelgaDraft,
} from './huelgasPageModel';

function draft(overrides: Partial<HuelgaDraft> = {}): HuelgaDraft {
  return {
    fecha: '2026-10-16',
    sindicatos: ['ELA'],
    tipo: 'jornada-completa',
    tramos: [],
    observaciones: '',
    circuitosZonaIds: ['zona-a'],
    ...overrides,
  };
}

function huelga(overrides: Partial<Huelga> = {}): Huelga {
  return {
    id: 'huelga-1',
    fecha: '2026-10-16',
    sindicatos: ['ELA'],
    tipo: 'jornada-completa',
    tramos: [],
    observaciones: '',
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
    circuitosZonaIds: ['zona-a'],
    ...overrides,
  };
}

describe('validateDraft', () => {
  it('acepta una convocatoria completa válida', () => {
    expect(validateDraft(draft())).toBeNull();
  });

  it('rechaza tramos parciales incompletos o invertidos', () => {
    expect(validateDraft(draft({ tipo: 'paros-parciales', tramos: [] }))).toContain('Añade');
    expect(validateDraft(draft({
      tipo: 'paros-parciales',
      tramos: [{ id: 't1', inicio: '10:00', fin: '09:00' }],
    }))).toContain('posterior');
  });

  it('rechaza tramos parciales que se solapan aunque estén introducidos desordenados', () => {
    expect(validateDraft(draft({
      tipo: 'paros-parciales',
      tramos: [
        { id: 't2', inicio: '08:30', fin: '10:00' },
        { id: 't1', inicio: '07:00', fin: '09:00' },
      ],
    }))).toContain('solapan');
  });

  it('permite tramos consecutivos que no se solapan', () => {
    expect(validateDraft(draft({
      tipo: 'paros-parciales',
      tramos: [
        { id: 't1', inicio: '07:00', fin: '09:00' },
        { id: 't2', inicio: '09:00', fin: '10:00' },
      ],
    }))).toBeNull();
  });
});

describe('reconcilePreparedCommunications', () => {
  it('conserva comunicaciones de circuitos que siguen seleccionados', () => {
    const current = huelga({ correosPreparadosPorZona: { 'zona-a': 'x', 'zona-b': 'y' } });
    expect(reconcilePreparedCommunications(current, draft({ circuitosZonaIds: ['zona-a'] }))).toEqual({ 'zona-a': 'x' });
  });

  it('invalida comunicaciones si cambia fecha, tipo o tramos', () => {
    const current = huelga({ correosPreparadosPorZona: { 'zona-a': 'x' } });
    expect(reconcilePreparedCommunications(current, draft({ fecha: '2026-10-17' }))).toEqual({});
  });
});

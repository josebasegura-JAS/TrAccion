import { describe, expect, it } from 'vitest';
import { convocatoriaLabel, huelgaStatus, isHuelga, reconcilePreparedCommunications, validateDraft, type Huelga, type HuelgaDraft } from './huelgasPageModel';

const baseDraft: HuelgaDraft = {
  fecha: '2026-10-01',
  sindicatos: ['ELA'],
  tipo: 'jornada-completa',
  tramos: [],
  observaciones: '',
  circuitosZonaIds: ['zona-mm-ariz'],
};

const baseHuelga: Huelga = {
  id: 'h1',
  ...baseDraft,
  createdAt: '2026-09-25T08:00:00.000Z',
  updatedAt: '2026-09-25T08:00:00.000Z',
  correosPreparadosPorZona: {
    'zona-mm-ariz': '2026-09-25T09:00:00.000Z',
    'zona-pmc': '2026-09-25T09:01:00.000Z',
  },
};

describe('huelgasPageModel', () => {
  it('valida los campos obligatorios de una convocatoria', () => {
    expect(validateDraft({ ...baseDraft, fecha: '' })).toBe('Indica la fecha de la huelga.');
    expect(validateDraft({ ...baseDraft, sindicatos: [] })).toBe('Selecciona al menos un sindicato convocante.');
    expect(validateDraft({ ...baseDraft, circuitosZonaIds: [] })).toBe('Selecciona al menos un circuito de recogida.');
    expect(validateDraft(baseDraft)).toBeNull();
  });

  it('valida los tramos de los paros parciales', () => {
    expect(validateDraft({ ...baseDraft, tipo: 'paros-parciales', tramos: [] })).toBe('Añade al menos un tramo horario para los paros parciales.');
    expect(validateDraft({ ...baseDraft, tipo: 'paros-parciales', tramos: [{ id: '1', inicio: '10:00', fin: '09:00' }] })).toBe('La hora de fin de cada tramo debe ser posterior a la de inicio.');
    expect(validateDraft({ ...baseDraft, tipo: 'paros-parciales', tramos: [{ id: '1', inicio: '09:00', fin: '10:00' }] })).toBeNull();
  });

  it('genera la etiqueta de convocatoria sin cambiar el formato previo', () => {
    expect(convocatoriaLabel(baseDraft)).toBe('Jornada completa');
    expect(convocatoriaLabel({ tipo: 'paros-parciales', tramos: [{ id: '1', inicio: '09:00', fin: '10:30' }] })).toBe('09:00–10:30');
  });

  it('rechaza registros incompletos al hidratar huelgas y mantiene compatibilidad con registros anteriores', () => {
    expect(isHuelga({ id: 'h1' })).toBe(false);
    expect(isHuelga({
      id: 'h1',
      fecha: '2026-10-01',
      sindicatos: ['ELA'],
      tipo: 'jornada-completa',
      tramos: [],
      observaciones: '',
      createdAt: '2026-09-25T08:00:00.000Z',
      updatedAt: '2026-09-25T08:00:00.000Z',
    })).toBe(true);
  });

  it('invalida todas las comunicaciones preparadas si cambia fecha, tipo o tramos', () => {
    expect(reconcilePreparedCommunications(baseHuelga, { ...baseDraft, fecha: '2026-10-02' })).toEqual({});
    expect(reconcilePreparedCommunications(baseHuelga, { ...baseDraft, tipo: 'paros-parciales', tramos: [{ id: 't1', inicio: '09:00', fin: '10:00' }] })).toEqual({});
  });

  it('mantiene únicamente comunicaciones de circuitos que continúan seleccionados', () => {
    expect(reconcilePreparedCommunications(baseHuelga, { ...baseDraft, circuitosZonaIds: ['zona-mm-ariz'] })).toEqual({
      'zona-mm-ariz': '2026-09-25T09:00:00.000Z',
    });
  });

  it('clasifica una fecha pasada como finalizada', () => {
    expect(huelgaStatus('2000-01-01')).toBe('Finalizada');
  });
});

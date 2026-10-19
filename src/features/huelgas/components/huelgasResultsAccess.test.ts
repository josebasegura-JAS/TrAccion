import { describe, expect, it } from 'vitest';
import { isHuelgaResultsReady, isHuelgaResultsComplete, usableHuelgaResultsCollection } from './huelgasResultsAccess';
import { emptyZoneResponse, type HuelgaResponseCollection } from './huelgasResponseCollection';
import type { Huelga } from './huelgasPageModel';

function response(zoneId: string) {
  return {
    ...emptyZoneResponse(zoneId, zoneId),
    sourceFileName: `${zoneId}.xlsx`,
    importedAt: '2026-10-16T08:00:00.000Z',
    personasTurno: 10,
    serviciosMinimos: 1,
    personasTrabajan: 7,
    personasHuelga: 2,
    reviewed: true,
  };
}

function collection(zoneIds: string[]): HuelgaResponseCollection {
  return {
    huelgaId: 'h1',
    responses: Object.fromEntries(zoneIds.map((zoneId) => [zoneId, response(zoneId)])),
    updatedAt: '2026-10-16T08:30:00.000Z',
  };
}

const huelga: Huelga = {
  id: 'h1',
  fecha: '2026-10-16',
  sindicatos: ['ELA'],
  tipo: 'jornada-completa',
  tramos: [],
  observaciones: '',
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
  circuitosZonaIds: ['zona-a'],
};

describe('isHuelgaResultsReady', () => {
  it('acepta una colección validada con los circuitos actuales y SSGG interno', () => {
    expect(isHuelgaResultsReady(
      collection(['zona-a', 'zona-ssgg-interno']),
      huelga,
      [],
    )).toBe(true);
  });

  it('permite resultados parciales si se añade un circuito después de guardar la recogida', () => {
    expect(isHuelgaResultsReady(
      collection(['zona-a', 'zona-ssgg-interno']),
      { ...huelga, circuitosZonaIds: ['zona-a', 'zona-b'] },
      [],
    )).toBe(true);
  });

  it('mantiene acceso a resultados aunque la recogida conserve un circuito retirado', () => {
    expect(isHuelgaResultsReady(
      collection(['zona-a', 'zona-b', 'zona-ssgg-interno']),
      huelga,
      [],
    )).toBe(true);
  });
  it('excluye del informe los circuitos pendientes de revisión o con datos incoherentes', () => {
    const pending = { ...response('zona-b'), reviewed: false };
    const invalid = { ...response('zona-c'), personasTurno: 2 };
    const collectionWithPending: HuelgaResponseCollection = {
      ...collection(['zona-a']),
      responses: { 'zona-a': response('zona-a'), 'zona-b': pending, 'zona-c': invalid },
    };
    const usable = usableHuelgaResultsCollection(collectionWithPending);
    expect(Object.keys(usable?.responses ?? {})).toEqual(['zona-a']);
    expect(isHuelgaResultsReady(collectionWithPending, huelga, [])).toBe(true);
    expect(isHuelgaResultsComplete(collectionWithPending, huelga, [])).toBe(false);
  });

  it('bloquea resultados si no hay ningún circuito revisado y válido', () => {
    const pending = { ...response('zona-a'), reviewed: false };
    const noReviewed = { ...collection(['zona-a']), responses: { 'zona-a': pending } };
    expect(usableHuelgaResultsCollection(noReviewed)).toBeNull();
    expect(isHuelgaResultsReady(noReviewed, huelga, [])).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { isHuelgaResultsReady } from './huelgasResultsAccess';
import type { Huelga } from './huelgasPageModel';
import type { HuelgaResponseCollection, HuelgaZoneResponse } from './huelgasResponseCollection';
import type { HuelgaZona } from './huelgasZones';

function response(zoneId: string, reviewed = true): HuelgaZoneResponse {
  return {
    zonaId: zoneId,
    zonaNombre: zoneId,
    sourceFileName: `${zoneId}.xlsx`,
    importedAt: '2026-10-16T08:00:00.000Z',
    personasTurno: 10,
    serviciosMinimos: 1,
    personasTrabajan: 7,
    personasHuelga: 2,
    huelguistas: [],
    warnings: [],
    reviewed,
    generalDetail: [],
  };
}

function collection(responses: HuelgaZoneResponse[]): HuelgaResponseCollection {
  return {
    huelgaId: 'h1',
    responses: Object.fromEntries(responses.map((item) => [item.zonaId, item])),
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

const zonas: HuelgaZona[] = [{
  id: 'zona-a',
  nombre: 'Zona A',
  responsableNombre: 'Responsable',
  responsableEmail: 'responsable@example.com',
  correoCc: '',
  correoActivo: true,
  correoAsunto: '',
  correoCuerpoHtml: '',
  correoPlazos: '',
  correoInstruccionesHabituales: '',
  plantillaExcelNombrePatron: 'zona-a.xlsx',
  active: true,
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
}];

describe('isHuelgaResultsReady', () => {
  it('acepta una colección validada con los circuitos actuales y SSGG interno', () => {
    expect(isHuelgaResultsReady(
      collection([response('zona-a'), response('zona-ssgg-interno')]),
      huelga,
      zonas,
    )).toBe(true);
  });

  it('invalida resultados si se añade un circuito después de guardar la recogida', () => {
    expect(isHuelgaResultsReady(
      collection([response('zona-a'), response('zona-ssgg-interno')]),
      { ...huelga, circuitosZonaIds: ['zona-a', 'zona-b'] },
      zonas,
    )).toBe(false);
  });

  it('invalida resultados si la colección conserva un circuito ya retirado', () => {
    expect(isHuelgaResultsReady(
      collection([response('zona-a'), response('zona-b'), response('zona-ssgg-interno')]),
      huelga,
      zonas,
    )).toBe(false);
  });
});

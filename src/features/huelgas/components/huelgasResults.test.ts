import { describe, expect, it } from 'vitest';
import type { HuelgaResponseCollection, HuelgaZoneResponse } from './huelgasResponseCollection';
import { buildHuelgaResults } from './huelgasResults';

function response(
  zonaId: string,
  zonaNombre: string,
  noche: { trabajan: number; huelga: number; minimos: number },
  manana: { trabajan: number; huelga: number; minimos: number },
  tarde: { trabajan: number; huelga: number; minimos: number },
): HuelgaZoneResponse {
  const detail = ([
    ['noche', noche],
    ['manana', manana],
    ['tarde', tarde],
  ] as const).map(([turno, values]) => ({
    turno,
    colectivo: zonaNombre,
    trabajan: { hombres: values.trabajan, mujeres: 0 },
    huelga: { hombres: values.huelga, mujeres: 0 },
    serviciosMinimos: { hombres: values.minimos, mujeres: 0 },
    personasTurno: { hombres: values.trabajan + values.huelga + values.minimos, mujeres: 0 },
  }));
  const personasTrabajan = detail.reduce((sum, row) => sum + row.trabajan.hombres, 0);
  const personasHuelga = detail.reduce((sum, row) => sum + row.huelga.hombres, 0);
  const serviciosMinimos = detail.reduce((sum, row) => sum + row.serviciosMinimos.hombres, 0);
  return {
    zonaId,
    zonaNombre,
    sourceFileName: `${zonaId}.xlsx`,
    importedAt: '2026-10-15T10:00:00.000Z',
    personasTurno: personasTrabajan + personasHuelga + serviciosMinimos,
    serviciosMinimos,
    personasTrabajan,
    personasHuelga,
    huelguistas: [],
    observaciones: '',
    reviewed: true,
    warnings: [],
    generalDetail: detail,
  };
}

describe('buildHuelgaResults', () => {
  it('excludes minimum services from the computable population', () => {
    const collection: HuelgaResponseCollection = {
      huelgaId: 'h-1',
      updatedAt: '2026-10-15T10:00:00.000Z',
      responses: {
        a: response('a', 'Línea', { trabajan: 60, huelga: 20, minimos: 20 }, { trabajan: 0, huelga: 0, minimos: 0 }, { trabajan: 0, huelga: 0, minimos: 0 }),
      },
    };

    const results = buildHuelgaResults(collection);
    expect(results.noche.totals.personasTurno).toBe(100);
    expect(results.noche.totals.personasComputables).toBe(80);
    expect(results.noche.totals.seguimiento).toBe(25);
  });

  it('calculates the global percentage from people instead of averaging area percentages', () => {
    const collection: HuelgaResponseCollection = {
      huelgaId: 'h-2',
      updatedAt: '2026-10-15T10:00:00.000Z',
      responses: {
        a: response('a', 'Área grande', { trabajan: 80, huelga: 20, minimos: 0 }, { trabajan: 0, huelga: 0, minimos: 0 }, { trabajan: 0, huelga: 0, minimos: 0 }),
        b: response('b', 'Área pequeña', { trabajan: 0, huelga: 10, minimos: 0 }, { trabajan: 0, huelga: 0, minimos: 0 }, { trabajan: 0, huelga: 0, minimos: 0 }),
      },
    };

    const results = buildHuelgaResults(collection);
    expect(results.global.totals.personasComputables).toBe(110);
    expect(results.global.totals.personasHuelga).toBe(30);
    expect(results.global.totals.seguimiento).toBeCloseTo(27.2727, 3);
    expect(results.global.totals.seguimiento).not.toBe(60);
  });

  it('keeps night, morning and afternoon separated while global consolidates all shifts', () => {
    const collection: HuelgaResponseCollection = {
      huelgaId: 'h-3',
      updatedAt: '2026-10-15T10:00:00.000Z',
      responses: {
        a: response('a', 'Operación', { trabajan: 9, huelga: 1, minimos: 2 }, { trabajan: 16, huelga: 4, minimos: 5 }, { trabajan: 7, huelga: 3, minimos: 1 }),
      },
    };

    const results = buildHuelgaResults(collection);
    expect(results.noche.totals.personasHuelga).toBe(1);
    expect(results.manana.totals.personasHuelga).toBe(4);
    expect(results.tarde.totals.personasHuelga).toBe(3);
    expect(results.global.totals.personasHuelga).toBe(8);
    expect(results.global.totals.personasComputables).toBe(40);
    expect(results.global.totals.seguimiento).toBe(20);
  });
});

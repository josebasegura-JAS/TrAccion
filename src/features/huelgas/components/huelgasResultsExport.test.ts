import { describe, expect, it } from 'vitest';
import type { HuelgaResponseCollection } from './huelgasResponseCollection';
import { buildHuelgaExcelRows } from './huelgasResultsExport';

describe('buildHuelgaExcelRows', () => {
  it('calcula hombres, mujeres y total como la plantilla operativa de seguimiento', () => {
    const collection: HuelgaResponseCollection = {
      huelgaId: 'h-plantilla',
      updatedAt: '2026-10-15T10:00:00.000Z',
      responses: {
        conduccion: {
          zonaId: 'conduccion',
          zonaNombre: 'Conducción',
          sourceFileName: 'conduccion.xlsx',
          importedAt: '2026-10-15T10:00:00.000Z',
          personasTurno: 42,
          serviciosMinimos: 14,
          personasTrabajan: 22,
          personasHuelga: 6,
          huelguistas: [],
          observaciones: '',
          reviewed: true,
          warnings: [],
          generalDetail: [
            {
              turno: 'tarde',
              colectivo: 'Conducción',
              personasTurno: { hombres: 31, mujeres: 11 },
              trabajan: { hombres: 17, mujeres: 5 },
              huelga: { hombres: 2, mujeres: 4 },
              serviciosMinimos: { hombres: 12, mujeres: 2 },
            },
          ],
        },
      },
    };

    const [row] = buildHuelgaExcelRows(collection, 'tarde');
    expect(row.personasTurno).toEqual({ hombres: 31, mujeres: 11, total: 42 });
    expect(row.trabajan).toEqual({ hombres: 17, mujeres: 5, total: 22 });
    expect(row.huelga).toEqual({ hombres: 2, mujeres: 4, total: 6 });
    expect(row.serviciosMinimos).toEqual({ hombres: 12, mujeres: 2, total: 14 });
    expect(row.seguimiento.hombres).toBeCloseTo(0.064516, 5);
    expect(row.seguimiento.mujeres).toBeCloseTo(0.363636, 5);
    expect(row.seguimiento.total).toBeCloseTo(0.142857, 5);
  });
});

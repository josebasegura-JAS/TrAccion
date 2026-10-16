import { describe, expect, it } from 'vitest';
import type { ParsedHuelgaResponse } from './huelgasResponseCollection';
import { normalizeParsedHuelgaResponseTotals } from './huelgasParsedResponseTotals';

const AUTO_WARNINGS = [
  'No se ha localizado automáticamente el total de personas con turno.',
  'No se ha localizado automáticamente el total de servicios mínimos.',
  'No se ha localizado automáticamente el total de personas que trabajan.',
  'No se ha localizado automáticamente el total de personas en huelga.',
];

describe('normalizeParsedHuelgaResponseTotals', () => {
  it('calcula los cuatro totales desde el detalle H/M y elimina los avisos de total ya resueltos', () => {
    const parsed: ParsedHuelgaResponse = {
      personasTurno: null,
      serviciosMinimos: null,
      personasTrabajan: null,
      personasHuelga: null,
      huelguistas: [],
      warnings: [...AUTO_WARNINGS, 'Aviso independiente que sí debe conservarse.'],
      generalDetail: [
        {
          turno: 'manana',
          colectivo: 'OAC',
          personasTurno: { mujeres: 8, hombres: 7 },
          serviciosMinimos: { mujeres: 1, hombres: 2 },
          trabajan: { mujeres: 5, hombres: 4 },
          huelga: { mujeres: 2, hombres: 1 },
        },
      ],
    };

    const result = normalizeParsedHuelgaResponseTotals(parsed);

    expect(result.personasTurno).toBe(15);
    expect(result.serviciosMinimos).toBe(3);
    expect(result.personasTrabajan).toBe(9);
    expect(result.personasHuelga).toBe(3);
    expect(result.warnings).toEqual(['Aviso independiente que sí debe conservarse.']);
  });

  it('considera cero un total válido cuando el detalle indica cero huelguistas', () => {
    const parsed: ParsedHuelgaResponse = {
      personasTurno: null,
      serviciosMinimos: null,
      personasTrabajan: null,
      personasHuelga: null,
      huelguistas: [],
      warnings: [...AUTO_WARNINGS],
      generalDetail: [
        {
          turno: 'tarde',
          colectivo: 'PMC',
          personasTurno: { mujeres: 4, hombres: 6 },
          serviciosMinimos: { mujeres: 1, hombres: 1 },
          trabajan: { mujeres: 3, hombres: 5 },
          huelga: { mujeres: 0, hombres: 0 },
        },
      ],
    };

    const result = normalizeParsedHuelgaResponseTotals(parsed);

    expect(result.personasHuelga).toBe(0);
    expect(result.warnings).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import type { HuelgaZoneResponse } from './huelgasResponseCollection';
import { resolveHuelgaIssueNavigation } from './huelgaIssueNavigation';

const responses: HuelgaZoneResponse[] = [
  {
    zonaId: 'zona-gmo',
    zonaNombre: 'GMO y Línea',
    sourceFileName: 'gmo.xlsx',
    importedAt: '2026-10-16T08:00:00.000Z',
    personasTurno: 10,
    serviciosMinimos: 1,
    personasTrabajan: 7,
    personasHuelga: 2,
    huelguistas: [{ empleado: '00123', nombre: 'Persona Uno' }],
    observaciones: '',
    reviewed: false,
    warnings: [],
  },
];

describe('resolveHuelgaIssueNavigation', () => {
  it('mantiene el circuito y dirige los errores de totales al campo correspondiente', () => {
    expect(resolveHuelgaIssueNavigation({
      severity: 'error',
      zonaId: 'zona-gmo',
      message: 'Falta personas con turno.',
    }, responses)).toMatchObject({ zoneId: 'zona-gmo', target: 'personasTurno' });
  });

  it('dirige incoherencias del desglose al editor H/M', () => {
    expect(resolveHuelgaIssueNavigation({
      severity: 'error',
      zonaId: 'zona-gmo',
      message: 'Desglose duplicado: Operación, turno mañana.',
    }, responses)).toMatchObject({ zoneId: 'zona-gmo', target: 'detail' });
  });

  it('resuelve el circuito a partir del empleado en incidencias globales', () => {
    expect(resolveHuelgaIssueNavigation({
      severity: 'error',
      empleado: '00123',
      message: 'El empleado 00123 figura en huelga en varios circuitos.',
    }, responses)).toMatchObject({ zoneId: 'zona-gmo', target: 'huelguistas', employee: '00123' });
  });
});

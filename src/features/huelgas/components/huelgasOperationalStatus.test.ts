import { describe, expect, it } from 'vitest';
import type { HuelgaResponseCollection, HuelgaZoneResponse } from './huelgasResponseCollection';
import { deriveHuelgaOperationalStatus } from './huelgasOperationalStatus';

function response(overrides: Partial<HuelgaZoneResponse> = {}): HuelgaZoneResponse {
  return {
    zonaId: 'zona-a',
    zonaNombre: 'Zona A',
    sourceFileName: 'respuesta.xlsx',
    importedAt: '2026-10-16T07:00:00.000Z',
    personasTurno: 10,
    serviciosMinimos: 1,
    personasTrabajan: 7,
    personasHuelga: 2,
    huelguistas: [],
    observaciones: '',
    reviewed: false,
    warnings: [],
    ...overrides,
  };
}

function collection(responses: HuelgaZoneResponse[]): HuelgaResponseCollection {
  return {
    huelgaId: 'h1',
    responses: Object.fromEntries(responses.map((item) => [item.zonaId, item])),
    updatedAt: '2026-10-16T07:05:00.000Z',
  };
}

describe('deriveHuelgaOperationalStatus', () => {
  it('clasifica como preparación cuando todavía no hay respuestas', () => {
    const status = deriveHuelgaOperationalStatus(
      { total: 2, received: 0, reviewed: 0 },
      null,
      ['zona-a'],
    );
    expect(status.state).toBe('preparacion');
    expect(status.label).toBe('Preparación');
  });

  it('clasifica como recogida cuando faltan respuestas y no hay errores', () => {
    const status = deriveHuelgaOperationalStatus(
      { total: 3, received: 1, reviewed: 0 },
      collection([response()]),
      ['zona-a', 'zona-b'],
    );
    expect(status.state).toBe('recogida');
  });

  it('prioriza incidencias bloqueantes sobre el progreso de recepción', () => {
    const invalid = response({ personasTurno: 10, serviciosMinimos: 1, personasTrabajan: 8, personasHuelga: 3 });
    const status = deriveHuelgaOperationalStatus(
      { total: 3, received: 1, reviewed: 0 },
      collection([invalid]),
      ['zona-a', 'zona-b'],
    );
    expect(status.state).toBe('incidencias');
    expect(status.errors).toBeGreaterThan(0);
  });

  it('clasifica como pendiente de revisión cuando todo está recibido pero falta revisar', () => {
    const status = deriveHuelgaOperationalStatus(
      { total: 1, received: 1, reviewed: 0 },
      collection([response()]),
      ['zona-a'],
    );
    expect(status.state).toBe('revision');
  });

  it('clasifica como validada cuando todo está recibido, revisado y sin errores', () => {
    const status = deriveHuelgaOperationalStatus(
      { total: 1, received: 1, reviewed: 1 },
      collection([response({ reviewed: true })]),
      ['zona-a'],
    );
    expect(status.state).toBe('validada');
    expect(status.errors).toBe(0);
  });

  it('detecta duplicados nominales entre circuitos como incidencia global', () => {
    const first = response({
      huelguistas: [{ empleado: '1234', nombre: 'Persona Uno' }],
      personasHuelga: 1,
      personasTrabajan: 8,
    });
    const second = response({
      zonaId: 'zona-b',
      zonaNombre: 'Zona B',
      huelguistas: [{ empleado: '1234', nombre: 'Persona Uno' }],
      personasHuelga: 1,
      personasTrabajan: 8,
    });
    const status = deriveHuelgaOperationalStatus(
      { total: 2, received: 2, reviewed: 0 },
      collection([first, second]),
      ['zona-a', 'zona-b'],
    );
    expect(status.state).toBe('incidencias');
    expect(status.errors).toBeGreaterThan(0);
  });
});

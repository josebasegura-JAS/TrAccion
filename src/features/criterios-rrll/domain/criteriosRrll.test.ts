import { describe, expect, it } from 'vitest';
import type { CriterioRrll } from './criterioRrll';
import { filterCriteriosRrll } from './filters';
import { sortCriteriosRrllByColumn, sortCriteriosRrllByDefault } from './sort';

function buildCriterio(overrides: Partial<CriterioRrll>): CriterioRrll {
  return {
    id: 'criterio-1',
    tema: 'Calendario laboral',
    criterio: 'Aplicar calendario vigente.',
    estado: 'vigente',
    fecha: '2026-02-01',
    responsable: 'RRLL',
    observaciones: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('criterios RRLL domain', () => {
  const criterios: CriterioRrll[] = [
    buildCriterio({ id: 'criterio-1', tema: 'Calendario laboral', estado: 'vigente' }),
    buildCriterio({
      id: 'criterio-2',
      tema: 'Permisos retribuidos',
      criterio: 'Validar justificante antes de aplicar el criterio.',
      estado: 'en revisión',
      fecha: '2026-03-15',
      responsable: 'Administración',
    }),
    buildCriterio({
      id: 'criterio-3',
      tema: 'Baja médica',
      criterio: 'Criterio archivado.',
      estado: 'archivado',
      fecha: '',
      deletedAt: '2026-04-01T00:00:00.000Z',
    }),
  ];

  it('busca por tema, criterio u observaciones', () => {
    expect(filterCriteriosRrll(criterios, { search: 'justificante', estado: '' })).toEqual([
      criterios[1],
    ]);
  });

  it('filtra por estado', () => {
    expect(filterCriteriosRrll(criterios, { search: '', estado: 'vigente' })).toEqual([
      criterios[0],
    ]);
  });

  it('ordena por columna manteniendo estabilidad', () => {
    expect(sortCriteriosRrllByColumn(criterios.slice(0, 2), 'tema', 'asc').map(({ id }) => id)).toEqual([
      'criterio-1',
      'criterio-2',
    ]);
    expect(sortCriteriosRrllByColumn(criterios.slice(0, 2), 'tema', 'desc').map(({ id }) => id)).toEqual([
      'criterio-2',
      'criterio-1',
    ]);
  });

  it('ordena por defecto por fecha descendente con fechas vacías al final', () => {
    expect(sortCriteriosRrllByDefault(criterios).map(({ id }) => id)).toEqual([
      'criterio-2',
      'criterio-1',
      'criterio-3',
    ]);
  });

  it('excluye criterios con borrado lógico', () => {
    expect(filterCriteriosRrll(criterios, { search: '', estado: '' }).map(({ id }) => id)).toEqual([
      'criterio-1',
      'criterio-2',
    ]);
  });
});

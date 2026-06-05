import { describe, expect, it } from 'vitest';
import { EMPTY_PETICION_FILTERS, filterPeticiones, type PeticionFilters } from './filters';
import { groupHistoricPeticiones } from './historico';
import { sortPeticionesByDefault } from './sort';
import type { Peticion } from './peticion';

function buildPeticion(overrides: Partial<Peticion>): Peticion {
  return {
    id: 'peticion-base',
    titulo: 'Título base',
    descripcion: 'Descripción base',
    estado: 'pendiente',
    prioridad: 'media',
    fechaLimite: '',
    solicitante: '',
    sindicato: '',
    observaciones: '',
    seguimiento: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    closedAt: null,
    ...overrides,
  };
}

const peticiones: Peticion[] = [
  buildPeticion({ id: 'baja-con-fecha', prioridad: 'baja', fechaLimite: '2026-01-02' }),
  buildPeticion({ id: 'critica-sin-fecha', prioridad: 'critica', fechaLimite: '' }),
  buildPeticion({ id: 'alta-tarde', prioridad: 'alta', fechaLimite: '2026-01-10' }),
  buildPeticion({ id: 'critica-temprana', prioridad: 'critica', fechaLimite: '2026-01-01' }),
  buildPeticion({ id: 'alta-temprana', prioridad: 'alta', fechaLimite: '2026-01-03' }),
  buildPeticion({ id: 'media', prioridad: 'media', fechaLimite: '2026-01-04' }),
];

describe('peticiones domain', () => {
  it('ordena por prioridad y fecha límite, dejando sin fecha al final de su prioridad', () => {
    expect(sortPeticionesByDefault(peticiones).map((peticion) => peticion.id)).toEqual([
      'critica-temprana',
      'critica-sin-fecha',
      'alta-temprana',
      'alta-tarde',
      'media',
      'baja-con-fecha',
    ]);
  });

  it('busca únicamente por título y descripción', () => {
    const source = [
      buildPeticion({ id: 'titulo', titulo: 'Revisar solicitud', solicitante: 'No coincide' }),
      buildPeticion({ id: 'descripcion', descripcion: 'Seguimiento de solicitud sindical' }),
      buildPeticion({
        id: 'solicitante',
        titulo: 'Otra petición',
        descripcion: '',
        solicitante: 'Solicitud',
      }),
    ];

    expect(
      filterPeticiones(source, { ...EMPTY_PETICION_FILTERS, search: 'solicitud' }).map(
        (peticion) => peticion.id,
      ),
    ).toEqual(['titulo', 'descripcion']);
  });

  it('filtra por estado y prioridad', () => {
    const source = [
      buildPeticion({ id: 'pendiente-alta', estado: 'pendiente', prioridad: 'alta' }),
      buildPeticion({ id: 'curso-alta', estado: 'en curso', prioridad: 'alta' }),
      buildPeticion({ id: 'curso-baja', estado: 'en curso', prioridad: 'baja' }),
    ];
    const filters: PeticionFilters = {
      ...EMPTY_PETICION_FILTERS,
      estado: 'en curso',
      prioridad: 'alta',
    };

    expect(filterPeticiones(source, filters).map((peticion) => peticion.id)).toEqual([
      'curso-alta',
    ]);
  });

  it('excluye peticiones borradas y cerradas de la vista activa', () => {
    const source = [
      buildPeticion({ id: 'visible' }),
      buildPeticion({ id: 'borrada', deletedAt: '2026-01-02T00:00:00.000Z' }),
      buildPeticion({ id: 'cerrada', estado: 'cerrada', closedAt: '2026-01-03T00:00:00.000Z' }),
    ];

    expect(filterPeticiones(source, EMPTY_PETICION_FILTERS).map((peticion) => peticion.id)).toEqual(
      ['visible'],
    );
  });

  it('agrupa el histórico de cerradas por año de cierre y excluye borradas', () => {
    const source = [
      buildPeticion({
        id: 'cerrada-2026',
        estado: 'cerrada',
        closedAt: '2026-03-01T00:00:00.000Z',
      }),
      buildPeticion({
        id: 'cerrada-2025',
        estado: 'cerrada',
        closedAt: '2025-03-01T00:00:00.000Z',
      }),
      buildPeticion({ id: 'activa', estado: 'en curso' }),
      buildPeticion({
        id: 'borrada-cerrada',
        estado: 'cerrada',
        deletedAt: '2026-03-02T00:00:00.000Z',
        closedAt: '2026-03-01T00:00:00.000Z',
      }),
    ];

    expect(
      groupHistoricPeticiones(source, { key: 'closedAt', direction: 'desc' }).map((group) => ({
        year: group.year,
        ids: group.peticiones.map((peticion) => peticion.id),
      })),
    ).toEqual([
      { year: '2026', ids: ['cerrada-2026'] },
      { year: '2025', ids: ['cerrada-2025'] },
    ]);
  });
});

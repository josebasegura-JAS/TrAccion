import { describe, expect, it } from 'vitest';
import {
  buildGruposCoberturaByIdMap,
  isGrupoCobertura,
  normalizeGrupoCoberturaDraft,
  normalizeGrupoCoberturaNombre,
  type GrupoCobertura,
} from './gruposCobertura';

function buildGrupo(overrides: Partial<GrupoCobertura> = {}): GrupoCobertura {
  return {
    id: 'grupo-base',
    nombre: 'Recepción',
    presencialidadMinima: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('normalizeGrupoCoberturaNombre', () => {
  it('quita acentos, colapsa espacios y pasa a minúsculas', () => {
    expect(normalizeGrupoCoberturaNombre('  Recepción   Turno Mañana ')).toBe(
      'recepcion turno manana',
    );
  });

  it('devuelve cadena vacía para valores nulos o indefinidos', () => {
    expect(normalizeGrupoCoberturaNombre(null)).toBe('');
    expect(normalizeGrupoCoberturaNombre(undefined)).toBe('');
  });

  it('dos nombres con distinto formato pero mismo contenido normalizan igual', () => {
    expect(normalizeGrupoCoberturaNombre('Recepción')).toBe(normalizeGrupoCoberturaNombre('  recepcion  '));
  });
});

describe('normalizeGrupoCoberturaDraft', () => {
  it('recorta el nombre y fuerza presencialidadMinima a entero no negativo', () => {
    expect(normalizeGrupoCoberturaDraft({ nombre: '  Turno tarde  ', presencialidadMinima: 2.8 })).toEqual({
      nombre: 'Turno tarde',
      presencialidadMinima: 2,
    });
  });

  it('valores negativos o no numéricos de presencialidadMinima quedan en 0', () => {
    expect(normalizeGrupoCoberturaDraft({ nombre: 'Grupo', presencialidadMinima: -5 })).toMatchObject({
      presencialidadMinima: 0,
    });
    expect(normalizeGrupoCoberturaDraft({ nombre: 'Grupo', presencialidadMinima: Number.NaN })).toMatchObject({
      presencialidadMinima: 0,
    });
  });

  it('aplica valores por defecto cuando faltan campos', () => {
    expect(normalizeGrupoCoberturaDraft({})).toEqual({ nombre: '', presencialidadMinima: 0 });
  });
});

describe('isGrupoCobertura', () => {
  it('acepta un objeto con id y nombre de tipo string', () => {
    expect(isGrupoCobertura(buildGrupo())).toBe(true);
  });

  it('rechaza valores que no son objetos o les falta id/nombre', () => {
    expect(isGrupoCobertura(null)).toBe(false);
    expect(isGrupoCobertura(undefined)).toBe(false);
    expect(isGrupoCobertura('grupo')).toBe(false);
    expect(isGrupoCobertura({ id: 'g1' })).toBe(false);
    expect(isGrupoCobertura({ nombre: 'Grupo' })).toBe(false);
  });
});

describe('buildGruposCoberturaByIdMap', () => {
  it('indexa los grupos visibles por id', () => {
    const grupoA = buildGrupo({ id: 'a', nombre: 'Grupo A' });
    const grupoB = buildGrupo({ id: 'b', nombre: 'Grupo B' });

    const map = buildGruposCoberturaByIdMap([grupoA, grupoB]);

    expect(map.get('a')).toEqual(grupoA);
    expect(map.get('b')).toEqual(grupoB);
    expect(map.size).toBe(2);
  });

  it('excluye los grupos eliminados (deletedAt no nulo)', () => {
    const grupoActivo = buildGrupo({ id: 'activo' });
    const grupoEliminado = buildGrupo({ id: 'eliminado', deletedAt: '2026-02-01T00:00:00.000Z' });

    const map = buildGruposCoberturaByIdMap([grupoActivo, grupoEliminado]);

    expect(map.has('activo')).toBe(true);
    expect(map.has('eliminado')).toBe(false);
  });
});

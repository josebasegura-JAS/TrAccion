import { describe, expect, it } from 'vitest';
import {
  EMPTY_CENSO_MIEMBRO_DRAFT,
  groupCensoMiembrosByGrupo,
  isCensoGrupo,
  isValidCensoMiembroDraft,
  normalizeCensoMiembroNombre,
  selectActiveCensoMiembros,
  type CensoMiembro,
} from './censo';

const timestamp = '2026-06-17T08:00:00.000Z';

function miembro(overrides: Partial<CensoMiembro> = {}): CensoMiembro {
  return {
    id: 'censo-1',
    tipoActa: 'Comité',
    grupo: 'Representación Sindical',
    nombre: 'Ejemplo Apellido',
    organizacion: 'ELA',
    disabled: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

describe('censo domain', () => {
  it('reconoce los 3 grupos válidos y rechaza cualquier otro', () => {
    expect(isCensoGrupo('Dirección')).toBe(true);
    expect(isCensoGrupo('Representación Sindical')).toBe(true);
    expect(isCensoGrupo('Invitado')).toBe(true);
    expect(isCensoGrupo('Sindicato inventado')).toBe(false);
  });

  it('normaliza espacios sobrantes en el nombre', () => {
    expect(normalizeCensoMiembroNombre('  Ander   Cabrera  ')).toBe('Ander Cabrera');
  });

  it('un borrador vacío no es válido, uno con nombre y grupo conocido sí', () => {
    expect(isValidCensoMiembroDraft(EMPTY_CENSO_MIEMBRO_DRAFT)).toBe(false);
    expect(isValidCensoMiembroDraft({ ...EMPTY_CENSO_MIEMBRO_DRAFT, nombre: 'Ander Cabrera' })).toBe(true);
  });

  it('selectActiveCensoMiembros filtra por tipo de acta, de baja y eliminados', () => {
    const censo = [
      miembro({ id: 'a', tipoActa: 'Comité' }),
      miembro({ id: 'b', tipoActa: 'Paritaria' }),
      miembro({ id: 'c', tipoActa: 'Comité', disabled: true }),
      miembro({ id: 'd', tipoActa: 'Comité', deletedAt: timestamp }),
    ];

    expect(selectActiveCensoMiembros(censo, 'Comité').map((item) => item.id)).toEqual(['a']);
  });

  it('groupCensoMiembrosByGrupo agrupa manteniendo los 3 grupos aunque alguno esté vacío', () => {
    const censo = [
      miembro({ id: 'rd-1', grupo: 'Dirección', nombre: 'Andoni Hueso', organizacion: '' }),
      miembro({ id: 'sind-1', grupo: 'Representación Sindical', organizacion: 'CIM' }),
      miembro({ id: 'sind-2', grupo: 'Representación Sindical', organizacion: 'ELA' }),
    ];

    const grouped = groupCensoMiembrosByGrupo(censo);

    expect(grouped.Dirección.map((item) => item.id)).toEqual(['rd-1']);
    expect(grouped['Representación Sindical'].map((item) => item.id)).toEqual(['sind-1', 'sind-2']);
    expect(grouped.Invitado).toEqual([]);
  });
});

import type { ActaType } from './acta';

/**
 * Censo de miembros de un órgano (Comité de Empresa, Paritaria...). Es
 * información de referencia que cambia poco — quién representa a cada
 * sindicato o a la Dirección — no un dato propio de cada acta. Vive
 * separado de `ActaAsistenciaEntry` (en `actaContenido.ts`) por el mismo
 * motivo que Grupos de Cobertura se separó de Teletrabajo en junio de
 * 2026: es una entidad de referencia reutilizada, no texto libre repetido
 * acta tras acta.
 *
 * Cuando se pasa lista en una reunión concreta, `ActaAsistenciaEntry`
 * copia (no referencia en vivo) el nombre y la organización del miembro
 * en ese momento — si alguien cambia de sindicato o causa baja del censo
 * más adelante, las actas ya firmadas no deben cambiar retroactivamente.
 */

export const CENSO_GRUPOS = ['Dirección', 'Representación Sindical', 'Invitado'] as const;
export type CensoGrupo = (typeof CENSO_GRUPOS)[number];

export interface CensoMiembro {
  id: string;
  tipoActa: ActaType;
  grupo: CensoGrupo;
  nombre: string;
  /** Sigla del sindicato (ELA, CCOO, CIM, SEMAF, EGIE, USO, LAB...) o cargo. Vacío si no aplica. */
  organizacion: string;
  /** Baja lógica del censo — igual patrón que ActaTypeDefinition.disabled: no se borra, se deja de listar en altas nuevas. */
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type CensoMiembroDraft = Pick<CensoMiembro, 'tipoActa' | 'grupo' | 'nombre' | 'organizacion'>;

export const EMPTY_CENSO_MIEMBRO_DRAFT: CensoMiembroDraft = {
  tipoActa: 'Comité',
  grupo: 'Representación Sindical',
  nombre: '',
  organizacion: '',
};

export function isCensoGrupo(value: unknown): value is CensoGrupo {
  return typeof value === 'string' && (CENSO_GRUPOS as readonly string[]).includes(value);
}

export function normalizeCensoMiembroNombre(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function isValidCensoMiembroDraft(draft: CensoMiembroDraft): boolean {
  return normalizeCensoMiembroNombre(draft.nombre).length > 0 && isCensoGrupo(draft.grupo);
}

/** Miembros activos (no dados de baja ni eliminados) de un tipo de acta, para poblar la asistencia por defecto. */
export function selectActiveCensoMiembros(
  censo: readonly CensoMiembro[],
  tipoActa: ActaType,
): CensoMiembro[] {
  return censo.filter((miembro) => miembro.tipoActa === tipoActa && !miembro.disabled && !miembro.deletedAt);
}

/** Agrupa el censo activo por grupo, en el orden Dirección → Representación Sindical → Invitado, para pintar la tabla de asistentes. */
export function groupCensoMiembrosByGrupo(
  censo: readonly CensoMiembro[],
): Record<CensoGrupo, CensoMiembro[]> {
  const grouped: Record<CensoGrupo, CensoMiembro[]> = {
    Dirección: [],
    'Representación Sindical': [],
    Invitado: [],
  };

  for (const miembro of censo) {
    grouped[miembro.grupo].push(miembro);
  }

  return grouped;
}

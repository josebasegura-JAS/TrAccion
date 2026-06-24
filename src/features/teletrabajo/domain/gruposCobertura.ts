/**
 * Grupo de cobertura: agrupa varios Puestos Teletrabajo que van coordinados
 * (comparten presencialidad mínima y dotación computable conjunta) para que
 * las solicitudes de teletrabajo de cualquiera de esos puestos compitan entre
 * sí por el mismo límite, en vez de evaluarse puesto a puesto.
 *
 * Un puesto pertenece como mucho a un grupo de cobertura (puesto.grupoCoberturaId).
 */
export interface GrupoCobertura {
  id: string;
  nombre: string;
  presencialidadMinima: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface GrupoCoberturaDraft {
  nombre: string;
  presencialidadMinima: number;
}

export const EMPTY_GRUPO_COBERTURA_DRAFT: GrupoCoberturaDraft = {
  nombre: '',
  presencialidadMinima: 0,
};

export function normalizeGrupoCoberturaNombre(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePresencialidadMinima(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function normalizeGrupoCoberturaDraft(
  draft: Partial<GrupoCoberturaDraft>,
): GrupoCoberturaDraft {
  return {
    nombre: (draft.nombre ?? '').trim(),
    presencialidadMinima: normalizePresencialidadMinima(draft.presencialidadMinima ?? 0),
  };
}

export function isGrupoCobertura(value: unknown): value is GrupoCobertura {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof GrupoCobertura, unknown>>;
  return typeof candidate.id === 'string' && typeof candidate.nombre === 'string';
}

export function buildGruposCoberturaByIdMap(
  grupos: readonly GrupoCobertura[],
): Map<string, GrupoCobertura> {
  return new Map(
    grupos.filter((grupo) => !grupo.deletedAt).map((grupo) => [grupo.id, grupo]),
  );
}

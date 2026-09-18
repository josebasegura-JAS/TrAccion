import type { HuelgaPuestoAsignacion } from './huelgasAssignments';

export type HuelgaArea = {
  id: string;
  nombre: string;
  zonaId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function normalize(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value: string): string {
  return normalize(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES');
}

export function areaKey(zonaId: string, nombre: string): string {
  return `${zonaId.trim()}::${normalizeKey(nombre)}`;
}

export function createAreaId(): string {
  return `area-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isHuelgaArea(value: unknown): value is HuelgaArea {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HuelgaArea>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.nombre === 'string' &&
    typeof candidate.zonaId === 'string' &&
    typeof candidate.active === 'boolean' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

export function isHuelgaAreas(value: unknown): value is HuelgaArea[] {
  return Array.isArray(value) && value.every(isHuelgaArea);
}

export function mergeLegacyAreas(
  current: HuelgaArea[],
  assignments: HuelgaPuestoAsignacion[],
): HuelgaArea[] {
  const byKey = new Map(current.map((area) => [areaKey(area.zonaId, area.nombre), area]));
  const now = new Date().toISOString();

  for (const assignment of assignments) {
    const nombre = normalize(assignment.area ?? '');
    const zonaId = assignment.zonaId?.trim() ?? '';
    if (!nombre || !zonaId) continue;
    const key = areaKey(zonaId, nombre);
    if (byKey.has(key)) continue;
    byKey.set(key, {
      id: createAreaId(),
      nombre,
      zonaId,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  return [...byKey.values()].sort((a, b) => {
    const zoneOrder = a.zonaId.localeCompare(b.zonaId, 'es', { sensitivity: 'base' });
    return zoneOrder || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
  });
}

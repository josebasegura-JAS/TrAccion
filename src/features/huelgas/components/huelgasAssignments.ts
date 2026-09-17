import type { HuelgaPersonalTurno } from './huelgasPersonalImport';

export type HuelgaPuestoAsignacion = {
  puesto: string;
  area: string;
  responsableNombre: string;
  responsableEmail: string;
  updatedAt: string;
};

export function normalizePuesto(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value: string): string {
  return normalizePuesto(value).toLocaleLowerCase('es-ES');
}

export function isHuelgaPuestoAsignacion(value: unknown): value is HuelgaPuestoAsignacion {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HuelgaPuestoAsignacion>;
  return (
    typeof candidate.puesto === 'string' &&
    typeof candidate.area === 'string' &&
    typeof candidate.responsableNombre === 'string' &&
    typeof candidate.responsableEmail === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

export function isHuelgaPuestoAsignaciones(value: unknown): value is HuelgaPuestoAsignacion[] {
  return Array.isArray(value) && value.every(isHuelgaPuestoAsignacion);
}

export function isAsignacionCompleta(asignacion: HuelgaPuestoAsignacion): boolean {
  return Boolean(
    asignacion.area.trim() &&
      asignacion.responsableNombre.trim() &&
      asignacion.responsableEmail.trim(),
  );
}

export function countPersonasByPuesto(personal: HuelgaPersonalTurno[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const persona of personal) {
    const puesto = normalizePuesto(persona.puesto);
    if (!puesto) continue;
    const key = normalizeKey(puesto);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function buildAsignacionesForPersonal(
  personal: HuelgaPersonalTurno[],
  current: HuelgaPuestoAsignacion[],
  master: HuelgaPuestoAsignacion[],
): HuelgaPuestoAsignacion[] {
  const currentByPuesto = new Map(current.map((item) => [normalizeKey(item.puesto), item]));
  const masterByPuesto = new Map(master.map((item) => [normalizeKey(item.puesto), item]));
  const unique = new Map<string, string>();

  for (const persona of personal) {
    const puesto = normalizePuesto(persona.puesto);
    if (!puesto) continue;
    const key = normalizeKey(puesto);
    if (!unique.has(key)) unique.set(key, puesto);
  }

  const now = new Date().toISOString();
  return [...unique.entries()]
    .map(([key, puesto]) => {
      const source = currentByPuesto.get(key) ?? masterByPuesto.get(key);
      return {
        puesto,
        area: source?.area ?? '',
        responsableNombre: source?.responsableNombre ?? '',
        responsableEmail: source?.responsableEmail ?? '',
        updatedAt: source?.updatedAt ?? now,
      };
    })
    .sort((a, b) => a.puesto.localeCompare(b.puesto, 'es', { sensitivity: 'base' }));
}

export function mergeAsignacionesIntoMaster(
  master: HuelgaPuestoAsignacion[],
  updates: HuelgaPuestoAsignacion[],
): HuelgaPuestoAsignacion[] {
  const byPuesto = new Map(master.map((item) => [normalizeKey(item.puesto), item]));
  for (const update of updates) {
    byPuesto.set(normalizeKey(update.puesto), update);
  }
  return [...byPuesto.values()].sort((a, b) =>
    a.puesto.localeCompare(b.puesto, 'es', { sensitivity: 'base' }),
  );
}

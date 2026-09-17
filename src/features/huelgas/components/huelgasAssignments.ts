import type { HuelgaPersonalTurno } from './huelgasPersonalImport';

export type HuelgaPuestoAsignacion = {
  residencia: string;
  puesto: string;
  area: string;
  responsableNombre: string;
  responsableEmail: string;
  updatedAt: string;
};

export function normalizePuesto(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeResidencia(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES')
    .replace(/\s+/g, ' ')
    .trim();
}

export function asignacionKey(residencia: string, puesto: string): string {
  return `${normalizeKey(normalizeResidencia(residencia))}::${normalizeKey(normalizePuesto(puesto))}`;
}

function residenciaPersona(persona: HuelgaPersonalTurno): string {
  return normalizeResidencia(
    persona.residenciaAsignacion || persona.residenciaPlantilla || persona.residenciaEstacion || '',
  );
}

export function isHuelgaPuestoAsignacion(value: unknown): value is HuelgaPuestoAsignacion {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HuelgaPuestoAsignacion>;
  return (
    (typeof candidate.residencia === 'string' || typeof candidate.residencia === 'undefined') &&
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
    normalizeResidencia(asignacion.residencia ?? '') &&
      asignacion.area.trim() &&
      asignacion.responsableNombre.trim() &&
      asignacion.responsableEmail.trim(),
  );
}

export function countPersonasByAsignacion(personal: HuelgaPersonalTurno[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const persona of personal) {
    const puesto = normalizePuesto(persona.puesto);
    const residencia = residenciaPersona(persona);
    if (!puesto || !residencia) continue;
    const key = asignacionKey(residencia, puesto);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function buildAsignacionesForPersonal(
  personal: HuelgaPersonalTurno[],
  current: HuelgaPuestoAsignacion[],
  master: HuelgaPuestoAsignacion[],
): HuelgaPuestoAsignacion[] {
  const currentByKey = new Map(
    current.map((item) => [asignacionKey(item.residencia ?? '', item.puesto), item]),
  );
  const masterByKey = new Map(
    master.map((item) => [asignacionKey(item.residencia ?? '', item.puesto), item]),
  );
  const legacyMasterByPuesto = new Map(
    master
      .filter((item) => !normalizeResidencia(item.residencia ?? ''))
      .map((item) => [normalizeKey(item.puesto), item]),
  );
  const unique = new Map<string, { residencia: string; puesto: string }>();

  for (const persona of personal) {
    const puesto = normalizePuesto(persona.puesto);
    const residencia = residenciaPersona(persona);
    if (!puesto || !residencia) continue;
    const key = asignacionKey(residencia, puesto);
    if (!unique.has(key)) unique.set(key, { residencia, puesto });
  }

  const now = new Date().toISOString();
  return [...unique.entries()]
    .map(([key, identity]) => {
      const source =
        currentByKey.get(key) ??
        masterByKey.get(key) ??
        legacyMasterByPuesto.get(normalizeKey(identity.puesto));
      return {
        residencia: identity.residencia,
        puesto: identity.puesto,
        area: source?.area ?? '',
        responsableNombre: source?.responsableNombre ?? '',
        responsableEmail: source?.responsableEmail ?? '',
        updatedAt: source?.updatedAt ?? now,
      };
    })
    .sort((a, b) => {
      const residenciaOrder = a.residencia.localeCompare(b.residencia, 'es', { sensitivity: 'base' });
      return residenciaOrder || a.puesto.localeCompare(b.puesto, 'es', { sensitivity: 'base' });
    });
}

export function mergeAsignacionesIntoMaster(
  master: HuelgaPuestoAsignacion[],
  updates: HuelgaPuestoAsignacion[],
): HuelgaPuestoAsignacion[] {
  const byKey = new Map(
    master
      .filter((item) => normalizeResidencia(item.residencia ?? ''))
      .map((item) => [asignacionKey(item.residencia, item.puesto), item]),
  );
  for (const update of updates) {
    byKey.set(asignacionKey(update.residencia, update.puesto), update);
  }
  return [...byKey.values()].sort((a, b) => {
    const residenciaOrder = a.residencia.localeCompare(b.residencia, 'es', { sensitivity: 'base' });
    return residenciaOrder || a.puesto.localeCompare(b.puesto, 'es', { sensitivity: 'base' });
  });
}

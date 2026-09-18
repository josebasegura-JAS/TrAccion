import type { HuelgaPersonalTurno } from './huelgasPersonalImport';
import type { HuelgaZona } from './huelgasZones';

export type HuelgaPuestoAsignacion = {
  residencia: string;
  puesto: string;
  area: string;
  zonaId: string;
  zonaNombre: string;
  zonaResponsableNombre: string;
  zonaResponsableEmail: string;
  /** Campos legacy de Fase 3/4/5. Se conservan solo para migrar datos ya guardados. */
  responsableNombre?: string;
  responsableEmail?: string;
  updatedAt: string;
};

export function normalizePuesto(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeResidencia(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeAssignmentText(value: string): string {
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
    (typeof candidate.zonaId === 'string' || typeof candidate.zonaId === 'undefined') &&
    (typeof candidate.zonaNombre === 'string' || typeof candidate.zonaNombre === 'undefined') &&
    (typeof candidate.zonaResponsableNombre === 'string' || typeof candidate.zonaResponsableNombre === 'undefined') &&
    (typeof candidate.zonaResponsableEmail === 'string' || typeof candidate.zonaResponsableEmail === 'undefined') &&
    (typeof candidate.responsableNombre === 'string' || typeof candidate.responsableNombre === 'undefined') &&
    (typeof candidate.responsableEmail === 'string' || typeof candidate.responsableEmail === 'undefined') &&
    typeof candidate.updatedAt === 'string'
  );
}

export function isHuelgaPuestoAsignaciones(value: unknown): value is HuelgaPuestoAsignacion[] {
  return Array.isArray(value) && value.every(isHuelgaPuestoAsignacion);
}

export function isAsignacionCompleta(asignacion: HuelgaPuestoAsignacion): boolean {
  return Boolean(
    normalizeResidencia(asignacion.residencia ?? '') &&
      normalizeAssignmentText(asignacion.area) &&
      normalizeAssignmentText(asignacion.zonaId ?? '') &&
      normalizeAssignmentText(asignacion.zonaNombre ?? '') &&
      normalizeAssignmentText(asignacion.zonaResponsableNombre ?? '') &&
      normalizeAssignmentText(asignacion.zonaResponsableEmail ?? ''),
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

function withZoneSnapshot(
  base: HuelgaPuestoAsignacion,
  zonesById: Map<string, HuelgaZona>,
): HuelgaPuestoAsignacion {
  const zona = base.zonaId ? zonesById.get(base.zonaId) : undefined;
  if (!zona) {
    return {
      ...base,
      zonaId: base.zonaId ?? '',
      zonaNombre: base.zonaNombre ?? '',
      zonaResponsableNombre: base.zonaResponsableNombre ?? base.responsableNombre ?? '',
      zonaResponsableEmail: base.zonaResponsableEmail ?? base.responsableEmail ?? '',
    };
  }
  return {
    ...base,
    zonaId: zona.id,
    zonaNombre: zona.nombre,
    zonaResponsableNombre: zona.responsableNombre,
    zonaResponsableEmail: zona.responsableEmail,
  };
}

export function buildAsignacionesForPersonal(
  personal: HuelgaPersonalTurno[],
  current: HuelgaPuestoAsignacion[],
  master: HuelgaPuestoAsignacion[],
  zonas: HuelgaZona[] = [],
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
  const zonesById = new Map(zonas.map((zona) => [zona.id, zona]));
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
      const currentSource = currentByKey.get(key);
      const source =
        currentSource ??
        masterByKey.get(key) ??
        legacyMasterByPuesto.get(normalizeKey(identity.puesto));
      const base: HuelgaPuestoAsignacion = {
        residencia: identity.residencia,
        puesto: identity.puesto,
        area: source?.area ?? '',
        zonaId: source?.zonaId ?? '',
        zonaNombre: source?.zonaNombre ?? '',
        zonaResponsableNombre: source?.zonaResponsableNombre ?? source?.responsableNombre ?? '',
        zonaResponsableEmail: source?.zonaResponsableEmail ?? source?.responsableEmail ?? '',
        responsableNombre: source?.responsableNombre,
        responsableEmail: source?.responsableEmail,
        updatedAt: source?.updatedAt ?? now,
      };
      // La copia guardada en una huelga es histórica: no debe cambiar si posteriormente
      // se modifica el responsable o el nombre de la zona maestra.
      return currentSource ? base : withZoneSnapshot(base, zonesById);
    })
    .sort((a, b) => {
      const residenciaOrder = a.residencia.localeCompare(b.residencia, 'es', { sensitivity: 'base' });
      return residenciaOrder || a.puesto.localeCompare(b.puesto, 'es', { sensitivity: 'base' });
    });
}

export function applyZoneSnapshots(
  assignments: HuelgaPuestoAsignacion[],
  zonas: HuelgaZona[],
): HuelgaPuestoAsignacion[] {
  const zonesById = new Map(zonas.map((zona) => [zona.id, zona]));
  return assignments.map((assignment) => withZoneSnapshot(assignment, zonesById));
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

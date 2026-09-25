import type { Employee, EmployeeDraft } from '../../plantilla/domain/employee';
import type { HuelgaPersonalTurno } from './huelgasPersonalImport';
import { asignacionKey, isHuelgaPuestoAsignaciones, type HuelgaPuestoAsignacion } from './huelgasAssignments';

export const STORAGE_KEY = 'traccion.v1.huelgas.records';
export const PUESTO_RESPONSABLES_STORAGE_KEY = 'traccion.v1.huelgas.puestoResponsables';
export const ZONAS_STORAGE_KEY = 'traccion.v1.huelgas.zonas';
export const AREAS_STORAGE_KEY = 'traccion.v1.huelgas.areas';

export type HuelgaTipo = 'jornada-completa' | 'paros-parciales';

export type HuelgaTramo = {
  id: string;
  inicio: string;
  fin: string;
};

export type Huelga = {
  id: string;
  fecha: string;
  sindicatos: string[];
  tipo: HuelgaTipo;
  tramos: HuelgaTramo[];
  observaciones: string;
  createdAt: string;
  updatedAt: string;
  personalConTurno?: HuelgaPersonalTurno[];
  personalImportadoAt?: string | null;
  asignacionesPuesto?: HuelgaPuestoAsignacion[];
  instruccionesCorreoPorZona?: Record<string, string>;
};

export type HuelgaDraft = Pick<Huelga, 'fecha' | 'sindicatos' | 'tipo' | 'tramos' | 'observaciones'>;
export type AssignmentSortKey = 'residencia' | 'puesto' | 'personas' | 'area' | 'zona' | 'responsable' | 'estado';
export type AssignmentSortDirection = 'asc' | 'desc';

export type AssignmentFilters = {
  residencia: string;
  puesto: string;
  personas: string;
  area: string;
  zona: string;
  responsable: string;
  estado: string;
};

export const EMPTY_ASSIGNMENT_FILTERS: AssignmentFilters = {
  residencia: '',
  puesto: '',
  personas: '',
  area: '',
  zona: '',
  responsable: '',
  estado: '',
};

export const EMPTY_DRAFT: HuelgaDraft = {
  fecha: '',
  sindicatos: [],
  tipo: 'jornada-completa',
  tramos: [],
  observaciones: '',
};

export function isHuelga(value: unknown): value is Huelga {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Huelga>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.fecha === 'string' &&
    Array.isArray(candidate.sindicatos) &&
    candidate.sindicatos.every((item) => typeof item === 'string') &&
    (candidate.tipo === 'jornada-completa' || candidate.tipo === 'paros-parciales') &&
    Array.isArray(candidate.tramos) &&
    typeof candidate.observaciones === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    (typeof candidate.personalConTurno === 'undefined' || Array.isArray(candidate.personalConTurno)) &&
    (typeof candidate.personalImportadoAt === 'undefined' || candidate.personalImportadoAt === null || typeof candidate.personalImportadoAt === 'string') &&
    (typeof candidate.asignacionesPuesto === 'undefined' || isHuelgaPuestoAsignaciones(candidate.asignacionesPuesto)) &&
    (typeof candidate.instruccionesCorreoPorZona === 'undefined' || (candidate.instruccionesCorreoPorZona !== null && typeof candidate.instruccionesCorreoPorZona === 'object' && !Array.isArray(candidate.instruccionesCorreoPorZona)))
  );
}

export function isHuelgas(value: unknown): value is Huelga[] {
  return Array.isArray(value) && value.every(isHuelga);
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function formatDate(value: string): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

export function huelgaStatus(fecha: string): 'Hoy' | 'Próxima' | 'Finalizada' {
  const today = todayIso();
  if (fecha === today) return 'Hoy';
  return fecha > today ? 'Próxima' : 'Finalizada';
}

export function statusClass(status: ReturnType<typeof huelgaStatus>): string {
  if (status === 'Hoy') return 'border-red-500/40 bg-red-500/15 text-red-200';
  if (status === 'Próxima') return 'border-amber-500/40 bg-amber-500/15 text-amber-200';
  return 'border-metro-border bg-metro-panel/70 text-metro-muted';
}

export function convocatoriaLabel(huelga: Pick<Huelga, 'tipo' | 'tramos'>): string {
  if (huelga.tipo === 'jornada-completa') return 'Jornada completa';
  if (huelga.tramos.length === 0) return 'Paros parciales';
  return huelga.tramos.map((tramo) => `${tramo.inicio}–${tramo.fin}`).join(' · ');
}

export function validateDraft(draft: HuelgaDraft): string | null {
  if (!draft.fecha) return 'Indica la fecha de la huelga.';
  if (draft.sindicatos.length === 0) return 'Selecciona al menos un sindicato convocante.';
  if (draft.tipo === 'paros-parciales') {
    if (draft.tramos.length === 0) return 'Añade al menos un tramo horario para los paros parciales.';
    for (const tramo of draft.tramos) {
      if (!tramo.inicio || !tramo.fin) return 'Completa la hora de inicio y fin de todos los tramos.';
      if (tramo.inicio >= tramo.fin) return 'La hora de fin de cada tramo debe ser posterior a la de inicio.';
    }
  }
  return null;
}

export function resolveResidenceOverride(
  overrides: Record<string, string>,
  residencia: string,
  puesto: string,
): string {
  let current = residencia.trim();
  const visited = new Set<string>();
  for (let index = 0; index < 20; index += 1) {
    const key = asignacionKey(current, puesto);
    if (visited.has(key)) break;
    visited.add(key);
    const next = overrides[key]?.trim();
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

export function employeeToDraft(employee: Employee): EmployeeDraft {
  return {
    empleado: employee.empleado,
    nombreApellidos: employee.nombreApellidos,
    puestoNomina: employee.puestoNomina,
    puestoOrganizativo: employee.puestoOrganizativo,
    puestoEus: employee.puestoEus,
    residencia: employee.residencia,
    unidad: employee.unidad,
    nivelRetributivo: employee.nivelRetributivo,
    direccionOrganizativa: employee.direccionOrganizativa,
    antiguedadPuesto: employee.antiguedadPuesto,
    sexo: employee.sexo,
    calle: employee.calle,
    numero: employee.numero,
    piso: employee.piso,
    codigoPostal: employee.codigoPostal,
    poblacion: employee.poblacion,
    provincia: employee.provincia,
    nif: employee.nif,
    telefono1: employee.telefono1,
    telefono2: employee.telefono2,
    email: employee.email,
  };
}

export function sameNormalizedText(left: string, right: string): boolean {
  const normalize = (value: string) => value
    .replace(/\u00a0/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES')
    .replace(/\s+/g, ' ')
    .trim();
  return normalize(left) === normalize(right);
}

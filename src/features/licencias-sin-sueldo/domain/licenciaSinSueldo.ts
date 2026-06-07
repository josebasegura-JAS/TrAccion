import type { Employee } from '../../plantilla/domain/employee';

export const LICENCIA_SIN_SUELDO_STORAGE_KEY = 'traccion.v1.licenciasSinSueldo.records';

export const licenciaSinSueldoTipos = [
  'Licencia sin sueldo',
  'Permiso no retribuido',
  'Año de Libre Disposición',
  'Excedencia',
] as const;

export type LicenciaSinSueldoTipo = (typeof licenciaSinSueldoTipos)[number];

export const licenciaSinSueldoEstados = [
  'pendiente_aprobacion',
  'pendiente_firma',
  'vigente',
  'historico',
] as const;

export type LicenciaSinSueldoEstado = (typeof licenciaSinSueldoEstados)[number];

export interface LicenciaSinSueldoActualizacion {
  id: string;
  fecha: string;
  texto: string;
}

export interface LicenciaSinSueldoRecord {
  id: string;
  numeroEmpleado: string;
  nombreCompleto: string;
  tipo: LicenciaSinSueldoTipo;
  fechaSolicitud: string;
  fechaInicio: string;
  fechaFin: string;
  estado: LicenciaSinSueldoEstado;
  observaciones: string;
  actualizaciones: LicenciaSinSueldoActualizacion[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type LicenciaSinSueldoDraft = Pick<
  LicenciaSinSueldoRecord,
  | 'numeroEmpleado'
  | 'nombreCompleto'
  | 'tipo'
  | 'fechaSolicitud'
  | 'fechaInicio'
  | 'fechaFin'
  | 'estado'
  | 'observaciones'
  | 'actualizaciones'
>;

export interface EmployeeSuggestion {
  empleado: string;
  nombreApellidos: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export const EMPTY_LICENCIA_SIN_SUELDO_DRAFT: LicenciaSinSueldoDraft = {
  numeroEmpleado: '',
  nombreCompleto: '',
  tipo: 'Licencia sin sueldo',
  fechaSolicitud: '',
  fechaInicio: '',
  fechaFin: '',
  estado: 'pendiente_aprobacion',
  observaciones: '',
  actualizaciones: [],
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isLicenciaSinSueldoTipo(value: unknown): value is LicenciaSinSueldoTipo {
  return typeof value === 'string' && licenciaSinSueldoTipos.includes(value as LicenciaSinSueldoTipo);
}

export function isLicenciaSinSueldoEstado(value: unknown): value is LicenciaSinSueldoEstado {
  return (
    typeof value === 'string' &&
    licenciaSinSueldoEstados.includes(value as LicenciaSinSueldoEstado)
  );
}

export function isIsoDate(value: string): boolean {
  return ISO_DATE_PATTERN.test(value);
}

function parseIsoDate(value: string): Date | null {
  if (!isIsoDate(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addYearsClamped(isoDate: string, years: number): string {
  const date = parseIsoDate(isoDate);
  if (!date) {
    return '';
  }

  const originalMonth = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() + years);
  if (date.getUTCMonth() !== originalMonth) {
    date.setUTCDate(0);
  }

  return date.toISOString().slice(0, 10);
}

function addMonthsClamped(isoDate: string, months: number): string {
  const date = parseIsoDate(isoDate);
  if (!date) {
    return '';
  }

  const originalDay = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + months);
  if (date.getUTCDate() !== originalDay) {
    date.setUTCDate(0);
  }

  return date.toISOString().slice(0, 10);
}

export function calculateFechaFinForTipo(tipo: LicenciaSinSueldoTipo, fechaInicio: string): string {
  return tipo === 'Año de Libre Disposición' ? addYearsClamped(fechaInicio, 5) : '';
}

export function normalizeDraftForTipo(draft: LicenciaSinSueldoDraft): LicenciaSinSueldoDraft {
  const fechaInicio = draft.fechaInicio.trim();
  return {
    ...draft,
    numeroEmpleado: draft.numeroEmpleado.trim(),
    nombreCompleto: draft.nombreCompleto.trim(),
    fechaSolicitud: draft.fechaSolicitud.trim(),
    fechaInicio,
    fechaFin:
      draft.tipo === 'Año de Libre Disposición'
        ? calculateFechaFinForTipo(draft.tipo, fechaInicio)
        : draft.fechaFin.trim(),
    observaciones: draft.observaciones.trim(),
    actualizaciones: draft.actualizaciones
      .map((actualizacion) => ({
        ...actualizacion,
        fecha: actualizacion.fecha.trim(),
        texto: actualizacion.texto.trim(),
      }))
      .filter((actualizacion) => actualizacion.texto),
  };
}

export function validateLicenciaSinSueldoDraft(draft: LicenciaSinSueldoDraft): ValidationResult {
  const normalizedDraft = normalizeDraftForTipo(draft);
  const errors: string[] = [];

  if (!normalizedDraft.numeroEmpleado) errors.push('El nº de empleado es obligatorio.');
  if (!normalizedDraft.nombreCompleto) errors.push('El nombre completo es obligatorio.');
  if (!normalizedDraft.tipo) errors.push('El tipo es obligatorio.');
  if (!normalizedDraft.fechaSolicitud) errors.push('La fecha de solicitud es obligatoria.');
  if (!normalizedDraft.fechaInicio) errors.push('La fecha de inicio es obligatoria.');
  if (!normalizedDraft.fechaFin) errors.push('La fecha de fin es obligatoria.');

  const inicio = parseIsoDate(normalizedDraft.fechaInicio);
  const fin = parseIsoDate(normalizedDraft.fechaFin);

  if (normalizedDraft.fechaInicio && !inicio) errors.push('La fecha de inicio no es válida.');
  if (normalizedDraft.fechaFin && !fin) errors.push('La fecha de fin no es válida.');

  if (inicio && fin) {
    if (fin.getTime() < inicio.getTime()) {
      errors.push('La fecha de fin no puede ser anterior a la fecha de inicio.');
    }

    if (normalizedDraft.tipo === 'Licencia sin sueldo') {
      const inclusiveDays = Math.floor((fin.getTime() - inicio.getTime()) / MS_PER_DAY) + 1;
      const maxEndDate = addMonthsClamped(normalizedDraft.fechaInicio, 9);
      if (inclusiveDays < 15) {
        errors.push('La licencia sin sueldo debe durar como mínimo 15 días naturales.');
      }
      if (maxEndDate && normalizedDraft.fechaFin > maxEndDate) {
        errors.push('La licencia sin sueldo no puede superar 9 meses.');
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function buildLicenciaSinSueldoRecord(
  draft: LicenciaSinSueldoDraft,
  now: string,
  id: string,
  previous?: LicenciaSinSueldoRecord,
): LicenciaSinSueldoRecord {
  const normalizedDraft = normalizeDraftForTipo(draft);
  return {
    id,
    ...normalizedDraft,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    deletedAt: previous?.deletedAt ?? null,
  };
}

export function getEffectiveLicenciaEstado(
  record: LicenciaSinSueldoRecord,
  today: string,
): LicenciaSinSueldoEstado {
  if (record.estado === 'vigente' && record.fechaFin < today) {
    return 'historico';
  }
  return record.estado;
}

export function visibleLicenciasSinSueldo(records: LicenciaSinSueldoRecord[]): LicenciaSinSueldoRecord[] {
  return records.filter((record) => !record.deletedAt);
}

export function findEmployeeByNumber(
  employees: Employee[],
  employeeNumber: string,
): EmployeeSuggestion | null {
  const normalizedNumber = employeeNumber.trim();
  const employee = employees.find(
    (current) => !current.deletedAt && current.empleado.trim() === normalizedNumber,
  );
  return employee ? { empleado: employee.empleado, nombreApellidos: employee.nombreApellidos } : null;
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();
}

export function suggestEmployees(employees: Employee[], search: string): EmployeeSuggestion[] {
  const normalizedSearch = normalizeSearch(search);
  if (!normalizedSearch) return [];

  return employees
    .filter((employee) => {
      if (employee.deletedAt) return false;
      return (
        normalizeSearch(employee.nombreApellidos).includes(normalizedSearch) ||
        normalizeSearch(employee.empleado).includes(normalizedSearch)
      );
    })
    .sort((first, second) =>
      first.empleado.localeCompare(second.empleado, 'es', { numeric: true, sensitivity: 'base' }),
    )
    .slice(0, 8)
    .map((employee) => ({ empleado: employee.empleado, nombreApellidos: employee.nombreApellidos }));
}

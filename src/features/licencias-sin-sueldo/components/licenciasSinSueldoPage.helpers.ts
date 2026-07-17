import type { ModuleHelpSection } from '../../../components/ModuleHelp';
import type { ExportColumn } from '../../../shared/export/types';
import type { TableViewPreferences } from '../../../shared/table/useTableViewPreferences';
import type {
  LicenciaSinSueldoActualizacion,
  LicenciaSinSueldoDraft,
  LicenciaSinSueldoEstado,
  LicenciaSinSueldoRecord,
} from '../domain/licenciaSinSueldo';

export type EditorMode = 'create' | 'edit';

export type LicenciasTableColumnId =
  | 'numeroEmpleado'
  | 'nombreCompleto'
  | 'tipo'
  | 'fechaSolicitud'
  | 'fechaInicio'
  | 'fechaFin'
  | 'estado'
  | 'actions';

export type BlockId =
  | 'pendiente_aprobacion'
  | 'pendiente_firma'
  | 'vigente'
  | `historico-${number}`;

export const tableColumnIds: readonly LicenciasTableColumnId[] = [
  'numeroEmpleado',
  'nombreCompleto',
  'tipo',
  'fechaSolicitud',
  'fechaInicio',
  'fechaFin',
  'estado',
  'actions',
];

export const defaultTablePreferences: TableViewPreferences<LicenciasTableColumnId> = {
  sort: { columnId: 'fechaSolicitud', direction: 'desc' },
  columnWidths: {},
  columnOrder: null,
};

export const LICENCIAS_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: '¿Qué hace este módulo?',
    body: 'Gestiona solicitudes de Licencia sin sueldo, Permiso no retribuido, Año de Libre Disposición y Excedencia, desde la aprobación hasta el histórico, con generación del documento Word de concesión.',
  },
  {
    title: 'Estados',
    items: [
      'Pendiente de aprobar → Pendiente de firma → Vigente.',
      'Una solicitud "Vigente" pasa a mostrarse como histórica automáticamente en cuanto su fecha de fin queda en el pasado, sin necesidad de cambiarla a mano.',
    ],
  },
  {
    title: 'Reglas de duración según el tipo',
    items: [
      'Licencia sin sueldo: duración obligatoria de entre 15 días naturales y 9 meses desde la fecha de inicio.',
      'Año de Libre Disposición: la fecha de fin se calcula automáticamente como 5 años después del inicio; no se edita a mano.',
      'Permiso no retribuido y Excedencia: no tienen una duración mínima ni máxima automática; solo se exige que la fecha de fin no sea anterior a la de inicio.',
      'En todos los tipos son obligatorios el número de empleado, nombre completo, fecha de solicitud, fecha de inicio y fecha de fin.',
    ],
  },
  {
    title: 'Generación documental',
    items: [
      'En los registros aprobados puede generarse el documento Word de concesión a partir de una plantilla externa configurada en Ajustes.',
      'El documento rellena automáticamente marcadores de la plantilla («Puesto_CAST», «Puesto_EUS»...) con los datos de la persona: puesto en castellano y su traducción a euskera (tomada de Plantilla o, si falta, de la tabla de Traducción de puestos), fechas y demás datos de la solicitud.',
    ],
  },
];

const estadoLabels: Record<LicenciaSinSueldoEstado, string> = {
  pendiente_aprobacion: 'Pendiente aprobar',
  pendiente_firma: 'Pendiente firma',
  vigente: 'Vigente',
  historico: 'Histórico',
};

export const exportColumns: ExportColumn<LicenciaSinSueldoRecord>[] = [
  { key: 'numeroEmpleado', header: 'Nº empleado', value: (record) => record.numeroEmpleado },
  { key: 'nombreCompleto', header: 'Nombre', value: (record) => record.nombreCompleto },
  { key: 'tipo', header: 'Tipo', value: (record) => record.tipo },
  { key: 'fechaSolicitud', header: 'Fecha solicitud', value: (record) => record.fechaSolicitud },
  { key: 'fechaInicio', header: 'Fecha inicio', value: (record) => record.fechaInicio },
  { key: 'fechaFin', header: 'Fecha fin', value: (record) => record.fechaFin },
  { key: 'estado', header: 'Estado', value: (record) => estadoLabels[record.estado] },
  { key: 'observaciones', header: 'Observaciones', value: (record) => record.observaciones },
];

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createUpdateId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `actualizacion-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatDate(value: string): string {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-ES');
}

export function formatEstado(value: LicenciaSinSueldoEstado): string {
  return estadoLabels[value];
}

export function buildHaystack(
  record: LicenciaSinSueldoRecord,
  effectiveEstado: LicenciaSinSueldoEstado,
): string {
  return [
    record.numeroEmpleado,
    record.nombreCompleto,
    record.tipo,
    effectiveEstado,
    estadoLabels[effectiveEstado],
    record.observaciones,
    ...record.actualizaciones.map(
      (actualizacion: LicenciaSinSueldoActualizacion) => actualizacion.texto,
    ),
  ]
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}

export function getHistoricalYear(record: LicenciaSinSueldoRecord): number {
  const year = Number(record.fechaFin.slice(0, 4));
  return Number.isFinite(year) ? year : 0;
}

export function toDraft(record: LicenciaSinSueldoRecord): LicenciaSinSueldoDraft {
  return {
    numeroEmpleado: record.numeroEmpleado,
    nombreCompleto: record.nombreCompleto,
    tipo: record.tipo,
    fechaSolicitud: record.fechaSolicitud,
    fechaInicio: record.fechaInicio,
    fechaFin: record.fechaFin,
    estado: record.estado,
    observaciones: record.observaciones,
    actualizaciones: record.actualizaciones,
  };
}

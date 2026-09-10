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
  | 'ultimaActualizacion'
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
  'ultimaActualizacion',
  'actions',
];

export const defaultTablePreferences: TableViewPreferences<LicenciasTableColumnId> = {
  sort: { columnId: 'fechaSolicitud', direction: 'desc' },
  columnWidths: {},
  columnOrder: null,
};

export const LICENCIAS_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: '¿Qué gestiona este módulo?',
    body: 'Centraliza Licencias sin sueldo, Permisos no retribuidos, Año de Libre Disposición y Excedencias. La pantalla principal prioriza el seguimiento del flujo y deja el detalle completo dentro de cada ficha.',
  },
  {
    title: 'Bandejas de trabajo',
    items: [
      'Pendientes de aprobar y Pendientes de firma muestran solo Nº, Nombre, Tipo y Acciones para facilitar una revisión rápida.',
      'Haz un clic sobre cualquier fila para abrir la ficha completa y consultar fechas, estado, observaciones y actualizaciones.',
      'Las tablas de Vigentes e Histórico mantienen el detalle ampliado para consulta y explotación.',
    ],
  },
  {
    title: 'Estados y flujo',
    items: [
      'Pendiente de aprobar → Pendiente de firma → Vigente. También puede pasar a Denegada durante la tramitación.',
      'Una solicitud Vigente pasa a Histórico automáticamente cuando su fecha de fin queda en el pasado.',
      'Las solicitudes denegadas se conservan en el histórico y requieren registrar el motivo en Actualizaciones.',
    ],
  },
  {
    title: 'Reglas de duración',
    items: [
      'Licencia sin sueldo: entre 15 días naturales y 9 meses desde la fecha de inicio.',
      'Año de Libre Disposición: la fecha de fin se calcula automáticamente como 5 años después del inicio.',
      'Permiso no retribuido y Excedencia: no tienen una duración mínima o máxima automática; la fecha de fin no puede ser anterior a la de inicio.',
      'En todos los tipos son obligatorios el número de empleado, nombre completo, fecha de solicitud, fecha de inicio y fecha de fin.',
    ],
  },
  {
    title: 'Generación Word',
    items: [
      'Cuando una Licencia sin sueldo o una Excedencia está Pendiente de firma, el Word puede generarse tanto desde la tabla como desde la ficha de detalle.',
      'Para Excedencia se utiliza su plantilla DOCX configurada en Ajustes y, al aprobarla, TrAccion intenta generar automáticamente el documento.',
      'Los datos personales necesarios se obtienen de Plantilla por número de empleado. Si falta información obligatoria o la plantilla no es válida, TrAccion avisa antes de generar un documento incompleto.',
      'Las prórrogas de Excedencia conservan su generación Word específica cuando corresponda.',
    ],
  },
  {
    title: 'Flujo recomendado',
    ordered: true,
    items: [
      'Crear la solicitud con la persona, el tipo y las fechas correspondientes.',
      'Revisar la bandeja Pendientes de aprobar y abrir la ficha con un clic cuando necesites el detalle.',
      'Aprobar la solicitud para pasarla a Pendiente de firma.',
      'Generar o regenerar el Word desde la tabla o desde la propia ficha.',
      'Registrar la firma recibida para completar el flujo y consultar posteriormente Vigentes o Histórico.',
    ],
  },
];

const estadoLabels: Record<LicenciaSinSueldoEstado, string> = {
  pendiente_aprobacion: 'Pendiente aprobar',
  pendiente_firma: 'Pendiente firma',
  vigente: 'Vigente',
  denegada: 'Denegada',
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
  {
    key: 'ultimaActualizacion',
    header: 'Última actualización',
    value: (record) => getLatestUpdateText(record),
  },
  { key: 'observaciones', header: 'Observaciones', value: (record) => record.observaciones },
];

export { toLocalIsoDate as todayIso } from '../../../utils/dateOnly';

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

export function getLatestUpdateText(record: LicenciaSinSueldoRecord): string {
  return record.actualizaciones[record.actualizaciones.length - 1]?.texto ?? '';
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
  const sourceDate =
    record.estado === 'denegada'
      ? (record.actualizaciones[record.actualizaciones.length - 1]?.fecha.slice(0, 10) ??
        record.fechaSolicitud)
      : (record.prorroga?.fechaFin ?? record.fechaFin);
  const year = Number(sourceDate.slice(0, 4));
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
    prorroga: record.prorroga ?? null,
  };
}

import type { ExportColumn } from '../../../shared/export/types';
import type { TableViewPreferences } from '../../../shared/table/useTableViewPreferences';
import type { TeletrabajoSolicitud } from '../domain/solicitud';

export type TeletrabajoTableColumnId =
  | 'revisado'
  | 'estado'
  | 'empleado'
  | 'nombreApellidos'
  | 'puestoOrganizativo'
  | 'teletrabajable'
  | 'residencia'
  | 'tipoSolicitud'
  | 'diasTeletrabajo'
  | 'periodo'
  | 'actions';

export const TELETRABAJO_TABLE_STORAGE_KEY = 'traccion.tableView.teletrabajo.solicitudes';

export const teletrabajoTableColumnIds: readonly TeletrabajoTableColumnId[] = [
  'revisado',
  'estado',
  'empleado',
  'nombreApellidos',
  'puestoOrganizativo',
  'teletrabajable',
  'residencia',
  'tipoSolicitud',
  'diasTeletrabajo',
  'periodo',
  'actions',
];

export const defaultTeletrabajoTablePreferences: TableViewPreferences<TeletrabajoTableColumnId> = {
  sort: null,
  columnWidths: {},
  columnOrder: null,
};

export const teletrabajoExportColumns: ExportColumn<TeletrabajoSolicitud>[] = [
  { key: 'revisado', header: 'Revisado', value: (solicitud) => (solicitud.revisado ? 'Sí' : 'No') },
  {
    key: 'estado',
    header: 'Estado',
    value: (solicitud) => {
      const labels: Record<string, string> = {
        pendiente: 'Pendiente',
        analizada: 'Analizada',
        aprobada: 'Aprobada',
        denegada: 'Rechazada',
        desistida: 'Desistida',
      };
      return labels[solicitud.estado] ?? solicitud.estado;
    },
  },
  { key: 'empleado', header: 'Empleado', value: (solicitud) => solicitud.empleado },
  {
    key: 'nombreApellidos',
    header: 'Nombre y apellidos',
    value: (solicitud) => solicitud.nombreApellidos,
  },
  {
    key: 'puestoOrganizativo',
    header: 'Puesto organizativo',
    value: (solicitud) => solicitud.puestoOrganizativo,
  },
  {
    key: 'teletrabajable',
    header: 'Incidencias',
    value: (solicitud) => solicitud.puestoOrganizativo,
  },
  { key: 'residencia', header: 'Residencia', value: (solicitud) => solicitud.residencia },
  { key: 'tipoSolicitud', header: 'Tipo', value: (solicitud) => solicitud.tipoSolicitud },
  {
    key: 'diasTeletrabajo',
    header: 'Días',
    value: (solicitud) => solicitud.diasTeletrabajo.join(', '),
  },
  { key: 'periodo', header: 'Periodo', value: (solicitud) => solicitud.periodo },
];

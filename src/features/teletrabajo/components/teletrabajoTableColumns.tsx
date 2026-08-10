import { AlertTriangle, CheckCircle2, FileText, XCircle } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { DataTableColumn } from '../../../shared/table/DataTable';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { Employee } from '../../plantilla/domain/employee';
import type { buildGruposCoberturaByIdMap } from '../domain/gruposCobertura';
import type {
  buildPuestosByKey,
  buildSolicitudesByPeriodoPuestoCount,
} from '../domain/semaforo';
import type { TeletrabajoSolicitud } from '../domain/solicitud';
import { getTeletrabajoIncidentMeta } from '../domain/incidentView';
import type { TeletrabajoTableColumnId } from './teletrabajoTableConfig';

export interface TeletrabajoIncidentTooltipState {
  title: string;
  x: number;
  y: number;
}

interface BuildTeletrabajoTableColumnsParams {
  alert: (message: string, options?: { title?: string; type?: 'info' | 'warning' | 'error' }) => Promise<void>;
  employeesByEmpleado: Map<string, Employee>;
  generatingWordId: string | null;
  gruposByIdMap: ReturnType<typeof buildGruposCoberturaByIdMap>;
  handleGenerateWord: (solicitud: TeletrabajoSolicitud) => Promise<void>;
  puestosByKey: ReturnType<typeof buildPuestosByKey>;
  removeWithConcurrencyCheck: (
    id: string,
    expectedUpdatedAt: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  setIncidentTooltip: Dispatch<SetStateAction<TeletrabajoIncidentTooltipState | null>>;
  solicitudesByPuestoCount: ReturnType<typeof buildSolicitudesByPeriodoPuestoCount>;
}

export function buildTeletrabajoTableColumns({
  alert,
  employeesByEmpleado,
  generatingWordId,
  gruposByIdMap,
  handleGenerateWord,
  puestosByKey,
  removeWithConcurrencyCheck,
  setIncidentTooltip,
  solicitudesByPuestoCount,
}: BuildTeletrabajoTableColumnsParams): Array<
  DataTableColumn<TeletrabajoSolicitud, TeletrabajoTableColumnId>
> {
  return [
    {
      id: 'revisado',
      header: 'Revisado',
      accessor: (s) => (s.revisado ? 1 : 0),
      render: (s) => (
        <StatusBadge
          tone={s.revisado ? 'success' : 'warning'}
          title={s.revisado ? 'Solicitud revisada' : 'Solicitud pendiente de revisar'}
        >
          {s.revisado ? 'Sí' : 'No'}
        </StatusBadge>
      ),
      width: 96,
      minWidth: 84,
      maxWidth: 130,
      sortable: true,
      className: 'text-center',
    },
    {
      id: 'estado',
      header: 'Estado',
      accessor: (s) => s.estado,
      render: (s) => {
        const estadoTones: Record<string, 'warning' | 'info' | 'success' | 'error' | 'muted'> = {
          pendiente: 'warning',
          analizada: 'info',
          aprobada: 'success',
          denegada: 'error',
          desistida: 'muted',
        };
        const estadoLabels: Record<string, string> = {
          pendiente: 'Pendiente',
          analizada: 'Analizada',
          aprobada: 'Aprobada',
          denegada: 'Rechazada',
          desistida: 'Desistida',
        };
        const tone = estadoTones[s.estado] ?? 'muted';
        const label = estadoLabels[s.estado] ?? s.estado;
        return (
          <StatusBadge tone={tone} title={label}>
            {label}
          </StatusBadge>
        );
      },
      width: 110,
      minWidth: 90,
      maxWidth: 180,
      sortable: true,
      className: 'text-center',
    },
    {
      id: 'empleado',
      header: 'Empleado',
      tone: 'identity',
      accessor: (s) => Number(s.empleado) || s.empleado,
      render: (s) => s.empleado,
      width: 105,
      minWidth: 85,
      maxWidth: 170,
      sortable: true,
      className: 'font-semibold text-metro-text',
    },
    {
      id: 'nombreApellidos',
      header: 'Nombre y apellidos',
      accessor: (s) => s.nombreApellidos,
      render: (s) => s.nombreApellidos,
      width: 220,
      minWidth: 160,
      maxWidth: 420,
      sortable: true,
      className: 'text-metro-text',
    },
    {
      id: 'puestoOrganizativo',
      header: 'Puesto organizativo',
      accessor: (s) => s.puestoOrganizativo,
      render: (s) => s.puestoOrganizativo,
      width: 190,
      minWidth: 140,
      maxWidth: 360,
      sortable: true,
      className: 'text-metro-muted',
    },
    {
      id: 'teletrabajable',
      header: 'Incidencias',
      tone: 'attention',
      accessor: (s) =>
        getTeletrabajoIncidentMeta(
          s,
          puestosByKey,
          solicitudesByPuestoCount,
          employeesByEmpleado,
          gruposByIdMap,
        ).status,
      render: (s) => {
        const meta = getTeletrabajoIncidentMeta(
          s,
          puestosByKey,
          solicitudesByPuestoCount,
          employeesByEmpleado,
          gruposByIdMap,
        );
        const tone =
          meta.status === 'ok' ? 'success' : meta.status === 'review' ? 'warning' : 'error';
        const icon =
          meta.status === 'ok' ? (
            <CheckCircle2 size={15} />
          ) : meta.status === 'review' ? (
            <AlertTriangle size={15} />
          ) : (
            <XCircle size={15} />
          );

        return (
          <StatusBadge
            aria-label={meta.title}
            className="h-7 min-w-[9.5rem]"
            icon={icon}
            tone={tone}
            onMouseEnter={(event) =>
              setIncidentTooltip({
                title: meta.title,
                x: event.clientX,
                y: event.clientY,
              })
            }
            onMouseLeave={() => setIncidentTooltip(null)}
            onMouseMove={(event) =>
              setIncidentTooltip((current) =>
                current ? { ...current, x: event.clientX, y: event.clientY } : current,
              )
            }
          >
            {meta.label}
          </StatusBadge>
        );
      },
      width: 200,
      minWidth: 160,
      maxWidth: 280,
      sortable: true,
      className: 'text-center',
    },
    {
      id: 'residencia',
      header: 'Residencia',
      accessor: (s) => s.residencia,
      render: (s) => s.residencia,
      width: 130,
      minWidth: 100,
      maxWidth: 240,
      sortable: true,
      className: 'text-metro-muted',
    },
    {
      id: 'tipoSolicitud',
      header: 'Tipo',
      accessor: (s) => s.tipoSolicitud,
      render: (s) => s.tipoSolicitud,
      width: 110,
      minWidth: 90,
      maxWidth: 180,
      sortable: true,
      className: 'text-metro-muted',
    },
    {
      id: 'diasTeletrabajo',
      header: 'Días',
      accessor: (s) => s.diasTeletrabajo.join(', '),
      render: (s) => s.diasTeletrabajo.join(', '),
      width: 150,
      minWidth: 110,
      maxWidth: 240,
      sortable: true,
      className: 'text-metro-muted',
    },
    {
      id: 'periodo',
      header: 'Periodo',
      accessor: (s) => s.periodo,
      render: (s) => s.periodo,
      width: 110,
      minWidth: 90,
      maxWidth: 180,
      sortable: true,
      className: 'text-metro-muted',
    },
    {
      id: 'actions',
      header: 'Acciones',
      render: (solicitud) => (
        <div className="inline-flex items-center justify-end gap-1">
          {solicitud.estado === 'aprobada' && (
            <button
              aria-label="Generar acuerdo Word"
              data-tip="Generar acuerdo Word"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-metro-border bg-metro-surface text-xs font-black text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
              disabled={generatingWordId !== null}
              onClick={(event) => {
                event.stopPropagation();
                void handleGenerateWord(solicitud);
              }}
              title="Generar acuerdo Word"
              type="button"
            >
              {generatingWordId === solicitud.id ? <FileText size={13} /> : 'W'}
            </button>
          )}
          <button
            className="rounded-lg bg-metro-red px-2.5 py-1 text-xs font-semibold text-white hover:bg-metro-dark"
            onClick={(event) => {
              event.stopPropagation();
              void (async () => {
                const result = await removeWithConcurrencyCheck(solicitud.id, solicitud.updatedAt);
                if (!result.ok) {
                  await alert(result.message ?? 'No se pudo eliminar la solicitud.', { type: 'error' });
                }
              })();
            }}
            type="button"
          >
            Eliminar
          </button>
        </div>
      ),
      width: 100,
      minWidth: 95,
      maxWidth: 130,
      resizable: false,
      isActionColumn: true,
      className: 'whitespace-nowrap',
    },
  ];
}

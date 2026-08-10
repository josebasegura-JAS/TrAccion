import type { Employee } from '../../plantilla/domain/employee';
import { buildGruposCoberturaByIdMap } from './gruposCobertura';
import {
  buildPuestosByKey,
  buildSolicitudesByPeriodoPuestoCount,
  getTeletrabajoIncidentSummary,
} from './semaforo';
import type { TeletrabajoSolicitud } from './solicitud';

export type TeletrabajoIncidentFilter =
  | ''
  | 'conflictos'
  | 'bloqueantes'
  | 'revisadasPendientes'
  | 'sinRevisar'
  | 'listasAprobar';

export interface TeletrabajoIncidentMeta {
  status: 'ok' | 'review' | 'blocked';
  label: string;
  title: string;
  isReviewedPending: boolean;
  isReadyToApprove: boolean;
}

export const TELETRABAJO_INCIDENT_FILTER_LABELS: Record<
  Exclude<TeletrabajoIncidentFilter, ''>,
  string
> = {
  conflictos: 'Con incidencias',
  bloqueantes: 'Bloqueantes',
  revisadasPendientes: 'Revisadas pendientes',
  sinRevisar: 'Sin revisar',
  listasAprobar: 'Listas para aprobar',
};

export function getTeletrabajoIncidentMeta(
  solicitud: TeletrabajoSolicitud,
  puestosByKey: ReturnType<typeof buildPuestosByKey>,
  solicitudesByPuestoCount: ReturnType<typeof buildSolicitudesByPeriodoPuestoCount>,
  employeesByEmpleado: Map<string, Employee>,
  gruposById: ReturnType<typeof buildGruposCoberturaByIdMap>,
): TeletrabajoIncidentMeta {
  const summary = getTeletrabajoIncidentSummary(
    solicitud,
    puestosByKey,
    solicitudesByPuestoCount,
    employeesByEmpleado,
    gruposById,
  );
  const isReviewedPending = solicitud.revisado && solicitud.estado === 'pendiente';
  const isReadyToApprove =
    solicitud.revisado && solicitud.estado === 'analizada' && summary.status === 'ok';

  if (summary.status === 'blocked') {
    return {
      status: 'blocked',
      label: summary.label,
      title: summary.title,
      isReviewedPending,
      isReadyToApprove,
    };
  }

  if (summary.status === 'review') {
    return {
      status: 'review',
      label: summary.label,
      title: summary.title,
      isReviewedPending,
      isReadyToApprove,
    };
  }

  return {
    status: 'ok',
    label: summary.label,
    title: isReviewedPending
      ? `${summary.title} Solicitud revisada que sigue en estado pendiente: queda una decisión manual por resolver, pero no hay incidencia objetiva de condiciones.`
      : summary.title,
    isReviewedPending,
    isReadyToApprove,
  };
}

export function matchesIncidentFilter(
  solicitud: TeletrabajoSolicitud,
  filter: TeletrabajoIncidentFilter,
  puestosByKey: ReturnType<typeof buildPuestosByKey>,
  solicitudesByPuestoCount: ReturnType<typeof buildSolicitudesByPeriodoPuestoCount>,
  employeesByEmpleado: Map<string, Employee>,
  gruposById: ReturnType<typeof buildGruposCoberturaByIdMap>,
): boolean {
  if (!filter) {
    return true;
  }

  const meta = getTeletrabajoIncidentMeta(
    solicitud,
    puestosByKey,
    solicitudesByPuestoCount,
    employeesByEmpleado,
    gruposById,
  );

  if (filter === 'conflictos') {
    return meta.status !== 'ok';
  }

  if (filter === 'bloqueantes') {
    return meta.status === 'blocked';
  }

  if (filter === 'revisadasPendientes') {
    return meta.isReviewedPending;
  }

  if (filter === 'sinRevisar') {
    return !solicitud.revisado;
  }

  if (filter === 'listasAprobar') {
    return meta.isReadyToApprove;
  }

  return true;
}

export function getTeletrabajoRowClassName(
  meta: TeletrabajoIncidentMeta,
  estado: TeletrabajoSolicitud['estado'],
): string {
  if (estado === 'denegada' || estado === 'desistida') {
    return 'border-l-4 border-slate-500/50 bg-slate-900/20 text-slate-200 hover:bg-slate-900/30';
  }

  if (meta.status === 'blocked') {
    return 'border-l-4 border-red-400 bg-red-950/30 text-red-100 hover:bg-red-950/40';
  }

  if (meta.status === 'review' || meta.isReviewedPending) {
    return 'border-l-4 border-amber-400 bg-amber-950/20 text-amber-50 hover:bg-amber-950/30';
  }

  return '';
}

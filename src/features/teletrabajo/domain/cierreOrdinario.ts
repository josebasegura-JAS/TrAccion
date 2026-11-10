import { getTeletrabajoModalidad, getTeletrabajoOrdinaryDeadline, isTeletrabajoOrdinaryAdmissionClosed } from './modalidadTramitacion';
import type { TeletrabajoSolicitud, TeletrabajoEstado } from './solicitud';

export const TELETRABAJO_CIERRE_PREFIX = '__teletrabajo_ordinary_closure_v1__:';

export interface TeletrabajoOrdinaryClosure {
  kind: 'teletrabajo-ordinary-closure-v1';
  periodo: string;
  deadline: string;
  capturedAt: string;
  /** Fotografía inmutable del estado en el momento de registrar el cierre. */
  entries: Array<{ id: string; estado: TeletrabajoEstado; fechaSolicitud: string }>;
  /** Solicitudes legacy sin fecha verificable: no se adscriben artificialmente. */
  unclassifiedCount: number;
}

export function getTeletrabajoClosureId(periodo: string): string {
  return `${TELETRABAJO_CIERRE_PREFIX}${periodo.trim()}`;
}

export function parseTeletrabajoClosure(value: string): TeletrabajoOrdinaryClosure | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const v = parsed as Partial<TeletrabajoOrdinaryClosure>;
    if (v.kind !== 'teletrabajo-ordinary-closure-v1'
      || typeof v.periodo !== 'string'
      || typeof v.deadline !== 'string'
      || typeof v.capturedAt !== 'string'
      || !Array.isArray(v.entries)
      || typeof v.unclassifiedCount !== 'number'
      || !v.entries.every((entry) =>
        entry && typeof entry.id === 'string' && typeof entry.estado === 'string' && typeof entry.fechaSolicitud === 'string'
      )) return null;
    return v as TeletrabajoOrdinaryClosure;
  } catch {
    return null;
  }
}

export function buildTeletrabajoOrdinaryClosure(
  periodo: string,
  solicitudes: readonly TeletrabajoSolicitud[],
  at: Date,
): TeletrabajoOrdinaryClosure {
  const deadline = getTeletrabajoOrdinaryDeadline(periodo);
  if (!deadline || !isTeletrabajoOrdinaryAdmissionClosed(periodo, at)) {
    throw new Error('La campaña ordinaria no ha alcanzado todavía su cierre de admisión.');
  }
  const relevant = solicitudes.filter((s) => s.periodo === periodo && !s.deletedAt);
  return {
    kind: 'teletrabajo-ordinary-closure-v1',
    periodo,
    deadline,
    capturedAt: at.toISOString(),
    entries: relevant.filter((s) => getTeletrabajoModalidad(s) === 'ordinaria')
      .map(({ id, estado, fechaSolicitud }) => ({ id, estado, fechaSolicitud }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    unclassifiedCount: relevant.filter((s) => getTeletrabajoModalidad(s) === 'sin_clasificar').length,
  };
}

export function filterSolicitudesByTeletrabajoModalidad(
  solicitudes: readonly TeletrabajoSolicitud[],
  modalidad: 'ordinaria' | 'extraordinaria' | 'sin_clasificar',
): TeletrabajoSolicitud[] {
  return solicitudes.filter((s) => getTeletrabajoModalidad(s) === modalidad);
}

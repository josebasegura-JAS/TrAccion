import type { TeletrabajoSolicitud, TeletrabajoTipoSolicitud } from './solicitud';

export function getPreviousTeletrabajoPeriodo(periodo: string): string | null {
  const trimmed = periodo.trim();
  if (!trimmed) {
    return null;
  }

  const rangeMatch = /^(\d{4})(\D+)(\d{4})$/.exec(trimmed);
  if (rangeMatch) {
    return `${Number(rangeMatch[1]) - 1}${rangeMatch[2]}${Number(rangeMatch[3]) - 1}`;
  }

  const yearMatch = /^(\d{4})$/.exec(trimmed);
  if (yearMatch) {
    return `${Number(yearMatch[1]) - 1}`;
  }

  return null;
}

export function hasPreviousTeletrabajo(
  solicitud: Pick<TeletrabajoSolicitud, 'empleado' | 'periodo'>,
  solicitudes: readonly TeletrabajoSolicitud[],
  options: { excludeSolicitudId?: string | null } = {},
): boolean {
  const empleado = solicitud.empleado.trim();
  const previousPeriodo = getPreviousTeletrabajoPeriodo(solicitud.periodo);

  if (!empleado || !previousPeriodo) {
    return false;
  }

  return solicitudes.some((candidate) => {
    if (options.excludeSolicitudId && candidate.id === options.excludeSolicitudId) {
      return false;
    }

    return (
      !candidate.deletedAt &&
      candidate.empleado.trim() === empleado &&
      candidate.periodo.trim() === previousPeriodo &&
      candidate.diasTeletrabajo.length > 0 &&
      (candidate.estado === 'aprobada' || candidate.estado === 'analizada')
    );
  });
}

export function resolveTeletrabajoTipoSolicitud(
  solicitud: Pick<TeletrabajoSolicitud, 'empleado' | 'periodo'>,
  solicitudes: readonly TeletrabajoSolicitud[],
  options: { excludeSolicitudId?: string | null } = {},
): TeletrabajoTipoSolicitud {
  return hasPreviousTeletrabajo(solicitud, solicitudes, options) ? 'renovacion' : 'nueva';
}

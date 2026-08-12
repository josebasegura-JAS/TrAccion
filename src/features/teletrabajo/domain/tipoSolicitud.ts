import { sameEmployeeNumber } from '../../plantilla/domain/employeeMaster';
import type { TeletrabajoSolicitud, TeletrabajoTipoSolicitud } from './solicitud';

/**
 * Calcula el periodo que queda `yearsBack` años antes de `periodo`, respetando
 * el mismo formato (rango "2026-2027" o año suelto "2026"). `yearsBack` debe
 * ser un entero positivo; con 1 devuelve el periodo inmediatamente anterior.
 */
export function getTeletrabajoPeriodoOffset(periodo: string, yearsBack: number): string | null {
  const trimmed = periodo.trim();
  if (!trimmed) {
    return null;
  }

  const rangeMatch = /^(\d{4})(\D+)(\d{4})$/.exec(trimmed);
  if (rangeMatch) {
    return `${Number(rangeMatch[1]) - yearsBack}${rangeMatch[2]}${Number(rangeMatch[3]) - yearsBack}`;
  }

  const yearMatch = /^(\d{4})$/.exec(trimmed);
  if (yearMatch) {
    return `${Number(yearMatch[1]) - yearsBack}`;
  }

  return null;
}

export function getPreviousTeletrabajoPeriodo(periodo: string): string | null {
  return getTeletrabajoPeriodoOffset(periodo, 1);
}

/**
 * Comprueba si un empleado tuvo teletrabajo concedido (aprobada o analizada,
 * con algún día solicitado) en un periodo concreto. Es la pieza reutilizable
 * tanto para calcular el tipo de solicitud (nueva/renovación, solo mira 1 año
 * atrás) como para el Excel de Dirección (mira varios años atrás).
 */
export function hasTeletrabajoEnPeriodo(
  empleado: string,
  periodo: string | null,
  solicitudes: readonly TeletrabajoSolicitud[],
  options: { excludeSolicitudId?: string | null } = {},
): boolean {
  const empleadoTrim = empleado.trim();
  const periodoTrim = periodo?.trim();

  if (!empleadoTrim || !periodoTrim) {
    return false;
  }

  return solicitudes.some((candidate) => {
    if (options.excludeSolicitudId && candidate.id === options.excludeSolicitudId) {
      return false;
    }

    return (
      !candidate.deletedAt &&
      sameEmployeeNumber(candidate.empleado, empleadoTrim) &&
      candidate.periodo.trim() === periodoTrim &&
      candidate.diasTeletrabajo.length > 0 &&
      (candidate.estado === 'aprobada' || candidate.estado === 'analizada')
    );
  });
}

export function hasPreviousTeletrabajo(
  solicitud: Pick<TeletrabajoSolicitud, 'empleado' | 'periodo'>,
  solicitudes: readonly TeletrabajoSolicitud[],
  options: { excludeSolicitudId?: string | null } = {},
): boolean {
  const previousPeriodo = getPreviousTeletrabajoPeriodo(solicitud.periodo);
  return hasTeletrabajoEnPeriodo(solicitud.empleado, previousPeriodo, solicitudes, options);
}

export function resolveTeletrabajoTipoSolicitud(
  solicitud: Pick<TeletrabajoSolicitud, 'empleado' | 'periodo'>,
  solicitudes: readonly TeletrabajoSolicitud[],
  options: { excludeSolicitudId?: string | null } = {},
): TeletrabajoTipoSolicitud {
  return hasPreviousTeletrabajo(solicitud, solicitudes, options) ? 'renovacion' : 'nueva';
}

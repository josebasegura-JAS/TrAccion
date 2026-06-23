import type { Employee } from '../../plantilla/domain/employee';
import { evaluateTeletrabajoAntiguedad } from './antiguedad';
import { normalizeTeletrabajoPuesto, type TeletrabajoPuesto } from './puestosTeletrabajo';
import type { TeletrabajoSolicitud } from './solicitud';

export type TeletrabajoSemaforoStatus = 'ok' | 'review' | 'blocked';

export interface TeletrabajoSemaforo {
  status: TeletrabajoSemaforoStatus;
  title: string;
}

export function buildPuestosByKey(
  puestos: readonly TeletrabajoPuesto[],
): Map<string, TeletrabajoPuesto> {
  return new Map(
    puestos
      .filter((puesto) => !puesto.deletedAt)
      .map((puesto) => [normalizeTeletrabajoPuesto(puesto.puesto), puesto]),
  );
}

export function buildSolicitudPeriodoPuestoKey(periodo: string, puestoKey: string): string {
  return `${(periodo ?? '').trim()}::${puestoKey}`;
}

/**
 * Cuenta las solicitudes activas (no eliminadas ni denegadas) por puesto,
 * agrupadas también por periodo: cada solicitud solo compite por la
 * presencialidad mínima con las demás solicitudes de su mismo periodo.
 */
export function buildSolicitudesByPeriodoPuestoCount(
  solicitudes: readonly TeletrabajoSolicitud[],
): Map<string, number> {
  const counts = new Map<string, number>();

  solicitudes.forEach((solicitud) => {
    if (solicitud.deletedAt || solicitud.estado === 'denegada') {
      return;
    }

    const puestoKey = normalizeTeletrabajoPuesto(solicitud.puestoOrganizativo);
    if (!puestoKey) {
      return;
    }

    const key = buildSolicitudPeriodoPuestoKey(solicitud.periodo, puestoKey);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return counts;
}

export function getTeletrabajoSemaforo(
  solicitud: TeletrabajoSolicitud,
  puestosByKey: Map<string, TeletrabajoPuesto>,
  solicitudesByPuestoCount: Map<string, number>,
  employeesByEmpleado: Map<string, Employee>,
): TeletrabajoSemaforo {
  const antiguedad = evaluateTeletrabajoAntiguedad(
    solicitud,
    employeesByEmpleado.get((solicitud.empleado ?? '').trim()),
  );

  if (antiguedad.status === 'no-cumple') {
    return {
      status: 'blocked',
      title: antiguedad.title,
    };
  }

  if (antiguedad.status === 'sin-dato') {
    return {
      status: 'review',
      title: antiguedad.title,
    };
  }

  const puestoKey = normalizeTeletrabajoPuesto(solicitud.puestoOrganizativo);
  if (!puestoKey) {
    return {
      status: 'blocked',
      title: 'La solicitud no tiene puesto organizativo informado.',
    };
  }

  const puesto = puestosByKey.get(puestoKey);
  if (!puesto) {
    return {
      status: 'blocked',
      title: `El puesto organizativo «${solicitud.puestoOrganizativo}» no está marcado como teletrabajable.`,
    };
  }

  const solicitudesDelPuesto =
    solicitudesByPuestoCount.get(buildSolicitudPeriodoPuestoKey(solicitud.periodo, puestoKey)) ?? 0;
  if (puesto.maxSolicitudes > 0 && solicitudesDelPuesto > puesto.maxSolicitudes) {
    return {
      status: 'review',
      title: `Revisar: ${solicitudesDelPuesto} solicitudes activas para presencialidad mínima ${puesto.maxSolicitudes}.`,
    };
  }

  return {
    status: 'ok',
    title: puesto.observaciones
      ? `Puesto teletrabajable. ${puesto.observaciones}`
      : 'Puesto teletrabajable.',
  };
}

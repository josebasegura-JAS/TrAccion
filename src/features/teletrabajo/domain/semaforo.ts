import type { Employee } from '../../plantilla/domain/employee';
import { evaluateTeletrabajoAntiguedad } from './antiguedad';
import { normalizeTeletrabajoPuesto, type TeletrabajoPuesto } from './puestosTeletrabajo';
import { TELETRABAJO_DIAS, type TeletrabajoDia, type TeletrabajoSolicitud } from './solicitud';

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
export function buildSolicitudPeriodoPuestoDiaKey(
  periodo: string,
  puestoKey: string,
  dia: TeletrabajoDia,
): string {
  return `${buildSolicitudPeriodoPuestoKey(periodo, puestoKey)}::${dia}`;
}

/**
 * Cuenta solicitudes activas por puesto, periodo y día de teletrabajo.
 * La presencialidad mínima se comprueba por día: dos solicitudes del mismo
 * puesto no compiten entre sí si piden días distintos.
 */
export function buildSolicitudesByPeriodoPuestoDiaCount(
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

    solicitud.diasTeletrabajo.forEach((dia) => {
      const key = buildSolicitudPeriodoPuestoDiaKey(solicitud.periodo, puestoKey, dia);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });

  return counts;
}

export const buildSolicitudesByPeriodoPuestoCount = buildSolicitudesByPeriodoPuestoDiaCount;

export function getTeletrabajoSemaforo(
  solicitud: TeletrabajoSolicitud,
  puestosByKey: Map<string, TeletrabajoPuesto>,
  solicitudesByPuestoDiaCount: Map<string, number>,
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
      title: 'Falta puesto organizativo en la solicitud.',
    };
  }

  const puesto = puestosByKey.get(puestoKey);
  if (!puesto) {
    return {
      status: 'blocked',
      title: `Puesto no teletrabajable: «${solicitud.puestoOrganizativo}» no está configurado como teletrabajable.`,
    };
  }

  const presencialidadMinima = puesto.maxSolicitudes;
  if (presencialidadMinima > 0) {
    const empleadosDelPuesto = new Set(
      Array.from(employeesByEmpleado.values())
        .filter((employee) => normalizeTeletrabajoPuesto(employee.puestoOrganizativo) === puestoKey)
        .map((employee) => employee.empleado.trim()),
    );
    const totalPersonasPuesto = empleadosDelPuesto.size;

    const diasSolicitados =
      solicitud.diasTeletrabajo.length > 0 ? solicitud.diasTeletrabajo : TELETRABAJO_DIAS;
    const conflictos = diasSolicitados
      .map((dia) => {
        const solicitudesDia =
          solicitudesByPuestoDiaCount.get(
            buildSolicitudPeriodoPuestoDiaKey(solicitud.periodo, puestoKey, dia),
          ) ?? 0;
        const presencialesDia = totalPersonasPuesto - solicitudesDia;
        return { dia, solicitudesDia, presencialesDia };
      })
      .filter(
        ({ solicitudesDia, presencialesDia }) =>
          solicitudesDia > 0 && presencialesDia < presencialidadMinima,
      );

    if (conflictos.length > 0) {
      const detail = conflictos
        .map(({ dia, solicitudesDia, presencialesDia }) => {
          const presencialesResultantes = Math.max(presencialesDia, 0);
          const personasFaltantes = presencialidadMinima - presencialesResultantes;

          return `${dia}: hay ${solicitudesDia} ${solicitudesDia === 1 ? 'persona solicitando' : 'personas solicitando'} teletrabajo y ${presencialesResultantes} ${presencialesResultantes === 1 ? 'persona presencial' : 'personas presenciales'}. Faltaría ${personasFaltantes} ${personasFaltantes === 1 ? 'persona presencial' : 'personas presenciales'} para cumplir el mínimo exigido.`;
        })
        .join(' ');

      return {
        status: 'review',
        title: `Revisar presencialidad. Puesto: ${solicitud.puestoOrganizativo}. Personas del puesto: ${totalPersonasPuesto}. presencialidad mínima requerida: ${presencialidadMinima}. ${detail}`,
      };
    }
  }

  return {
    status: 'ok',
    title: puesto.observaciones
      ? `Sin incidencias detectadas. ${puesto.observaciones}`
      : 'Sin incidencias detectadas.',
  };
}

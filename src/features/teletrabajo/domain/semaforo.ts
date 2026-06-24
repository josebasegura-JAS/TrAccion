import type { Employee } from '../../plantilla/domain/employee';
import { evaluateTeletrabajoAntiguedad } from './antiguedad';
import type { GrupoCobertura } from './gruposCobertura';
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

/**
 * Clave de cobertura de un puesto: si pertenece a un grupo de cobertura (varios
 * puestos coordinados que comparten presencialidad mínima), la clave es el id
 * del grupo. Si no pertenece a ningún grupo, el puesto cubre solo por sí mismo.
 */
function getGrupoCoberturaKey(puesto: TeletrabajoPuesto, puestoKey: string): string {
  return puesto.grupoCoberturaId ? `grupo::${puesto.grupoCoberturaId}` : puestoKey;
}

function getPuestosInGrupo(
  puestosByKey: Map<string, TeletrabajoPuesto>,
  grupoKey: string,
): TeletrabajoPuesto[] {
  return Array.from(puestosByKey.entries())
    .filter(([puestoKey, puesto]) => getGrupoCoberturaKey(puesto, puestoKey) === grupoKey)
    .map(([, puesto]) => puesto);
}

function getDotacionComputableGrupo(
  puestosByKey: Map<string, TeletrabajoPuesto>,
  grupoKey: string,
): number {
  return getPuestosInGrupo(puestosByKey, grupoKey).reduce(
    (total, puesto) => total + Math.max(0, Math.floor(puesto.dotacionComputable ?? 0)),
    0,
  );
}

/**
 * Presencialidad mínima exigida para la clave de cobertura indicada. Si el
 * puesto pertenece a un grupo de cobertura, la presencialidad mínima es la
 * configurada en el grupo (gruposByid); si no pertenece a ningún grupo, es la
 * declarada en el propio puesto (compatibilidad con puestos sin agrupar).
 */
function getPresencialidadMinimaGrupo(
  puestosByKey: Map<string, TeletrabajoPuesto>,
  grupoKey: string,
  gruposById: Map<string, GrupoCobertura>,
): number {
  const [primerPuesto] = getPuestosInGrupo(puestosByKey, grupoKey);
  if (primerPuesto?.grupoCoberturaId) {
    const grupo = gruposById.get(primerPuesto.grupoCoberturaId);
    if (grupo) {
      return Math.max(0, Math.floor(grupo.presencialidadMinima ?? 0));
    }
  }

  return Math.max(
    0,
    ...getPuestosInGrupo(puestosByKey, grupoKey).map((puesto) => Math.max(0, Math.floor(puesto.maxSolicitudes ?? 0))),
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
  puestosByKey?: Map<string, TeletrabajoPuesto>,
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

    const puesto = puestosByKey?.get(puestoKey);
    const coberturaKey = puesto ? getGrupoCoberturaKey(puesto, puestoKey) : puestoKey;

    solicitud.diasTeletrabajo.forEach((dia) => {
      const key = buildSolicitudPeriodoPuestoDiaKey(solicitud.periodo, coberturaKey, dia);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });

  return counts;
}

export const buildSolicitudesByPeriodoPuestoCount = buildSolicitudesByPeriodoPuestoDiaCount;

function pluralPersonas(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function getTeletrabajoSemaforo(
  solicitud: TeletrabajoSolicitud,
  puestosByKey: Map<string, TeletrabajoPuesto>,
  solicitudesByPuestoDiaCount: Map<string, number>,
  employeesByEmpleado: Map<string, Employee>,
  gruposById: Map<string, GrupoCobertura> = new Map(),
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

  const coberturaKey = getGrupoCoberturaKey(puesto, puestoKey);
  const presencialidadMinima = getPresencialidadMinimaGrupo(puestosByKey, coberturaKey, gruposById);
  const diasSolicitados =
    solicitud.diasTeletrabajo.length > 0 ? solicitud.diasTeletrabajo : TELETRABAJO_DIAS;

  // Nº de peticiones activas (mismo periodo, misma cobertura) en cualquiera de
  // los días solicitados por esta solicitud: lo más representativo para el
  // resumen corto, tanto si hay incidencia como si no.
  const peticionesActivas = Math.max(
    0,
    ...diasSolicitados.map(
      (dia) =>
        solicitudesByPuestoDiaCount.get(
          buildSolicitudPeriodoPuestoDiaKey(solicitud.periodo, coberturaKey, dia),
        ) ?? 0,
    ),
  );

  if (presencialidadMinima > 0) {
    const dotacionParametrizada = getDotacionComputableGrupo(puestosByKey, coberturaKey);
    const totalPersonasPuesto = dotacionParametrizada > 0
      ? dotacionParametrizada
      : new Set(
          Array.from(employeesByEmpleado.values())
            .filter((employee) => normalizeTeletrabajoPuesto(employee.puestoOrganizativo) === puestoKey)
            .map((employee) => employee.empleado.trim()),
        ).size;

    const conflictos = diasSolicitados
      .map((dia) => {
        const solicitudesDia =
          solicitudesByPuestoDiaCount.get(
            buildSolicitudPeriodoPuestoDiaKey(solicitud.periodo, coberturaKey, dia),
          ) ?? 0;
        const presencialesDia = totalPersonasPuesto - solicitudesDia;
        return { dia, solicitudesDia, presencialesDia };
      })
      .filter(
        ({ solicitudesDia, presencialesDia }) =>
          solicitudesDia > 0 && presencialesDia < presencialidadMinima,
      );

    if (conflictos.length > 0) {
      const peorConflicto = conflictos.reduce((peor, actual) =>
        actual.presencialesDia < peor.presencialesDia ? actual : peor,
      );
      const presencialesResultantes = Math.max(peorConflicto.presencialesDia, 0);
      const personasFaltantes = presencialidadMinima - presencialesResultantes;
      const diasAfectados = conflictos.map(({ dia }) => dia).join(', ');

      return {
        status: 'review',
        title:
          `Revisar presencialidad mínima · ${pluralPersonas(peticionesActivas, 'petición', 'peticiones')} · mín. ${presencialidadMinima} presenciales · ` +
          `faltan ${pluralPersonas(personasFaltantes, 'persona', 'personas')} (${diasAfectados}).`,
      };
    }

    return {
      status: 'ok',
      title:
        `Sin incidencias · ${pluralPersonas(peticionesActivas, 'petición', 'peticiones')} · mín. ${presencialidadMinima} presenciales` +
        (puesto.observaciones ? ` · ${puesto.observaciones}` : ''),
    };
  }

  return {
    status: 'ok',
    title:
      `Sin incidencias · ${pluralPersonas(peticionesActivas, 'petición', 'peticiones')} · sin mínimo de presencialidad` +
      (puesto.observaciones ? ` · ${puesto.observaciones}` : ''),
  };
}


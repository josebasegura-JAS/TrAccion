import type { Employee } from '../../plantilla/domain/employee';
import { evaluateTeletrabajoAntiguedad } from './antiguedad';
import type { GrupoCobertura } from './gruposCobertura';
import { normalizeTeletrabajoPuesto, type TeletrabajoPuesto } from './puestosTeletrabajo';
import { type TeletrabajoDia, type TeletrabajoSolicitud } from './solicitud';

export type TeletrabajoSemaforoStatus = 'ok' | 'review' | 'blocked';

export interface TeletrabajoSemaforo {
  status: TeletrabajoSemaforoStatus;
  title: string;
}

export type TeletrabajoPresencialidadStatus = 'cumple' | 'no-cumple' | 'revisar';

export interface TeletrabajoPresencialidadEvaluation {
  status: TeletrabajoPresencialidadStatus;
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


function getDotacionRealGrupo(
  employees: Iterable<Employee>,
  puestosByKey: Map<string, TeletrabajoPuesto>,
  grupoKey: string,
): number {
  return new Set(
    Array.from(employees)
      .filter((employee) => {
        if (employee.deletedAt) {
          return false;
        }

        const empleadoKey = employee.empleado.trim();
        if (!empleadoKey) {
          return false;
        }

        const employeePuestoKey = normalizeTeletrabajoPuesto(employee.puestoOrganizativo);
        const employeePuesto = puestosByKey.get(employeePuestoKey);
        return employeePuesto
          ? getGrupoCoberturaKey(employeePuesto, employeePuestoKey) === grupoKey
          : false;
      })
      .map((employee) => employee.empleado.trim()),
  ).size;
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

/**
 * Cuenta solicitudes activas por cobertura y periodo, y mantiene también las
 * claves por día en el mismo mapa para no duplicar recorridos ni romper los
 * consumidores existentes. La clave base (periodo::cobertura) representa
 * personas/solicitudes del puesto; las claves con ::día representan cuántas
 * personas teletrabajan ese día concreto.
 */
export function buildSolicitudesByPeriodoPuestoCount(
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
    const baseKey = buildSolicitudPeriodoPuestoKey(solicitud.periodo, coberturaKey);
    counts.set(baseKey, (counts.get(baseKey) ?? 0) + 1);

    solicitud.diasTeletrabajo.forEach((dia) => {
      const key = buildSolicitudPeriodoPuestoDiaKey(solicitud.periodo, coberturaKey, dia);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });

  return counts;
}

function pluralPersonas(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Evalúa SOLO la presencialidad mínima de una solicitud, sin tener en cuenta
 * el estado de la solicitud (pendiente/aprobada/denegada) ni la antigüedad
 * del empleado: esos son motivos de bloqueo distintos y anteriores que ya
 * gestionan getTeletrabajoSemaforo (app) y buildTeletrabajoAssessment
 * (Excel de Dirección). Esta función responde únicamente a "si esta persona
 * llegara a teletrabajar esos días, ¿se mantiene la presencialidad mínima
 * exigida?", para no mezclar ambos criterios en un único semáforo.
 *
 * Si la solicitud no tiene ningún día de la semana marcado, no se puede
 * saber qué días afectaría, así que se marca como 'revisar' en vez de
 * asumir "todos los días" (que es lo que hace getTeletrabajoSemaforo para
 * el cálculo de conflictos, donde esa suposición es deliberada y distinta).
 */
export function evaluateTeletrabajoPresencialidad(
  solicitud: TeletrabajoSolicitud,
  puestosByKey: Map<string, TeletrabajoPuesto>,
  solicitudesByPuestoDiaCount: Map<string, number>,
  employeesByEmpleado: Map<string, Employee>,
  gruposById: Map<string, GrupoCobertura> = new Map(),
): TeletrabajoPresencialidadEvaluation {
  const puestoKey = normalizeTeletrabajoPuesto(solicitud.puestoOrganizativo);
  if (!puestoKey) {
    return {
      status: 'no-cumple',
      title: 'Falta puesto organizativo en la solicitud.',
    };
  }

  const puesto = puestosByKey.get(puestoKey);
  if (!puesto) {
    return {
      status: 'no-cumple',
      title: `Puesto no teletrabajable: «${solicitud.puestoOrganizativo}» no está configurado como teletrabajable.`,
    };
  }

  if (solicitud.diasTeletrabajo.length === 0) {
    return {
      status: 'revisar',
      title: 'Sin días de la semana marcados: no se puede comprobar la presencialidad mínima.',
    };
  }

  const coberturaKey = getGrupoCoberturaKey(puesto, puestoKey);
  const presencialidadMinima = getPresencialidadMinimaGrupo(puestosByKey, coberturaKey, gruposById);
  const diasSolicitados = solicitud.diasTeletrabajo;

  // Nº de peticiones activas: personas del mismo puesto/cobertura y periodo
  // que han solicitado teletrabajo. No equivale al número de días pedidos ni
  // a las coincidencias en un día concreto; esas cifras solo sirven para la
  // comprobación diaria de presencialidad.
  const peticionesActivas =
    solicitudesByPuestoDiaCount.get(buildSolicitudPeriodoPuestoKey(solicitud.periodo, coberturaKey)) ??
    Math.max(
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
      : getDotacionRealGrupo(employeesByEmpleado.values(), puestosByKey, coberturaKey);

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
        status: 'revisar',
        title:
          `Revisar presencialidad mínima · ${pluralPersonas(peticionesActivas, 'petición', 'peticiones')} · mín. ${presencialidadMinima} presenciales · ` +
          `faltan ${pluralPersonas(personasFaltantes, 'persona', 'personas')} (${diasAfectados}).`,
      };
    }

    return {
      status: 'cumple',
      title:
        `Sin incidencias · ${pluralPersonas(peticionesActivas, 'petición', 'peticiones')} · mín. ${presencialidadMinima} presenciales` +
        (puesto.observaciones ? ` · ${puesto.observaciones}` : ''),
    };
  }

  return {
    status: 'cumple',
    title:
      `Sin incidencias · ${pluralPersonas(peticionesActivas, 'petición', 'peticiones')} · sin mínimo de presencialidad` +
      (puesto.observaciones ? ` · ${puesto.observaciones}` : ''),
  };
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

  const presencialidad = evaluateTeletrabajoPresencialidad(
    solicitud,
    puestosByKey,
    solicitudesByPuestoDiaCount,
    employeesByEmpleado,
    gruposById,
  );

  if (presencialidad.status === 'no-cumple') {
    return {
      status: 'blocked',
      title: presencialidad.title,
    };
  }

  if (presencialidad.status === 'revisar') {
    return {
      status: 'review',
      title: presencialidad.title,
    };
  }

  return {
    status: 'ok',
    title: presencialidad.title,
  };
}

export interface TeletrabajoIncidentSummary {
  status: TeletrabajoSemaforoStatus;
  label: string;
  title: string;
}

function getTeletrabajoIncidentLabel(semaforo: TeletrabajoSemaforo): string {
  if (semaforo.status === 'ok') {
    return 'Sin incidencias';
  }

  const title = semaforo.title.toLocaleLowerCase('es-ES');

  if (title.includes('presencialidad')) {
    return 'Revisar presencialidad';
  }

  if (title.includes('empleado no localizado')) {
    return 'Empleado no localizado';
  }

  if (title.includes('antigüedad insuficiente')) {
    return 'Antigüedad insuficiente';
  }

  if (title.includes('antigüedad')) {
    return 'Revisar antigüedad';
  }

  if (title.includes('falta puesto organizativo')) {
    return 'Falta puesto organizativo';
  }

  if (title.includes('puesto no teletrabajable')) {
    return 'Puesto no teletrabajable';
  }

  return semaforo.status === 'blocked' ? 'Incidencia bloqueante' : 'Revisar incidencia';
}

/**
 * Resumen de incidencia para un único badge en la app: normalmente basta
 * con el semáforo general (getTeletrabajoSemaforo), porque ya incorpora la
 * presencialidad mínima cuando la antigüedad es correcta. La única
 * situación donde antigüedad y presencialidad pueden decir cosas distintas
 * es cuando la antigüedad bloquea o deja en revisión el semáforo general,
 * pero la presencialidad por su lado sí se cumpliría: en ese caso se añade
 * esa información al label/title en vez de mostrar un segundo badge
 * permanente, que sería redundante en el resto de casos.
 */
export function getTeletrabajoIncidentSummary(
  solicitud: TeletrabajoSolicitud,
  puestosByKey: Map<string, TeletrabajoPuesto>,
  solicitudesByPuestoDiaCount: Map<string, number>,
  employeesByEmpleado: Map<string, Employee>,
  gruposById: Map<string, GrupoCobertura> = new Map(),
): TeletrabajoIncidentSummary {
  const semaforo = getTeletrabajoSemaforo(
    solicitud,
    puestosByKey,
    solicitudesByPuestoDiaCount,
    employeesByEmpleado,
    gruposById,
  );
  const antiguedad = evaluateTeletrabajoAntiguedad(
    solicitud,
    employeesByEmpleado.get((solicitud.empleado ?? '').trim()),
  );

  const label = getTeletrabajoIncidentLabel(semaforo);
  let title = semaforo.title;
  let combinedLabel = label;

  if (semaforo.status !== 'ok' && antiguedad.status !== 'cumple') {
    const presencialidad = evaluateTeletrabajoPresencialidad(
      solicitud,
      puestosByKey,
      solicitudesByPuestoDiaCount,
      employeesByEmpleado,
      gruposById,
    );
    if (presencialidad.status === 'cumple') {
      combinedLabel = `${label} · presencialidad OK`;
      title = `${title} En cuanto a presencialidad mínima, no hay incidencia: ${presencialidad.title.toLocaleLowerCase('es-ES')}`;
    }
  }

  return {
    status: semaforo.status,
    label: combinedLabel,
    title,
  };
}

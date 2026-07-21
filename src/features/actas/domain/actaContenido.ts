import type { Task } from '../../tareas/domain/task';
import type { ManagedSession } from '../../../shared/sessions/session';
import type { CensoGrupo, CensoMiembro } from './censo';

/**
 * Contenido real de una sesión (Comité, Paritaria...), separado de `Acta`
 * (en `acta.ts`), que sigue siendo puramente el registro de seguimiento
 * administrativo — estado, plazo, alegaciones, ruta al .docx — sin tocarlo.
 * `ActaContenido` es lo que hasta ahora se escribía a mano directamente en
 * Word: quién asistió, qué se trató en cada punto, qué se votó.
 *
 * Se referencia por `actaId`, uno a uno, en vez de meter estos campos
 * dentro de `Acta` directamente — así ningún código existente que ya
 * trabaja con `Acta` (listados, filtros, alegaciones) tiene que enterarse
 * de esto, y el guardado de "estado del acta" y "contenido de la reunión"
 * pueden evolucionar y guardarse por separado sin pisarse.
 */

// -- Asistencia ---------------------------------------------------------

export const ASISTENCIA_ESTADOS = ['presente', 'ausente', 'suplencia'] as const;
export type AsistenciaEstado = (typeof ASISTENCIA_ESTADOS)[number];

export interface ActaAsistenciaEntry {
  id: string;
  /** Miembro del censo del que procede esta fila, o null si es un invitado puntual no censado. */
  censoMiembroId: string | null;
  /** Copiado del censo en el momento de pasar lista — ver nota en censo.ts sobre por qué no se referencia en vivo. */
  nombre: string;
  organizacion: string;
  grupo: CensoGrupo;
  estado: AsistenciaEstado;
  /** Si estado === 'suplencia', a qué censoMiembroId sustituye. */
  suplenteDeId: string | null;
  /** Formato HH:MM. Vacío si asiste desde el inicio de la sesión. */
  horaEntrada: string;
  /** Formato HH:MM. Vacío si permanece hasta el final. */
  horaSalida: string;
}

export type ActaAsistenciaEntryDraft = Omit<ActaAsistenciaEntry, 'id'>;

/**
 * Siembra la lista de asistencia a partir del censo activo, todos como
 * "presente" por defecto — en la práctica es más rápido marcar las
 * excepciones (ausencias, suplencias) que dar de alta a todo el mundo a
 * mano en cada sesión.
 */
export function buildAsistenciaFromCenso(censo: readonly CensoMiembro[]): ActaAsistenciaEntryDraft[] {
  return censo.map((miembro) => ({
    censoMiembroId: miembro.id,
    nombre: miembro.nombre,
    organizacion: miembro.organizacion,
    grupo: miembro.grupo,
    estado: 'presente',
    suplenteDeId: null,
    horaEntrada: '',
    horaSalida: '',
  }));
}

export function isAsistenciaEstado(value: unknown): value is AsistenciaEstado {
  return typeof value === 'string' && (ASISTENCIA_ESTADOS as readonly string[]).includes(value);
}

// -- Recesos --------------------------------------------------------------

export interface ActaReceso {
  id: string;
  /** Formato HH:MM. */
  horaInicio: string;
  /** Formato HH:MM. Vacío mientras el receso está en curso. */
  horaFin: string;
}

export type ActaRecesoDraft = Omit<ActaReceso, 'id'>;

// -- Puntos del día ---------------------------------------------------------

export const ACTA_PUNTO_RESULTADOS = ['sin_resolver', 'acuerdo', 'sin_acuerdo', 'pendiente_votacion'] as const;
export type ActaPuntoResultado = (typeof ACTA_PUNTO_RESULTADOS)[number];

export interface ActaPunto {
  id: string;
  orden: number;
  /** Tarea de Tareas (fase comité/paritaria) de la que procede este punto, si la hay — no todos los puntos nacen de una tarea (ver "punto previo" en actas reales). */
  taskId: string | null;
  titulo: string;
  /**
   * Texto libre de lo tratado en el punto. Deliberadamente NO estructurado
   * en intervenciones individuales (interviniente/tipo/contenido): en una
   * reunión real el debate tiene turnos cruzados y réplicas que no encajan
   * en una secuencia limpia, y forzar esa estructura mientras se toma nota
   * en vivo iría más lento que escribir directo. Queda para una fase
   * posterior si el texto libre resulta insuficiente en la práctica.
   */
  contenido: string;
  resultado: ActaPuntoResultado;
}

export type ActaPuntoDraft = Omit<ActaPunto, 'id' | 'orden'>;

export function isActaPuntoResultado(value: unknown): value is ActaPuntoResultado {
  return typeof value === 'string' && (ACTA_PUNTO_RESULTADOS as readonly string[]).includes(value);
}

/**
 * Siembra los puntos del día a partir de las tareas tratadas en la sesión
 * de origen (`session.items`, que ya es el orden del día real — ver
 * `buildActaObservacionesFromSession` en acta.ts). El orden respeta el de
 * `session.items`, no el de `treatedTasks`. Las actas reales suelen tener
 * además algún "punto previo" no recogido en el orden del día oficial
 * (una pregunta suelta antes de empezar) — por eso se pueden añadir puntos
 * sueltos sin taskId después de sembrar estos.
 */
export function buildActaPuntosFromSession(
  session: Pick<ManagedSession, 'items'>,
  treatedTasks: readonly Task[],
): ActaPuntoDraft[] {
  const tasksById = new Map(treatedTasks.map((task) => [task.id, task]));

  return session.items.flatMap((taskId) => {
    const task = tasksById.get(taskId);
    if (!task) {
      return [];
    }

    return [
      {
        taskId: task.id,
        titulo: task.titulo,
        contenido: '',
        resultado: 'sin_resolver' as const,
      },
    ];
  });
}

// -- Acuerdos y compromisos -------------------------------------------------

export const ACTA_ACUERDO_ESTADOS = ['pendiente', 'en_curso', 'cumplido'] as const;
export type ActaAcuerdoEstado = (typeof ACTA_ACUERDO_ESTADOS)[number];

export interface ActaAcuerdo {
  id: string;
  puntoId: string;
  descripcion: string;
  responsable: string;
  fechaLimite: string;
  estado: ActaAcuerdoEstado;
  /** Tarea de seguimiento creada en Tareas a partir de este compromiso, si se generó una. */
  tareaSeguimientoId: string | null;
}

export type ActaAcuerdoDraft = Omit<ActaAcuerdo, 'id' | 'tareaSeguimientoId'>;

export function isActaAcuerdoEstado(value: unknown): value is ActaAcuerdoEstado {
  return typeof value === 'string' && (ACTA_ACUERDO_ESTADOS as readonly string[]).includes(value);
}

// -- Votaciones ---------------------------------------------------------

export const VOTACION_POSICIONES = ['favor', 'contra', 'abstencion', 'pendiente', 'no_participa'] as const;
export type VotacionPosicion = (typeof VOTACION_POSICIONES)[number];

export interface ActaVotacionPosicion {
  organizacion: string;
  posicion: VotacionPosicion;
  /** Fecha en la que se registró esta posición, si llegó después de la sesión (p. ej. por email). Null si se dio en la propia reunión. */
  fecha: string | null;
  /** P. ej. "mediante email". Texto libre, opcional. */
  observacion: string;
}

export interface ActaVotacion {
  id: string;
  puntoId: string | null;
  tema: string;
  posiciones: ActaVotacionPosicion[];
}

export type ActaVotacionDraft = Omit<ActaVotacion, 'id'>;

export function isVotacionPosicion(value: unknown): value is VotacionPosicion {
  return typeof value === 'string' && (VOTACION_POSICIONES as readonly string[]).includes(value);
}

/**
 * Recuento de posiciones por categoría. Deliberadamente NO calcula un
 * "resultado legal" de la votación (aprobado/rechazado): la representatividad
 * de cada sindicato no es un simple recuento de asistentes en la mesa, así
 * que afirmar automáticamente quién gana sería una aseveración con
 * implicaciones legales que le corresponde hacer a una persona, no al
 * software. Esto es solo un resumen para redactar el texto, no un veredicto.
 */
export function summarizeVotacionPosiciones(
  votacion: Pick<ActaVotacion, 'posiciones'>,
): Record<VotacionPosicion, number> {
  const summary: Record<VotacionPosicion, number> = {
    favor: 0,
    contra: 0,
    abstencion: 0,
    pendiente: 0,
    no_participa: 0,
  };

  for (const { posicion } of votacion.posiciones) {
    summary[posicion] += 1;
  }

  return summary;
}

export function hasPendingVotacionPosiciones(votacion: Pick<ActaVotacion, 'posiciones'>): boolean {
  return votacion.posiciones.some((entry) => entry.posicion === 'pendiente');
}

// -- Contenido completo -----------------------------------------------------

export interface ActaContenido {
  actaId: string;
  organo: string;
  lugar: string;
  /** Formato HH:MM. */
  horaInicio: string;
  /** Formato HH:MM. Vacío mientras la sesión está en curso. */
  horaFin: string;
  recesos: ActaReceso[];
  asistencia: ActaAsistenciaEntry[];
  puntos: ActaPunto[];
  acuerdos: ActaAcuerdo[];
  votaciones: ActaVotacion[];
  createdAt: string;
  updatedAt: string;
}

export function buildEmptyActaContenido(actaId: string, now: string): ActaContenido {
  return {
    actaId,
    organo: '',
    lugar: '',
    horaInicio: '',
    horaFin: '',
    recesos: [],
    asistencia: [],
    puntos: [],
    acuerdos: [],
    votaciones: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Puntos pendientes de un resultado explícito — para el aviso de control previo a exportar. */
export function selectUnresolvedPuntos(contenido: Pick<ActaContenido, 'puntos'>): ActaPunto[] {
  return contenido.puntos.filter((punto) => punto.resultado === 'sin_resolver');
}

/** Acuerdos sin responsable o sin fecha límite — para el mismo aviso de control previo. */
export function selectIncompleteAcuerdos(contenido: Pick<ActaContenido, 'acuerdos'>): ActaAcuerdo[] {
  return contenido.acuerdos.filter(
    (acuerdo) => acuerdo.responsable.trim().length === 0 || acuerdo.fechaLimite.trim().length === 0,
  );
}

/** Votaciones con alguna posición aún pendiente — para el mismo aviso. */
export function selectVotacionesConPendientes(contenido: Pick<ActaContenido, 'votaciones'>): ActaVotacion[] {
  return contenido.votaciones.filter((votacion) => hasPendingVotacionPosiciones(votacion));
}

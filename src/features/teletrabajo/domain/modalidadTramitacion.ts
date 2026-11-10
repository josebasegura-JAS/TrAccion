import type { TeletrabajoModalidadTramitacion } from './solicitud';

export type TeletrabajoModalidadEvaluada = TeletrabajoModalidadTramitacion | 'sin_clasificar';

export interface TeletrabajoModalidadInput {
  periodo: string;
  fechaSolicitud: string;
  modalidadTramitacion?: TeletrabajoModalidadTramitacion;
}

/** La campaña empieza el 1 de septiembre y cierra admisión ordinaria el 31 de julio previo. */
export function getTeletrabajoOrdinaryDeadline(periodo: string): string | null {
  const match = /^(\d{4})\s*[-/]\s*(\d{4})$/.exec(periodo.trim());
  if (!match || Number(match[2]) !== Number(match[1]) + 1) return null;
  return `${match[1]}-07-31`;
}

export function isValidTeletrabajoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function classifyTeletrabajoSolicitud(input: Pick<TeletrabajoModalidadInput, 'periodo' | 'fechaSolicitud'>): TeletrabajoModalidadEvaluada {
  const deadline = getTeletrabajoOrdinaryDeadline(input.periodo);
  if (!deadline || !isValidTeletrabajoDate(input.fechaSolicitud)) return 'sin_clasificar';
  return input.fechaSolicitud.trim() <= deadline ? 'ordinaria' : 'extraordinaria';
}

/**
 * Un expediente guardado con modalidad explícita conserva esa pertenencia.
 * Los anteriores a esta versión se clasifican solo en memoria cuando su fecha
 * es verificable, sin escritura implícita ni cambios en su updatedAt.
 */
export function getTeletrabajoModalidad(input: TeletrabajoModalidadInput): TeletrabajoModalidadEvaluada {
  if (input.modalidadTramitacion === 'ordinaria' || input.modalidadTramitacion === 'extraordinaria') {
    return input.modalidadTramitacion;
  }
  return classifyTeletrabajoSolicitud(input);
}

export function isTeletrabajoOrdinaryAdmissionClosed(periodo: string, now: Date): boolean {
  const deadline = getTeletrabajoOrdinaryDeadline(periodo);
  if (!deadline) return false;
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  return today > deadline;
}

export function validateNewTeletrabajoAdmission(
  input: Pick<TeletrabajoModalidadInput, 'periodo' | 'fechaSolicitud'>,
  now: Date,
): { ok: true; modalidad: TeletrabajoModalidadTramitacion } | { ok: false; message: string } {
  const deadline = getTeletrabajoOrdinaryDeadline(input.periodo);
  if (!deadline) return { ok: false, message: 'Indica un periodo válido (por ejemplo, 2026-2027).' };
  if (!isValidTeletrabajoDate(input.fechaSolicitud)) {
    return { ok: false, message: 'Indica una fecha de solicitud válida para clasificar su tramitación.' };
  }
  const modalidad = classifyTeletrabajoSolicitud(input);
  if (modalidad === 'sin_clasificar') {
    return { ok: false, message: 'No se ha podido clasificar esta solicitud.' };
  }
  if (modalidad === 'ordinaria' && isTeletrabajoOrdinaryAdmissionClosed(input.periodo, now)) {
    return {
      ok: false,
      message: `La admisión ordinaria del periodo ${input.periodo} se cerró el ${deadline}. No se pueden dar de alta nuevas solicitudes ordinarias; las existentes siguen tramitándose. Verifica la fecha real de presentación.`,
    };
  }
  return { ok: true, modalidad };
}

/**
 * La clasificación de un expediente existente no cambia por una edición
 * accidental de fecha o periodo. Permite rellenar fechas ausentes en
 * expedientes antiguos, pero no convertir una modalidad en otra.
 */
export function validateTeletrabajoClassificationChange(
  previous: TeletrabajoModalidadInput,
  next: Pick<TeletrabajoModalidadInput, 'periodo' | 'fechaSolicitud'>,
): { ok: true; modalidad?: TeletrabajoModalidadTramitacion } | { ok: false; message: string } {
  const previousClass = getTeletrabajoModalidad(previous);
  const nextClass = classifyTeletrabajoSolicitud(next);
  // La pertenencia a una campaña se compone de periodo + modalidad.
  // No basta con comparar "ordinaria": cambiar de 2026 a 2027 también
  // alteraría retroactivamente el censo de la campaña anterior.
  if (previousClass !== 'sin_clasificar'
    && getTeletrabajoOrdinaryDeadline(previous.periodo) !== getTeletrabajoOrdinaryDeadline(next.periodo)) {
    return {
      ok: false,
      message: 'No se puede mover una solicitud ya clasificada a otro periodo editando su ficha. Requiere una rectificación expresa y auditada.',
    };
  }
  if (previousClass !== 'sin_clasificar' && nextClass !== previousClass) {
    return {
      ok: false,
      message: 'No se puede cambiar la pertenencia a la campaña ordinaria o extraordinaria editando la fecha o el periodo. Revisa el expediente y utiliza el procedimiento de rectificación cuando esté disponible.',
    };
  }
  if (previousClass === 'sin_clasificar' && nextClass !== 'sin_clasificar') {
    return { ok: true, modalidad: nextClass };
  }
  return { ok: true, modalidad: previous.modalidadTramitacion };
}

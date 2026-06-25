export interface JobPositionTranslation {
  puestoCastellano: string;
  puestoEuskera: string;
}

export const EMPTY_JOB_POSITION_TRANSLATION: JobPositionTranslation = {
  puestoCastellano: '',
  puestoEuskera: '',
};

export function normalizeJobPosition(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Una traducción está "pendiente" cuando se ha dado de alta (manual o
 * automáticamente, p. ej. al sincronizar contra los puestoOrganizativo de
 * Plantilla) pero todavía no tiene equivalente en euskera. Sirve tanto para
 * resaltar la fila en Traducción de puestos como en Puestos Teletrabajo.
 */
export function isJobPositionTranslationPending(translation: JobPositionTranslation): boolean {
  return !translation.puestoEuskera.trim();
}

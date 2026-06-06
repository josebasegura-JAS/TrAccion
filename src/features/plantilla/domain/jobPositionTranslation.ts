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

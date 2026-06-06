export interface TaskPhaseConfig {
  id: string;
  nombre: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_PHASE_NAMES = [
  'tarea',
  'peticion',
  'comite',
  'paritaria',
  'sesion comite',
  'sesion paritaria',
  'cerrada',
] as const;

const DEFAULT_PHASE_DATE = '2026-01-01T00:00:00.000Z';

export const DEFAULT_TASK_PHASES: TaskPhaseConfig[] = DEFAULT_PHASE_NAMES.map((nombre) => ({
  id: createTaskPhaseIdFromName(nombre),
  nombre,
  active: true,
  createdAt: DEFAULT_PHASE_DATE,
  updatedAt: DEFAULT_PHASE_DATE,
}));

export function createTaskPhaseIdFromName(nombre: string): string {
  const normalized = nombre
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || `fase-${Date.now().toString(36)}`;
}

export function normalizeTaskPhaseName(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ').toLowerCase();
}

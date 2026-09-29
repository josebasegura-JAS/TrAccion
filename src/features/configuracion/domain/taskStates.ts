export interface TaskStateConfig {
  /** Identificador estable almacenado en las tareas. El nombre visible puede cambiar sin migrarlas. */
  id: string;
  nombre: string;
  active: boolean;
  protectedRole?: 'initial' | 'closed';
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_TIMESTAMP = '2026-01-01T00:00:00.000Z';

export const DEFAULT_TASK_STATES: TaskStateConfig[] = [
  { id: 'pendiente', nombre: 'Pendiente', active: true, protectedRole: 'initial', createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
  { id: 'en curso', nombre: 'En curso', active: true, createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
  { id: 'bloqueada', nombre: 'Bloqueada', active: true, createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
  { id: 'resuelta', nombre: 'Resuelta', active: true, createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
  { id: 'cerrada', nombre: 'Cerrada', active: true, protectedRole: 'closed', createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
];

export function normalizeTaskStateName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function createTaskStateIdFromName(value: string): string {
  return normalizeTaskStateName(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `estado-${Date.now().toString(36)}`;
}

export function taskStateLabel(states: readonly TaskStateConfig[], id: string): string {
  return states.find((state) => state.id === id)?.nombre ?? id;
}

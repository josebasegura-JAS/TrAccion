import type { Task } from '../../tareas/domain/task';
import {
  EMPTY_MANAGED_SESSION_DRAFT,
  isTaskInSessionPhase,
  managedSessionLabel,
  type ManagedSession,
  type ManagedSessionDraft,
  type SessionModuleConfig,
} from '../../../shared/sessions/session';

export const PARITARIA_TASK_PHASE = 'paritaria';

export const PARITARIA_SESSION_CONFIG: SessionModuleConfig = {
  moduleId: 'paritaria',
  storageKey: 'traccion.v1.paritaria.sessions',
  taskPhase: PARITARIA_TASK_PHASE,
  title: 'Comisión Paritaria',
  shortTitle: 'Comisión Paritaria',
  createButtonLabel: 'Nueva sesión',
  newSessionDefaultTitle: 'Paritaria',
  taskSelectPlaceholder: 'Añadir tarea en fase paritaria...',
  exportFilename: 'sesiones-paritaria',
  exportTitle: 'Sesiones de Comisión Paritaria',
  closeTrackingLabel: 'Comisión Paritaria',
};

export type ParitariaSession = ManagedSession;
export type ParitariaSessionDraft = ManagedSessionDraft;

export const EMPTY_PARITARIA_SESSION_DRAFT = EMPTY_MANAGED_SESSION_DRAFT;

export function isParitariaTask(task: Pick<Task, 'fase' | 'estado' | 'deletedAt'>): boolean {
  return isTaskInSessionPhase(task, PARITARIA_TASK_PHASE);
}

export const paritariaSessionLabel = managedSessionLabel;

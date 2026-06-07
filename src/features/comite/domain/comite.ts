import type { Task } from '../../tareas/domain/task';
import {
  EMPTY_MANAGED_SESSION_DRAFT,
  formatManagedSessionDate,
  isTaskInSessionPhase,
  managedSessionLabel,
  type ManagedSession,
  type ManagedSessionDraft,
  type SessionModuleConfig,
} from '../../../shared/sessions/session';

export const COMITE_TASK_PHASE = 'comite';

export const COMITE_SESSION_CONFIG: SessionModuleConfig = {
  moduleId: 'comite',
  storageKey: 'traccion.v1.comite.sessions',
  taskPhase: COMITE_TASK_PHASE,
  title: 'Comité de Empresa',
  shortTitle: 'Comité',
  createButtonLabel: 'Nueva sesión',
  newSessionDefaultTitle: 'Comité',
  taskSelectPlaceholder: 'Añadir tarea en fase comité...',
  exportFilename: 'sesiones-comite',
  exportTitle: 'Sesiones de Comité',
  closeTrackingLabel: 'Comité de Empresa',
};

export type CommitteeSessionStatus = ManagedSession['status'];
export type CommitteeSession = ManagedSession;
export type CommitteeSessionDraft = ManagedSessionDraft;

export const EMPTY_COMMITTEE_SESSION_DRAFT = EMPTY_MANAGED_SESSION_DRAFT;

export function isCommitteeTask(task: Pick<Task, 'fase' | 'estado' | 'deletedAt'>): boolean {
  return isTaskInSessionPhase(task, COMITE_TASK_PHASE);
}

export const formatCommitteeSessionDate = formatManagedSessionDate;
export const committeeSessionLabel = managedSessionLabel;

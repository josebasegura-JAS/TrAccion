import type { Task } from '../../tareas/domain/task';

export const COMITE_TASK_PHASE = 'comite';

export type CommitteeSessionStatus = 'open' | 'closed';

export interface CommitteeSession {
  id: string;
  date: string;
  code: string;
  title: string;
  notes: string;
  status: CommitteeSessionStatus;
  items: string[];
  treatedTaskIds: string[];
  untreatedTaskIds: string[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface CommitteeSessionDraft {
  date: string;
  code: string;
  title: string;
  notes: string;
}

export const EMPTY_COMMITTEE_SESSION_DRAFT: CommitteeSessionDraft = {
  date: '',
  code: '',
  title: '',
  notes: '',
};

export function isCommitteeTask(task: Pick<Task, 'fase' | 'estado' | 'deletedAt'>): boolean {
  return (
    !task.deletedAt &&
    task.estado !== 'cerrada' &&
    task.fase.trim().toLowerCase() === COMITE_TASK_PHASE
  );
}

export function formatCommitteeSessionDate(date: string): string {
  if (!date) {
    return 'Sin fecha';
  }

  const parsedDate = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsedDate.getTime()) ? date : parsedDate.toLocaleDateString('es-ES');
}

export function committeeSessionLabel(session: Pick<CommitteeSession, 'code' | 'date'>): string {
  return `${session.code || 'Sin código'} · ${formatCommitteeSessionDate(session.date)}`;
}

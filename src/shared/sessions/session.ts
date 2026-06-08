import type { Task } from '../../features/tareas/domain/task';

export type ManagedSessionStatus = 'open' | 'closed';

export interface ManagedSession {
  id: string;
  date: string;
  code: string;
  title: string;
  notes: string;
  status: ManagedSessionStatus;
  items: string[];
  treatedTaskIds: string[];
  untreatedTaskIds: string[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface ManagedSessionDraft {
  date: string;
  code: string;
  title: string;
  notes: string;
}

export const EMPTY_MANAGED_SESSION_DRAFT: ManagedSessionDraft = {
  date: '',
  code: '',
  title: '',
  notes: '',
};

export interface SessionModuleConfig {
  moduleId: string;
  storageKey: string;
  taskPhase: string;
  title: string;
  shortTitle: string;
  createButtonLabel: string;
  newSessionDefaultTitle: string;
  taskSelectPlaceholder: string;
  exportFilename: string;
  exportTitle: string;
  closeTrackingLabel: string;
}

export function isTaskInSessionPhase(
  task: Pick<Task, 'fase' | 'estado' | 'deletedAt'>,
  taskPhase: string,
): boolean {
  return !task.deletedAt && task.estado !== 'cerrada' && task.fase.trim().toLowerCase() === taskPhase;
}

export function formatManagedSessionDate(date: string): string {
  if (!date) {
    return 'Sin fecha';
  }

  const parsedDate = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsedDate.getTime()) ? date : parsedDate.toLocaleDateString('es-ES');
}

export function managedSessionLabel(session: Pick<ManagedSession, 'code' | 'date'>): string {
  return `${session.code || 'Sin código'} · ${formatManagedSessionDate(session.date)}`;
}

function isHistoricalSessionDate(date: string): boolean {
  const year = Number(date.match(/^(\d{4})/)?.[1] ?? 0);
  return year > 0 && year < 2026;
}

export function normalizeManagedSession(session: ManagedSession, fallbackTitle: string): ManagedSession {
  const createdAt = session.createdAt ?? new Date().toISOString();
  const updatedAt = session.updatedAt ?? createdAt;
  const items = Array.isArray(session.items)
    ? session.items.filter((item): item is string => typeof item === 'string')
    : [];
  const treatedTaskIds = Array.isArray(session.treatedTaskIds)
    ? session.treatedTaskIds.filter((item): item is string => typeof item === 'string')
    : [];
  const untreatedTaskIds = Array.isArray(session.untreatedTaskIds)
    ? session.untreatedTaskIds.filter((item): item is string => typeof item === 'string')
    : [];
  const shouldForceHistory = isHistoricalSessionDate(session.date);
  const closedAt = session.closedAt ?? (shouldForceHistory ? `${session.date}T00:00:00.000Z` : null);

  return {
    id: session.id,
    date: session.date,
    code: session.code,
    title: session.title || `${fallbackTitle} ${session.date || ''}`.trim(),
    notes: session.notes ?? EMPTY_MANAGED_SESSION_DRAFT.notes,
    status: session.status === 'closed' || shouldForceHistory ? 'closed' : 'open',
    items,
    treatedTaskIds: shouldForceHistory ? items : treatedTaskIds,
    untreatedTaskIds: shouldForceHistory ? [] : untreatedTaskIds,
    createdAt,
    updatedAt,
    closedAt,
  };
}

export function isManagedSession(value: unknown): value is ManagedSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof ManagedSession, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.date === 'string' &&
    typeof candidate.code === 'string' &&
    typeof candidate.title === 'string' &&
    (candidate.status === 'open' || candidate.status === 'closed')
  );
}

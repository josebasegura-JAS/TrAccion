import { readStorageItem } from '../../../services/persistence';
import { CLOSED_TASK_PHASE, isTaskClosed, type Task } from '../domain/task';

const SESSION_TASK_REFERENCES = [
  { storageKey: 'traccion.v1.comite.sessions', module: 'comite', moduleLabel: 'Comité de Empresa' },
  { storageKey: 'traccion.v1.paritaria.sessions', module: 'paritaria', moduleLabel: 'Comisión Paritaria' },
] as const;

type SessionTaskReference = {
  taskId: string;
  module: string;
  moduleLabel: string;
  sessionLabel: string;
  sessionDocumentCode: string;
  sessionDate: string;
  closedAt: string;
};

type StoredManagedSessionForTaskSync = {
  id: string;
  date: string;
  code: string;
  title: string;
  status: 'open' | 'closed';
  items: string[];
  treatedTaskIds: string[];
  untreatedTaskIds: string[];
  taskResults?: Record<string, 'resolved' | 'followup' | 'return' | 'not-treated'>;
  closedAt: string | null;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStoredManagedSessionForTaskSync(value: unknown): value is StoredManagedSessionForTaskSync {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<keyof StoredManagedSessionForTaskSync, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.date === 'string' &&
    typeof candidate.code === 'string' &&
    typeof candidate.title === 'string' &&
    (candidate.status === 'open' || candidate.status === 'closed') &&
    isStringArray(candidate.items) &&
    (candidate.treatedTaskIds === undefined || isStringArray(candidate.treatedTaskIds)) &&
    (candidate.untreatedTaskIds === undefined || isStringArray(candidate.untreatedTaskIds)) &&
    (candidate.taskResults === undefined || (candidate.taskResults !== null && typeof candidate.taskResults === 'object')) &&
    (candidate.closedAt === null || candidate.closedAt === undefined || typeof candidate.closedAt === 'string')
  );
}

function readStoredArray(storageKey: string): unknown[] {
  const stored = readStorageItem(storageKey);
  if (!stored) return [];
  const parsed: unknown = JSON.parse(stored);
  return Array.isArray(parsed) ? parsed : [];
}

function isHistoricalSessionDate(date: string): boolean {
  const year = Number(date.match(/^(\d{4})/)?.[1] ?? 0);
  return year > 0 && year < 2026;
}

function formatSessionDateForTask(date: string): string {
  if (!date) return 'Sin fecha';
  const parsedDate = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsedDate.getTime()) ? date : parsedDate.toLocaleDateString('es-ES');
}

function buildSessionLabelForTask(session: Pick<StoredManagedSessionForTaskSync, 'code' | 'date'>): string {
  return `${session.code || 'Sin código'} · ${formatSessionDateForTask(session.date)}`;
}

function readClosedSessionTaskReferences(): Map<string, SessionTaskReference> {
  const references = new Map<string, SessionTaskReference>();
  SESSION_TASK_REFERENCES.forEach((source) => {
    const storedSessions = readStoredArray(source.storageKey).filter(isStoredManagedSessionForTaskSync);
    storedSessions.forEach((session) => {
      const forceHistorical = isHistoricalSessionDate(session.date);
      if (session.status !== 'closed' && !forceHistorical) return;
      const untreatedTaskIds = new Set(session.untreatedTaskIds ?? []);
      const detailedResults = session.taskResults ?? {};
      const treatedTaskIds = forceHistorical
        ? session.items
        : Object.keys(detailedResults).length > 0
          ? session.items.filter((taskId) => detailedResults[taskId] === 'resolved')
          : (session.treatedTaskIds ?? []).length === 0
            ? session.items
            : (session.treatedTaskIds ?? []);
      const closedAt = session.closedAt ?? (session.date ? `${session.date}T00:00:00.000Z` : new Date().toISOString());
      treatedTaskIds.forEach((taskId) => {
        if (!taskId || untreatedTaskIds.has(taskId)) return;
        references.set(taskId, {
          taskId,
          module: source.module,
          moduleLabel: source.moduleLabel,
          sessionLabel: buildSessionLabelForTask(session),
          sessionDocumentCode: session.code.trim(),
          sessionDate: session.date,
          closedAt,
        });
      });
    });
  });
  return references;
}

export function reconcileTasksWithClosedSessions(tasks: Task[]): Task[] {
  const references = readClosedSessionTaskReferences();
  if (references.size === 0) return tasks;
  const reconciledAt = new Date().toISOString();
  return tasks.map((task) => {
    const reference = references.get(task.id);
    if (!reference || task.deletedAt) return task;
    const trackingText = `Tratada en ${reference.moduleLabel} (${reference.sessionLabel}).`;
    const alreadyTracked = task.seguimiento.some((entry) => entry.texto === trackingText);
    const alreadyClosed = isTaskClosed(task);
    const nextTask: Task = {
      ...task,
      sessionDocumentCode: task.sessionDocumentCode || reference.sessionDocumentCode,
      sessionModule: task.sessionModule || reference.module,
      sessionDate: task.sessionDate || reference.sessionDate,
      estado: alreadyClosed ? task.estado : 'cerrada',
      fase: alreadyClosed ? task.fase : CLOSED_TASK_PHASE,
      closedAt: task.closedAt ?? reference.closedAt,
      updatedAt:
        alreadyClosed &&
        task.sessionDocumentCode === (task.sessionDocumentCode || reference.sessionDocumentCode) &&
        task.sessionModule === (task.sessionModule || reference.module) &&
        task.sessionDate === (task.sessionDate || reference.sessionDate) &&
        alreadyTracked
          ? task.updatedAt
          : reconciledAt,
      seguimiento: alreadyTracked ? task.seguimiento : [{ fechaHora: reference.closedAt, texto: trackingText }, ...task.seguimiento],
    };
    return nextTask;
  });
}

import { readStorageItem, writeStorageItem } from '../../../services/persistence';

const TASK_CRITERION_LINKS_STORAGE_KEY = 'traccion.v1.tareas.criterios-rrll.links';

export interface TaskCriterionLink {
  taskId: string;
  criterioId: string;
  createdAt: string;
}

function readLinks(): TaskCriterionLink[] {
  try {
    const raw = readStorageItem(TASK_CRITERION_LINKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is TaskCriterionLink => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<TaskCriterionLink>;
      return (
        typeof candidate.taskId === 'string' &&
        candidate.taskId.length > 0 &&
        typeof candidate.criterioId === 'string' &&
        candidate.criterioId.length > 0 &&
        typeof candidate.createdAt === 'string'
      );
    });
  } catch {
    return [];
  }
}

function persistLinks(links: TaskCriterionLink[]): void {
  writeStorageItem(TASK_CRITERION_LINKS_STORAGE_KEY, JSON.stringify(links));
}

export function getCriterionIdForTask(taskId: string): string | null {
  return readLinks().find((link) => link.taskId === taskId)?.criterioId ?? null;
}

export function getTaskIdForCriterion(criterioId: string): string | null {
  return readLinks().find((link) => link.criterioId === criterioId)?.taskId ?? null;
}

export function linkTaskToCriterion(taskId: string, criterioId: string): void {
  const current = readLinks();
  const next: TaskCriterionLink[] = [
    ...current.filter((link) => link.taskId !== taskId && link.criterioId !== criterioId),
    {
      taskId,
      criterioId,
      createdAt: new Date().toISOString(),
    },
  ];
  persistLinks(next);
}

export function unlinkTaskCriterion(taskId: string): void {
  const current = readLinks();
  const next = current.filter((link) => link.taskId !== taskId);
  if (next.length !== current.length) {
    persistLinks(next);
  }
}

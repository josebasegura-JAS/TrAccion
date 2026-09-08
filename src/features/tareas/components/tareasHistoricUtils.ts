import { getTaskClosedYear } from '../domain/historico';
import { TASK_PRIORITIES, type Task, type TaskPriority } from '../domain/task';
import type { SortDirection } from '../domain/sort';

export type HistoricSortKey = 'titulo' | 'closedAt' | 'responsable' | 'prioridad';

export interface HistoricSortState {
  key: HistoricSortKey;
  direction: SortDirection;
}

export interface HistoricYearGroup {
  year: string;
  tasks: Task[];
}

export const HISTORIC_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_HISTORIC_PAGE_SIZE = 50;

const PRIORITY_ORDER = new Map<TaskPriority, number>(
  TASK_PRIORITIES.map((priority, index) => [priority, index]),
);

function compareHistoricTasks(first: Task, second: Task, key: HistoricSortKey): number {
  if (key === 'closedAt') {
    return (first.closedAt ?? '').localeCompare(second.closedAt ?? '', 'es', {
      numeric: true,
      sensitivity: 'base',
    });
  }

  if (key === 'prioridad') {
    return (
      (PRIORITY_ORDER.get(first.prioridad) ?? TASK_PRIORITIES.length) -
      (PRIORITY_ORDER.get(second.prioridad) ?? TASK_PRIORITIES.length)
    );
  }

  return first[key].localeCompare(second[key], 'es', { numeric: true, sensitivity: 'base' });
}

export function sortHistoricTasks(tasks: Task[], sortState: HistoricSortState): Task[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((first, second) => {
      const comparison = compareHistoricTasks(first.task, second.task, sortState.key);
      const orderedComparison = sortState.direction === 'asc' ? comparison : -comparison;
      return orderedComparison || first.index - second.index;
    })
    .map(({ task }) => task);
}

export function groupHistoricTasks(tasks: Task[]): HistoricYearGroup[] {
  const groups = new Map<string, Task[]>();

  tasks.forEach((task) => {
    const year = getTaskClosedYear(task);
    const yearTasks = groups.get(year);
    if (yearTasks) yearTasks.push(task);
    else groups.set(year, [task]);
  });

  return Array.from(groups.entries())
    .sort(([firstYear], [secondYear]) =>
      secondYear.localeCompare(firstYear, 'es', { numeric: true }),
    )
    .map(([year, groupTasks]) => ({ year, tasks: groupTasks }));
}

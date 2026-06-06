import { TASK_PRIORITIES, type Task } from './task';

export type TaskSortKey =
  | 'titulo'
  | 'tipo'
  | 'fase'
  | 'estado'
  | 'prioridad'
  | 'fechaLimite'
  | 'responsable'
  | 'sindicato';
export type SortDirection = 'asc' | 'desc';

const PRIORITY_ORDER = new Map(TASK_PRIORITIES.map((priority, index) => [priority, index]));

function comparePriority(first: Task, second: Task): number {
  return (
    (PRIORITY_ORDER.get(first.prioridad) ?? TASK_PRIORITIES.length) -
    (PRIORITY_ORDER.get(second.prioridad) ?? TASK_PRIORITIES.length)
  );
}

function compareDateWithEmptyLast(firstDate: string, secondDate: string): number {
  const firstHasDate = firstDate.trim().length > 0;
  const secondHasDate = secondDate.trim().length > 0;

  if (!firstHasDate && !secondHasDate) {
    return 0;
  }

  if (!firstHasDate) {
    return 1;
  }

  if (!secondHasDate) {
    return -1;
  }

  return firstDate.localeCompare(secondDate, 'es', { numeric: true, sensitivity: 'base' });
}

export function compareTaskValues(first: Task, second: Task, key: TaskSortKey): number {
  if (key === 'prioridad') {
    return comparePriority(first, second);
  }

  if (key === 'fechaLimite') {
    return compareDateWithEmptyLast(first.fechaLimite, second.fechaLimite);
  }

  return first[key].localeCompare(second[key], 'es', { numeric: true, sensitivity: 'base' });
}

function stableSort(tasks: Task[], compare: (first: Task, second: Task) => number): Task[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((first, second) => compare(first.task, second.task) || first.index - second.index)
    .map(({ task }) => task);
}

export function sortTasksByDefault(tasks: Task[]): Task[] {
  return stableSort(tasks, (first, second) => {
    return comparePriority(first, second) || compareDateWithEmptyLast(first.fechaLimite, second.fechaLimite);
  });
}

export function sortTasksByColumn(tasks: Task[], key: TaskSortKey, direction: SortDirection): Task[] {
  return stableSort(tasks, (first, second) => {
    const comparison = compareTaskValues(first, second, key);
    return direction === 'asc' ? comparison : -comparison;
  });
}

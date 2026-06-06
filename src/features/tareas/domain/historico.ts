import { isTaskClosed, type Task } from './task';

export interface TaskHistoricYearGroup {
  year: string;
  tasks: Task[];
}

export function getTaskClosedYear(task: Task): string {
  const closedDate = task.closedAt ? new Date(task.closedAt) : null;
  return closedDate && !Number.isNaN(closedDate.getTime())
    ? String(closedDate.getFullYear())
    : 'Sin fecha';
}

export function groupHistoricTasksByYear(tasks: Task[]): TaskHistoricYearGroup[] {
  const groups = new Map<string, Task[]>();

  tasks.filter(isTaskClosed).forEach((task) => {
    const year = getTaskClosedYear(task);
    groups.set(year, [...(groups.get(year) ?? []), task]);
  });

  return Array.from(groups.entries())
    .sort(([firstYear], [secondYear]) =>
      secondYear.localeCompare(firstYear, 'es', { numeric: true }),
    )
    .map(([year, groupTasks]) => ({ year, tasks: groupTasks }));
}

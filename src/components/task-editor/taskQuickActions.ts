import type { Task, TaskQuickAction } from '../../features/tareas/domain/task';

export function getTaskQuickActions(task: Pick<Task, 'seguimiento'>): TaskQuickAction[] {
  return task.seguimiento
    .flatMap((entry) => entry.quickActions ?? [])
    .sort((first, second) => Number(Boolean(first.completedAt)) - Number(Boolean(second.completedAt)));
}

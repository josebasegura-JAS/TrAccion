import type { Task, TaskPriority, TaskState } from './task';

export interface TaskFilters {
  search: string;
  estado: '' | TaskState;
  prioridad: '' | TaskPriority;
}

export const EMPTY_TASK_FILTERS: TaskFilters = {
  search: '',
  estado: '',
  prioridad: '',
};

export function filterTasks(tasks: Task[], filters: TaskFilters): Task[] {
  const normalizedSearch = filters.search.trim().toLowerCase();

  return tasks.filter((task) => {
    const matchesSearch = normalizedSearch
      ? [task.titulo, task.descripcion].join(' ').toLowerCase().includes(normalizedSearch)
      : true;

    return (
      !task.deletedAt &&
      task.estado !== 'cerrada' &&
      matchesSearch &&
      (!filters.estado || task.estado === filters.estado) &&
      (!filters.prioridad || task.prioridad === filters.prioridad)
    );
  });
}

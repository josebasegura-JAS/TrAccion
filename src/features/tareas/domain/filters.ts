import { isTaskClosed, type Task, type TaskPriority, type TaskState, type TaskType } from './task';

export interface TaskFilters {
  search: string;
  tipo: '' | TaskType;
  fase: string;
  estado: '' | TaskState;
  prioridad: '' | TaskPriority;
  origen: string;
}

export const EMPTY_TASK_FILTERS: TaskFilters = {
  search: '',
  tipo: '',
  fase: '',
  estado: '',
  prioridad: '',
  origen: '',
};

export function filterTasks(tasks: Task[], filters: TaskFilters): Task[] {
  const normalizedSearch = filters.search.trim().toLowerCase();

  return tasks.filter((task) => {
    const matchesSearch = normalizedSearch
      ? [task.titulo, task.descripcion, task.sindicato, task.origen]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch)
      : true;

    return (
      !task.deletedAt &&
      !isTaskClosed(task) &&
      matchesSearch &&
      (!filters.tipo || task.tipo === filters.tipo) &&
      (!filters.fase || task.fase === filters.fase) &&
      (!filters.estado || task.estado === filters.estado) &&
      (!filters.prioridad || task.prioridad === filters.prioridad) &&
      (!filters.origen || task.sindicato === filters.origen)
    );
  });
}

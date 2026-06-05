import { create } from 'zustand';
import { EMPTY_TASK_FILTERS, type TaskFilters } from '../domain/filters';
import { EMPTY_TASK_DRAFT, type Task, type TaskDraft, TASK_PRIORITIES, TASK_STATES } from '../domain/task';

const STORAGE_KEY = 'traccion.v1.tareas.tasks';

interface TaskStateStore {
  tasks: Task[];
  selectedTaskId: string;
  filters: TaskFilters;
  load: () => void;
  create: (draft: TaskDraft) => void;
  update: (id: string, draft: TaskDraft) => void;
  remove: (id: string) => void;
  selectTask: (taskId: string) => void;
  setFilter: <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => void;
}

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof Task, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.titulo === 'string' &&
    typeof candidate.descripcion === 'string' &&
    typeof candidate.estado === 'string' &&
    (TASK_STATES as readonly string[]).includes(candidate.estado) &&
    typeof candidate.prioridad === 'string' &&
    (TASK_PRIORITIES as readonly string[]).includes(candidate.prioridad)
  );
}

function normalizeTask(task: Task): Task {
  return {
    id: task.id,
    titulo: task.titulo,
    descripcion: task.descripcion,
    estado: task.estado,
    prioridad: task.prioridad,
    fechaLimite: task.fechaLimite ?? EMPTY_TASK_DRAFT.fechaLimite,
    responsable: task.responsable ?? EMPTY_TASK_DRAFT.responsable,
    origenSindicato: task.origenSindicato ?? EMPTY_TASK_DRAFT.origenSindicato,
    observaciones: task.observaciones ?? EMPTY_TASK_DRAFT.observaciones,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    deletedAt: task.deletedAt ?? null,
  };
}

function readTasks(): Task[] {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isTask).map(normalizeTask);
}

function persistTasks(tasks: Task[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function firstVisibleTaskId(tasks: Task[]): string {
  return tasks.find((task) => !task.deletedAt)?.id ?? '';
}

function createTaskId(): string {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useTaskStore = create<TaskStateStore>((set) => ({
  tasks: [],
  selectedTaskId: '',
  filters: EMPTY_TASK_FILTERS,
  load: () => {
    const tasks = readTasks();
    set({ tasks, selectedTaskId: firstVisibleTaskId(tasks) });
  },
  create: (draft) => {
    set((state) => {
      const now = new Date().toISOString();
      const task: Task = {
        id: createTaskId(),
        ...draft,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      const tasks = [...state.tasks, task];
      persistTasks(tasks);
      return { tasks, selectedTaskId: task.id };
    });
  },
  update: (id, draft) => {
    set((state) => {
      const tasks = state.tasks.map((task) =>
        task.id === id ? { ...task, ...draft, updatedAt: new Date().toISOString() } : task,
      );
      persistTasks(tasks);
      return { tasks, selectedTaskId: id };
    });
  },
  remove: (id) => {
    set((state) => {
      const tasks = state.tasks.map((task) =>
        task.id === id ? { ...task, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : task,
      );
      persistTasks(tasks);
      return { tasks, selectedTaskId: firstVisibleTaskId(tasks) };
    });
  },
  selectTask: (taskId) => set({ selectedTaskId: taskId }),
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
}));

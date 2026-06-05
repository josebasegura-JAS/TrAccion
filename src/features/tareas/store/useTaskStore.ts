import { create } from 'zustand';
import { EMPTY_TASK_FILTERS, type TaskFilters } from '../domain/filters';
import {
  EMPTY_TASK_DRAFT,
  type Task,
  type TaskDraft,
  TASK_PRIORITIES,
  TASK_STATES,
  type TaskUpdate,
} from '../domain/task';

const STORAGE_KEY = 'traccion.v1.tareas.tasks';

interface TaskStateStore {
  tasks: Task[];
  selectedTaskId: string;
  filters: TaskFilters;
  load: () => void;
  create: (draft: TaskDraft, updateText?: string) => void;
  update: (id: string, draft: TaskDraft, updateText?: string) => void;
  remove: (id: string) => void;
  selectTask: (taskId: string) => void;
  setFilter: <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => void;
}

function isTaskUpdate(value: unknown): value is TaskUpdate {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof TaskUpdate, unknown>>;
  return typeof candidate.fechaHora === 'string' && typeof candidate.texto === 'string';
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
  const updatedAt = task.updatedAt ?? task.createdAt;
  const actualizaciones = Array.isArray(task.actualizaciones)
    ? task.actualizaciones.filter(isTaskUpdate)
    : [];

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
    actualizaciones,
    closedAt: task.closedAt ?? (task.estado === 'cerrada' ? updatedAt : null),
    createdAt: task.createdAt,
    updatedAt,
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

function firstActiveTaskId(tasks: Task[]): string {
  return tasks.find((task) => !task.deletedAt && task.estado !== 'cerrada')?.id ?? '';
}

function createTaskId(): string {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildUpdate(text: string | undefined, fechaHora: string): TaskUpdate[] {
  const trimmedText = text?.trim();
  return trimmedText ? [{ fechaHora, texto: trimmedText }] : [];
}

function resolveClosedAt(task: Task, draft: TaskDraft, fechaHora: string): string | null {
  if (draft.estado !== 'cerrada') {
    return null;
  }

  return task.estado === 'cerrada' ? task.closedAt ?? fechaHora : fechaHora;
}

export const useTaskStore = create<TaskStateStore>((set) => ({
  tasks: [],
  selectedTaskId: '',
  filters: EMPTY_TASK_FILTERS,
  load: () => {
    const tasks = readTasks();
    set({ tasks, selectedTaskId: firstActiveTaskId(tasks) });
  },
  create: (draft, updateText) => {
    set((state) => {
      const now = new Date().toISOString();
      const task: Task = {
        id: createTaskId(),
        ...draft,
        actualizaciones: buildUpdate(updateText, now),
        closedAt: draft.estado === 'cerrada' ? now : null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      const tasks = [...state.tasks, task];
      persistTasks(tasks);
      return { tasks, selectedTaskId: task.estado === 'cerrada' ? firstActiveTaskId(tasks) : task.id };
    });
  },
  update: (id, draft, updateText) => {
    set((state) => {
      const now = new Date().toISOString();
      const tasks = state.tasks.map((task) => {
        if (task.id !== id) {
          return task;
        }

        return {
          ...task,
          ...draft,
          actualizaciones: [...buildUpdate(updateText, now), ...task.actualizaciones],
          closedAt: resolveClosedAt(task, draft, now),
          updatedAt: now,
        };
      });
      persistTasks(tasks);
      const updatedTask = tasks.find((task) => task.id === id);
      return {
        tasks,
        selectedTaskId: updatedTask?.estado === 'cerrada' ? firstActiveTaskId(tasks) : id,
      };
    });
  },
  remove: (id) => {
    set((state) => {
      const now = new Date().toISOString();
      const tasks = state.tasks.map((task) =>
        task.id === id ? { ...task, deletedAt: now, updatedAt: now } : task,
      );
      persistTasks(tasks);
      return { tasks, selectedTaskId: firstActiveTaskId(tasks) };
    });
  },
  selectTask: (taskId) => set({ selectedTaskId: taskId }),
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
}));

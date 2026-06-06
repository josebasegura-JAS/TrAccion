import { create } from 'zustand';
import { EMPTY_TASK_FILTERS, type TaskFilters } from '../domain/filters';
import {
  CLOSED_TASK_PHASE,
  DEFAULT_TASK_PHASE,
  EMPTY_TASK_DRAFT,
  isTaskClosed,
  migratePeticionToTask,
  TASK_PRIORITIES,
  TASK_STATES,
  TASK_TYPES,
  type LegacyPeticionForTaskMigration,
  type Task,
  type TaskDraft,
  type TaskSeguimientoEntry,
} from '../domain/task';

const STORAGE_KEY = 'traccion.v1.tareas.tasks';
const LEGACY_PETICIONES_STORAGE_KEY = 'traccion.v1.peticiones.peticiones';
const PETICIONES_MIGRATION_FLAG_KEY = 'traccion.v1.tareas.peticionesMigrated';

interface TaskStateStore {
  tasks: Task[];
  selectedTaskId: string;
  filters: TaskFilters;
  load: () => void;
  create: (draft: TaskDraft, seguimientoText?: string) => void;
  update: (id: string, draft: TaskDraft, seguimientoText?: string) => void;
  remove: (id: string) => void;
  selectTask: (taskId: string) => void;
  setFilter: <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => void;
}

function isTaskSeguimientoEntry(value: unknown): value is TaskSeguimientoEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof TaskSeguimientoEntry, unknown>>;
  return typeof candidate.fechaHora === 'string' && typeof candidate.texto === 'string';
}

function hasStringProperty<K extends string>(value: unknown, property: K): value is Record<K, string> {
  return (
    value !== null &&
    typeof value === 'object' &&
    property in value &&
    typeof (value as Record<K, unknown>)[property] === 'string'
  );
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

function isLegacyPeticion(value: unknown): value is LegacyPeticionForTaskMigration {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof LegacyPeticionForTaskMigration, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.titulo === 'string' &&
    typeof candidate.descripcion === 'string' &&
    typeof candidate.estado === 'string' &&
    typeof candidate.prioridad === 'string' &&
    typeof candidate.createdAt === 'string'
  );
}

function normalizeSeguimiento(task: Task): TaskSeguimientoEntry[] {
  if (Array.isArray(task.seguimiento)) {
    return task.seguimiento
      .filter(isTaskSeguimientoEntry)
      .sort((first, second) => second.fechaHora.localeCompare(first.fechaHora));
  }

  const legacyUpdates = (task as { actualizaciones?: unknown }).actualizaciones;

  return Array.isArray(legacyUpdates)
    ? legacyUpdates
        .filter(isTaskSeguimientoEntry)
        .sort((first, second) => second.fechaHora.localeCompare(first.fechaHora))
    : [];
}

function normalizeTask(task: Task): Task {
  const updatedAt = task.updatedAt ?? task.createdAt;
  const tipo = (TASK_TYPES as readonly string[]).includes(task.tipo) ? task.tipo : EMPTY_TASK_DRAFT.tipo;
  const fase = typeof task.fase === 'string' && task.fase.trim() ? task.fase : DEFAULT_TASK_PHASE;
  const estado = (TASK_STATES as readonly string[]).includes(task.estado)
    ? task.estado
    : EMPTY_TASK_DRAFT.estado;

  return {
    id: task.id,
    titulo: task.titulo,
    descripcion: task.descripcion,
    tipo,
    fase,
    estado,
    prioridad: task.prioridad,
    fechaLimite: task.fechaLimite ?? EMPTY_TASK_DRAFT.fechaLimite,
    responsable: task.responsable ?? EMPTY_TASK_DRAFT.responsable,
    origen:
      task.origen ??
      (hasStringProperty(task, 'origenSindicato') ? task.origenSindicato : EMPTY_TASK_DRAFT.origen),
    sindicato: task.sindicato ?? EMPTY_TASK_DRAFT.sindicato,
    observaciones: task.observaciones ?? EMPTY_TASK_DRAFT.observaciones,
    seguimiento: normalizeSeguimiento(task),
    createdAt: task.createdAt,
    updatedAt,
    deletedAt: task.deletedAt ?? null,
    closedAt: task.closedAt ?? (estado === 'cerrada' || fase === CLOSED_TASK_PHASE ? updatedAt : null),
  };
}

function readStoredArray(storageKey: string): unknown[] {
  const stored = window.localStorage.getItem(storageKey);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  return Array.isArray(parsed) ? parsed : [];
}

function readCurrentTasks(): Task[] {
  return readStoredArray(STORAGE_KEY).filter(isTask).map(normalizeTask);
}

function readMigratedPeticiones(): Task[] {
  if (window.localStorage.getItem(PETICIONES_MIGRATION_FLAG_KEY) === 'true') {
    return [];
  }

  return readStoredArray(LEGACY_PETICIONES_STORAGE_KEY)
    .filter(isLegacyPeticion)
    .map(migratePeticionToTask)
    .map(normalizeTask);
}

function readTasks(): Task[] {
  const currentTasks = readCurrentTasks();
  const migratedTasks = readMigratedPeticiones().filter(
    (migratedTask) => !currentTasks.some((task) => task.id === migratedTask.id),
  );

  if (migratedTasks.length === 0) {
    return currentTasks;
  }

  const tasks = [...currentTasks, ...migratedTasks];
  persistTasks(tasks);
  window.localStorage.setItem(PETICIONES_MIGRATION_FLAG_KEY, 'true');
  return tasks;
}

function persistTasks(tasks: Task[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function firstActiveTaskId(tasks: Task[]): string {
  return tasks.find((task) => !task.deletedAt && !isTaskClosed(task))?.id ?? '';
}

function createTaskId(): string {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSeguimiento(text: string | undefined, fechaHora: string): TaskSeguimientoEntry[] {
  const trimmedText = text?.trim();
  return trimmedText ? [{ fechaHora, texto: trimmedText }] : [];
}

function resolveClosedAt(task: Task, draft: TaskDraft, fechaHora: string): string | null {
  if (!isTaskClosed(draft)) {
    return null;
  }

  return isTaskClosed(task) ? (task.closedAt ?? fechaHora) : fechaHora;
}

export const useTaskStore = create<TaskStateStore>((set) => ({
  tasks: [],
  selectedTaskId: '',
  filters: EMPTY_TASK_FILTERS,
  load: () => {
    const tasks = readTasks();
    set({ tasks, selectedTaskId: firstActiveTaskId(tasks) });
  },
  create: (draft, seguimientoText) => {
    set((state) => {
      const now = new Date().toISOString();
      const task: Task = {
        id: createTaskId(),
        ...draft,
        seguimiento: buildSeguimiento(seguimientoText, now),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        closedAt: isTaskClosed(draft) ? now : null,
      };
      const tasks = [...state.tasks, task];
      persistTasks(tasks);
      return {
        tasks,
        selectedTaskId: isTaskClosed(task) ? firstActiveTaskId(tasks) : task.id,
      };
    });
  },
  update: (id, draft, seguimientoText) => {
    set((state) => {
      const now = new Date().toISOString();
      const tasks = state.tasks.map((task) => {
        if (task.id !== id) {
          return task;
        }

        return {
          ...task,
          ...draft,
          seguimiento: [...buildSeguimiento(seguimientoText, now), ...task.seguimiento],
          closedAt: resolveClosedAt(task, draft, now),
          updatedAt: now,
        };
      });
      persistTasks(tasks);
      const updatedTask = tasks.find((task) => task.id === id);
      return {
        tasks,
        selectedTaskId: updatedTask && isTaskClosed(updatedTask) ? firstActiveTaskId(tasks) : id,
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

import { create } from 'zustand';
import { EMPTY_TASK_FILTERS, type TaskFilters } from '../domain/filters';
import { emitPersistenceFeedback } from '../../../services/persistence';
import { hasTaskSqliteRepository } from './taskSqliteRepository';
import { isTaskClosed, type Task, type TaskDraft } from '../domain/task';
import { firstActiveTaskId, normalizeTask } from './taskNormalization';
import { readTasks, readTasksForStore, TASKS_STORAGE_KEY, type TaskUpdateResult } from './taskPersistence';
import { closeTasksFromSessionPersisted } from './taskSessionClosure';
import {
  createManyTasksFromImport,
  createTaskWithConcurrencyCheck,
  removeTaskWithConcurrencyCheck,
  updateTaskWithConcurrencyCheck,
} from './taskCrud';

export { TASKS_STORAGE_KEY } from './taskPersistence';
export { parseTasksSnapshot } from './taskNormalization';

interface TaskStateStore {
  tasks: Task[];
  selectedTaskId: string;
  historicalTasksLoaded: boolean;
  isLoadingHistoricalTasks: boolean;
  filters: TaskFilters;
  load: () => void;
  reloadFromStorage: () => void;
  loadHistoricalTasks: () => Promise<void>;
  createWithConcurrencyCheck: (draft: TaskDraft, seguimientoText?: string) => Promise<TaskUpdateResult>;
  createManyFromImport: (
    drafts: Array<{ externalKey: string; draft: TaskDraft; closedAt?: string | null }>,
  ) => Promise<Record<string, string>>;
  updateWithConcurrencyCheck: (
    id: string,
    draft: TaskDraft,
    seguimientoText: string | undefined,
    expectedUpdatedAt: string | null,
  ) => Promise<TaskUpdateResult>;
  removeWithConcurrencyCheck: (
    id: string,
    expectedUpdatedAt: string | null,
  ) => Promise<TaskUpdateResult>;
  selectTask: (taskId: string) => void;
  closeTasksFromCommittee: (taskIds: string[], sessionLabel: string) => void;
  closeTasksFromSession: (taskIds: string[], moduleLabel: string, sessionLabel: string) => void;
  closeTasksFromSessionWithConcurrencyCheck: (
    taskIds: string[],
    moduleLabel: string,
    sessionLabel: string,
  ) => Promise<TaskUpdateResult>;
  setFilter: <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => void;
}

export const useTaskStore = create<TaskStateStore>((set, get) => ({
  tasks: [],
  selectedTaskId: '',
  historicalTasksLoaded: false,
  isLoadingHistoricalTasks: false,
  filters: EMPTY_TASK_FILTERS,
  load: () => {
    if (!hasTaskSqliteRepository()) {
      const tasks = import.meta.env.MODE === 'test' ? readTasks() : [];
      set({ tasks, selectedTaskId: firstActiveTaskId(tasks) });
      return;
    }

    void readTasksForStore('active').then((tasks) => {
      set({ tasks, selectedTaskId: firstActiveTaskId(tasks), historicalTasksLoaded: false });
    });
  },
  reloadFromStorage: () => {
    if (!hasTaskSqliteRepository()) {
      const tasks = import.meta.env.MODE === 'test' ? readTasks() : [];
      set((state) => ({
        tasks,
        selectedTaskId: tasks.some((task) => task.id === state.selectedTaskId)
          ? state.selectedTaskId
          : firstActiveTaskId(tasks),
      }));
      return;
    }

    void readTasksForStore('active').then((tasks) => {
      set((state) => ({
        tasks,
        selectedTaskId: tasks.some((task) => task.id === state.selectedTaskId)
          ? state.selectedTaskId
          : firstActiveTaskId(tasks),
        historicalTasksLoaded: false,
      }));
    });
  },

  loadHistoricalTasks: async () => {
    const state = get();
    if (state.historicalTasksLoaded || state.isLoadingHistoricalTasks) {
      return;
    }

    set({ isLoadingHistoricalTasks: true });
    try {
      const historicalTasks = hasTaskSqliteRepository()
        ? await readTasksForStore('historical')
        : import.meta.env.MODE === 'test'
          ? readTasks().filter(isTaskClosed)
          : [];

      set((current) => {
        const tasksById = new Map(current.tasks.map((task) => [task.id, task]));
        historicalTasks.forEach((task) => tasksById.set(task.id, task));
        const tasks = Array.from(tasksById.values()).map(normalizeTask);
        return { tasks, historicalTasksLoaded: true, isLoadingHistoricalTasks: false };
      });
    } catch (error) {
      console.warn('No se han podido cargar las tareas históricas.', error);
      set({ isLoadingHistoricalTasks: false });
    }
  },
  createWithConcurrencyCheck: (draft, seguimientoText) =>
    createTaskWithConcurrencyCheck(draft, seguimientoText, set),
  createManyFromImport: (drafts) =>
    createManyTasksFromImport(drafts, get(), set, () =>
      get().reloadFromStorage(),
    ),
  updateWithConcurrencyCheck: (id, draft, seguimientoText, expectedUpdatedAt) =>
    updateTaskWithConcurrencyCheck(id, draft, seguimientoText, expectedUpdatedAt, set),
  removeWithConcurrencyCheck: (id, expectedUpdatedAt) =>
    removeTaskWithConcurrencyCheck(id, expectedUpdatedAt, set),
  closeTasksFromCommittee: (taskIds, sessionLabel) => {
    get().closeTasksFromSession(taskIds, 'Comité de Empresa', sessionLabel);
  },
  closeTasksFromSession: (taskIds, moduleLabel, sessionLabel) => {
    void get()
      .closeTasksFromSessionWithConcurrencyCheck(taskIds, moduleLabel, sessionLabel)
      .then((result) => {
        if (result.ok) {
          return;
        }
        emitPersistenceFeedback({
          kind: 'error',
          updatedAt: new Date().toISOString(),
          key: TASKS_STORAGE_KEY,
          message: result.message,
        });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'No se han podido cerrar las tareas de la sesión.';
        emitPersistenceFeedback({
          kind: 'error',
          updatedAt: new Date().toISOString(),
          key: TASKS_STORAGE_KEY,
          message,
        });
      });
  },

  closeTasksFromSessionWithConcurrencyCheck: async (taskIds, moduleLabel, sessionLabel) => {
    const result = await closeTasksFromSessionPersisted(taskIds, moduleLabel, sessionLabel);
    if (result.ok && result.tasks && result.selectedTaskId !== undefined) {
      set({ tasks: result.tasks, selectedTaskId: result.selectedTaskId });
    }
    return { ok: result.ok, message: result.message };
  },
  selectTask: (taskId) => set({ selectedTaskId: taskId }),
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
}));

import { create } from 'zustand';
import { EMPTY_TASK_FILTERS, type TaskFilters } from '../domain/filters';
import { emitPersistenceFeedback } from '../../../services/persistence';
import { saveNewSharedArrayRecord, saveSharedArrayRecord } from '../../../services/sharedRecordPersistence';
import { hasTaskSqliteRepository } from './taskSqliteRepository';
import { enqueueAuditEvent } from '../../../shared/audit/auditTrail';
import {
  isTaskClosed,
  type Task,
  type TaskDraft,
} from '../domain/task';
import {
  firstActiveTaskId,
  normalizeTask,
  parseTasksSnapshot,
  tasksDiffer,
} from './taskNormalization';
import {
  buildAssignmentNoticeFields,
  buildSeguimiento,
  buildUpdatedTask,
  createTaskId,
} from './taskMutations';
import {
  persistTaskDirectly,
  persistTasks,
  readTasks,
  readTasksForStore,
  TASKS_STORAGE_KEY,
  type TaskUpdateResult,
} from './taskPersistence';
import { closeTasksFromSessionPersisted } from './taskSessionClosure';

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

export const useTaskStore = create<TaskStateStore>((set) => ({
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
    const state = useTaskStore.getState();
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
  createWithConcurrencyCheck: async (draft, seguimientoText) => {
    const now = new Date().toISOString();
    const taskId = createTaskId();
    const task: Task = {
      id: taskId,
      ...draft,
      ...buildAssignmentNoticeFields(taskId, '', draft.responsable, now),
      sessionDocumentCode: '',
      sessionModule: '',
      sessionDate: '',
      seguimiento: buildSeguimiento(seguimientoText, now),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      closedAt: isTaskClosed(draft) ? now : null,
    };

    try {
      if (hasTaskSqliteRepository()) {
        const saveResult = await persistTaskDirectly(task, null);
        if (!saveResult.ok) {
          return saveResult;
        }

        enqueueAuditEvent({
          module: 'tareas',
          entityId: task.id,
          action: 'created',
          summary: 'Registro creado',
          changes: [],
        });

        set((state) => {
          const tasks = [...state.tasks.filter((record) => record.id !== task.id), task].map(normalizeTask);
          return {
            tasks,
            selectedTaskId: isTaskClosed(task) ? firstActiveTaskId(tasks) : task.id,
          };
        });

        return { ok: true, message: 'Tarea creada.', recordId: task.id };
      }

      const { records, newRecord } = await saveNewSharedArrayRecord<Task>({
        storageKey: TASKS_STORAGE_KEY,
        newRecord: task,
        parseRecords: parseTasksSnapshot,
        getRecordId: (record) => record.id,
        duplicateMessage:
          'La tarea ya existe en la base compartida. Recarga antes de continuar.',
      });

      enqueueAuditEvent({
        module: 'tareas',
        entityId: newRecord.id,
        action: 'created',
        summary: 'Registro creado',
        changes: [],
      });

      const normalizedRecords = records.map(normalizeTask);
      set({
        tasks: normalizedRecords,
        selectedTaskId: isTaskClosed(newRecord) ? firstActiveTaskId(normalizedRecords) : newRecord.id,
      });

      return { ok: true, message: 'Tarea creada.', recordId: newRecord.id };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'No se ha podido crear la tarea.',
      };
    }
  },
  createManyFromImport: async (drafts) => {
    const state = useTaskStore.getState();
    const now = new Date().toISOString();
    const createdIds: Record<string, string> = {};
    const existingImportKeys = new Set(
      state.tasks
        .map((task) => task.observaciones.match(/ImportKey:([^\s]+)/)?.[1])
        .filter((value): value is string => Boolean(value)),
    );
    const importedTasks: Task[] = [];
    const tasksWithNormalizedExistingImports = state.tasks.map((task) => normalizeTask(task));
    const changedExistingTasks = tasksWithNormalizedExistingImports.some(
      (task, index) => JSON.stringify(task) !== JSON.stringify(state.tasks[index]),
    );

    drafts.forEach(({ externalKey, draft, closedAt }) => {
      if (existingImportKeys.has(externalKey)) {
        const existingTask = tasksWithNormalizedExistingImports.find((task) =>
          task.observaciones.includes(`ImportKey:${externalKey}`),
        );
        if (existingTask) {
          createdIds[externalKey] = existingTask.id;
        }
        return;
      }

      const task: Task = normalizeTask({
        id: createTaskId(),
        ...draft,
        sessionDocumentCode: '',
        sessionModule: '',
        sessionDate: '',
        observaciones: `${draft.observaciones ? `${draft.observaciones} ` : ''}ImportKey:${externalKey}`,
        seguimiento: buildSeguimiento(
          'Tarea importada desde resumen histórico de Comité/Paritaria.',
          now,
        ),
        createdAt: closedAt ?? now,
        updatedAt: now,
        deletedAt: null,
        closedAt: isTaskClosed(draft) ? (closedAt ?? now) : null,
      });
      createdIds[externalKey] = task.id;
      importedTasks.push(task);
    });

    if (importedTasks.length === 0 && !changedExistingTasks) {
      return createdIds;
    }

    const tasks = [...tasksWithNormalizedExistingImports, ...importedTasks];

    if (hasTaskSqliteRepository()) {
      try {
        for (const task of importedTasks) {
          const result = await persistTaskDirectly(task, null);
          if (!result.ok) {
            throw new Error(result.message);
          }
        }

        if (changedExistingTasks) {
          for (let index = 0; index < tasksWithNormalizedExistingImports.length; index += 1) {
            const task = tasksWithNormalizedExistingImports[index];
            const previousTask = state.tasks[index];
            if (!previousTask || !tasksDiffer(previousTask, task)) {
              continue;
            }

            const result = await persistTaskDirectly(task, previousTask.updatedAt);
            if (!result.ok) {
              throw new Error(result.message);
            }
          }
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'No se han podido guardar las tareas importadas.';
        emitPersistenceFeedback({
          kind: 'error',
          updatedAt: new Date().toISOString(),
          key: TASKS_STORAGE_KEY,
          message,
        });
        useTaskStore.getState().reloadFromStorage();
        throw error;
      }
    } else {
      persistTasks(tasks);
    }

    set({ tasks, selectedTaskId: firstActiveTaskId(tasks) });
    return createdIds;
  },
  updateWithConcurrencyCheck: async (id, draft, seguimientoText, expectedUpdatedAt) => {
    try {
      if (hasTaskSqliteRepository()) {
        const latestTasks = await readTasksForStore('all');
        const latestTask = latestTasks.find((task) => task.id === id);
        if (!latestTask) {
          return {
            ok: false,
            message: 'La tarea ya no existe en la base de datos compartida. Recarga antes de continuar.',
          };
        }

        if (latestTask.updatedAt !== expectedUpdatedAt) {
          return {
            ok: false,
            message:
              'La tarea ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
          };
        }

        const updatedTask = normalizeTask(buildUpdatedTask(latestTask, draft, seguimientoText));
        const saveResult = await persistTaskDirectly(updatedTask, expectedUpdatedAt);
        if (!saveResult.ok) {
          return saveResult;
        }

        set((state) => {
          const tasks = state.tasks.map((task) => (task.id === id ? updatedTask : task));
          return {
            tasks,
            selectedTaskId: isTaskClosed(updatedTask) ? firstActiveTaskId(tasks) : id,
          };
        });

        return { ok: true, message: 'Tarea guardada.', recordId: id };
      }

      const { records, updatedRecord } = await saveSharedArrayRecord<Task>({
        storageKey: TASKS_STORAGE_KEY,
        recordId: id,
        expectedUpdatedAt,
        parseRecords: parseTasksSnapshot,
        getRecordId: (record) => record.id,
        getRecordUpdatedAt: (record) => record.updatedAt,
        updateRecord: (latestTask) => normalizeTask(buildUpdatedTask(latestTask, draft, seguimientoText)),
        missingMessage:
          'La tarea ya no existe en la base de datos compartida. Recarga antes de continuar.',
        conflictMessage:
          'La tarea ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
      });

      const normalizedRecords = records.map(normalizeTask);
      set({
        tasks: normalizedRecords,
        selectedTaskId: isTaskClosed(updatedRecord) ? firstActiveTaskId(normalizedRecords) : id,
      });

      return { ok: true, message: 'Tarea guardada.' };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'No se ha podido guardar la tarea.',
      };
    }
  },
  removeWithConcurrencyCheck: async (id, expectedUpdatedAt) => {
    try {
      if (hasTaskSqliteRepository()) {
        const latestTasks = await readTasksForStore('all');
        const latestTask = latestTasks.find((task) => task.id === id);
        if (!latestTask) {
          return {
            ok: false,
            message: 'La tarea ya no existe en la base de datos compartida. Recarga antes de continuar.',
          };
        }

        if (latestTask.updatedAt !== expectedUpdatedAt) {
          return {
            ok: false,
            message:
              'La tarea ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
          };
        }

        const now = new Date().toISOString();
        const deletedTask = normalizeTask({ ...latestTask, deletedAt: now, updatedAt: now });
        const saveResult = await persistTaskDirectly(deletedTask, expectedUpdatedAt);
        if (!saveResult.ok) {
          return saveResult;
        }

        enqueueAuditEvent({
          module: 'tareas',
          entityId: id,
          action: 'deleted',
          summary: 'Registro eliminado',
          changes: [],
        });

        set((state) => {
          const tasks = state.tasks.map((task) => (task.id === id ? deletedTask : task));
          return { tasks, selectedTaskId: firstActiveTaskId(tasks) };
        });

        return { ok: true, message: 'Tarea eliminada.', recordId: id };
      }

      const { records, updatedRecord } = await saveSharedArrayRecord<Task>({
        storageKey: TASKS_STORAGE_KEY,
        recordId: id,
        expectedUpdatedAt,
        parseRecords: parseTasksSnapshot,
        getRecordId: (record) => record.id,
        getRecordUpdatedAt: (record) => record.updatedAt,
        updateRecord: (latestTask) => {
          const now = new Date().toISOString();
          enqueueAuditEvent({
            module: 'tareas',
            entityId: latestTask.id,
            action: 'deleted',
            summary: 'Registro eliminado',
            changes: [],
          });
          return normalizeTask({ ...latestTask, deletedAt: now, updatedAt: now });
        },
        missingMessage:
          'La tarea ya no existe en la base de datos compartida. Recarga antes de continuar.',
        conflictMessage:
          'La tarea ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
      });

      const normalizedRecords = records.map(normalizeTask);
      set({
        tasks: normalizedRecords,
        selectedTaskId: firstActiveTaskId(normalizedRecords),
      });

      return { ok: true, message: 'Tarea eliminada.', recordId: updatedRecord.id };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'No se ha podido eliminar la tarea.',
      };
    }
  },
  closeTasksFromCommittee: (taskIds, sessionLabel) => {
    useTaskStore.getState().closeTasksFromSession(taskIds, 'Comité de Empresa', sessionLabel);
  },
  closeTasksFromSession: (taskIds, moduleLabel, sessionLabel) => {
    void useTaskStore
      .getState()
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

import { create } from 'zustand';
import { EMPTY_TASK_FILTERS, type TaskFilters } from '../domain/filters';
import {
  emitPersistenceFeedback,
  readStorageItem,
  writeStorageItem,
} from '../../../services/persistence';
import { saveNewSharedArrayRecord, saveSharedArrayMutation, saveSharedArrayRecord } from '../../../services/sharedRecordPersistence';
import { hasTaskSqliteRepository, loadTasksFromSqlite, saveTaskToSqlite, type TaskSqliteLoadMode } from './taskSqliteRepository';
import { enqueueAuditEvent } from '../../../shared/audit/auditTrail';
import {
  CLOSED_TASK_PHASE,
  isTaskClosed,
  migratePeticionToTask,
  type Task,
  type TaskDraft,
} from '../domain/task';
import {
  firstActiveTaskId,
  isLegacyPeticion,
  isTask,
  normalizeTask,
  parseTasksSnapshot,
  tasksDiffer,
} from './taskNormalization';
import { reconcileTasksWithClosedSessions } from './taskSessionReconciliation';
import {
  buildAssignmentNoticeFields,
  buildSeguimiento,
  buildUpdatedTask,
  createTaskId,
} from './taskMutations';

export const TASKS_STORAGE_KEY = 'traccion.v1.tareas.tasks';
const LEGACY_PETICIONES_STORAGE_KEY = 'traccion.v1.peticiones.peticiones';
const PETICIONES_MIGRATION_FLAG_KEY = 'traccion.v1.tareas.peticionesMigrated';



interface TaskUpdateResult {
  ok: boolean;
  message: string;
  recordId?: string;
}

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

function readStoredArray(storageKey: string): unknown[] {
  const stored = readStorageItem(storageKey);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  return Array.isArray(parsed) ? parsed : [];
}

function readMigratedPeticiones(): Task[] {
  if (readStorageItem(PETICIONES_MIGRATION_FLAG_KEY) === 'true') {
    return [];
  }

  return readStoredArray(LEGACY_PETICIONES_STORAGE_KEY)
    .filter(isLegacyPeticion)
    .map(migratePeticionToTask)
    .map(normalizeTask);
}

function readTasks(): Task[] {
  const rawCurrentTasks = readStoredArray(TASKS_STORAGE_KEY).filter(isTask);
  const currentTasks = reconcileTasksWithClosedSessions(rawCurrentTasks.map(normalizeTask));
  const migratedTasks = readMigratedPeticiones().filter(
    (migratedTask) => !currentTasks.some((task) => task.id === migratedTask.id),
  );
  const currentTasksChanged = currentTasks.some(
    (task, index) => JSON.stringify(task) !== JSON.stringify(rawCurrentTasks[index]),
  );

  if (migratedTasks.length === 0) {
    if (currentTasksChanged) {
      persistTasks(currentTasks);
    }
    return currentTasks;
  }

  const tasks = reconcileTasksWithClosedSessions([...currentTasks, ...migratedTasks]);
  persistTasks(tasks);
  writeStorageItem(PETICIONES_MIGRATION_FLAG_KEY, 'true');
  return tasks;
}

function persistTasks(tasks: Task[]): void {
  writeStorageItem(TASKS_STORAGE_KEY, JSON.stringify(tasks.map(normalizeTask)));
}

async function readTasksForStore(mode: TaskSqliteLoadMode = 'active'): Promise<Task[]> {
  if (!hasTaskSqliteRepository()) {
    if (import.meta.env.MODE === 'test') return readTasks();
    console.error('Repositorio SQLite de tareas no disponible; no se usa fallback local.');
    return [];
  }

  try {
    const sqliteTasks = await loadTasksFromSqlite(parseTasksSnapshot, mode);
    if (sqliteTasks) {
      const normalizedSqliteTasks = sqliteTasks.map(normalizeTask);
      const reconciledSqliteTasks = reconcileTasksWithClosedSessions(normalizedSqliteTasks);
      const previousTasksById = new Map(normalizedSqliteTasks.map((task) => [task.id, task]));
      const migratedPeticiones = mode === 'active'
        ? readMigratedPeticiones().filter(
            (migratedTask) =>
              !isTaskClosed(migratedTask) &&
              !reconciledSqliteTasks.some((task) => task.id === migratedTask.id),
          )
        : [];
      const tasks = [...reconciledSqliteTasks, ...migratedPeticiones].map(normalizeTask);

      const normalizationPersisted = await persistTaskChangesBestEffort(
        tasks,
        previousTasksById,
        'normalización o migración de tareas',
      );

      if (migratedPeticiones.length > 0 && normalizationPersisted) {
        writeStorageItem(PETICIONES_MIGRATION_FLAG_KEY, 'true');
      }

      return tasks;
    }
  } catch (error) {
    console.error('No se han podido cargar tareas desde SQLite. No se usa fallback local.', error);
  }

  return [];
}

async function persistTaskDirectly(task: Task, expectedUpdatedAt: string | null): Promise<TaskUpdateResult> {
  if (!hasTaskSqliteRepository()) {
    return { ok: false, message: 'Repositorio SQLite directo de tareas no disponible.' };
  }

  const result = await saveTaskToSqlite(normalizeTask(task), expectedUpdatedAt);
  if (!result) {
    return { ok: false, message: 'Repositorio SQLite directo de tareas no disponible.' };
  }

  return { ok: result.ok, message: result.message, recordId: task.id };
}

async function persistTaskChangesBestEffort(
  tasks: Task[],
  previousTasksById: Map<string, Task>,
  context: string,
): Promise<boolean> {
  if (!hasTaskSqliteRepository()) {
    return false;
  }

  let allPersisted = true;
  for (const task of tasks) {
    const previousTask = previousTasksById.get(task.id);
    const expectedUpdatedAt = previousTask?.updatedAt ?? null;
    if (previousTask && !tasksDiffer(previousTask, task)) {
      continue;
    }

    const result = await persistTaskDirectly(task, expectedUpdatedAt);
    if (!result.ok) {
      allPersisted = false;
      console.warn(`[tareas] No se ha podido persistir ${context}.`, result.message);
    }
  }

  return allPersisted;
}

export { parseTasksSnapshot } from './taskNormalization';

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
    try {
      const now = new Date().toISOString();
      const taskIdSet = new Set(taskIds);
      const seguimiento = buildSeguimiento(`Tratada en ${moduleLabel} (${sessionLabel}).`, now);

      if (hasTaskSqliteRepository()) {
        const latestTasks = await readTasksForStore('all');
        const updatedTasks = latestTasks.map((task) => {
          if (!taskIdSet.has(task.id) || task.deletedAt || isTaskClosed(task)) {
            return task;
          }

          enqueueAuditEvent({
            module: 'tareas',
            entityId: task.id,
            action: 'status_changed',
            summary: `Estado cambiado: ${task.estado} → cerrada`,
            changes: [
              { field: 'estado', label: 'Estado', before: task.estado, after: 'cerrada' },
              { field: 'fase', label: 'Fase', before: task.fase, after: CLOSED_TASK_PHASE },
            ],
          });

          return normalizeTask({
            ...task,
            estado: 'cerrada' as const,
            fase: CLOSED_TASK_PHASE,
            seguimiento: [...seguimiento, ...task.seguimiento],
            closedAt: task.closedAt ?? now,
            updatedAt: now,
          });
        });

        const saveResults = await Promise.all(
          updatedTasks.map((task) => {
            const previousTask = latestTasks.find((candidate) => candidate.id === task.id);
            if (!previousTask || previousTask.updatedAt === task.updatedAt) {
              return Promise.resolve({ ok: true, message: 'Sin cambios.' });
            }

            return persistTaskDirectly(task, previousTask.updatedAt);
          }),
        );
        const failedSave = saveResults.find((result) => !result.ok);
        if (failedSave) {
          return { ok: false, message: failedSave.message };
        }

        set({ tasks: updatedTasks, selectedTaskId: firstActiveTaskId(updatedTasks) });
        return { ok: true, message: 'Puntos tratados cerrados.' };
      }

      const result = await saveSharedArrayMutation<Task>({
        storageKey: TASKS_STORAGE_KEY,
        parseRecords: parseTasksSnapshot,
        updateRecords: (latestTasks) =>
          latestTasks.map((task) => {
            if (!taskIdSet.has(task.id) || task.deletedAt || isTaskClosed(task)) {
              return task;
            }

            enqueueAuditEvent({
              module: 'tareas',
              entityId: task.id,
              action: 'status_changed',
              summary: `Estado cambiado: ${task.estado} → cerrada`,
              changes: [
                { field: 'estado', label: 'Estado', before: task.estado, after: 'cerrada' },
                { field: 'fase', label: 'Fase', before: task.fase, after: CLOSED_TASK_PHASE },
              ],
            });

            return normalizeTask({
              ...task,
              estado: 'cerrada' as const,
              fase: CLOSED_TASK_PHASE,
              seguimiento: [...seguimiento, ...task.seguimiento],
              closedAt: task.closedAt ?? now,
              updatedAt: now,
            });
          }),
      });
      const normalizedTasks = result.records.map(normalizeTask);
      set({ tasks: normalizedTasks, selectedTaskId: firstActiveTaskId(normalizedTasks) });
      return { ok: true, message: 'Puntos tratados cerrados.' };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'No se han podido cerrar los puntos tratados.',
      };
    }
  },
  selectTask: (taskId) => set({ selectedTaskId: taskId }),
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
}));

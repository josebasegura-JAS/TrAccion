import { emitPersistenceFeedback } from '../../../services/persistence';
import { saveNewSharedArrayRecord, saveSharedArrayRecord } from '../../../services/sharedRecordPersistence';
import { enqueueAuditEvent } from '../../../shared/audit/auditTrail';
import { isTaskClosed, type Task, type TaskDraft } from '../domain/task';
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
  readTasksForStore,
  TASKS_STORAGE_KEY,
  type TaskUpdateResult,
} from './taskPersistence';
import { hasTaskSqliteRepository } from './taskSqliteRepository';

export interface TaskCrudState {
  tasks: Task[];
  selectedTaskId: string;
}

type SetTaskCrudState = (
  updater:
    | Partial<TaskCrudState>
    | ((state: TaskCrudState) => Partial<TaskCrudState>),
) => void;

export async function createTaskWithConcurrencyCheck(
  draft: TaskDraft,
  seguimientoText: string | undefined,
  setState: SetTaskCrudState,
): Promise<TaskUpdateResult> {
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
      if (!saveResult.ok) return saveResult;

      enqueueAuditEvent({
        module: 'tareas', entityId: task.id, action: 'created', summary: 'Registro creado', changes: [],
      });

      setState((state) => {
        const tasks = [...state.tasks.filter((record) => record.id !== task.id), task].map(normalizeTask);
        return { tasks, selectedTaskId: isTaskClosed(task) ? firstActiveTaskId(tasks) : task.id };
      });
      return { ok: true, message: 'Tarea creada.', recordId: task.id };
    }

    const { records, newRecord } = await saveNewSharedArrayRecord<Task>({
      storageKey: TASKS_STORAGE_KEY,
      newRecord: task,
      parseRecords: parseTasksSnapshot,
      getRecordId: (record) => record.id,
      duplicateMessage: 'La tarea ya existe en la base compartida. Recarga antes de continuar.',
    });

    enqueueAuditEvent({
      module: 'tareas', entityId: newRecord.id, action: 'created', summary: 'Registro creado', changes: [],
    });
    const normalizedRecords = records.map(normalizeTask);
    setState({
      tasks: normalizedRecords,
      selectedTaskId: isTaskClosed(newRecord) ? firstActiveTaskId(normalizedRecords) : newRecord.id,
    });
    return { ok: true, message: 'Tarea creada.', recordId: newRecord.id };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'No se ha podido crear la tarea.' };
  }
}

export async function createManyTasksFromImport(
  drafts: Array<{ externalKey: string; draft: TaskDraft; closedAt?: string | null }>,
  state: TaskCrudState,
  setState: SetTaskCrudState,
  reloadFromStorage: () => void,
): Promise<Record<string, string>> {
  const now = new Date().toISOString();
  const createdIds: Record<string, string> = {};
  const existingImportKeys = new Set(
    state.tasks.map((task) => task.observaciones.match(/ImportKey:([^\s]+)/)?.[1])
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
        task.observaciones.includes(`ImportKey:${externalKey}`));
      if (existingTask) createdIds[externalKey] = existingTask.id;
      return;
    }

    const task: Task = normalizeTask({
      id: createTaskId(),
      ...draft,
      sessionDocumentCode: '',
      sessionModule: '',
      sessionDate: '',
      observaciones: `${draft.observaciones ? `${draft.observaciones} ` : ''}ImportKey:${externalKey}`,
      seguimiento: buildSeguimiento('Tarea importada desde resumen histórico de Comité/Paritaria.', now),
      createdAt: closedAt ?? now,
      updatedAt: now,
      deletedAt: null,
      closedAt: isTaskClosed(draft) ? (closedAt ?? now) : null,
    });
    createdIds[externalKey] = task.id;
    importedTasks.push(task);
  });

  if (importedTasks.length === 0 && !changedExistingTasks) return createdIds;
  const tasks = [...tasksWithNormalizedExistingImports, ...importedTasks];

  if (hasTaskSqliteRepository()) {
    try {
      for (const task of importedTasks) {
        const result = await persistTaskDirectly(task, null);
        if (!result.ok) throw new Error(result.message);
      }
      if (changedExistingTasks) {
        for (let index = 0; index < tasksWithNormalizedExistingImports.length; index += 1) {
          const task = tasksWithNormalizedExistingImports[index];
          const previousTask = state.tasks[index];
          if (!previousTask || !tasksDiffer(previousTask, task)) continue;
          const result = await persistTaskDirectly(task, previousTask.updatedAt);
          if (!result.ok) throw new Error(result.message);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se han podido guardar las tareas importadas.';
      emitPersistenceFeedback({ kind: 'error', updatedAt: new Date().toISOString(), key: TASKS_STORAGE_KEY, message });
      reloadFromStorage();
      throw error;
    }
  } else {
    persistTasks(tasks);
  }

  setState({ tasks, selectedTaskId: firstActiveTaskId(tasks) });
  return createdIds;
}

export async function updateTaskWithConcurrencyCheck(
  id: string,
  draft: TaskDraft,
  seguimientoText: string | undefined,
  expectedUpdatedAt: string | null,
  setState: SetTaskCrudState,
): Promise<TaskUpdateResult> {
  try {
    if (hasTaskSqliteRepository()) {
      const latestTasks = await readTasksForStore('all');
      const latestTask = latestTasks.find((task) => task.id === id);
      if (!latestTask) return { ok: false, message: 'La tarea ya no existe en la base de datos compartida. Recarga antes de continuar.' };
      if (latestTask.updatedAt !== expectedUpdatedAt) {
        return { ok: false, message: 'La tarea ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.' };
      }

      const updatedTask = normalizeTask(buildUpdatedTask(latestTask, draft, seguimientoText));
      const saveResult = await persistTaskDirectly(updatedTask, expectedUpdatedAt);
      if (!saveResult.ok) return saveResult;
      setState((state) => {
        const tasks = state.tasks.map((task) => (task.id === id ? updatedTask : task));
        return { tasks, selectedTaskId: isTaskClosed(updatedTask) ? firstActiveTaskId(tasks) : id };
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
      missingMessage: 'La tarea ya no existe en la base de datos compartida. Recarga antes de continuar.',
      conflictMessage: 'La tarea ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
    });
    const normalizedRecords = records.map(normalizeTask);
    setState({ tasks: normalizedRecords, selectedTaskId: isTaskClosed(updatedRecord) ? firstActiveTaskId(normalizedRecords) : id });
    return { ok: true, message: 'Tarea guardada.' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'No se ha podido guardar la tarea.' };
  }
}

export async function removeTaskWithConcurrencyCheck(
  id: string,
  expectedUpdatedAt: string | null,
  setState: SetTaskCrudState,
): Promise<TaskUpdateResult> {
  try {
    if (hasTaskSqliteRepository()) {
      const latestTasks = await readTasksForStore('all');
      const latestTask = latestTasks.find((task) => task.id === id);
      if (!latestTask) return { ok: false, message: 'La tarea ya no existe en la base de datos compartida. Recarga antes de continuar.' };
      if (latestTask.updatedAt !== expectedUpdatedAt) {
        return { ok: false, message: 'La tarea ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.' };
      }
      const now = new Date().toISOString();
      const deletedTask = normalizeTask({ ...latestTask, deletedAt: now, updatedAt: now });
      const saveResult = await persistTaskDirectly(deletedTask, expectedUpdatedAt);
      if (!saveResult.ok) return saveResult;
      enqueueAuditEvent({ module: 'tareas', entityId: id, action: 'deleted', summary: 'Registro eliminado', changes: [] });
      setState((state) => {
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
        enqueueAuditEvent({ module: 'tareas', entityId: latestTask.id, action: 'deleted', summary: 'Registro eliminado', changes: [] });
        return normalizeTask({ ...latestTask, deletedAt: now, updatedAt: now });
      },
      missingMessage: 'La tarea ya no existe en la base de datos compartida. Recarga antes de continuar.',
      conflictMessage: 'La tarea ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
    });
    const normalizedRecords = records.map(normalizeTask);
    setState({ tasks: normalizedRecords, selectedTaskId: firstActiveTaskId(normalizedRecords) });
    return { ok: true, message: 'Tarea eliminada.', recordId: updatedRecord.id };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'No se ha podido eliminar la tarea.' };
  }
}

import { emitPersistenceFeedback } from '../../../services/persistence';
import { saveNewSharedArrayRecord, saveSharedArrayRecord } from '../../../services/sharedRecordPersistence';
import { enqueueAuditEvent } from '../../../shared/audit/auditTrail';
import { CLOSED_TASK_PHASE, isTaskClosed, type Task, type TaskDraft, type TaskQuickAction, type TaskSeguimientoSource } from '../domain/task';
import {
  firstActiveTaskId,
  normalizeTask,
  parseTasksSnapshot,
  tasksDiffer,
} from './taskNormalization';
import {
  buildNewTask,
  buildSeguimiento,
  buildUpdatedTask,
  registerTaskUpdateAudit,
  createTaskId,
} from './taskMutations';
import {
  persistTaskDirectly,
  persistTasks,
  readTasksForStore,
  TASKS_STORAGE_KEY,
  type TaskUpdateResult,
} from './taskPersistence';
import { hasTaskSqliteRepository, saveTasksToSqliteAtomically } from './taskSqliteRepository';

interface PendingTaskSave {
  attemptId: string;
  previousTask: Task;
  draft: TaskDraft;
}

// Solo en memoria: nunca se reenvía una escritura incierta automáticamente.
const pendingTaskSaves = new Map<string, PendingTaskSave>();

function isIndeterminateSave(message: string): boolean {
  return /resultado (?:es )?indeterminado|operación puede seguir en curso|superó el límite de \d+ ms/i.test(message);
}

export interface TaskCrudState {
  tasks: Task[];
  selectedTaskId: string;
}

type SetTaskCrudState = (
  updater:
    | Partial<TaskCrudState>
    | ((state: TaskCrudState) => Partial<TaskCrudState>),
) => void;

export interface CoordinationTrackingMutation {
  taskId: string;
  trackingId: string;
  text: string;
  source: TaskSeguimientoSource;
  closeTask?: boolean;
}

function applyCoordinationTrackingMutation(task: Task, mutation: CoordinationTrackingMutation): Task {
  const now = new Date().toISOString();
  const existingEntry = task.seguimiento.find((entry) => entry.id === mutation.trackingId);
  const cleanText = mutation.text.trim();
  const remainingTracking = task.seguimiento.filter((entry) => entry.id !== mutation.trackingId);
  const seguimiento = cleanText
    ? [
        {
          id: mutation.trackingId,
          fechaHora: existingEntry?.fechaHora ?? now,
          texto: cleanText,
          source: mutation.source,
        },
        ...remainingTracking,
      ]
    : remainingTracking;

  const shouldClose = Boolean(mutation.closeTask) && !isTaskClosed(task);
  return normalizeTask({
    ...task,
    seguimiento,
    estado: shouldClose ? 'cerrada' : task.estado,
    fase: shouldClose ? CLOSED_TASK_PHASE : task.fase,
    closedAt: shouldClose ? now : task.closedAt,
    updatedAt: now,
  });
}

export async function upsertCoordinationTrackingWithConcurrencyCheck(
  mutation: CoordinationTrackingMutation,
  setState: SetTaskCrudState,
): Promise<TaskUpdateResult> {
  try {
    if (hasTaskSqliteRepository()) {
      const latestTasks = await readTasksForStore('all', mutation.taskId);
      const latestTask = latestTasks.find((task) => task.id === mutation.taskId);
      if (!latestTask || latestTask.deletedAt) {
        return { ok: false, message: 'La tarea vinculada ya no existe o está eliminada.' };
      }

      const updatedTask = applyCoordinationTrackingMutation(latestTask, mutation);
      const saveResult = await persistTaskDirectly(updatedTask, latestTask.updatedAt);
      if (!saveResult.ok) return saveResult;
      setState((state) => ({
        tasks: state.tasks.some((task) => task.id === updatedTask.id)
          ? state.tasks.map((task) => task.id === updatedTask.id ? updatedTask : task)
          : [...state.tasks, updatedTask],
        selectedTaskId: state.selectedTaskId,
      }));
      enqueueAuditEvent({
        module: 'tareas',
        entityId: updatedTask.id,
        action: 'updated',
        summary: mutation.text.trim() ? 'Seguimiento actualizado desde Coordinación' : 'Seguimiento de Coordinación eliminado',
        changes: [],
      });
      return { ok: true, message: 'Seguimiento de tarea actualizado.', recordId: updatedTask.id };
    }

    const { records, updatedRecord } = await saveSharedArrayRecord<Task>({
      storageKey: TASKS_STORAGE_KEY,
      recordId: mutation.taskId,
      expectedUpdatedAt: null,
      parseRecords: parseTasksSnapshot,
      getRecordId: (record) => record.id,
      getRecordUpdatedAt: (record) => record.updatedAt,
      updateRecord: (latestTask) => applyCoordinationTrackingMutation(latestTask, mutation),
      missingMessage: 'La tarea vinculada ya no existe. Recarga antes de continuar.',
      conflictMessage: 'La tarea vinculada ha cambiado mientras guardabas. Vuelve a guardar la reunión.',
    });
    const normalizedRecords = records.map(normalizeTask);
    setState((state) => ({ tasks: normalizedRecords, selectedTaskId: state.selectedTaskId }));
    return { ok: true, message: 'Seguimiento de tarea actualizado.', recordId: updatedRecord.id };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'No se ha podido actualizar el seguimiento de la tarea vinculada.' };
  }
}

export async function createTaskWithConcurrencyCheck(
  draft: TaskDraft,
  seguimientoText: string | undefined,
  setState: SetTaskCrudState,
): Promise<TaskUpdateResult> {
  const task = buildNewTask(draft, seguimientoText);

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

export function buildImportedTaskRecord(
  entry: { externalKey: string; draft: TaskDraft; closedAt?: string | null },
  now = new Date().toISOString(),
): Task {
  const { externalKey, draft, closedAt } = entry;
  // Una importación de sesiones anterior a 2026 se incorpora como histórico
  // cerrado desde su creación, sin imponer ese cierre en futuras lecturas.
  const historicalYear = Number((closedAt ?? '').match(/^(\d{4})/)?.[1] ?? 0);
  const isHistoricalSession = historicalYear > 0 && historicalYear < 2026;
  const importedDraft = isHistoricalSession
    ? { ...draft, estado: 'cerrada', fase: CLOSED_TASK_PHASE }
    : draft;
  return normalizeTask({
    id: createTaskId(),
    ...importedDraft,
    sessionDocumentCode: '',
    sessionModule: '',
    sessionDate: '',
    observaciones: `${draft.observaciones ? `${draft.observaciones} ` : ''}ImportKey:${externalKey}`,
    seguimiento: buildSeguimiento('Tarea importada desde resumen histórico de Comité/Paritaria.', now),
    createdAt: closedAt ?? now,
    updatedAt: now,
    deletedAt: null,
    closedAt: isTaskClosed(importedDraft) ? (closedAt ?? now) : null,
  });
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

    const task = buildImportedTaskRecord({ externalKey, draft, closedAt }, now);
    createdIds[externalKey] = task.id;
    importedTasks.push(task);
  });

  if (importedTasks.length === 0 && !changedExistingTasks) return createdIds;
  const tasks = [...tasksWithNormalizedExistingImports, ...importedTasks];

  if (hasTaskSqliteRepository()) {
    try {
      const batch = [
        ...importedTasks.map((task) => ({ task, expectedUpdatedAt: null })),
        ...tasksWithNormalizedExistingImports.flatMap((task, index) => {
          const previousTask = state.tasks[index];
          return previousTask && tasksDiffer(previousTask, task)
            ? [{ task, expectedUpdatedAt: previousTask.updatedAt }]
            : [];
        }),
      ];

      const result = await saveTasksToSqliteAtomically(batch);
      if (!result || !result.ok) {
        throw new Error(result?.message ?? 'Repositorio SQLite directo de tareas no disponible.');
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
  quickAction?: Pick<TaskQuickAction, 'titulo' | 'fechaObjetivo' | 'asignadaA'>,
): Promise<TaskUpdateResult> {
  try {
    if (hasTaskSqliteRepository()) {
      // Una petición que agotó el timeout puede seguir ejecutándose en Electron.
      // La siguiente pulsación verifica el resultado; NUNCA reenvía ese guardado.
      const pending = pendingTaskSaves.get(id);
      if (pending) {
        let persisted: Task | undefined;
        try {
          persisted = (await readTasksForStore('all', id)).find((task) => task.id === id);
        } catch {
          return { ok: false, message: 'El resultado del guardado anterior sigue sin poder verificarse. Conserva el borrador y vuelve a comprobar cuando SQLite esté disponible. No se ha enviado otro guardado.' };
        }
        if (persisted?.lastSaveAttemptId === pending.attemptId) {
          pendingTaskSaves.delete(id);
          registerTaskUpdateAudit(pending.previousTask, pending.draft);
          setState((state) => {
            const tasks = state.tasks.map((task) => task.id === id ? persisted! : task);
            return { tasks, selectedTaskId: isTaskClosed(persisted!) ? firstActiveTaskId(tasks) : id };
          });
          return { ok: true, message: 'Se ha confirmado el guardado anterior. No se ha duplicado la operación.', recordId: id };
        }
        pendingTaskSaves.delete(id);
        if (persisted && persisted.updatedAt === pending.previousTask.updatedAt) {
          return { ok: false, message: 'El guardado anterior no figura en SQLite. Se ha conservado el borrador y no se ha enviado otra escritura. Revisa los datos y vuelve a pulsar Guardar.' };
        }
        return { ok: false, message: 'No se ha podido confirmar el guardado anterior: la tarea ahora tiene otra versión o ya no existe. Conserva el borrador y recarga antes de continuar; no se ha repetido la escritura.' };
      }

      const latestTasks = await readTasksForStore('all', id);
      const latestTask = latestTasks.find((task) => task.id === id);
      if (!latestTask) return { ok: false, message: 'La tarea ya no existe en la base de datos compartida. Recarga antes de continuar.' };
      if (latestTask.updatedAt !== expectedUpdatedAt) {
        return { ok: false, message: 'La tarea ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.' };
      }

      // Marcador inequívoco para distinguir el guardado propio de otra edición
      // incluso cuando dos equipos generan el mismo updatedAt.
      const attemptId = createTaskId();
      const updatedTask = normalizeTask({
        ...buildUpdatedTask(latestTask, draft, seguimientoText, quickAction, { skipAudit: true }),
        lastSaveAttemptId: attemptId,
      });
      let saveResult: TaskUpdateResult;
      try {
        saveResult = await persistTaskDirectly(updatedTask, expectedUpdatedAt);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isIndeterminateSave(message)) {
          pendingTaskSaves.set(id, { attemptId, previousTask: latestTask, draft });
          return { ok: false, message: 'El guardado agotó el tiempo de espera y puede terminar después. Conserva el borrador. Pulsa Guardar de nuevo solo para comprobar el resultado; no se enviará otra escritura.' };
        }
        throw error;
      }
      if (!saveResult.ok) {
        if (isIndeterminateSave(saveResult.message)) {
          pendingTaskSaves.set(id, { attemptId, previousTask: latestTask, draft });
          return { ok: false, message: 'El guardado agotó el tiempo de espera y puede terminar después. Conserva el borrador. Pulsa Guardar de nuevo solo para comprobar el resultado; no se enviará otra escritura.' };
        }
        return saveResult;
      }
      registerTaskUpdateAudit(latestTask, draft);
      setState((state) => {
        const tasks = state.tasks.map((task) => (task.id === id ? updatedTask : task));
        return { tasks, selectedTaskId: isTaskClosed(updatedTask) ? firstActiveTaskId(tasks) : id };
      });
      return { ok: true, message: 'Tarea guardada.', recordId: id };
    }

    const auditSnapshot: { previousTask: Task | null } = { previousTask: null };
    const { records, updatedRecord } = await saveSharedArrayRecord<Task>({
      storageKey: TASKS_STORAGE_KEY,
      recordId: id,
      expectedUpdatedAt,
      parseRecords: parseTasksSnapshot,
      getRecordId: (record) => record.id,
      getRecordUpdatedAt: (record) => record.updatedAt,
      updateRecord: (latestTask) => {
        auditSnapshot.previousTask = latestTask;
        return normalizeTask(buildUpdatedTask(latestTask, draft, seguimientoText, quickAction, { skipAudit: true }));
      },
      missingMessage: 'La tarea ya no existe en la base de datos compartida. Recarga antes de continuar.',
      conflictMessage: 'La tarea ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
    });
    if (auditSnapshot.previousTask) registerTaskUpdateAudit(auditSnapshot.previousTask, draft);
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
      const latestTasks = await readTasksForStore('all', id);
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
        return normalizeTask({ ...latestTask, deletedAt: now, updatedAt: now });
      },
      missingMessage: 'La tarea ya no existe en la base de datos compartida. Recarga antes de continuar.',
      conflictMessage: 'La tarea ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
    });
    enqueueAuditEvent({ module: 'tareas', entityId: updatedRecord.id, action: 'deleted', summary: 'Registro eliminado', changes: [] });
    const normalizedRecords = records.map(normalizeTask);
    setState({ tasks: normalizedRecords, selectedTaskId: firstActiveTaskId(normalizedRecords) });
    return { ok: true, message: 'Tarea eliminada.', recordId: updatedRecord.id };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'No se ha podido eliminar la tarea.' };
  }
}

import { enqueueAuditEvent } from '../../../shared/audit/auditTrail';
import { saveSharedArrayMutation } from '../../../services/sharedRecordPersistence';
import { CLOSED_TASK_PHASE, isTaskClosed, type Task } from '../domain/task';
import { buildSeguimiento } from './taskMutations';
import { firstActiveTaskId, normalizeTask, parseTasksSnapshot } from './taskNormalization';
import { hasTaskSqliteRepository } from './taskSqliteRepository';
import {
  persistTaskDirectly,
  readTasksForStore,
  TASKS_STORAGE_KEY,
  type TaskUpdateResult,
} from './taskPersistence';

export interface ClosedSessionTasksResult extends TaskUpdateResult {
  tasks?: Task[];
  selectedTaskId?: string;
}

function closeTasks(
  tasks: Task[],
  taskIdSet: Set<string>,
  moduleLabel: string,
  sessionLabel: string,
  now: string,
): Task[] {
  const seguimiento = buildSeguimiento(`Tratada en ${moduleLabel} (${sessionLabel}).`, now);

  return tasks.map((task) => {
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
}

export async function closeTasksFromSessionPersisted(
  taskIds: string[],
  moduleLabel: string,
  sessionLabel: string,
): Promise<ClosedSessionTasksResult> {
  try {
    const now = new Date().toISOString();
    const taskIdSet = new Set(taskIds);

    if (hasTaskSqliteRepository()) {
      const latestTasks = await readTasksForStore('all');
      const updatedTasks = closeTasks(latestTasks, taskIdSet, moduleLabel, sessionLabel, now);

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

      return {
        ok: true,
        message: 'Puntos tratados cerrados.',
        tasks: updatedTasks,
        selectedTaskId: firstActiveTaskId(updatedTasks),
      };
    }

    const result = await saveSharedArrayMutation<Task>({
      storageKey: TASKS_STORAGE_KEY,
      parseRecords: parseTasksSnapshot,
      updateRecords: (latestTasks) => closeTasks(latestTasks, taskIdSet, moduleLabel, sessionLabel, now),
    });
    const normalizedTasks = result.records.map(normalizeTask);
    return {
      ok: true,
      message: 'Puntos tratados cerrados.',
      tasks: normalizedTasks,
      selectedTaskId: firstActiveTaskId(normalizedTasks),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No se han podido cerrar los puntos tratados.',
    };
  }
}

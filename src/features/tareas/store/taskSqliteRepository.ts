import { clearPersistenceBusy, publishPersistenceBusy, waitForNextPaint } from '../../../services/persistence';
import type { Task } from '../domain/task';

export interface TaskSqliteSaveResult {
  ok: boolean;
  message: string;
  currentUpdatedAt: string | null;
}

export function hasTaskSqliteRepository(): boolean {
  return Boolean(window.traccion?.loadTaskRecords && window.traccion?.saveTaskRecordIfUnchanged);
}

export async function loadTasksFromSqlite(
  parseTasks: (storageValue: string | null) => Task[],
): Promise<Task[] | null> {
  const loader = window.traccion?.loadTaskRecords;
  if (!loader) {
    return null;
  }

  const snapshot = await loader();
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    return null;
  }

  return snapshot.records.flatMap((record) => parseTasks(`[${record.value}]`));
}

const TASKS_DIRECT_STORAGE_KEY = 'traccion.v1.tareas.tasks';

export async function saveTaskToSqlite(
  task: Task,
  expectedUpdatedAt: string | null,
): Promise<TaskSqliteSaveResult | null> {
  const saver = window.traccion?.saveTaskRecordIfUnchanged;
  if (!saver) {
    return null;
  }

  publishPersistenceBusy(TASKS_DIRECT_STORAGE_KEY, 'Guardando tarea en SQLite…');
  await waitForNextPaint();

  try {
    const result = await saver({
      id: task.id,
      value: JSON.stringify(task),
      expectedUpdatedAt,
    });

    clearPersistenceBusy(TASKS_DIRECT_STORAGE_KEY, result.message);

    return {
      ok: result.ok,
      message: result.message,
      currentUpdatedAt: result.currentUpdatedAt,
    };
  } catch (error) {
    clearPersistenceBusy(TASKS_DIRECT_STORAGE_KEY, 'No se ha podido guardar la tarea en SQLite.');
    throw error;
  }
}

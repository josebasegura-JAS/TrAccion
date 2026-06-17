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

export async function saveTaskToSqlite(
  task: Task,
  expectedUpdatedAt: string | null,
): Promise<TaskSqliteSaveResult | null> {
  const saver = window.traccion?.saveTaskRecordIfUnchanged;
  if (!saver) {
    return null;
  }

  const result = await saver({
    id: task.id,
    value: JSON.stringify(task),
    expectedUpdatedAt,
  });

  return {
    ok: result.ok,
    message: result.message,
    currentUpdatedAt: result.currentUpdatedAt,
  };
}

import { clearPersistenceBusy, publishPersistenceBusy, waitForNextPaint } from '../../../services/persistence';
import {
  saveSharedRecord,
} from '../../../services/strictSqliteWrites';
import type { Task } from '../domain/task';

const TASKS_DIRECT_STORAGE_KEY = 'traccion.v1.tareas.tasks';

const TEMPORARY_SQLITE_BUSY_RETRIES = 6;
const TEMPORARY_SQLITE_BUSY_RETRY_MS = 250;

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isTemporarySqliteBusyError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  return (
    message.includes('base ocupada') ||
    message.includes('bloqueo temporal') ||
    message.includes('sqlite_busy') ||
    message.includes('database is locked') ||
    message.includes('temporarily unavailable')
  );
}

async function withTemporarySqliteRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= TEMPORARY_SQLITE_BUSY_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTemporarySqliteBusyError(error) || attempt === TEMPORARY_SQLITE_BUSY_RETRIES) {
        break;
      }
      await delay(Math.min(TEMPORARY_SQLITE_BUSY_RETRY_MS * (2 ** attempt) + Math.trunc(Math.random() * 100), 3000));
    }
  }

  throw lastError;
}

export interface TaskSqliteSaveResult {
  ok: boolean;
  message: string;
  currentUpdatedAt: string | null;
}

export interface TaskSqliteBatchSaveResult {
  ok: boolean;
  message: string;
  saved: number;
}

export function hasTaskSqliteRepository(): boolean {
  return Boolean(window.traccion?.loadTaskRecords && window.traccion?.saveTaskRecordIfUnchanged);
}

export type TaskSqliteLoadMode = 'all' | 'active' | 'historical';

export async function loadTasksFromSqlite(
  parseTasks: (storageValue: string | null) => Task[],
  mode: TaskSqliteLoadMode = 'all',
): Promise<Task[] | null> {
  const loader = window.traccion?.loadTaskRecords;
  if (!loader) {
    return null;
  }

  const snapshot = await withTemporarySqliteRetry(() => loader({ mode }));
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

  publishPersistenceBusy(TASKS_DIRECT_STORAGE_KEY, 'Guardando tarea en SQLite…');
  await waitForNextPaint();

  const value = JSON.stringify(task);

  try {
    const result = await saveSharedRecord(() => withTemporarySqliteRetry(() => saver({ id: task.id, value, expectedUpdatedAt })));

    clearPersistenceBusy(TASKS_DIRECT_STORAGE_KEY, result.message);

    return result;
  } catch (error) {
    clearPersistenceBusy(TASKS_DIRECT_STORAGE_KEY, 'No se ha podido guardar la tarea en SQLite.');
    throw error;
  }
}

export async function saveTasksToSqliteAtomically(
  records: Array<{ task: Task; expectedUpdatedAt: string | null }>,
): Promise<TaskSqliteBatchSaveResult | null> {
  const saver = window.traccion?.saveTaskRecordIfUnchanged;
  if (!saver) return null;

  publishPersistenceBusy(TASKS_DIRECT_STORAGE_KEY, 'Guardando lote de tareas en SQLite…');
  await waitForNextPaint();

  try {
    // El preload expone una única función para este canal. El handler Electron
    // distingue el payload de lote por la propiedad `records` y lo ejecuta en
    // una única transacción SQLite.
    const batchSaver = saver as unknown as (payload: {
      records: Array<{ id: string; value: string; expectedUpdatedAt: string | null }>;
    }) => Promise<TaskSqliteBatchSaveResult>;

    const result = await withTemporarySqliteRetry(() =>
      batchSaver({
        records: records.map(({ task, expectedUpdatedAt }) => ({
          id: task.id,
          value: JSON.stringify(task),
          expectedUpdatedAt,
        })),
      }),
    );

    clearPersistenceBusy(TASKS_DIRECT_STORAGE_KEY, result.message);
    return result;
  } catch (error) {
    clearPersistenceBusy(TASKS_DIRECT_STORAGE_KEY, 'No se ha podido guardar el lote de tareas en SQLite.');
    throw error;
  }
}

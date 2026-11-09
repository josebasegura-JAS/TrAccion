import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import { isTaskClosed, migratePeticionToTask, type Task } from '../domain/task';
import { hasTaskSqliteRepository, loadTasksFromSqlite, saveTaskToSqlite, type TaskSqliteLoadMode } from './taskSqliteRepository';
import {
  isLegacyPeticion,
  isTask,
  normalizeTask,
  parseTasksSnapshot,
} from './taskNormalization';
import { reconcileTasksWithClosedSessions } from './taskSessionReconciliation';

export const TASKS_STORAGE_KEY = 'traccion.v1.tareas.tasks';
const LEGACY_PETICIONES_STORAGE_KEY = 'traccion.v1.peticiones.peticiones';
const PETICIONES_MIGRATION_FLAG_KEY = 'traccion.v1.tareas.peticionesMigrated';

export interface TaskUpdateResult {
  ok: boolean;
  message: string;
  recordId?: string;
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

export function readTasks(): Task[] {
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

export function persistTasks(tasks: Task[]): void {
  writeStorageItem(TASKS_STORAGE_KEY, JSON.stringify(tasks.map(normalizeTask)));
}

export async function readTasksForStore(mode: TaskSqliteLoadMode = 'active', id?: string): Promise<Task[]> {
  if (!hasTaskSqliteRepository()) {
    if (import.meta.env.MODE === 'test') return readTasks();
    throw new Error('Repositorio SQLite de tareas no disponible.');
  }

  try {
    const sqliteTasks = await loadTasksFromSqlite(parseTasksSnapshot, mode, id);
    if (sqliteTasks === null) {
      throw new Error('SQLite de tareas no está disponible en este momento.');
    }

    const normalizedSqliteTasks = sqliteTasks.map(normalizeTask);
    const migratedPeticiones = mode === 'active'
      ? readMigratedPeticiones().filter(
          (migratedTask) =>
            !isTaskClosed(migratedTask) &&
            !normalizedSqliteTasks.some((task) => task.id === migratedTask.id),
        )
      : [];
    // Los registros ya existentes en SQLite son autoritativos. Una lectura no
    // puede reconciliarlos contra un snapshot legacy potencialmente obsoleto,
    // ni guardar automáticamente cambios derivados de su normalización.
    const tasks = [...normalizedSqliteTasks, ...migratedPeticiones];

    // Excepción explícita: la primera importación de peticiones anteriores.
    // Únicamente se insertan registros todavía ausentes en SQLite.
    const migrationPersisted = migratedPeticiones.length > 0
      ? await persistMigratedPeticionesBestEffort(migratedPeticiones)
      : true;

    if (migratedPeticiones.length > 0 && migrationPersisted) {
      writeStorageItem(PETICIONES_MIGRATION_FLAG_KEY, 'true');
    }

    return tasks;
  } catch (error) {
    console.error('No se han podido cargar tareas desde SQLite. No se usa fallback local.', error);
    throw error;
  }
}

export async function persistTaskDirectly(
  task: Task,
  expectedUpdatedAt: string | null,
): Promise<TaskUpdateResult> {
  if (!hasTaskSqliteRepository()) {
    return { ok: false, message: 'Repositorio SQLite directo de tareas no disponible.' };
  }

  const result = await saveTaskToSqlite(normalizeTask(task), expectedUpdatedAt);
  if (!result) {
    return { ok: false, message: 'Repositorio SQLite directo de tareas no disponible.' };
  }

  return { ok: result.ok, message: result.message, recordId: task.id };
}

async function persistMigratedPeticionesBestEffort(tasks: Task[]): Promise<boolean> {
  let allPersisted = true;
  for (const task of tasks) {
    const result = await persistTaskDirectly(task, null);
    if (!result.ok) {
      allPersisted = false;
      console.warn('[tareas] No se ha podido migrar una petición histórica.', result.message);
    }
  }
  return allPersisted;
}

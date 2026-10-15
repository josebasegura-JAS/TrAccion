import { parseTasksSnapshot } from '../../features/tareas/store/taskNormalization';
import {
  hasTaskSqliteRepository,
  loadTasksFromSqlite,
} from '../../features/tareas/store/taskSqliteRepository';

export async function loadTasksForCatalogIntegrityCheck() {
  if (!hasTaskSqliteRepository()) {
    throw new Error('Repositorio SQLite de tareas no disponible.');
  }

  const tasks = await loadTasksFromSqlite(parseTasksSnapshot, 'all');
  if (!tasks) {
    throw new Error('SQLite de tareas no está disponible.');
  }

  return tasks;
}

import type { Task } from '../../tareas/domain/task';
import { normalizeTask, parseTasksSnapshot } from '../../tareas/store/taskNormalization';
import { reconcileTasksWithClosedSessions } from '../../tareas/store/taskSessionReconciliation';
import { hasTaskSqliteRepository, loadTasksFromSqlite } from '../../tareas/store/taskSqliteRepository';

export async function readFreshCoordinationTasks(): Promise<Task[]> {
  if (!hasTaskSqliteRepository()) {
    throw new Error('No está disponible la conexión SQLite de Tareas.');
  }

  try {
    const records = await loadTasksFromSqlite(parseTasksSnapshot, 'all');
    if (records === null) {
      throw new Error('La base de datos de Tareas no está disponible en este momento.');
    }

    return reconcileTasksWithClosedSessions(records.map(normalizeTask));
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    throw new Error(detail
      ? `No se pudieron recuperar las tareas desde SQLite. ${detail}`
      : 'No se pudieron recuperar las tareas desde SQLite. Reintenta la operación.');
  }
}

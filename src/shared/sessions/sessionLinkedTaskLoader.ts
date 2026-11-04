import type { Task } from '../../features/tareas/domain/task';
import { parseTasksSnapshot } from '../../features/tareas/store/taskNormalization';
import type { ManagedSession } from './session';

const TASK_BATCH_SIZE = 300;

/** Solo solicita puntos que aparecen en las sesiones visibles, sin cargar
 * todo el histórico de Tareas ni modificar su store global.
 */
export function missingSessionTaskIds(
  sessions: readonly ManagedSession[],
  knownIds: ReadonlySet<string>,
): string[] {
  const missing = new Set<string>();
  for (const session of sessions) {
    for (const taskId of session.items) {
      if (taskId && !knownIds.has(taskId)) missing.add(taskId);
    }
  }
  return [...missing];
}

/** Consulta de solo lectura: no normaliza ni reescribe tareas históricas. */
export async function loadSessionLinkedTasks(ids: readonly string[]): Promise<Task[]> {
  if (ids.length === 0) return [];
  const load = window.traccion?.loadTaskRecords;
  if (!load) throw new Error('El repositorio compartido de Tareas no está disponible.');
  const result: Task[] = [];
  for (let start = 0; start < ids.length; start += TASK_BATCH_SIZE) {
    const chunk = ids.slice(start, start + TASK_BATCH_SIZE);
    const snapshot = await load({ ids: chunk });
    if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
      throw new Error('SQLite no está disponible para recuperar los puntos de las sesiones.');
    }
    for (const record of snapshot.records) {
      // Mantener exactamente el parsing de Tareas utilizado por el resto
      // de la aplicación, sin generar escrituras durante la consulta.
      result.push(...parseTasksSnapshot(`[${record.value}]`));
    }
  }
  return result;
}

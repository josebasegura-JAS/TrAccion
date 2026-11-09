import { readTasksForStore } from '../../features/tareas/store/taskPersistence';
import type { Task } from '../../features/tareas/domain/task';

/**
 * El lock no actualiza automáticamente el snapshot que estaba abierto en
 * modo consulta. Tras adquirirlo hay que leer la versión vigente de SQLite.
 * La lectura individual no efectúa ninguna escritura ni altera otros datos.
 */
export async function loadFreshTaskAfterLock(taskId: string): Promise<Task> {
  const latest = (await readTasksForStore('all', taskId))
    .find((candidate) => candidate.id === taskId && !candidate.deletedAt);
  if (!latest) {
    throw new Error('No se ha podido recuperar la tarea actual desde SQLite.');
  }
  return latest;
}

/** Nunca reemplazar un borrador que ya contiene cambios sin guardar. */
export function hasUnsavedTaskEditorChanges(
  current: Record<string, unknown>,
  baseline: Record<string, unknown>,
): boolean {
  return JSON.stringify(current) !== JSON.stringify(baseline);
}

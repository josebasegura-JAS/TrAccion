import type { Task } from '../../features/tareas/domain/task';
import { readTasksForStore } from '../../features/tareas/store/taskPersistence';
import { isTaskInSessionPhase } from './session';

type SessionTaskCandidate = Pick<Task, 'id' | 'fase' | 'estado' | 'deletedAt'>;
type SessionTaskLoader = () => Promise<SessionTaskCandidate[]>;

export interface SessionTaskValidationResult {
  ok: boolean;
  message: string;
}

export async function validatePersistedTaskForSession(
  taskId: string,
  taskPhase: string,
  loadTasks: SessionTaskLoader = () => readTasksForStore('all'),
): Promise<SessionTaskValidationResult> {
  const tasks = await loadTasks();
  const task = tasks.find((candidate) => candidate.id === taskId);

  if (!task) {
    return {
      ok: false,
      message: 'La tarea ya no está disponible en la base compartida. Actualiza las tareas antes de continuar.',
    };
  }

  if (!isTaskInSessionPhase(task, taskPhase)) {
    return {
      ok: false,
      message: `La tarea ya no está activa o ya no pertenece a la fase ${taskPhase}. Actualiza las tareas antes de continuar.`,
    };
  }

  return { ok: true, message: '' };
}

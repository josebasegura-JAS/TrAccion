import { isTaskClosed, type Task } from '../../tareas/domain/task';

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function isRosaTask(task: Task): boolean {
  return [task.estado, task.fase].some((value) => normalized(value) === 'tratar con rosa');
}

export function directionMeetingTasks(tasks: Task[], markedTaskIds: readonly string[]): Task[] {
  const marked = new Set(markedTaskIds);
  const seen = new Set<string>();
  return tasks.filter((task) => {
    if (task.deletedAt || isTaskClosed(task) || !(marked.has(task.id) || isRosaTask(task)) || seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  });
}

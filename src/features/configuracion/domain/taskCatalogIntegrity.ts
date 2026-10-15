import type { Task } from '../../tareas/domain/task';

export type TaskCatalogReferenceField = 'estado' | 'fase' | 'responsable' | 'origen';

const FIELD_LABELS: Record<TaskCatalogReferenceField, { article: 'el' | 'la'; label: string }> = {
  estado: { article: 'el', label: 'estado' },
  fase: { article: 'la', label: 'fase' },
  responsable: { article: 'el', label: 'responsable' },
  origen: { article: 'el', label: 'origen' },
};

export function countTaskCatalogReferences(
  tasks: Task[],
  field: TaskCatalogReferenceField,
  value: string,
): number {
  const expected = value.trim();
  if (!expected) return 0;
  return tasks.filter((task) => !task.deletedAt && task[field].trim() === expected).length;
}

export function buildTaskCatalogRenameWarning(
  field: TaskCatalogReferenceField,
  currentValue: string,
  nextValue: string,
  usages: number,
): string | null {
  const current = currentValue.trim();
  const next = nextValue.trim();
  if (!current || !next || current === next || usages <= 0) return null;

  const taskLabel = usages === 1 ? '1 tarea' : `${usages} tareas`;
  const fieldLabel = FIELD_LABELS[field];
  return `${taskLabel} ${usages === 1 ? 'conserva' : 'conservan'} todavía ${fieldLabel.article} ${fieldLabel.label} «${current}».\n\n` +
    `Si renombras el catálogo a «${next}», esas tareas mantendrán el valor anterior. ` +
    'No se migrarán automáticamente y podrían quedar fuera de filtros o automatismos que utilicen el nuevo nombre.\n\n' +
    '¿Quieres renombrar solo el catálogo?';
}
import { buildAuditChanges, buildUpdateSummary, enqueueAuditEvent } from '../../../shared/audit/auditTrail';
import { isTaskClosed, type Task, type TaskDraft, type TaskSeguimientoEntry } from '../domain/task';

const TASK_AUDIT_LABELS = {
  titulo: 'Título', descripcion: 'Descripción', tipo: 'Tipo', fase: 'Fase', estado: 'Estado', prioridad: 'Prioridad',
  fechaLimite: 'Fecha límite', responsable: 'Responsable', origen: 'Detalle origen', sindicato: 'Origen',
  observaciones: 'Observaciones', mail: 'Email',
} satisfies Partial<Record<keyof TaskDraft, string>>;

const TASK_AUDIT_FIELDS: Array<keyof TaskDraft> = [
  'titulo', 'descripcion', 'tipo', 'fase', 'estado', 'prioridad', 'fechaLimite', 'responsable', 'origen', 'sindicato', 'observaciones', 'mail',
];

function pickTaskAuditSnapshot(task: Task | TaskDraft): Record<string, unknown> {
  return TASK_AUDIT_FIELDS.reduce<Record<string, unknown>>((snapshot, field) => {
    snapshot[field] = task[field];
    return snapshot;
  }, {});
}

function registerTaskUpdateAudit(previousTask: Task, draft: TaskDraft): void {
  const changes = buildAuditChanges(
    pickTaskAuditSnapshot(previousTask), pickTaskAuditSnapshot(draft), TASK_AUDIT_LABELS, TASK_AUDIT_FIELDS,
  );
  if (changes.length === 0) return;
  enqueueAuditEvent({
    module: 'tareas', entityId: previousTask.id,
    action: changes.some((change) => change.field === 'estado') ? 'status_changed' : 'updated',
    summary: buildUpdateSummary(changes), changes,
  });
}

export function createTaskId(): string {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeResponsibleForAssignment(value: string | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('es');
}

function createAssignmentNoticeId(taskId: string, assignedAt: string): string {
  return `${taskId}:${assignedAt}:${Math.random().toString(36).slice(2, 8)}`;
}

export function buildAssignmentNoticeFields(
  taskId: string,
  previousResponsible: string | undefined,
  nextResponsible: string | undefined,
  assignedAt: string,
  previousNoticeId?: string,
  previousNoticeAt?: string,
): Pick<Task, 'assignmentNoticeId' | 'assignmentNoticeAt'> {
  const previous = normalizeResponsibleForAssignment(previousResponsible);
  const next = normalizeResponsibleForAssignment(nextResponsible);
  if (previous === next) return { assignmentNoticeId: previousNoticeId, assignmentNoticeAt: previousNoticeAt };
  if (!next) return { assignmentNoticeId: undefined, assignmentNoticeAt: undefined };
  return { assignmentNoticeId: createAssignmentNoticeId(taskId, assignedAt), assignmentNoticeAt: assignedAt };
}

export function buildSeguimiento(text: string | undefined, fechaHora: string): TaskSeguimientoEntry[] {
  const trimmedText = text?.trim();
  return trimmedText ? [{ fechaHora, texto: trimmedText }] : [];
}

function resolveClosedAt(task: Task, draft: TaskDraft, fechaHora: string): string | null {
  if (!isTaskClosed(draft)) return null;
  return isTaskClosed(task) ? (task.closedAt ?? fechaHora) : fechaHora;
}

export function buildUpdatedTask(task: Task, draft: TaskDraft, seguimientoText: string | undefined): Task {
  const now = new Date().toISOString();
  registerTaskUpdateAudit(task, draft);
  return {
    ...task,
    ...draft,
    ...buildAssignmentNoticeFields(task.id, task.responsable, draft.responsable, now, task.assignmentNoticeId, task.assignmentNoticeAt),
    seguimiento: [...buildSeguimiento(seguimientoText, now), ...task.seguimiento],
    closedAt: resolveClosedAt(task, draft, now),
    updatedAt: now,
  };
}

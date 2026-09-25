import {
  CLOSED_TASK_PHASE,
  isTaskClosed,
  DEFAULT_TASK_PHASE,
  EMPTY_TASK_DRAFT,
  TASK_PRIORITIES,
  TASK_STATES,
  TASK_TYPES,
  type LegacyPeticionForTaskMigration,
  type Task,
  type TaskDocumentLink,
  type TaskSeguimientoEntry,
} from '../domain/task';

export function isTaskSeguimientoEntry(value: unknown): value is TaskSeguimientoEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<keyof TaskSeguimientoEntry, unknown>>;
  return typeof candidate.fechaHora === 'string' && typeof candidate.texto === 'string';
}

function hasStringProperty<K extends string>(value: unknown, property: K): value is Record<K, string> {
  return value !== null && typeof value === 'object' && property in value && typeof (value as Record<K, unknown>)[property] === 'string';
}

export function isTask(value: unknown): value is Task {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<keyof Task, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.titulo === 'string' &&
    typeof candidate.descripcion === 'string' &&
    typeof candidate.estado === 'string' &&
    (TASK_STATES as readonly string[]).includes(candidate.estado) &&
    typeof candidate.prioridad === 'string' &&
    (TASK_PRIORITIES as readonly string[]).includes(candidate.prioridad)
  );
}

export function isLegacyPeticion(value: unknown): value is LegacyPeticionForTaskMigration {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<keyof LegacyPeticionForTaskMigration, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.titulo === 'string' &&
    typeof candidate.descripcion === 'string' &&
    typeof candidate.estado === 'string' &&
    typeof candidate.prioridad === 'string' &&
    typeof candidate.createdAt === 'string'
  );
}

function isTaskDocumentLink(value: unknown): value is TaskDocumentLink {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<keyof TaskDocumentLink, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.nombre === 'string' &&
    typeof candidate.ruta === 'string' &&
    typeof candidate.createdAt === 'string'
  );
}

function normalizeDocumentLinks(task: Task): TaskDocumentLink[] {
  return Array.isArray(task.documentLinks) ? task.documentLinks.filter(isTaskDocumentLink) : [];
}

function normalizeSeguimiento(task: Task): TaskSeguimientoEntry[] {
  if (Array.isArray(task.seguimiento)) {
    return task.seguimiento.filter(isTaskSeguimientoEntry).sort((a, b) => b.fechaHora.localeCompare(a.fechaHora));
  }
  const legacyUpdates = (task as { actualizaciones?: unknown }).actualizaciones;
  return Array.isArray(legacyUpdates)
    ? legacyUpdates.filter(isTaskSeguimientoEntry).sort((a, b) => b.fechaHora.localeCompare(a.fechaHora))
    : [];
}

function getHistoricalImportDate(task: Task): string {
  const directDate = task.createdAt.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? task.fechaLimite;
  const notesDate = task.observaciones.match(/\b(20\d{2}-\d{2}-\d{2}|19\d{2}-\d{2}-\d{2})\b/)?.[1] ?? '';
  return directDate || notesDate;
}

function isHistoricalSessionImportTask(task: Task): boolean {
  const phase = task.fase.trim().toLowerCase();
  const origin = task.origen.trim().toLowerCase();
  const notes = task.observaciones.trim().toLowerCase();
  const looksLikeSessionImport =
    phase === 'comite' ||
    phase === 'paritaria' ||
    origin.includes('comité de empresa') ||
    origin.includes('comite de empresa') ||
    origin.includes('comisión paritaria') ||
    origin.includes('comision paritaria') ||
    notes.includes('importado de') ||
    notes.includes('resumen histórico de comité/paritaria') ||
    notes.includes('resumen historico de comite/paritaria') ||
    notes.includes('importkey:comite:') ||
    notes.includes('importkey:paritaria:');

  if (!looksLikeSessionImport) return false;
  const year = Number(getHistoricalImportDate(task).match(/^(\d{4})/)?.[1] ?? 0);
  return year > 0 && year < 2026;
}

export function normalizeTask(task: Task): Task {
  const updatedAt = task.updatedAt ?? task.createdAt;
  const tipo = (TASK_TYPES as readonly string[]).includes(task.tipo) ? task.tipo : EMPTY_TASK_DRAFT.tipo;
  const fase = typeof task.fase === 'string' && task.fase.trim() ? task.fase : DEFAULT_TASK_PHASE;
  const estado = (TASK_STATES as readonly string[]).includes(task.estado) ? task.estado : EMPTY_TASK_DRAFT.estado;
  const normalizedTask = {
    id: task.id,
    titulo: task.titulo,
    descripcion: task.descripcion,
    tipo,
    fase,
    estado,
    prioridad: task.prioridad,
    fechaLimite: task.fechaLimite ?? EMPTY_TASK_DRAFT.fechaLimite,
    responsable: task.responsable ?? EMPTY_TASK_DRAFT.responsable,
    assignmentNoticeId: typeof task.assignmentNoticeId === 'string' && task.assignmentNoticeId.trim() ? task.assignmentNoticeId : undefined,
    assignmentNoticeAt: typeof task.assignmentNoticeAt === 'string' && task.assignmentNoticeAt.trim() ? task.assignmentNoticeAt : undefined,
    origen: task.origen ?? (hasStringProperty(task, 'origenSindicato') ? task.origenSindicato : EMPTY_TASK_DRAFT.origen),
    sindicato: task.sindicato ?? EMPTY_TASK_DRAFT.sindicato,
    observaciones: task.observaciones ?? EMPTY_TASK_DRAFT.observaciones,
    mail: typeof task.mail === 'string' ? task.mail : EMPTY_TASK_DRAFT.mail,
    documentLinks: normalizeDocumentLinks(task),
    sessionDocumentCode: typeof task.sessionDocumentCode === 'string' ? task.sessionDocumentCode : '',
    sessionModule: typeof task.sessionModule === 'string' ? task.sessionModule : '',
    sessionDate: typeof task.sessionDate === 'string' ? task.sessionDate : '',
    seguimiento: normalizeSeguimiento(task),
    createdAt: task.createdAt,
    updatedAt,
    deletedAt: task.deletedAt ?? null,
    closedAt: task.closedAt ?? (estado === 'cerrada' || fase === CLOSED_TASK_PHASE ? updatedAt : null),
  } satisfies Task;

  if (!isHistoricalSessionImportTask(normalizedTask)) return normalizedTask;
  const historicalDate = getHistoricalImportDate(normalizedTask);
  const closedAt = normalizedTask.closedAt ?? (historicalDate ? `${historicalDate}T00:00:00.000Z` : updatedAt);
  return { ...normalizedTask, fase: CLOSED_TASK_PHASE, estado: 'cerrada', closedAt };
}

export function parseTasksSnapshot(storageValue: string | null): Task[] {
  if (!storageValue) return [];
  try {
    const parsed: unknown = JSON.parse(storageValue);
    return Array.isArray(parsed) ? parsed.filter(isTask).map(normalizeTask) : [];
  } catch {
    return [];
  }
}

export function firstActiveTaskId(tasks: Task[]): string {
  return tasks.find((task) => !task.deletedAt && !isTaskClosed(task))?.id ?? '';
}

export function tasksDiffer(first: Task, second: Task): boolean {
  return JSON.stringify(normalizeTask(first)) !== JSON.stringify(normalizeTask(second));
}

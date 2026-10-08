import { CLOSED_TASK_PHASE, isTaskClosed, type Task, type TaskDraft } from '../../tareas/domain/task';
import { useTaskStore } from '../../tareas/store/useTaskStore';
import {
  coordinationMeetingDisplayTitle,
  formatCoordinationDate,
  type CoordinationMeeting,
} from '../domain/coordinacion';
import { coordinationPointStatusLabel } from '../store/useCoordinacionStore';

export type TrackingSyncFailure = { pointId: string; message: string };
export type TaskClosureFailure = { taskId: string; message: string };

type PendingTrackingSync = {
  meetingId: string;
  pointId: string;
  allowStatusOnly: boolean;
};

type PendingTrackingRemoval = {
  meetingId: string;
  pointId: string;
  taskId: string;
  label: string;
};

const PENDING_TRACKING_SYNC_KEY = 'traccion.v1.coordinacion.pendingTrackingSync';
const PENDING_TRACKING_REMOVAL_KEY = 'traccion.v1.coordinacion.pendingTrackingRemoval';

export function meetingContext(meeting: CoordinationMeeting): string {
  if (meeting.area === 'direccion') return 'Dirección';
  if (meeting.area === 'sindicatos') return meeting.unionName?.trim() || 'sindicato';
  return meeting.areaName?.trim() || 'otra área';
}

function coordinationTrackingId(meetingId: string, pointId: string): string {
  return `coordination:${meetingId}:${pointId}`;
}

function buildCoordinationTrackingText(
  meeting: CoordinationMeeting,
  point: CoordinationMeeting['points'][number],
  allowStatusOnly: boolean,
): string {
  const result = point.result.trim();
  if (!result && !allowStatusOnly) return '';
  const header = `Coordinación · ${coordinationMeetingDisplayTitle(meeting)} · ${meetingContext(meeting)} · ${formatCoordinationDate(meeting.date)}`;
  const status = coordinationPointStatusLabel(point.status);
  return result ? `${header}\n${status}\n${result}` : `${header}\n${status}`;
}

function readPendingTrackingSync(): PendingTrackingSync[] {
  const stored = window.localStorage.getItem(PENDING_TRACKING_SYNC_KEY);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is PendingTrackingSync => Boolean(
      entry
      && typeof entry === 'object'
      && typeof (entry as PendingTrackingSync).meetingId === 'string'
      && typeof (entry as PendingTrackingSync).pointId === 'string'
      && typeof (entry as PendingTrackingSync).allowStatusOnly === 'boolean',
    ));
  } catch {
    return [];
  }
}

function writePendingTrackingSync(entries: PendingTrackingSync[]): void {
  if (entries.length === 0) {
    window.localStorage.removeItem(PENDING_TRACKING_SYNC_KEY);
    return;
  }
  window.localStorage.setItem(PENDING_TRACKING_SYNC_KEY, JSON.stringify(entries));
}

function readPendingTrackingRemovals(): PendingTrackingRemoval[] {
  const stored = window.localStorage.getItem(PENDING_TRACKING_REMOVAL_KEY);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is PendingTrackingRemoval => Boolean(
      entry
      && typeof entry === 'object'
      && typeof (entry as PendingTrackingRemoval).meetingId === 'string'
      && typeof (entry as PendingTrackingRemoval).pointId === 'string'
      && typeof (entry as PendingTrackingRemoval).taskId === 'string'
      && typeof (entry as PendingTrackingRemoval).label === 'string',
    ));
  } catch {
    return [];
  }
}

function writePendingTrackingRemovals(entries: PendingTrackingRemoval[]): void {
  if (entries.length === 0) {
    window.localStorage.removeItem(PENDING_TRACKING_REMOVAL_KEY);
    return;
  }
  window.localStorage.setItem(PENDING_TRACKING_REMOVAL_KEY, JSON.stringify(entries));
}

export function queueCoordinationTrackingRemoval(entry: PendingTrackingRemoval): void {
  const entries = readPendingTrackingRemovals();
  const filtered = entries.filter((candidate) => !(candidate.meetingId === entry.meetingId && candidate.pointId === entry.pointId));
  filtered.push(entry);
  writePendingTrackingRemovals(filtered);
}

function setPendingTrackingSync(
  meetingId: string,
  pointId: string,
  allowStatusOnly: boolean,
  pending: boolean,
): void {
  const entries = readPendingTrackingSync();
  const filtered = entries.filter((entry) => !(entry.meetingId === meetingId && entry.pointId === pointId));
  if (pending) filtered.push({ meetingId, pointId, allowStatusOnly });
  writePendingTrackingSync(filtered);
}

export function pendingCoordinationTrackingCount(): number {
  return readPendingTrackingSync().length + readPendingTrackingRemovals().length;
}

export function existingTrackingPointIds(meeting: CoordinationMeeting): string[] {
  const tasks = useTaskStore.getState().tasks;
  return meeting.points
    .filter((point) => {
      if (!point.taskId) return false;
      const task = tasks.find((candidate) => candidate.id === point.taskId);
      if (!task || task.deletedAt) return false;
      const trackingId = coordinationTrackingId(meeting.id, point.id);
      return task.seguimiento.some((entry) => entry.id === trackingId);
    })
    .map((point) => point.id);
}

function closingDraft(task: Task): TaskDraft {
  return {
    titulo: task.titulo,
    descripcion: task.descripcion,
    tipo: task.tipo,
    fase: CLOSED_TASK_PHASE,
    estado: 'cerrada',
    prioridad: task.prioridad,
    fechaLimite: task.fechaLimite,
    responsable: task.responsable,
    origen: task.origen,
    sindicato: task.sindicato,
    observaciones: task.observaciones,
    mail: task.mail,
    documentLinks: task.documentLinks,
  };
}

export async function syncMeetingTracking(
  meeting: CoordinationMeeting,
  pointIds: Iterable<string>,
  options: { allowStatusOnly: boolean },
): Promise<TrackingSyncFailure[]> {
  const failures: TrackingSyncFailure[] = [];
  const pointIdSet = new Set(pointIds);
  for (const pending of readPendingTrackingSync()) {
    if (pending.meetingId === meeting.id) pointIdSet.add(pending.pointId);
  }

  for (const pointId of pointIdSet) {
    const point = meeting.points.find((candidate) => candidate.id === pointId);
    if (!point || !point.taskId) {
      setPendingTrackingSync(meeting.id, pointId, options.allowStatusOnly, false);
      continue;
    }

    const task = useTaskStore.getState().tasks.find((candidate) => candidate.id === point.taskId);
    if (!task || task.deletedAt) {
      setPendingTrackingSync(meeting.id, point.id, options.allowStatusOnly, false);
      continue;
    }

    const queued = readPendingTrackingSync().find((entry) => entry.meetingId === meeting.id && entry.pointId === point.id);
    const allowStatusOnly = queued?.allowStatusOnly ?? options.allowStatusOnly;
    const trackingResult = await useTaskStore.getState().upsertCoordinationTracking({
      taskId: point.taskId,
      trackingId: coordinationTrackingId(meeting.id, point.id),
      text: buildCoordinationTrackingText(meeting, point, allowStatusOnly),
      source: {
        module: 'coordinacion',
        recordId: meeting.id,
        pointId: point.id,
        label: `Coordinación · ${coordinationMeetingDisplayTitle(meeting)} · ${meetingContext(meeting)} · ${formatCoordinationDate(meeting.date)}`,
      },
      closeTask: false,
    });
    if (!trackingResult.ok) {
      setPendingTrackingSync(meeting.id, point.id, allowStatusOnly, true);
      failures.push({ pointId: point.id, message: `${task.titulo}: ${trackingResult.message}` });
      continue;
    }
    setPendingTrackingSync(meeting.id, point.id, allowStatusOnly, false);
  }
  return failures;
}

export async function retryPendingCoordinationTracking(
  meetings: CoordinationMeeting[],
): Promise<TrackingSyncFailure[]> {
  const failures: TrackingSyncFailure[] = [];

  for (const entry of readPendingTrackingSync()) {
    const meeting = meetings.find((candidate) => candidate.id === entry.meetingId);
    const point = meeting?.points.find((candidate) => candidate.id === entry.pointId);
    if (!meeting || !point || !point.taskId) {
      setPendingTrackingSync(entry.meetingId, entry.pointId, entry.allowStatusOnly, false);
      continue;
    }

    const result = await useTaskStore.getState().upsertCoordinationTracking({
      taskId: point.taskId,
      trackingId: coordinationTrackingId(meeting.id, point.id),
      text: buildCoordinationTrackingText(meeting, point, entry.allowStatusOnly),
      source: {
        module: 'coordinacion',
        recordId: meeting.id,
        pointId: point.id,
        label: `Coordinación · ${coordinationMeetingDisplayTitle(meeting)} · ${meetingContext(meeting)} · ${formatCoordinationDate(meeting.date)}`,
      },
      closeTask: false,
    });
    if (result.ok || result.message.toLowerCase().includes('ya no existe') || result.message.toLowerCase().includes('eliminada')) {
      setPendingTrackingSync(entry.meetingId, entry.pointId, entry.allowStatusOnly, false);
      continue;
    }
    failures.push({ pointId: point.id, message: `${point.title}: ${result.message}` });
  }

  const remainingRemovals: PendingTrackingRemoval[] = [];
  for (const entry of readPendingTrackingRemovals()) {
    const result = await useTaskStore.getState().upsertCoordinationTracking({
      taskId: entry.taskId,
      trackingId: coordinationTrackingId(entry.meetingId, entry.pointId),
      text: '',
      source: {
        module: 'coordinacion',
        recordId: entry.meetingId,
        pointId: entry.pointId,
        label: entry.label,
      },
      closeTask: false,
    });
    if (result.ok || result.message.toLowerCase().includes('ya no existe') || result.message.toLowerCase().includes('eliminada')) {
      continue;
    }
    remainingRemovals.push(entry);
    failures.push({ pointId: entry.pointId, message: result.message });
  }
  writePendingTrackingRemovals(remainingRemovals);
  return failures;
}

export async function closeCoordinationTasks(taskIds: Iterable<string>): Promise<TaskClosureFailure[]> {
  const failures: TaskClosureFailure[] = [];
  for (const taskId of new Set(taskIds)) {
    const task = useTaskStore.getState().tasks.find((candidate) => candidate.id === taskId);
    if (!task || task.deletedAt || isTaskClosed(task)) continue;
    const result = await useTaskStore.getState().updateWithConcurrencyCheck(
      task.id,
      closingDraft(task),
      'Tarea cerrada expresamente al cerrar una reunión de Coordinación.',
      task.updatedAt,
    );
    if (!result.ok) failures.push({ taskId, message: `${task.titulo}: ${result.message}` });
  }
  return failures;
}

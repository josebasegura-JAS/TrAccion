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

const PENDING_TRACKING_SYNC_KEY = 'traccion.v1.coordinacion.pendingTrackingSync';

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
  return readPendingTrackingSync().length;
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
  const entries = readPendingTrackingSync();
  const byMeeting = new Map<string, PendingTrackingSync[]>();
  for (const entry of entries) {
    const current = byMeeting.get(entry.meetingId) ?? [];
    current.push(entry);
    byMeeting.set(entry.meetingId, current);
  }

  for (const [meetingId, pendingEntries] of byMeeting) {
    const meeting = meetings.find((candidate) => candidate.id === meetingId);
    if (!meeting) {
      for (const entry of pendingEntries) {
        setPendingTrackingSync(entry.meetingId, entry.pointId, entry.allowStatusOnly, false);
      }
      continue;
    }
    const result = await syncMeetingTracking(
      meeting,
      pendingEntries.map((entry) => entry.pointId),
      { allowStatusOnly: false },
    );
    failures.push(...result);
  }
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

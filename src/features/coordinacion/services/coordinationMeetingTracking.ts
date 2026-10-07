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
  for (const point of meeting.points) {
    if (!pointIdSet.has(point.id) || !point.taskId) continue;
    const task = useTaskStore.getState().tasks.find((candidate) => candidate.id === point.taskId);
    if (!task || task.deletedAt) continue;
    const trackingResult = await useTaskStore.getState().upsertCoordinationTracking({
      taskId: point.taskId,
      trackingId: coordinationTrackingId(meeting.id, point.id),
      text: buildCoordinationTrackingText(meeting, point, options.allowStatusOnly),
      source: {
        module: 'coordinacion',
        recordId: meeting.id,
        pointId: point.id,
        label: `Coordinación · ${coordinationMeetingDisplayTitle(meeting)} · ${meetingContext(meeting)} · ${formatCoordinationDate(meeting.date)}`,
      },
      closeTask: false,
    });
    if (!trackingResult.ok) {
      failures.push({ pointId: point.id, message: `${task.titulo}: ${trackingResult.message}` });
    }
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

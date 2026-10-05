import { useTaskStore } from '../../tareas/store/useTaskStore';
import {
  coordinationMeetingDisplayTitle,
  formatCoordinationDate,
  type CoordinationMeeting,
} from '../domain/coordinacion';
import { coordinationPointStatusLabel } from '../store/useCoordinacionStore';

export type TrackingSyncFailure = { pointId: string; message: string };

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

export async function syncMeetingTracking(
  meeting: CoordinationMeeting,
  pointIds: Iterable<string>,
  options: { allowStatusOnly: boolean; closeResolvedTasks: boolean },
): Promise<TrackingSyncFailure[]> {
  const failures: TrackingSyncFailure[] = [];
  const pointIdSet = new Set(pointIds);
  for (const point of meeting.points) {
    if (!pointIdSet.has(point.id) || !point.taskId) continue;
    const task = useTaskStore.getState().tasks.find((candidate) => candidate.id === point.taskId);
    if (!task || task.deletedAt) continue;
    const result = await useTaskStore.getState().upsertCoordinationTracking({
      taskId: point.taskId,
      trackingId: coordinationTrackingId(meeting.id, point.id),
      text: buildCoordinationTrackingText(meeting, point, options.allowStatusOnly),
      source: {
        module: 'coordinacion',
        recordId: meeting.id,
        pointId: point.id,
        label: `Coordinación · ${coordinationMeetingDisplayTitle(meeting)} · ${meetingContext(meeting)} · ${formatCoordinationDate(meeting.date)}`,
      },
      closeTask: options.closeResolvedTasks && point.status === 'tratado',
    });
    if (!result.ok) failures.push({ pointId: point.id, message: `${task.titulo}: ${result.message}` });
  }
  return failures;
}

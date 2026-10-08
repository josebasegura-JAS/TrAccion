import { syncCoordinacionExcelBackup } from '../../../shared/export/coordinacionExcelBackup';
import { useTaskStore } from '../../tareas/store/useTaskStore';
import {
  coordinationMeetingDisplayTitle,
  formatCoordinationDate,
  type CoordinationState,
} from '../domain/coordinacion';
import { useCoordinacionStore } from '../store/useCoordinacionStore';
import { persistCoordinationState, readCoordinationState } from './coordinationPersistence';
import { meetingContext, queueCoordinationTrackingRemoval } from './coordinationMeetingTracking';

type RemovePointResult = { ok: boolean; message: string };

export async function removeCoordinationMeetingPoint(pointId: string): Promise<RemovePointResult> {
  const state = readCoordinationState();
  const meeting = state.meetings.find((candidate) => candidate.points.some((point) => point.id === pointId));
  if (!meeting) {
    return { ok: false, message: 'No se ha encontrado la reunión o el punto. Recarga antes de continuar.' };
  }
  if (meeting.status === 'closed') {
    return { ok: false, message: 'La reunión está cerrada y no admite modificaciones.' };
  }

  const point = meeting.points.find((candidate) => candidate.id === pointId);
  if (!point) return { ok: false, message: 'No se ha encontrado el punto.' };

  const now = new Date().toISOString();
  const next: CoordinationState = {
    meetings: state.meetings.map((candidate) => candidate.id === meeting.id
      ? { ...candidate, points: candidate.points.filter((item) => item.id !== pointId), updatedAt: now }
      : candidate),
    directionTaskIds: state.directionTaskIds,
    unionTaskIds: state.unionTaskIds,
    areaTaskIds: state.areaTaskIds,
  };

  const saveResult = await persistCoordinationState(next);
  if (!saveResult.ok) {
    return {
      ok: false,
      message: saveResult.message || 'Otro usuario ha modificado esta reunión. Recarga antes de volver a quitar la tarea.',
    };
  }

  useCoordinacionStore.setState(next);

  let trackingWarning = '';
  if (point.taskId) {
    const task = useTaskStore.getState().tasks.find((candidate) => candidate.id === point.taskId);
    if (task && !task.deletedAt) {
      const trackingLabel = `Coordinación · ${coordinationMeetingDisplayTitle(meeting)} · ${meetingContext(meeting)} · ${formatCoordinationDate(meeting.date)}`;
      const trackingResult = await useTaskStore.getState().upsertCoordinationTracking({
        taskId: point.taskId,
        trackingId: `coordination:${meeting.id}:${point.id}`,
        text: '',
        source: {
          module: 'coordinacion',
          recordId: meeting.id,
          pointId: point.id,
          label: trackingLabel,
        },
        closeTask: false,
      });
      if (!trackingResult.ok) {
        queueCoordinationTrackingRemoval({
          meetingId: meeting.id,
          pointId: point.id,
          taskId: point.taskId,
          label: trackingLabel,
        });
        trackingWarning = ` Aviso: el punto se ha quitado, pero no se ha podido limpiar su seguimiento en la tarea: ${trackingResult.message}. Se reintentará automáticamente.`;
      }
    }
  }

  const backupMessage = await syncCoordinacionExcelBackup(next.meetings);
  const baseMessage = point.taskId
    ? 'Tarea quitada de la reunión. La tarea sigue disponible en Tareas.'
    : 'Punto eliminado.';
  return {
    ok: true,
    message: `${baseMessage}${trackingWarning}${backupMessage ? ` ${backupMessage}` : ''}`.trim(),
  };
}

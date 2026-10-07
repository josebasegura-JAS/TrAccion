import { writeJsonStorageAsync } from '../../../services/persistence';
import { syncCoordinacionExcelBackup } from '../../../shared/export/coordinacionExcelBackup';
import { useTaskStore } from '../../tareas/store/useTaskStore';
import { coordinationMeetingDisplayTitle, formatCoordinationDate } from '../domain/coordinacion';
import { COORDINATION_STORAGE_KEY, useCoordinacionStore } from '../store/useCoordinacionStore';
import { meetingContext } from './coordinationMeetingTracking';

type RemovePointResult = { ok: boolean; message: string };

export async function removeCoordinationMeetingPoint(pointId: string): Promise<RemovePointResult> {
  const state = useCoordinacionStore.getState();
  const meeting = state.meetings.find((candidate) => candidate.points.some((point) => point.id === pointId));
  if (!meeting) return { ok: false, message: 'No se ha encontrado la reunión o el punto.' };
  if (meeting.status === 'closed') return { ok: false, message: 'La reunión está cerrada y no admite modificaciones.' };

  const point = meeting.points.find((candidate) => candidate.id === pointId);
  if (!point) return { ok: false, message: 'No se ha encontrado el punto.' };

  if (point.taskId) {
    const task = useTaskStore.getState().tasks.find((candidate) => candidate.id === point.taskId);
    if (task && !task.deletedAt) {
      const trackingResult = await useTaskStore.getState().upsertCoordinationTracking({
        taskId: point.taskId,
        trackingId: `coordination:${meeting.id}:${point.id}`,
        text: '',
        source: {
          module: 'coordinacion',
          recordId: meeting.id,
          pointId: point.id,
          label: `Coordinación · ${coordinationMeetingDisplayTitle(meeting)} · ${meetingContext(meeting)} · ${formatCoordinationDate(meeting.date)}`,
        },
        closeTask: false,
      });
      if (!trackingResult.ok) {
        return { ok: false, message: `No se ha podido quitar la tarea de la reunión porque no se ha podido limpiar su seguimiento: ${trackingResult.message}` };
      }
    }
  }

  const now = new Date().toISOString();
  const next = {
    meetings: state.meetings.map((candidate) => candidate.id === meeting.id
      ? { ...candidate, points: candidate.points.filter((item) => item.id !== pointId), updatedAt: now }
      : candidate),
    directionTaskIds: state.directionTaskIds,
    unionTaskIds: state.unionTaskIds,
    areaTaskIds: state.areaTaskIds,
  };

  const saveResult = await writeJsonStorageAsync(COORDINATION_STORAGE_KEY, next);
  if (!saveResult.ok) return { ok: false, message: saveResult.message };

  useCoordinacionStore.getState().reloadFromStorage();
  const backupMessage = await syncCoordinacionExcelBackup(useCoordinacionStore.getState().meetings);
  return {
    ok: true,
    message: backupMessage ?? (point.taskId ? 'Tarea quitada de la reunión. La tarea sigue disponible en Tareas.' : 'Punto eliminado.'),
  };
}

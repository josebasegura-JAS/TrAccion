import { writeRendererStorageCache } from '../../../services/persistence';
import { syncCoordinacionExcelBackup } from '../../../shared/export/coordinacionExcelBackup';
import { useTaskStore } from '../../tareas/store/useTaskStore';
import {
  coordinationMeetingDisplayTitle,
  formatCoordinationDate,
  type CoordinationState,
} from '../domain/coordinacion';
import { COORDINATION_STORAGE_KEY, useCoordinacionStore } from '../store/useCoordinacionStore';
import { meetingContext } from './coordinationMeetingTracking';

type RemovePointResult = { ok: boolean; message: string };

function parseCoordinationState(value: string | null): CoordinationState | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<CoordinationState>;
    if (!Array.isArray(candidate.meetings) || !Array.isArray(candidate.directionTaskIds)) return null;
    return {
      meetings: candidate.meetings,
      directionTaskIds: candidate.directionTaskIds,
      unionTaskIds: candidate.unionTaskIds && typeof candidate.unionTaskIds === 'object' ? candidate.unionTaskIds : {},
      areaTaskIds: candidate.areaTaskIds && typeof candidate.areaTaskIds === 'object' ? candidate.areaTaskIds : {},
    };
  } catch {
    return null;
  }
}

export async function removeCoordinationMeetingPoint(pointId: string): Promise<RemovePointResult> {
  const getPersistedRecord = window.traccion?.getPersistedRecord;
  const saveIfUnchanged = window.traccion?.saveLocalStorageRecordIfUnchanged;
  if (!getPersistedRecord || !saveIfUnchanged) {
    return { ok: false, message: 'SQLite compartido no está disponible. No se puede modificar la reunión de forma segura.' };
  }

  const snapshot = await getPersistedRecord(COORDINATION_STORAGE_KEY);
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    return { ok: false, message: snapshot.status.message ?? 'SQLite compartido no está activo.' };
  }

  const state = parseCoordinationState(snapshot.record?.value ?? null);
  if (!state) return { ok: false, message: 'No se ha podido leer el estado actualizado de Coordinación.' };

  const meeting = state.meetings.find((candidate) => candidate.points.some((point) => point.id === pointId));
  if (!meeting) return { ok: false, message: 'No se ha encontrado la reunión o el punto. Recarga antes de continuar.' };
  if (meeting.status === 'closed') return { ok: false, message: 'La reunión está cerrada y no admite modificaciones.' };

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
  const serialized = JSON.stringify(next);
  const saveResult = await saveIfUnchanged({
    key: COORDINATION_STORAGE_KEY,
    value: serialized,
    expectedUpdatedAt: snapshot.record?.updatedAt ?? null,
  });
  if (!saveResult.ok || !saveResult.status.ready || saveResult.status.phase !== 'active') {
    return {
      ok: false,
      message: saveResult.message ?? 'Otro usuario ha modificado Coordinación. Recarga la reunión antes de volver a quitar la tarea.',
    };
  }

  writeRendererStorageCache(COORDINATION_STORAGE_KEY, serialized, 'sqlite');
  useCoordinacionStore.getState().reloadFromStorage();

  let trackingWarning = '';
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
        trackingWarning = ` Aviso: el punto se ha quitado, pero no se ha podido limpiar su seguimiento en la tarea: ${trackingResult.message}`;
      }
    }
  }

  const backupMessage = await syncCoordinacionExcelBackup(useCoordinacionStore.getState().meetings);
  const baseMessage = point.taskId
    ? 'Tarea quitada de la reunión. La tarea sigue disponible en Tareas.'
    : 'Punto eliminado.';
  return {
    ok: true,
    message: `${baseMessage}${trackingWarning}${backupMessage ? ` ${backupMessage}` : ''}`.trim(),
  };
}

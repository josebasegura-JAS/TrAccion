import { applyConfirmedPersistedRecord, readStorageItem } from '../../../services/persistence';
import { CLOSED_TASK_PHASE, isTaskClosed, type Task, type TaskDraft } from '../../tareas/domain/task';
import { buildUpdatedTask } from '../../tareas/store/taskMutations';
import type { CoordinationState } from '../domain/coordinacion';
import {
  COORDINATION_INDEX_STORAGE_KEY,
  coordinationIndexFromState,
  coordinationMeetingStorageKey,
} from './coordinationPersistence';

export type AtomicCoordinationTaskChange = {
  previous: Task;
  next: Task;
  draft: TaskDraft;
};

export type AtomicCoordinationClosureResult =
  | { ok: true; message: string; nextState: CoordinationState; taskChanges: AtomicCoordinationTaskChange[] }
  | { ok: false; message: string };

export function buildClosedCoordinationState(
  current: CoordinationState,
  meetingId: string,
  now: string,
): CoordinationState | null {
  const meeting = current.meetings.find((item) => item.id === meetingId);
  if (!meeting) return null;
  if (meeting.status === 'closed') return current;

  const directionTaskIds = new Set(current.directionTaskIds);
  const unionTaskIds = { ...current.unionTaskIds };
  const areaTaskIds = { ...current.areaTaskIds };

  if (meeting.area === 'direccion') {
    meeting.points.forEach((point) => {
      if (!point.taskId) return;
      if (point.status === 'tratado' || point.status === 'seguimiento') directionTaskIds.delete(point.taskId);
      if (['volver', 'pendiente', 'no-tratado'].includes(point.status)) directionTaskIds.add(point.taskId);
    });
  }
  if (meeting.area === 'sindicatos' && meeting.unionName) {
    const ids = new Set(unionTaskIds[meeting.unionName] ?? []);
    meeting.points.forEach((point) => {
      if (!point.taskId) return;
      if (point.status === 'tratado' || point.status === 'seguimiento') ids.delete(point.taskId);
      else ids.add(point.taskId);
    });
    unionTaskIds[meeting.unionName] = [...ids];
  }
  if (meeting.area === 'otras-areas' && meeting.areaName) {
    const ids = new Set(areaTaskIds[meeting.areaName] ?? []);
    meeting.points.forEach((point) => {
      if (!point.taskId) return;
      if (point.status === 'tratado' || point.status === 'seguimiento') ids.delete(point.taskId);
      else ids.add(point.taskId);
    });
    areaTaskIds[meeting.areaName] = [...ids];
  }

  return {
    directionTaskIds: [...directionTaskIds],
    unionTaskIds,
    areaTaskIds,
    meetings: current.meetings.map((item) => item.id === meetingId ? {
      ...item,
      status: 'closed',
      closedAt: now,
      updatedAt: now,
    } : item),
  };
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

export async function closeCoordinationWorkflowAtomically(
  current: CoordinationState,
  meetingId: string,
  taskIdsToClose: Iterable<string>,
  tasks: Task[],
): Promise<AtomicCoordinationClosureResult> {
  const api = window.traccion;
  if (!api?.getPersistedRecord || !api.closeCoordinationWorkflowAtomically) {
    return { ok: false, message: 'La versión actual no expone el cierre atómico de Coordinación.' };
  }

  const meeting = current.meetings.find((item) => item.id === meetingId);
  if (!meeting) return { ok: false, message: 'No se ha encontrado la reunión.' };
  if (meeting.status === 'closed') {
    return { ok: true, message: 'La reunión ya estaba cerrada.', nextState: current, taskChanges: [] };
  }

  const now = new Date().toISOString();
  const nextState = buildClosedCoordinationState(current, meetingId, now);
  const nextMeeting = nextState?.meetings.find((item) => item.id === meetingId);
  if (!nextState || !nextMeeting) {
    return { ok: false, message: 'No se ha podido preparar el cierre de la reunión.' };
  }

  const meetingKey = coordinationMeetingStorageKey(meetingId);
  const currentMeetingValue = readStorageItem(meetingKey);
  const currentIndexValue = readStorageItem(COORDINATION_INDEX_STORAGE_KEY);
  if (!currentMeetingValue || !currentIndexValue) {
    return { ok: false, message: 'Coordinación no está sincronizada con SQLite. Guarda o recarga antes de cerrar.' };
  }

  const [meetingSnapshot, indexSnapshot] = await Promise.all([
    api.getPersistedRecord(meetingKey),
    api.getPersistedRecord(COORDINATION_INDEX_STORAGE_KEY),
  ]);
  if (
    !meetingSnapshot.record || meetingSnapshot.record.value !== currentMeetingValue ||
    !indexSnapshot.record || indexSnapshot.record.value !== currentIndexValue
  ) {
    return { ok: false, message: 'Coordinación ha cambiado en otro equipo. Recarga antes de cerrar la reunión.' };
  }

  const taskChanges: AtomicCoordinationTaskChange[] = [];
  for (const taskId of new Set(taskIdsToClose)) {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task || task.deletedAt || isTaskClosed(task)) continue;
    const draft = closingDraft(task);
    taskChanges.push({
      previous: task,
      draft,
      next: buildUpdatedTask(
        task,
        draft,
        'Tarea cerrada expresamente al cerrar una reunión de Coordinación.',
        undefined,
        { now, skipAudit: true },
      ),
    });
  }

  const nextMeetingValue = JSON.stringify(nextMeeting);
  const nextIndexValue = JSON.stringify(coordinationIndexFromState(nextState));
  const result = await api.closeCoordinationWorkflowAtomically({
    meeting: {
      key: meetingKey,
      value: nextMeetingValue,
      expectedUpdatedAt: meetingSnapshot.record.updatedAt,
    },
    index: {
      key: COORDINATION_INDEX_STORAGE_KEY,
      value: nextIndexValue,
      expectedUpdatedAt: indexSnapshot.record.updatedAt,
    },
    tasks: taskChanges.map(({ previous, next }) => ({
      id: previous.id,
      value: JSON.stringify(next),
      expectedUpdatedAt: previous.updatedAt,
    })),
  });

  if (!result.ok || !result.meetingUpdatedAt || !result.indexUpdatedAt) {
    return { ok: false, message: result.message || 'No se ha podido cerrar la reunión de forma atómica.' };
  }

  applyConfirmedPersistedRecord(meetingKey, nextMeetingValue, result.meetingUpdatedAt);
  applyConfirmedPersistedRecord(COORDINATION_INDEX_STORAGE_KEY, nextIndexValue, result.indexUpdatedAt);
  return { ok: true, message: result.message, nextState, taskChanges };
}

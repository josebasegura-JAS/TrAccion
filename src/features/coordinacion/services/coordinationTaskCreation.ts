import { applyConfirmedPersistedRecord, readStorageItem } from '../../../services/persistence';
import { enqueueAuditEvent } from '../../../shared/audit/auditTrail';
import { isTaskClosed, type TaskDraft } from '../../tareas/domain/task';
import { firstActiveTaskId, normalizeTask } from '../../tareas/store/taskNormalization';
import { buildNewTask } from '../../tareas/store/taskMutations';
import type { TaskUpdateResult } from '../../tareas/store/taskPersistence';
import { useTaskStore } from '../../tareas/store/useTaskStore';
import { createCoordinationId, type CoordinationPoint, type CoordinationState } from '../domain/coordinacion';
import { useCoordinacionStore } from '../store/useCoordinacionStore';
import { updateTaskTargets } from './coordinationTaskTargets';
import {
  COORDINATION_INDEX_STORAGE_KEY,
  coordinationIndexFromState,
  coordinationMeetingStorageKey,
  readCoordinationState,
} from './coordinationPersistence';

export interface CoordinationTaskCreationInput {
  meetingId: string;
  pointId: string | null;
  draft: TaskDraft;
  seguimientoText?: string;
  targets: { direction: boolean; unionName: string | null; areaName: string | null };
}

function withLinkedTask(
  current: CoordinationState,
  meetingId: string,
  pointId: string | null,
  task: ReturnType<typeof buildNewTask>,
  now: string,
): CoordinationState | null {
  const meeting = current.meetings.find((candidate) => candidate.id === meetingId);
  if (!meeting || meeting.status === 'closed') return null;

  let points: CoordinationPoint[];
  if (pointId) {
    const point = meeting.points.find((candidate) => candidate.id === pointId);
    if (!point || point.origin !== 'manual') return null;
    points = meeting.points.map((candidate) => candidate.id === pointId ? {
      ...candidate,
      origin: 'task',
      taskId: task.id,
      updatedAt: now,
    } : candidate);
  } else {
    points = [...meeting.points, {
      id: createCoordinationId('task-point'),
      origin: 'task',
      taskId: task.id,
      title: task.titulo,
      detail: task.descripcion,
      result: '',
      status: 'pendiente',
      responsible: '',
      dueDate: '',
      createdAt: now,
      updatedAt: now,
    }];
  }

  return {
    ...current,
    meetings: current.meetings.map((candidate) => candidate.id === meetingId ? {
      ...candidate,
      points,
      updatedAt: now,
    } : candidate),
  };
}

export async function createAndLinkCoordinationTaskAtomically(
  input: CoordinationTaskCreationInput,
): Promise<TaskUpdateResult> {
  const api = window.traccion;
  if (!api?.getPersistedRecord || !api.createCoordinationTaskAtomically) {
    return { ok: false, message: 'La versión actual no expone la creación atómica de tareas desde Coordinación.' };
  }

  const current = readCoordinationState();
  const meeting = current.meetings.find((candidate) => candidate.id === input.meetingId);
  if (!meeting) return { ok: false, message: 'No se ha encontrado la reunión.' };
  if (meeting.status === 'closed') return { ok: false, message: 'La reunión está cerrada y no admite nuevas tareas.' };
  if (input.pointId) {
    const point = meeting.points.find((candidate) => candidate.id === input.pointId);
    if (!point || point.origin !== 'manual') {
      return { ok: false, message: 'El punto manual ya no está disponible para convertirlo en tarea.' };
    }
  }

  const now = new Date().toISOString();
  const task = normalizeTask(buildNewTask(input.draft, input.seguimientoText, { now }));
  const targetedState = updateTaskTargets(current, task.id, input.targets);
  const nextState = withLinkedTask(targetedState, input.meetingId, input.pointId, task, now);
  const nextMeeting = nextState?.meetings.find((candidate) => candidate.id === input.meetingId);
  if (!nextState || !nextMeeting) {
    return { ok: false, message: 'No se ha podido preparar el vínculo entre la tarea y la reunión.' };
  }

  const meetingKey = coordinationMeetingStorageKey(input.meetingId);
  const currentMeetingValue = readStorageItem(meetingKey);
  const currentIndexValue = readStorageItem(COORDINATION_INDEX_STORAGE_KEY);
  if (!currentMeetingValue || !currentIndexValue) {
    return { ok: false, message: 'Coordinación no está sincronizada con SQLite. Recarga antes de crear la tarea.' };
  }

  const [meetingSnapshot, indexSnapshot] = await Promise.all([
    api.getPersistedRecord(meetingKey),
    api.getPersistedRecord(COORDINATION_INDEX_STORAGE_KEY),
  ]);
  if (
    !meetingSnapshot.record || meetingSnapshot.record.value !== currentMeetingValue ||
    !indexSnapshot.record || indexSnapshot.record.value !== currentIndexValue
  ) {
    return { ok: false, message: 'Coordinación ha cambiado en otro equipo. Recarga antes de crear la tarea.' };
  }

  const meetingValue = JSON.stringify(nextMeeting);
  const indexValue = JSON.stringify(coordinationIndexFromState(nextState));
  const result = await api.createCoordinationTaskAtomically({
    meeting: { key: meetingKey, value: meetingValue, expectedUpdatedAt: meetingSnapshot.record.updatedAt },
    index: { key: COORDINATION_INDEX_STORAGE_KEY, value: indexValue, expectedUpdatedAt: indexSnapshot.record.updatedAt },
    task: { id: task.id, value: JSON.stringify(task) },
  });
  if (!result.ok || !result.meetingUpdatedAt || !result.indexUpdatedAt) {
    return { ok: false, message: result.message || 'No se ha podido crear y vincular la tarea de forma atómica.' };
  }

  applyConfirmedPersistedRecord(meetingKey, meetingValue, result.meetingUpdatedAt);
  applyConfirmedPersistedRecord(COORDINATION_INDEX_STORAGE_KEY, indexValue, result.indexUpdatedAt);
  useCoordinacionStore.setState(nextState);
  useTaskStore.setState((state) => {
    const tasks = [...state.tasks.filter((candidate) => candidate.id !== task.id), task];
    return {
      tasks,
      selectedTaskId: isTaskClosed(task) ? firstActiveTaskId(tasks) : task.id,
    };
  });
  enqueueAuditEvent({ module: 'tareas', entityId: task.id, action: 'created', summary: 'Registro creado', changes: [] });
  return { ok: true, message: result.message, recordId: task.id };
}

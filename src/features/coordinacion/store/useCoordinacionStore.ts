import { create } from 'zustand';
import { isTaskClosed, type Task } from '../../tareas/domain/task';
import { registerSyncableStore } from '../../../services/syncableStoreRegistry';
import {
  createCoordinationId,
  type CoordinationMeeting,
  type CoordinationPoint,
  type CoordinationPointStatus,
  type CoordinationState,
  type UnionMeetingType,
} from '../domain/coordinacion';
import {
  coordinationTargetsEqual,
  updateAreaTarget,
  updateDirectionTarget,
  updateTaskTargets,
  updateUnionTarget,
} from '../services/coordinationTaskTargets';
import {
  LEGACY_COORDINATION_STORAGE_KEY,
  persistCoordinationState,
  readCoordinationState,
} from '../services/coordinationPersistence';

export const COORDINATION_STORAGE_KEY = LEGACY_COORDINATION_STORAGE_KEY;

type Result = { ok: boolean; message: string; recordId?: string };

interface CoordinationStore extends CoordinationState {
  load: () => void;
  reloadFromStorage: () => void;
  setTaskForDirection: (taskId: string, enabled: boolean) => Promise<Result>;
  setTaskForUnion: (taskId: string, unionName: string | null) => Promise<Result>;
  setTaskForArea: (taskId: string, areaName: string | null) => Promise<Result>;
  setTaskTargets: (taskId: string, targets: { direction: boolean; unionName: string | null; areaName: string | null }) => Promise<Result>;
  createDirectionMeeting: (date: string, title: string, tasks: Task[]) => Promise<Result>;
  createOtherAreaMeeting: (
    date: string,
    title: string,
    areaName: string,
    referenceTaskId: string,
    interlocutors: string,
    purpose: string,
    tasks: Task[],
  ) => Promise<Result>;
  createUnionMeeting: (
    date: string,
    title: string,
    unionName: string,
    meetingType: UnionMeetingType,
    interlocutors: string,
    purpose: string,
    taskIds: string[],
    tasks: Task[],
  ) => Promise<Result>;
  addTaskPoint: (meetingId: string, taskId: string, tasks: Task[]) => Promise<Result>;
  linkManualPointToTask: (meetingId: string, pointId: string, taskId: string, tasks: Task[]) => Promise<Result>;
  addManualPoint: (meetingId: string, title: string, detail?: string) => Promise<Result>;
  updatePoint: (
    meetingId: string,
    pointId: string,
    patch: Partial<Pick<CoordinationPoint, 'title' | 'detail' | 'result' | 'status' | 'responsible' | 'dueDate'>>,
  ) => Promise<Result>;
  saveMeetingPoints: (
    meetingId: string,
    patches: Array<{ pointId: string; patch: Partial<Pick<CoordinationPoint, 'result' | 'status' | 'responsible' | 'dueDate'>> }>,
  ) => Promise<Result>;
  deleteManualPoint: (meetingId: string, pointId: string) => Promise<Result>;
  deleteMeeting: (meetingId: string) => Promise<Result>;
  closeMeeting: (meetingId: string) => Promise<Result>;
  reopenMeeting: (meetingId: string) => Promise<Result>;
}

function stateSnapshot(state: CoordinationState): CoordinationState {
  return {
    meetings: state.meetings,
    directionTaskIds: state.directionTaskIds,
    unionTaskIds: state.unionTaskIds,
    areaTaskIds: state.areaTaskIds,
  };
}

async function persist(state: CoordinationState): Promise<Result> {
  const result = await persistCoordinationState(state);
  return { ok: result.ok, message: result.message };
}

function activeTask(task: Task): boolean {
  return !task.deletedAt && !isTaskClosed(task);
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function findEditableMeeting(current: CoordinationState, meetingId: string):
  | { meeting: CoordinationMeeting; error: null }
  | { meeting: null; error: Result } {
  const meeting = current.meetings.find((item) => item.id === meetingId);
  if (!meeting) {
    return { meeting: null, error: { ok: false, message: 'No se ha encontrado la reunión.' } };
  }
  if (meeting.status === 'closed') {
    return { meeting: null, error: { ok: false, message: 'La reunión está cerrada y no admite modificaciones.' } };
  }
  return { meeting, error: null };
}

function replaceMeeting(
  current: CoordinationState,
  meetingId: string,
  update: (meeting: CoordinationMeeting) => CoordinationMeeting,
): CoordinationState {
  return {
    ...stateSnapshot(current),
    meetings: current.meetings.map((meeting) => meeting.id === meetingId ? update(meeting) : meeting),
  };
}

export const useCoordinacionStore = create<CoordinationStore>((set, get) => ({
  ...readCoordinationState(),
  load: () => set(readCoordinationState()),
  reloadFromStorage: () => {
    const next = readCoordinationState();
    if (JSON.stringify(next) !== JSON.stringify(stateSnapshot(get()))) set(next);
  },

  setTaskForDirection: async (taskId, enabled) => {
    const next = updateDirectionTarget(stateSnapshot(get()), taskId, enabled);
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },

  setTaskForUnion: async (taskId, unionName) => {
    const next = updateUnionTarget(stateSnapshot(get()), taskId, unionName);
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },

  setTaskForArea: async (taskId, areaName) => {
    const next = updateAreaTarget(stateSnapshot(get()), taskId, areaName);
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },

  setTaskTargets: async (taskId, targets) => {
    const current = stateSnapshot(get());
    const next = updateTaskTargets(current, taskId, targets);
    if (coordinationTargetsEqual(current, next)) {
      return { ok: true, message: 'Coordinación ya estaba actualizada.' };
    }
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },

  createDirectionMeeting: async (date, title, tasks) => {
    const normalizedDate = date.trim();
    const cleanTitle = title.trim();
    if (!normalizedDate) return { ok: false, message: 'Selecciona la fecha de la reunión.' };
    if (!cleanTitle) return { ok: false, message: 'Indica un título para la reunión.' };

    const current = stateSnapshot(get());
    const marked = new Set(current.directionTaskIds);
    const now = new Date().toISOString();
    const points: CoordinationPoint[] = tasks
      .filter((task) => marked.has(task.id) && activeTask(task))
      .map((task) => ({
        id: createCoordinationId('dir-point'),
        origin: 'task',
        taskId: task.id,
        title: task.titulo,
        detail: task.descripcion,
        result: '',
        status: 'pendiente',
        createdAt: now,
        updatedAt: now,
      }));
    const meeting: CoordinationMeeting = {
      id: createCoordinationId('dir-meeting'),
      title: cleanTitle,
      area: 'direccion',
      date: normalizedDate,
      status: 'open',
      points,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };
    const next: CoordinationState = { ...current, meetings: [meeting, ...current.meetings] };
    const result = await persist(next);
    if (result.ok) set(next);
    return { ...result, recordId: meeting.id };
  },

  createOtherAreaMeeting: async (date, title, areaName, referenceTaskId, interlocutors, purpose, tasks) => {
    const normalizedDate = date.trim();
    const cleanTitle = title.trim();
    const cleanAreaName = areaName.trim();
    if (!normalizedDate) return { ok: false, message: 'Selecciona la fecha de la reunión.' };
    if (!cleanTitle) return { ok: false, message: 'Indica un título para la reunión.' };
    if (!cleanAreaName) return { ok: false, message: 'Indica el área con la que se celebra la reunión.' };

    const task = referenceTaskId
      ? tasks.find((candidate) => candidate.id === referenceTaskId && activeTask(candidate))
      : undefined;
    if (referenceTaskId && !task) {
      return { ok: false, message: 'La tarea inicial seleccionada no existe o ya está cerrada.' };
    }

    const current = stateSnapshot(get());
    const queuedArea = Object.entries(current.areaTaskIds)
      .find(([name]) => normalizedName(name) === normalizedName(cleanAreaName));
    const resolvedAreaName = queuedArea?.[0] ?? cleanAreaName;
    const selectedIds = new Set(queuedArea?.[1] ?? []);
    if (task) selectedIds.add(task.id);
    const now = new Date().toISOString();
    const points: CoordinationPoint[] = tasks
      .filter((candidate) => selectedIds.has(candidate.id) && activeTask(candidate))
      .map((candidate) => ({
        id: createCoordinationId('area-point'),
        origin: 'task',
        taskId: candidate.id,
        title: candidate.titulo,
        detail: candidate.id === task?.id && purpose.trim() ? purpose.trim() : candidate.descripcion,
        result: '',
        status: 'pendiente',
        createdAt: now,
        updatedAt: now,
      }));
    const meeting: CoordinationMeeting = {
      id: createCoordinationId('area-meeting'),
      title: cleanTitle,
      area: 'otras-areas',
      areaName: resolvedAreaName,
      referenceTaskId: task?.id ?? null,
      interlocutors: interlocutors.trim(),
      purpose: purpose.trim(),
      date: normalizedDate,
      status: 'open',
      points,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };
    const next: CoordinationState = { ...current, meetings: [meeting, ...current.meetings] };
    const result = await persist(next);
    if (result.ok) set(next);
    return { ...result, recordId: meeting.id };
  },

  createUnionMeeting: async (date, title, unionName, meetingType, interlocutors, purpose, taskIds, tasks) => {
    const normalizedDate = date.trim();
    const cleanTitle = title.trim();
    const cleanUnion = unionName.trim();
    if (!normalizedDate) return { ok: false, message: 'Selecciona la fecha de la reunión.' };
    if (!cleanTitle) return { ok: false, message: 'Indica un título para la reunión.' };
    if (!cleanUnion) return { ok: false, message: 'Selecciona el sindicato.' };

    const current = stateSnapshot(get());
    const selectedIds = new Set([...(current.unionTaskIds[cleanUnion] ?? []), ...taskIds]);
    const latestPrevious = current.meetings
      .filter((meeting) => meeting.area === 'sindicatos' && meeting.unionName === cleanUnion && meeting.status === 'closed')
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    latestPrevious?.points.forEach((point) => {
      if (!point.taskId) return;
      if (['pendiente', 'volver', 'no-tratado', 'pendiente-rrll', 'pendiente-sindicato'].includes(point.status)) {
        selectedIds.add(point.taskId);
      }
    });

    const now = new Date().toISOString();
    const points: CoordinationPoint[] = tasks
      .filter((task) => selectedIds.has(task.id) && activeTask(task))
      .map((task) => ({
        id: createCoordinationId('union-point'),
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
      }));
    const meeting: CoordinationMeeting = {
      id: createCoordinationId('union-meeting'),
      title: cleanTitle,
      area: 'sindicatos',
      unionName: cleanUnion,
      meetingType,
      interlocutors: interlocutors.trim(),
      purpose: purpose.trim(),
      date: normalizedDate,
      status: 'open',
      points,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };
    const next: CoordinationState = { ...current, meetings: [meeting, ...current.meetings] };
    const result = await persist(next);
    if (result.ok) set(next);
    return { ...result, recordId: meeting.id };
  },

  addTaskPoint: async (meetingId, taskId, tasks) => {
    const current = stateSnapshot(get());
    const editable = findEditableMeeting(current, meetingId);
    if (editable.error) return editable.error;
    const { meeting } = editable;
    if (meeting.points.some((point) => point.taskId === taskId)) {
      return { ok: false, message: 'La tarea ya está incluida en el guion.' };
    }
    const task = tasks.find((candidate) => candidate.id === taskId && activeTask(candidate));
    if (!task) return { ok: false, message: 'La tarea seleccionada no está activa.' };

    const now = new Date().toISOString();
    const point: CoordinationPoint = {
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
    };
    const next = replaceMeeting(current, meetingId, (item) => ({
      ...item,
      points: [...item.points, point],
      updatedAt: now,
    }));
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },

  linkManualPointToTask: async (meetingId, pointId, taskId, tasks) => {
    const current = stateSnapshot(get());
    const editable = findEditableMeeting(current, meetingId);
    if (editable.error) return editable.error;
    const { meeting } = editable;
    const point = meeting.points.find((item) => item.id === pointId);
    if (!point || point.origin !== 'manual') {
      return { ok: false, message: 'El punto manual ya no está disponible.' };
    }
    if (meeting.points.some((item) => item.id !== pointId && item.taskId === taskId)) {
      return { ok: false, message: 'La tarea ya está incluida en el guion.' };
    }
    const task = tasks.find((candidate) => candidate.id === taskId && activeTask(candidate));
    if (!task) return { ok: false, message: 'La tarea creada no está activa.' };

    const now = new Date().toISOString();
    const next = replaceMeeting(current, meetingId, (item) => ({
      ...item,
      updatedAt: now,
      points: item.points.map((candidate) => candidate.id === pointId ? {
        ...candidate,
        origin: 'task',
        taskId: task.id,
        updatedAt: now,
      } : candidate),
    }));
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },

  addManualPoint: async (meetingId, title, detail = '') => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return { ok: false, message: 'Escribe el título del punto.' };
    const current = stateSnapshot(get());
    const editable = findEditableMeeting(current, meetingId);
    if (editable.error) return editable.error;

    const now = new Date().toISOString();
    const next = replaceMeeting(current, meetingId, (meeting) => ({
      ...meeting,
      updatedAt: now,
      points: [...meeting.points, {
        id: createCoordinationId('manual-point'),
        origin: 'manual',
        taskId: null,
        title: cleanTitle,
        detail: detail.trim(),
        result: '',
        status: 'pendiente',
        createdAt: now,
        updatedAt: now,
      }],
    }));
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },

  updatePoint: async (meetingId, pointId, patch) => {
    const current = stateSnapshot(get());
    const editable = findEditableMeeting(current, meetingId);
    if (editable.error) return editable.error;
    if (!editable.meeting.points.some((point) => point.id === pointId)) {
      return { ok: false, message: 'No se ha encontrado el punto.' };
    }

    const now = new Date().toISOString();
    const next = replaceMeeting(current, meetingId, (meeting) => ({
      ...meeting,
      updatedAt: now,
      points: meeting.points.map((point) => point.id === pointId ? { ...point, ...patch, updatedAt: now } : point),
    }));
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },

  saveMeetingPoints: async (meetingId, patches) => {
    const current = stateSnapshot(get());
    const editable = findEditableMeeting(current, meetingId);
    if (editable.error) return editable.error;
    const existingPointIds = new Set(editable.meeting.points.map((point) => point.id));
    if (patches.some(({ pointId }) => !existingPointIds.has(pointId))) {
      return { ok: false, message: 'Uno de los puntos ya no existe. Recarga la reunión antes de guardar.' };
    }

    const byPoint = new Map(patches.map(({ pointId, patch }) => [pointId, patch]));
    const now = new Date().toISOString();
    const next = replaceMeeting(current, meetingId, (meeting) => ({
      ...meeting,
      updatedAt: now,
      points: meeting.points.map((point) => {
        const pointPatch = byPoint.get(point.id);
        return pointPatch ? { ...point, ...pointPatch, updatedAt: now } : point;
      }),
    }));
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },

  deleteManualPoint: async (meetingId, pointId) => {
    const current = stateSnapshot(get());
    const editable = findEditableMeeting(current, meetingId);
    if (editable.error) return editable.error;
    const point = editable.meeting.points.find((item) => item.id === pointId);
    if (!point) return { ok: false, message: 'No se ha encontrado el punto.' };
    if (point.origin !== 'manual') {
      return { ok: false, message: 'Solo se pueden eliminar directamente los puntos añadidos manualmente.' };
    }

    const now = new Date().toISOString();
    const next = replaceMeeting(current, meetingId, (meeting) => ({
      ...meeting,
      updatedAt: now,
      points: meeting.points.filter((candidate) => candidate.id !== pointId),
    }));
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },

  deleteMeeting: async (meetingId) => {
    const current = stateSnapshot(get());
    if (!current.meetings.some((item) => item.id === meetingId)) {
      return { ok: false, message: 'No se ha encontrado la reunión.' };
    }
    const next: CoordinationState = {
      ...current,
      meetings: current.meetings.filter((item) => item.id !== meetingId),
    };
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },

  closeMeeting: async (meetingId) => {
    const current = stateSnapshot(get());
    const meeting = current.meetings.find((item) => item.id === meetingId);
    if (!meeting) return { ok: false, message: 'No se ha encontrado la reunión.' };
    if (meeting.status === 'closed') {
      return { ok: true, message: 'La reunión ya estaba cerrada.', recordId: meeting.id };
    }

    const now = new Date().toISOString();
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

    const next: CoordinationState = {
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
    const result = await persist(next);
    if (result.ok) set(next);
    return { ...result, recordId: meeting.id };
  },

  reopenMeeting: async (meetingId) => {
    const current = stateSnapshot(get());
    const meeting = current.meetings.find((item) => item.id === meetingId);
    if (!meeting) return { ok: false, message: 'No se ha encontrado la reunión.' };
    if (meeting.status === 'open') {
      return { ok: true, message: 'La reunión ya estaba abierta.', recordId: meeting.id };
    }

    const now = new Date().toISOString();
    const next = replaceMeeting(current, meetingId, (item) => ({
      ...item,
      status: 'open',
      closedAt: null,
      updatedAt: now,
    }));
    const result = await persist(next);
    if (result.ok) set(next);
    return { ...result, recordId: meeting.id };
  },
}));

registerSyncableStore({
  id: 'coordinacion',
  reloadFromStorage: () => useCoordinacionStore.getState().reloadFromStorage(),
});

export function coordinationPointStatusLabel(status: CoordinationPointStatus): string {
  if (status === 'tratado') return 'Tratado y resuelto';
  if (status === 'seguimiento') return 'Tratado · requiere seguimiento';
  if (status === 'volver') return 'Volver a próxima reunión';
  if (status === 'no-tratado') return 'No tratado';
  if (status === 'pendiente-rrll') return 'Pendiente de RRLL';
  if (status === 'pendiente-sindicato') return 'Pendiente del sindicato';
  return 'Pendiente';
}

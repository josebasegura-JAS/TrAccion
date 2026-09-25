import { create } from 'zustand';
import { readStorageItem, writeJsonStorageAsync } from '../../../services/persistence';
import type { Task } from '../../tareas/domain/task';
import { registerSyncableStore } from '../../../services/syncableStoreRegistry';
import {
  EMPTY_COORDINATION_STATE,
  createCoordinationId,
  type CoordinationMeeting,
  type CoordinationPoint,
  type CoordinationPointStatus,
  type CoordinationState,
  type UnionMeetingType,
} from '../domain/coordinacion';

export const COORDINATION_STORAGE_KEY = 'traccion.v1.coordinacion.state';

type Result = { ok: boolean; message: string; recordId?: string };

interface CoordinationStore extends CoordinationState {
  load: () => void;
  reloadFromStorage: () => void;
  setTaskForDirection: (taskId: string, enabled: boolean) => Promise<Result>;
  setTaskForUnion: (taskId: string, unionName: string | null) => Promise<Result>;
  setTaskForArea: (taskId: string, areaName: string | null) => Promise<Result>;
  createDirectionMeeting: (date: string, tasks: Task[]) => Promise<Result>;
  createOtherAreaMeeting: (
    date: string,
    areaName: string,
    referenceTaskId: string,
    interlocutors: string,
    purpose: string,
    tasks: Task[],
  ) => Promise<Result>;
  createUnionMeeting: (
    date: string,
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
  deleteManualPoint: (meetingId: string, pointId: string) => Promise<Result>;
  deleteMeeting: (meetingId: string) => Promise<Result>;
  closeMeeting: (meetingId: string) => Promise<Result>;
}

function normalizeCoordinationState(value: unknown): CoordinationState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<CoordinationState>;
  if (!Array.isArray(candidate.meetings) || !Array.isArray(candidate.directionTaskIds)) return null;
  const unionTaskIds = candidate.unionTaskIds && typeof candidate.unionTaskIds === 'object'
    ? Object.fromEntries(Object.entries(candidate.unionTaskIds).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((id) => typeof id === 'string')))
    : {};
  const areaTaskIds = candidate.areaTaskIds && typeof candidate.areaTaskIds === 'object'
    ? Object.fromEntries(Object.entries(candidate.areaTaskIds).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((id) => typeof id === 'string')))
    : {};
  return { meetings: candidate.meetings, directionTaskIds: candidate.directionTaskIds, unionTaskIds, areaTaskIds };
}

function readState(): CoordinationState {
  const stored = readStorageItem(COORDINATION_STORAGE_KEY);
  if (!stored) return EMPTY_COORDINATION_STATE;
  try {
    const parsed: unknown = JSON.parse(stored);
    return normalizeCoordinationState(parsed) ?? EMPTY_COORDINATION_STATE;
  } catch {
    return EMPTY_COORDINATION_STATE;
  }
}

async function persist(state: CoordinationState): Promise<Result> {
  const result = await writeJsonStorageAsync(COORDINATION_STORAGE_KEY, state);
  return { ok: result.ok, message: result.message };
}

function activeTask(task: Task): boolean {
  return !task.deletedAt && task.estado !== 'cerrada' && task.fase.trim().toLowerCase() !== 'cerrada';
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export const useCoordinacionStore = create<CoordinationStore>((set, get) => ({
  ...readState(),
  load: () => set(readState()),
  reloadFromStorage: () => {
    const next = readState();
    if (JSON.stringify(next) !== JSON.stringify({ meetings: get().meetings, directionTaskIds: get().directionTaskIds, unionTaskIds: get().unionTaskIds, areaTaskIds: get().areaTaskIds })) {
      set(next);
    }
  },
  setTaskForDirection: async (taskId, enabled) => {
    const current = get();
    const ids = new Set(current.directionTaskIds);
    if (enabled) ids.add(taskId); else ids.delete(taskId);
    const next: CoordinationState = { meetings: current.meetings, directionTaskIds: [...ids], unionTaskIds: current.unionTaskIds, areaTaskIds: current.areaTaskIds };
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },
  setTaskForUnion: async (taskId, unionName) => {
    const current = get();
    const cleanUnion = unionName?.trim() || null;
    const unionTaskIds = Object.fromEntries(
      Object.entries(current.unionTaskIds).map(([name, ids]) => [name, ids.filter((id) => id !== taskId)]),
    );
    if (cleanUnion) unionTaskIds[cleanUnion] = [...new Set([...(unionTaskIds[cleanUnion] ?? []), taskId])];
    const next: CoordinationState = { ...current, unionTaskIds };
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },
  setTaskForArea: async (taskId, areaName) => {
    const current = get();
    const cleanArea = areaName?.trim() || null;
    const areaTaskIds = Object.fromEntries(
      Object.entries(current.areaTaskIds).map(([name, ids]) => [name, ids.filter((id) => id !== taskId)]),
    );
    if (cleanArea) areaTaskIds[cleanArea] = [...new Set([...(areaTaskIds[cleanArea] ?? []), taskId])];
    const next: CoordinationState = { ...current, areaTaskIds };
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },
  createDirectionMeeting: async (date, tasks) => {
    const normalizedDate = date.trim();
    if (!normalizedDate) return { ok: false, message: 'Selecciona la fecha de la reunión.' };
    const current = get();
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
  createOtherAreaMeeting: async (date, areaName, referenceTaskId, interlocutors, purpose, tasks) => {
    const normalizedDate = date.trim();
    const cleanAreaName = areaName.trim();
    if (!normalizedDate) return { ok: false, message: 'Selecciona la fecha de la reunión.' };
    if (!cleanAreaName) return { ok: false, message: 'Indica el área con la que se celebra la reunión.' };

    const task = referenceTaskId
      ? tasks.find((candidate) => candidate.id === referenceTaskId && activeTask(candidate))
      : undefined;
    if (referenceTaskId && !task) return { ok: false, message: 'La tarea inicial seleccionada no existe o ya está cerrada.' };

    const current = get();
    const queuedArea = Object.entries(current.areaTaskIds).find(([name]) => normalizedName(name) === normalizedName(cleanAreaName));
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
  createUnionMeeting: async (date, unionName, meetingType, interlocutors, purpose, taskIds, tasks) => {
    const normalizedDate = date.trim();
    const cleanUnion = unionName.trim();
    if (!normalizedDate) return { ok: false, message: 'Selecciona la fecha de la reunión.' };
    if (!cleanUnion) return { ok: false, message: 'Selecciona el sindicato.' };
    const current = get();
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
        id: createCoordinationId('union-point'), origin: 'task', taskId: task.id,
        title: task.titulo, detail: task.descripcion, result: '', status: 'pendiente',
        responsible: '', dueDate: '', createdAt: now, updatedAt: now,
      }));
    const meeting: CoordinationMeeting = {
      id: createCoordinationId('union-meeting'), area: 'sindicatos', unionName: cleanUnion,
      meetingType, interlocutors: interlocutors.trim(), purpose: purpose.trim(),
      date: normalizedDate, status: 'open', points, createdAt: now, updatedAt: now, closedAt: null,
    };
    const next: CoordinationState = { ...current, meetings: [meeting, ...current.meetings] };
    const result = await persist(next);
    if (result.ok) set(next);
    return { ...result, recordId: meeting.id };
  },
  addTaskPoint: async (meetingId, taskId, tasks) => {
    const current = get();
    const meeting = current.meetings.find((item) => item.id === meetingId);
    if (!meeting || meeting.status === 'closed') return { ok: false, message: 'La reunión no está disponible para edición.' };
    if (meeting.points.some((point) => point.taskId === taskId)) return { ok: false, message: 'La tarea ya está incluida en el guion.' };
    const task = tasks.find((candidate) => candidate.id === taskId && activeTask(candidate));
    if (!task) return { ok: false, message: 'La tarea seleccionada no está activa.' };
    const now = new Date().toISOString();
    const point: CoordinationPoint = {
      id: createCoordinationId('task-point'), origin: 'task', taskId: task.id,
      title: task.titulo, detail: task.descripcion, result: '', status: 'pendiente',
      responsible: '', dueDate: '', createdAt: now, updatedAt: now,
    };
    const next: CoordinationState = {
      ...current,
      meetings: current.meetings.map((item) => item.id === meetingId
        ? { ...item, points: [...item.points, point], updatedAt: now }
        : item),
    };
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },
  linkManualPointToTask: async (meetingId, pointId, taskId, tasks) => {
    const current = get();
    const meeting = current.meetings.find((item) => item.id === meetingId);
    if (!meeting || meeting.status === 'closed') return { ok: false, message: 'La reunión no está disponible para edición.' };
    const point = meeting.points.find((item) => item.id === pointId);
    if (!point || point.origin !== 'manual') return { ok: false, message: 'El punto manual ya no está disponible.' };
    if (meeting.points.some((item) => item.id !== pointId && item.taskId === taskId)) {
      return { ok: false, message: 'La tarea ya está incluida en el guion.' };
    }
    const task = tasks.find((candidate) => candidate.id === taskId && activeTask(candidate));
    if (!task) return { ok: false, message: 'La tarea creada no está activa.' };
    const now = new Date().toISOString();
    const next: CoordinationState = {
      ...current,
      meetings: current.meetings.map((item) => item.id === meetingId ? {
        ...item,
        updatedAt: now,
        points: item.points.map((candidate) => candidate.id === pointId ? {
          ...candidate,
          origin: 'task',
          taskId: task.id,
          updatedAt: now,
        } : candidate),
      } : item),
    };
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },
  addManualPoint: async (meetingId, title, detail = '') => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return { ok: false, message: 'Escribe el título del punto.' };
    const current = get();
    const now = new Date().toISOString();
    const next: CoordinationState = {
      ...current,
      meetings: current.meetings.map((meeting) => meeting.id === meetingId ? {
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
      } : meeting),
    };
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },
  updatePoint: async (meetingId, pointId, patch) => {
    const current = get();
    const now = new Date().toISOString();
    const next: CoordinationState = {
      ...current,
      meetings: current.meetings.map((meeting) => meeting.id === meetingId ? {
        ...meeting,
        updatedAt: now,
        points: meeting.points.map((point) => point.id === pointId ? { ...point, ...patch, updatedAt: now } : point),
      } : meeting),
    };
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },
  deleteManualPoint: async (meetingId, pointId) => {
    const current = get();
    const meeting = current.meetings.find((item) => item.id === meetingId);
    if (!meeting) return { ok: false, message: 'No se ha encontrado la reunión.' };
    const point = meeting.points.find((item) => item.id === pointId);
    if (!point) return { ok: false, message: 'No se ha encontrado el punto.' };
    if (point.origin !== 'manual') {
      return { ok: false, message: 'Solo se pueden eliminar directamente los puntos añadidos manualmente.' };
    }
    const now = new Date().toISOString();
    const next: CoordinationState = {
      ...current,
      meetings: current.meetings.map((item) => item.id === meetingId ? {
        ...item,
        updatedAt: now,
        points: item.points.filter((candidate) => candidate.id !== pointId),
      } : item),
    };
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },
  deleteMeeting: async (meetingId) => {
    const current = get();
    const exists = current.meetings.some((item) => item.id === meetingId);
    if (!exists) return { ok: false, message: 'No se ha encontrado la reunión.' };
    const next: CoordinationState = {
      ...current,
      meetings: current.meetings.filter((item) => item.id !== meetingId),
    };
    const result = await persist(next);
    if (result.ok) set(next);
    return result;
  },
  closeMeeting: async (meetingId) => {
    const current = get();
    const meeting = current.meetings.find((item) => item.id === meetingId);
    if (!meeting) return { ok: false, message: 'No se ha encontrado la reunión.' };
    const now = new Date().toISOString();
    const directionTaskIds = new Set(current.directionTaskIds);
    const unionTaskIds = { ...current.unionTaskIds };
    const areaTaskIds = { ...current.areaTaskIds };
    if (meeting.area === 'direccion') meeting.points.forEach((point) => {
      if (!point.taskId) return;
      if (point.status === 'tratado' || point.status === 'seguimiento') directionTaskIds.delete(point.taskId);
      if (['volver', 'pendiente', 'no-tratado'].includes(point.status)) directionTaskIds.add(point.taskId);
    });
    if (meeting.area === 'sindicatos' && meeting.unionName) {
      const ids = new Set(unionTaskIds[meeting.unionName] ?? []);
      meeting.points.forEach((point) => {
        if (!point.taskId) return;
        if (point.status === 'tratado' || point.status === 'seguimiento') ids.delete(point.taskId); else ids.add(point.taskId);
      });
      unionTaskIds[meeting.unionName] = [...ids];
    }
    if (meeting.area === 'otras-areas' && meeting.areaName) {
      const ids = new Set(areaTaskIds[meeting.areaName] ?? []);
      meeting.points.forEach((point) => {
        if (!point.taskId) return;
        if (point.status === 'tratado' || point.status === 'seguimiento') ids.delete(point.taskId); else ids.add(point.taskId);
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
    return result;
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

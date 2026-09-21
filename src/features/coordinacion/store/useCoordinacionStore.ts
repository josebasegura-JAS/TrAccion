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
} from '../domain/coordinacion';

export const COORDINATION_STORAGE_KEY = 'traccion.v1.coordinacion.state';

type Result = { ok: boolean; message: string; recordId?: string };

interface CoordinationStore extends CoordinationState {
  load: () => void;
  reloadFromStorage: () => void;
  setTaskForDirection: (taskId: string, enabled: boolean) => Promise<Result>;
  createDirectionMeeting: (date: string, tasks: Task[]) => Promise<Result>;
  addManualPoint: (meetingId: string, title: string, detail?: string) => Promise<Result>;
  updatePoint: (
    meetingId: string,
    pointId: string,
    patch: Partial<Pick<CoordinationPoint, 'title' | 'detail' | 'result' | 'status'>>,
  ) => Promise<Result>;
  deleteManualPoint: (meetingId: string, pointId: string) => Promise<Result>;
  deleteMeeting: (meetingId: string) => Promise<Result>;
  closeMeeting: (meetingId: string) => Promise<Result>;
}

function isCoordinationState(value: unknown): value is CoordinationState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CoordinationState>;
  return Array.isArray(candidate.meetings) && Array.isArray(candidate.directionTaskIds);
}

function readState(): CoordinationState {
  const stored = readStorageItem(COORDINATION_STORAGE_KEY);
  if (!stored) return EMPTY_COORDINATION_STATE;
  try {
    const parsed: unknown = JSON.parse(stored);
    return isCoordinationState(parsed) ? parsed : EMPTY_COORDINATION_STATE;
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

export const useCoordinacionStore = create<CoordinationStore>((set, get) => ({
  ...readState(),
  load: () => set(readState()),
  reloadFromStorage: () => {
    const next = readState();
    if (JSON.stringify(next) !== JSON.stringify({ meetings: get().meetings, directionTaskIds: get().directionTaskIds })) {
      set(next);
    }
  },
  setTaskForDirection: async (taskId, enabled) => {
    const current = get();
    const ids = new Set(current.directionTaskIds);
    if (enabled) ids.add(taskId); else ids.delete(taskId);
    const next: CoordinationState = { meetings: current.meetings, directionTaskIds: [...ids] };
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
    meeting.points.forEach((point) => {
      if (!point.taskId) return;
      if (point.status === 'tratado') directionTaskIds.delete(point.taskId);
      if (point.status === 'volver') directionTaskIds.add(point.taskId);
    });
    const next: CoordinationState = {
      directionTaskIds: [...directionTaskIds],
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
  if (status === 'tratado') return 'Tratado';
  if (status === 'volver') return 'Volver a tratar';
  return 'Pendiente';
}

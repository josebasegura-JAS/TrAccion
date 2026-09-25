export type CoordinationArea = 'direccion' | 'otras-areas' | 'sindicatos';
export type CoordinationMeetingStatus = 'open' | 'closed';
export type CoordinationPointStatus =
  | 'pendiente'
  | 'tratado'
  | 'seguimiento'
  | 'volver'
  | 'no-tratado'
  | 'pendiente-rrll'
  | 'pendiente-sindicato';
export type CoordinationPointOrigin = 'task' | 'manual';
export type UnionMeetingType = 'ordinaria' | 'seguimiento' | 'urgente';

export interface CoordinationPoint {
  id: string;
  origin: CoordinationPointOrigin;
  taskId: string | null;
  title: string;
  detail: string;
  result: string;
  status: CoordinationPointStatus;
  responsible?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CoordinationMeeting {
  id: string;
  area: CoordinationArea;
  /** Nombre concreto del área cuando la reunión no es con Dirección. */
  areaName?: string;
  /** Tarea principal que da origen a la reunión con otra área. */
  referenceTaskId?: string | null;
  interlocutors?: string;
  purpose?: string;
  unionName?: string;
  meetingType?: UnionMeetingType;
  date: string;
  status: CoordinationMeetingStatus;
  points: CoordinationPoint[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface CoordinationState {
  meetings: CoordinationMeeting[];
  directionTaskIds: string[];
  unionTaskIds: Record<string, string[]>;
  /** Tareas pendientes de tratar en la siguiente reunión con cada área. */
  areaTaskIds: Record<string, string[]>;
}

export const EMPTY_COORDINATION_STATE: CoordinationState = {
  meetings: [],
  directionTaskIds: [],
  unionTaskIds: {},
  areaTaskIds: {},
};

export function createCoordinationId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatCoordinationDate(value: string): string {
  if (!value) return 'Sin fecha';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('es-ES');
}

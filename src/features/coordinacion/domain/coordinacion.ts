export type CoordinationArea = 'direccion' | 'otras-areas' | 'sindicatos';
export type CoordinationMeetingStatus = 'open' | 'closed';
export type CoordinationPointStatus = 'pendiente' | 'tratado' | 'volver';
export type CoordinationPointOrigin = 'task' | 'manual';

export interface CoordinationPoint {
  id: string;
  origin: CoordinationPointOrigin;
  taskId: string | null;
  title: string;
  detail: string;
  result: string;
  status: CoordinationPointStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CoordinationMeeting {
  id: string;
  area: CoordinationArea;
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
}

export const EMPTY_COORDINATION_STATE: CoordinationState = {
  meetings: [],
  directionTaskIds: [],
};

export function createCoordinationId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatCoordinationDate(value: string): string {
  if (!value) return 'Sin fecha';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('es-ES');
}

import type { Task } from '../../tareas/domain/task';
import type { ManagedSession } from '../../../shared/sessions/session';

export const ACTA_TYPES = ['Comité', 'Paritaria'] as const;
export const ACTA_STATES = [
  'Pendiente de redactar',
  'Enviada a Dirección',
  'Pendiente de alegaciones',
  'Pendiente de firma',
  'Cerrada',
] as const;

export type ActaType = (typeof ACTA_TYPES)[number];
export type ActaState = (typeof ACTA_STATES)[number];

export interface ActaAlegacion {
  sindicato: string;
  presentada: boolean;
  fecha: string;
  observacion: string;
}

export interface ActaUpdateEntry {
  id: string;
  fecha: string;
  texto: string;
}

export interface Acta {
  id: string;
  titulo: string;
  tipo: ActaType;
  fechaSesion: string;
  fechaCreacion: string;
  estado: ActaState;
  fechaLimite: string;
  observaciones: string;
  alegaciones: ActaAlegacion[];
  actualizaciones: ActaUpdateEntry[];
  actaPath: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sourceSessionId: string | null;
}

export type ActaDraft = Pick<
  Acta,
  | 'titulo'
  | 'tipo'
  | 'fechaSesion'
  | 'estado'
  | 'fechaLimite'
  | 'observaciones'
  | 'alegaciones'
  | 'actualizaciones'
  | 'actaPath'
>;

export const EMPTY_ACTA_DRAFT: ActaDraft = {
  titulo: '',
  tipo: 'Comité',
  fechaSesion: '',
  estado: 'Pendiente de redactar',
  fechaLimite: '',
  observaciones: '',
  alegaciones: [],
  actualizaciones: [],
  actaPath: '',
};

export interface CreateActaFromSessionInput {
  tipo: ActaType;
  session: ManagedSession;
  treatedTasks: Task[];
}

export function buildActaObservacionesFromSession(session: ManagedSession, treatedTasks: Task[]): string {
  const taskLines = treatedTasks.map((task, index) => `${index + 1}. ${task.titulo}`);
  return [session.notes, taskLines.length > 0 ? `Tareas tratadas:\n${taskLines.join('\n')}` : 'Sin tareas tratadas.']
    .filter((text) => text.trim())
    .join('\n\n');
}

export function isActaType(value: unknown): value is ActaType {
  return typeof value === 'string' && (ACTA_TYPES as readonly string[]).includes(value);
}

export function isActaState(value: unknown): value is ActaState {
  return typeof value === 'string' && (ACTA_STATES as readonly string[]).includes(value);
}

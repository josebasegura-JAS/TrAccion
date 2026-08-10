import type { Task } from '../../tareas/domain/task';
import type { ManagedSession } from '../../../shared/sessions/session';

export const DEFAULT_ACTA_TYPES = ['Comité', 'Paritaria'] as const;
export const ACTA_TYPES = DEFAULT_ACTA_TYPES;
export const ACTA_STATES = [
  'Pendiente de realizar',
  'Borrador',
  'Enviada a Dirección',
  'Pendiente de alegaciones',
  'Pendiente de firma',
  'Cerrada',
] as const;

export type ActaType = string;
export type ActaState = (typeof ACTA_STATES)[number];

export interface ActaTypeDefinition {
  id: string;
  nombre: string;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

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
  estado: 'Pendiente de realizar',
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

export function createDefaultActaTypes(): ActaTypeDefinition[] {
  const now = new Date().toISOString();
  return DEFAULT_ACTA_TYPES.map((nombre) => ({
    id: `acta-type-${nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}`,
    nombre,
    disabled: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }));
}

export function normalizeActaTypeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function isActaType(value: unknown): value is ActaType {
  return typeof value === 'string' && normalizeActaTypeName(value).length > 0;
}

export function isActaState(value: unknown): value is ActaState {
  return typeof value === 'string' && (ACTA_STATES as readonly string[]).includes(value);
}

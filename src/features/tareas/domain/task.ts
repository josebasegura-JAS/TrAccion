export const TASK_STATES = ['pendiente', 'en curso', 'cerrada'] as const;
export const TASK_PRIORITIES = ['critica', 'alta', 'media', 'baja'] as const;

export type TaskState = (typeof TASK_STATES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface TaskUpdate {
  fechaHora: string;
  texto: string;
}

export interface Task {
  id: string;
  titulo: string;
  descripcion: string;
  estado: TaskState;
  prioridad: TaskPriority;
  fechaLimite: string;
  responsable: string;
  origenSindicato: string;
  observaciones: string;
  actualizaciones: TaskUpdate[];
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type TaskDraft = Pick<
  Task,
  | 'titulo'
  | 'descripcion'
  | 'estado'
  | 'prioridad'
  | 'fechaLimite'
  | 'responsable'
  | 'origenSindicato'
  | 'observaciones'
>;

export type TaskDraftField = keyof TaskDraft;

export const EMPTY_TASK_DRAFT: TaskDraft = {
  titulo: '',
  descripcion: '',
  estado: 'pendiente',
  prioridad: 'media',
  fechaLimite: '',
  responsable: '',
  origenSindicato: '',
  observaciones: '',
};

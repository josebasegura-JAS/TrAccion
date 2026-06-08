export const TASK_TYPES = ['interna', 'sindical'] as const;
export const TASK_STATES = ['pendiente', 'en curso', 'bloqueada', 'resuelta', 'cerrada'] as const;
export const TASK_PRIORITIES = ['critica', 'alta', 'media', 'baja'] as const;
export const DEFAULT_TASK_PHASE = 'tarea';
export const PETICION_TASK_PHASE = 'peticion';
export const CLOSED_TASK_PHASE = 'cerrada';

export type TaskType = (typeof TASK_TYPES)[number];
export type TaskState = (typeof TASK_STATES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface TaskSeguimientoEntry {
  fechaHora: string;
  texto: string;
}

export interface TaskDocumentLink {
  id: string;
  nombre: string;
  ruta: string;
  createdAt: string;
}

export interface Task {
  id: string;
  titulo: string;
  descripcion: string;
  tipo: TaskType;
  fase: string;
  estado: TaskState;
  prioridad: TaskPriority;
  fechaLimite: string;
  responsable: string;
  origen: string;
  sindicato: string;
  observaciones: string;
  mail: string;
  documentLinks: TaskDocumentLink[];
  sessionDocumentCode: string;
  sessionModule: string;
  sessionDate: string;
  seguimiento: TaskSeguimientoEntry[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  closedAt: string | null;
}

export type TaskDraft = Pick<
  Task,
  | 'titulo'
  | 'descripcion'
  | 'tipo'
  | 'fase'
  | 'estado'
  | 'prioridad'
  | 'fechaLimite'
  | 'responsable'
  | 'origen'
  | 'sindicato'
  | 'observaciones'
  | 'mail'
  | 'documentLinks'
>;

export type TaskDraftField = keyof TaskDraft;

export interface LegacyPeticionSeguimientoEntry {
  fechaHora: string;
  texto: string;
}

export interface LegacyPeticionForTaskMigration {
  id: string;
  titulo: string;
  descripcion: string;
  estado: string;
  prioridad: string;
  fechaLimite?: string;
  solicitante?: string;
  sindicato?: string;
  observaciones?: string;
  seguimiento?: LegacyPeticionSeguimientoEntry[];
  closedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export const EMPTY_TASK_DRAFT: TaskDraft = {
  titulo: '',
  descripcion: '',
  tipo: 'interna',
  fase: DEFAULT_TASK_PHASE,
  estado: 'pendiente',
  prioridad: 'media',
  fechaLimite: '',
  responsable: '',
  origen: '',
  sindicato: '',
  observaciones: '',
  mail: '',
  documentLinks: [],
};

export function isTaskClosed(task: Pick<Task, 'estado' | 'fase'>): boolean {
  return task.estado === 'cerrada' || task.fase.trim().toLowerCase() === CLOSED_TASK_PHASE;
}

export function migratePeticionToTask(peticion: LegacyPeticionForTaskMigration): Task {
  const estado = (TASK_STATES as readonly string[]).includes(peticion.estado)
    ? (peticion.estado as TaskState)
    : 'pendiente';
  const prioridad = (TASK_PRIORITIES as readonly string[]).includes(peticion.prioridad)
    ? (peticion.prioridad as TaskPriority)
    : 'media';
  const updatedAt = peticion.updatedAt ?? peticion.createdAt;

  return {
    id: `migrada-${peticion.id}`,
    titulo: peticion.titulo,
    descripcion: peticion.descripcion,
    tipo: 'sindical',
    fase: PETICION_TASK_PHASE,
    estado,
    prioridad,
    fechaLimite: peticion.fechaLimite ?? '',
    responsable: '',
    origen: peticion.solicitante ?? '',
    sindicato: peticion.sindicato ?? '',
    observaciones: peticion.observaciones ?? '',
    mail: '',
    documentLinks: [],
    sessionDocumentCode: '',
    sessionModule: '',
    sessionDate: '',
    seguimiento: Array.isArray(peticion.seguimiento) ? peticion.seguimiento : [],
    createdAt: peticion.createdAt,
    updatedAt,
    deletedAt: peticion.deletedAt ?? null,
    closedAt: peticion.closedAt ?? (estado === 'cerrada' ? updatedAt : null),
  };
}

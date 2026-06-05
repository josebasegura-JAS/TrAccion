export const PETICION_STATES = ['pendiente', 'en curso', 'cerrada'] as const;
export const PETICION_PRIORITIES = ['critica', 'alta', 'media', 'baja'] as const;

export type PeticionState = (typeof PETICION_STATES)[number];
export type PeticionPriority = (typeof PETICION_PRIORITIES)[number];

export interface PeticionSeguimientoEntry {
  fechaHora: string;
  texto: string;
}

export interface Peticion {
  id: string;
  titulo: string;
  descripcion: string;
  estado: PeticionState;
  prioridad: PeticionPriority;
  fechaLimite: string;
  solicitante: string;
  sindicato: string;
  observaciones: string;
  seguimiento: PeticionSeguimientoEntry[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  closedAt: string | null;
}

export type PeticionDraft = Pick<
  Peticion,
  | 'titulo'
  | 'descripcion'
  | 'estado'
  | 'prioridad'
  | 'fechaLimite'
  | 'solicitante'
  | 'sindicato'
  | 'observaciones'
>;

export type PeticionDraftField = keyof PeticionDraft;

export const EMPTY_PETICION_DRAFT: PeticionDraft = {
  titulo: '',
  descripcion: '',
  estado: 'pendiente',
  prioridad: 'media',
  fechaLimite: '',
  solicitante: '',
  sindicato: '',
  observaciones: '',
};

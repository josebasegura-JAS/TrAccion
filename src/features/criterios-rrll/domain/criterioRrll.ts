export const CRITERIO_RRLL_ESTADOS = ['vigente', 'en revisión', 'archivado'] as const;
export const CRITERIO_RRLL_SENTIDOS = ['aprobado', 'denegado', 'sin clasificar'] as const;

export type CriterioRrllEstado = (typeof CRITERIO_RRLL_ESTADOS)[number];
export type CriterioRrllSentido = (typeof CRITERIO_RRLL_SENTIDOS)[number];

export interface CriterioRrll {
  id: string;
  tema: string;
  criterio: string;
  estado: CriterioRrllEstado;
  sentido: CriterioRrllSentido;
  fecha: string;
  responsable: string;
  observaciones: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type CriterioRrllDraft = Pick<
  CriterioRrll,
  'tema' | 'criterio' | 'estado' | 'sentido' | 'fecha' | 'responsable' | 'observaciones'
>;

export type CriterioRrllDraftField = keyof CriterioRrllDraft;

export const EMPTY_CRITERIO_RRLL_DRAFT: CriterioRrllDraft = {
  tema: '',
  criterio: '',
  estado: 'vigente',
  sentido: 'sin clasificar',
  fecha: '',
  responsable: '',
  observaciones: '',
};

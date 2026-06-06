import { create } from 'zustand';
import {
  EMPTY_CRITERIO_RRLL_DRAFT,
  CRITERIO_RRLL_ESTADOS,
  type CriterioRrll,
  type CriterioRrllDraft,
} from '../domain/criterioRrll';
import { EMPTY_CRITERIO_RRLL_FILTERS, type CriterioRrllFilters } from '../domain/filters';

const STORAGE_KEY = 'traccion.v1.criterios-rrll.criterios';

interface CriteriosRrllStateStore {
  criterios: CriterioRrll[];
  selectedCriterioId: string;
  filters: CriterioRrllFilters;
  load: () => void;
  create: (draft: CriterioRrllDraft) => void;
  update: (id: string, draft: CriterioRrllDraft) => void;
  remove: (id: string) => void;
  selectCriterio: (criterioId: string) => void;
  setFilter: <K extends keyof CriterioRrllFilters>(key: K, value: CriterioRrllFilters[K]) => void;
}

function isCriterioRrll(value: unknown): value is CriterioRrll {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof CriterioRrll, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.tema === 'string' &&
    typeof candidate.criterio === 'string' &&
    typeof candidate.estado === 'string' &&
    (CRITERIO_RRLL_ESTADOS as readonly string[]).includes(candidate.estado)
  );
}

function normalizeCriterioRrll(criterio: CriterioRrll): CriterioRrll {
  const createdAt = criterio.createdAt ?? new Date().toISOString();

  return {
    id: criterio.id,
    tema: criterio.tema,
    criterio: criterio.criterio,
    estado: criterio.estado,
    fecha: criterio.fecha ?? EMPTY_CRITERIO_RRLL_DRAFT.fecha,
    responsable: criterio.responsable ?? EMPTY_CRITERIO_RRLL_DRAFT.responsable,
    observaciones: criterio.observaciones ?? EMPTY_CRITERIO_RRLL_DRAFT.observaciones,
    createdAt,
    updatedAt: criterio.updatedAt ?? createdAt,
    deletedAt: criterio.deletedAt ?? null,
  };
}

function readCriteriosRrll(): CriterioRrll[] {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isCriterioRrll).map(normalizeCriterioRrll);
}

function persistCriteriosRrll(criterios: CriterioRrll[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(criterios));
}

function firstActiveCriterioId(criterios: CriterioRrll[]): string {
  return criterios.find((criterio) => !criterio.deletedAt)?.id ?? '';
}

function createCriterioRrllId(): string {
  return `criterio-rrll-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useCriteriosRrllStore = create<CriteriosRrllStateStore>((set) => ({
  criterios: [],
  selectedCriterioId: '',
  filters: EMPTY_CRITERIO_RRLL_FILTERS,
  load: () => {
    const criterios = readCriteriosRrll();
    set({ criterios, selectedCriterioId: firstActiveCriterioId(criterios) });
  },
  create: (draft) => {
    set((state) => {
      const now = new Date().toISOString();
      const criterio: CriterioRrll = {
        id: createCriterioRrllId(),
        ...draft,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      const criterios = [...state.criterios, criterio];
      persistCriteriosRrll(criterios);
      return { criterios, selectedCriterioId: criterio.id };
    });
  },
  update: (id, draft) => {
    set((state) => {
      const now = new Date().toISOString();
      const criterios = state.criterios.map((criterio) =>
        criterio.id === id ? { ...criterio, ...draft, updatedAt: now } : criterio,
      );
      persistCriteriosRrll(criterios);
      return { criterios, selectedCriterioId: id };
    });
  },
  remove: (id) => {
    set((state) => {
      const now = new Date().toISOString();
      const criterios = state.criterios.map((criterio) =>
        criterio.id === id ? { ...criterio, deletedAt: now, updatedAt: now } : criterio,
      );
      persistCriteriosRrll(criterios);
      return { criterios, selectedCriterioId: firstActiveCriterioId(criterios) };
    });
  },
  selectCriterio: (criterioId) => set({ selectedCriterioId: criterioId }),
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
}));

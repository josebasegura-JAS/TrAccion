import { create } from 'zustand';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import {
  EMPTY_CRITERIO_RRLL_DRAFT,
  CRITERIO_RRLL_ESTADOS,
  CRITERIO_RRLL_SENTIDOS,
  type CriterioRrll,
  type CriterioRrllDraft,
} from '../domain/criterioRrll';
import { EMPTY_CRITERIO_RRLL_FILTERS, type CriterioRrllFilters } from '../domain/filters';
import { buildImportedCriterioKey, importCriteriosRrllFromFile } from '../domain/importExcel';

const STORAGE_KEY = 'traccion.v1.criterios-rrll.criterios';

interface CriteriosRrllStateStore {
  criterios: CriterioRrll[];
  selectedCriterioId: string;
  filters: CriterioRrllFilters;
  load: () => void;
  reloadFromStorage: () => void;
  create: (draft: CriterioRrllDraft) => void;
  update: (id: string, draft: CriterioRrllDraft) => void;
  remove: (id: string) => void;
  importExcel: (file: File) => Promise<void>;
  importDrafts: (drafts: CriterioRrllDraft[]) => void;
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
    (CRITERIO_RRLL_ESTADOS as readonly string[]).includes(candidate.estado) &&
    (candidate.sentido === undefined ||
      (typeof candidate.sentido === 'string' &&
        (CRITERIO_RRLL_SENTIDOS as readonly string[]).includes(candidate.sentido)))
  );
}

function normalizeCriterioRrll(criterio: CriterioRrll): CriterioRrll {
  const createdAt = criterio.createdAt ?? new Date().toISOString();

  return {
    id: criterio.id,
    tema: criterio.tema,
    criterio: criterio.criterio,
    estado: criterio.estado,
    sentido: criterio.sentido ?? EMPTY_CRITERIO_RRLL_DRAFT.sentido,
    fecha: criterio.fecha ?? EMPTY_CRITERIO_RRLL_DRAFT.fecha,
    responsable: criterio.responsable ?? EMPTY_CRITERIO_RRLL_DRAFT.responsable,
    observaciones: criterio.observaciones ?? EMPTY_CRITERIO_RRLL_DRAFT.observaciones,
    createdAt,
    updatedAt: criterio.updatedAt ?? createdAt,
    deletedAt: criterio.deletedAt ?? null,
  };
}

function readCriteriosRrll(): CriterioRrll[] {
  const stored = readStorageItem(STORAGE_KEY);
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
  writeStorageItem(STORAGE_KEY, JSON.stringify(criterios));
}

function firstActiveCriterioId(criterios: CriterioRrll[]): string {
  return criterios.find((criterio) => !criterio.deletedAt)?.id ?? '';
}

function createCriterioRrllId(): string {
  return `criterio-rrll-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function upsertImportedCriterios(criterios: CriterioRrll[], drafts: CriterioRrllDraft[]): CriterioRrll[] {
  const now = new Date().toISOString();
  const importedByKey = new Map(drafts.map((draft) => [buildImportedCriterioKey(draft), draft]));
  const processedKeys = new Set<string>();

  const updated = criterios.map((criterio) => {
    const key = buildImportedCriterioKey(criterio);
    const imported = importedByKey.get(key);

    if (!imported) {
      return criterio;
    }

    processedKeys.add(key);
    return {
      ...criterio,
      ...imported,
      deletedAt: null,
      updatedAt: now,
    };
  });

  const created = drafts
    .filter((draft) => !processedKeys.has(buildImportedCriterioKey(draft)))
    .map((draft): CriterioRrll => ({
      id: createCriterioRrllId(),
      ...draft,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }));

  return [...updated, ...created];
}

export const useCriteriosRrllStore = create<CriteriosRrllStateStore>((set) => ({
  criterios: [],
  selectedCriterioId: '',
  filters: EMPTY_CRITERIO_RRLL_FILTERS,
  load: () => {
    const criterios = readCriteriosRrll();
    set({ criterios, selectedCriterioId: firstActiveCriterioId(criterios) });
  },
  reloadFromStorage: () => {
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
  importExcel: async (file) => {
    const drafts = await importCriteriosRrllFromFile(file);
    set((state) => {
      const criterios = upsertImportedCriterios(state.criterios, drafts);
      persistCriteriosRrll(criterios);
      return { criterios, selectedCriterioId: firstActiveCriterioId(criterios) };
    });
  },
  importDrafts: (drafts) => {
    set((state) => {
      const criterios = upsertImportedCriterios(state.criterios, drafts);
      persistCriteriosRrll(criterios);
      return { criterios, selectedCriterioId: firstActiveCriterioId(criterios) };
    });
  },
  selectCriterio: (criterioId) => set({ selectedCriterioId: criterioId }),
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
}));

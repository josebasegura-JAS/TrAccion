import { create } from 'zustand';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import { saveNewSharedArrayRecord, saveSharedArrayRecord } from '../../../services/sharedRecordPersistence';
import {
  EMPTY_CRITERIO_RRLL_DRAFT,
  CRITERIO_RRLL_ESTADOS,
  CRITERIO_RRLL_SENTIDOS,
  type CriterioRrll,
  type CriterioRrllDraft,
} from '../domain/criterioRrll';
import { EMPTY_CRITERIO_RRLL_FILTERS, type CriterioRrllFilters } from '../domain/filters';
import { buildImportedCriterioKey, importCriteriosRrllFromFile } from '../domain/importExcel';

export const CRITERIOS_RRLL_STORAGE_KEY = 'traccion.v1.criterios-rrll.criterios';
const STORAGE_KEY = CRITERIOS_RRLL_STORAGE_KEY;

interface CriteriosRrllStateStore {
  criterios: CriterioRrll[];
  selectedCriterioId: string;
  filters: CriterioRrllFilters;
  load: () => void;
  reloadFromStorage: () => void;
  create: (draft: CriterioRrllDraft) => void;
  createWithConcurrencyCheck: (draft: CriterioRrllDraft) => Promise<{ ok: boolean; message: string; recordId?: string }>;
  update: (id: string, draft: CriterioRrllDraft) => void;
  updateWithConcurrencyCheck: (id: string, draft: CriterioRrllDraft, expectedUpdatedAt: string | null) => Promise<{ ok: boolean; message: string }>;
  remove: (id: string) => void;
  removeWithConcurrencyCheck: (id: string, expectedUpdatedAt: string | null) => Promise<{ ok: boolean; message: string }>;
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

function parseCriteriosRrllSnapshot(storageValue: string | null): CriterioRrll[] {
  if (!storageValue) {
    return [];
  }

  const parsed: unknown = JSON.parse(storageValue);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isCriterioRrll).map(normalizeCriterioRrll);
}

function buildCriterioFromDraft(draft: CriterioRrllDraft, now: string, id = createCriterioRrllId(), previous?: CriterioRrll): CriterioRrll {
  return {
    id,
    ...draft,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    deletedAt: previous?.deletedAt ?? null,
  };
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
      const criterio = buildCriterioFromDraft(draft, now);
      const criterios = [...state.criterios, criterio];
      persistCriteriosRrll(criterios);
      return { criterios, selectedCriterioId: criterio.id };
    });
  },
  createWithConcurrencyCheck: async (draft) => {
    try {
      const now = new Date().toISOString();
      const criterio = buildCriterioFromDraft(draft, now);
      const result = await saveNewSharedArrayRecord<CriterioRrll>({
        storageKey: STORAGE_KEY,
        newRecord: criterio,
        parseRecords: parseCriteriosRrllSnapshot,
        getRecordId: (record) => record.id,
        duplicateMessage: 'El criterio ya existe en la base compartida. Recarga antes de continuar.',
      });
      set({ criterios: result.records, selectedCriterioId: result.newRecord.id });
      return { ok: true, message: 'Criterio creado.', recordId: result.newRecord.id };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'No se ha podido crear el criterio.' };
    }
  },
  update: (id, draft) => {
    set((state) => {
      const now = new Date().toISOString();
      const criterios = state.criterios.map((criterio) =>
        criterio.id === id ? buildCriterioFromDraft(draft, now, id, criterio) : criterio,
      );
      persistCriteriosRrll(criterios);
      return { criterios, selectedCriterioId: id };
    });
  },
  updateWithConcurrencyCheck: async (id, draft, expectedUpdatedAt) => {
    try {
      const result = await saveSharedArrayRecord<CriterioRrll>({
        storageKey: STORAGE_KEY,
        recordId: id,
        expectedUpdatedAt,
        parseRecords: parseCriteriosRrllSnapshot,
        getRecordId: (record) => record.id,
        getRecordUpdatedAt: (record) => record.updatedAt,
        updateRecord: (latestRecord) => buildCriterioFromDraft(draft, new Date().toISOString(), id, latestRecord),
        missingMessage: 'El criterio ya no existe en la base compartida. Recarga antes de continuar.',
        conflictMessage: 'Este criterio ha sido modificado por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
      });
      set({ criterios: result.records, selectedCriterioId: id });
      return { ok: true, message: 'Criterio guardado.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'No se ha podido guardar el criterio.' };
    }
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
  removeWithConcurrencyCheck: async (id, expectedUpdatedAt) => {
    try {
      const deletedAt = new Date().toISOString();
      const result = await saveSharedArrayRecord<CriterioRrll>({
        storageKey: STORAGE_KEY,
        recordId: id,
        expectedUpdatedAt,
        parseRecords: parseCriteriosRrllSnapshot,
        getRecordId: (record) => record.id,
        getRecordUpdatedAt: (record) => record.updatedAt,
        updateRecord: (latestRecord) => ({ ...latestRecord, deletedAt, updatedAt: deletedAt }),
        missingMessage: 'El criterio ya no existe en la base compartida. Recarga antes de continuar.',
        conflictMessage: 'Este criterio ha sido modificado por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
      });
      set({ criterios: result.records, selectedCriterioId: firstActiveCriterioId(result.records) });
      return { ok: true, message: 'Criterio eliminado.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'No se ha podido eliminar el criterio.' };
    }
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

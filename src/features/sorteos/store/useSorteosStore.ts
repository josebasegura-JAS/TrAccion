import { create } from 'zustand';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import { publishDatabaseStatus } from '../../../services/databaseStatus';
import { saveNewSharedArrayRecord } from '../../../services/sharedRecordPersistence';
import {
  addManualExclusion,
  deleteSorteo,
  removeExclusionById,
  resetWinnerExclusionsForDraw,
  runSorteo,
  type SorteosDraw,
  type SorteosDraft,
  type SorteosExclusion,
  type SorteosPerson,
  type SorteosValidationResult,
  type SorteosWinner,
} from '../domain/sorteos';

export const DRAWS_STORAGE_KEY = 'traccion.v1.sorteos.draws';
export const EXCLUSIONS_STORAGE_KEY = 'traccion.v1.sorteos.exclusions';

interface SorteosStoreState {
  draws: SorteosDraw[];
  exclusions: SorteosExclusion[];
  visibleDrawId: string;
  visibleResult: SorteosDraw | null;
  load: () => void;
  reloadFromStorage: () => void;
  createDraw: (draft: SorteosDraft, people: SorteosPerson[]) => SorteosValidationResult;
  createDrawWithConcurrencyCheck: (draft: SorteosDraft, people: SorteosPerson[]) => Promise<SorteosValidationResult>;
  addExclusion: (person: SorteosPerson) => void;
  addExclusionWithConcurrencyCheck: (person: SorteosPerson) => Promise<{ ok: boolean; message: string }>;
  removeExclusion: (exclusionId: string) => void;
  removeExclusionWithConcurrencyCheck: (exclusionId: string) => Promise<{ ok: boolean; message: string }>;
  viewDraw: (drawId: string) => void;
  deleteDraw: (drawId: string, removeLinkedWinnerExclusions: boolean) => void;
  deleteDrawWithConcurrencyCheck: (drawId: string, removeLinkedWinnerExclusions: boolean) => Promise<{ ok: boolean; message: string }>;
  resetDrawWinnerExclusions: (drawId: string) => void;
  resetDrawWinnerExclusionsWithConcurrencyCheck: (drawId: string) => Promise<{ ok: boolean; message: string }>;
  resetAllExclusions: () => void;
  resetAllExclusionsWithConcurrencyCheck: () => Promise<{ ok: boolean; message: string }>;
}

function isWinner(value: unknown): value is SorteosWinner {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SorteosWinner>;
  return (
    typeof candidate.position === 'number' &&
    typeof candidate.empleado === 'string' &&
    typeof candidate.nombreApellidos === 'string'
  );
}

function isDraw(value: unknown): value is SorteosDraw {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SorteosDraw>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.date === 'string' &&
    Array.isArray(candidate.winners) &&
    candidate.winners.every(isWinner) &&
    typeof candidate.createdAt === 'string'
  );
}

function isExclusion(value: unknown): value is SorteosExclusion {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SorteosExclusion>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.empleado === 'string' &&
    typeof candidate.nombreApellidos === 'string' &&
    typeof candidate.reason === 'string' &&
    (typeof candidate.drawId === 'string' || candidate.drawId === null) &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.excludedAt === 'string'
  );
}

function readArray<T>(storageKey: string, guard: (value: unknown) => value is T): T[] {
  const stored = readStorageItem(storageKey);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(guard);
}

async function loadSharedSorteosSnapshot(): Promise<{ draws: SorteosDraw[]; exclusions: SorteosExclusion[]; drawsUpdatedAt: string | null; exclusionsUpdatedAt: string | null }> {
  const snapshot = await window.traccion?.loadPersistedRecords?.();
  if (!snapshot) {
    throw new Error('SQLite compartido no disponible. No se permite guardar sin base compartida.');
  }
  publishDatabaseStatus(snapshot.status);
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    throw new Error(snapshot.status.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.');
  }

  const drawsRecord = snapshot.records.find((record) => record.key === DRAWS_STORAGE_KEY) ?? null;
  const exclusionsRecord = snapshot.records.find((record) => record.key === EXCLUSIONS_STORAGE_KEY) ?? null;
  return {
    draws: sortDraws(readArrayFromValue(drawsRecord?.value ?? null, isDraw)),
    exclusions: readArrayFromValue(exclusionsRecord?.value ?? null, isExclusion),
    drawsUpdatedAt: drawsRecord?.updatedAt ?? null,
    exclusionsUpdatedAt: exclusionsRecord?.updatedAt ?? null,
  };
}

function readArrayFromValue<T>(storageValue: string | null, guard: (value: unknown) => value is T): T[] {
  if (!storageValue) {
    return [];
  }

  const parsed: unknown = JSON.parse(storageValue);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(guard);
}

async function saveSharedArray(storageKey: string, value: string, expectedUpdatedAt: string | null): Promise<void> {
  const result = await window.traccion?.saveLocalStorageRecordIfUnchanged?.({
    key: storageKey,
    value,
    expectedUpdatedAt,
  });
  if (!result) {
    throw new Error('SQLite compartido no disponible. No se permite guardar sin base compartida.');
  }
  publishDatabaseStatus(result.status);
  if (!result.ok || !result.status.ready || result.status.phase !== 'active') {
    throw new Error(result.message ?? 'No se ha confirmado el guardado en SQLite compartido.');
  }
  window.localStorage.setItem(storageKey, value);
}

function persist(draws: SorteosDraw[], exclusions: SorteosExclusion[]): void {
  writeStorageItem(DRAWS_STORAGE_KEY, JSON.stringify(draws));
  writeStorageItem(EXCLUSIONS_STORAGE_KEY, JSON.stringify(exclusions));
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}`;
}

function sortDraws(draws: SorteosDraw[]): SorteosDraw[] {
  return [...draws].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export const useSorteosStore = create<SorteosStoreState>((set, get) => ({
  draws: [],
  exclusions: [],
  visibleDrawId: '',
  visibleResult: null,
  load: () => {
    const draws = sortDraws(readArray(DRAWS_STORAGE_KEY, isDraw));
    const exclusions = readArray(EXCLUSIONS_STORAGE_KEY, isExclusion);
    set({ draws, exclusions, visibleDrawId: '', visibleResult: null });
  },
  reloadFromStorage: () => {
    const draws = sortDraws(readArray(DRAWS_STORAGE_KEY, isDraw));
    const exclusions = readArray(EXCLUSIONS_STORAGE_KEY, isExclusion);
    const currentVisibleDrawId = get().visibleDrawId;
    const visibleResult = draws.find((draw) => draw.id === currentVisibleDrawId) ?? null;
    set({
      draws,
      exclusions,
      visibleDrawId: visibleResult ? visibleResult.id : '',
      visibleResult,
    });
  },
  createDraw: (draft, people) => {
    const drawId = createId('sorteo');
    const timestamp = nowIso();

    try {
      const result = runSorteo(
        draft,
        people,
        get().exclusions,
        drawId,
        (position) => `${drawId}-winner-${position}`,
        timestamp,
      );
      const draws = sortDraws([result.draw, ...get().draws]);
      persist(draws, result.exclusions);
      set({
        draws,
        exclusions: result.exclusions,
        visibleDrawId: result.draw.id,
        visibleResult: result.draw,
      });
      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: error instanceof Error ? error.message.split('\n') : ['No se ha podido realizar el sorteo.'],
      };
    }
  },
  createDrawWithConcurrencyCheck: async (draft, people) => {
    const drawId = createId('sorteo');
    const timestamp = nowIso();

    try {
      const snapshot = await loadSharedSorteosSnapshot();
      const result = runSorteo(
        draft,
        people,
        snapshot.exclusions,
        drawId,
        (position) => `${drawId}-winner-${position}`,
        timestamp,
      );
      const draws = sortDraws([result.draw, ...snapshot.draws]);
      await saveSharedArray(EXCLUSIONS_STORAGE_KEY, JSON.stringify(result.exclusions), snapshot.exclusionsUpdatedAt);
      await saveNewSharedArrayRecord<SorteosDraw>({
        storageKey: DRAWS_STORAGE_KEY,
        newRecord: result.draw,
        parseRecords: (value) => sortDraws(readArrayFromValue(value, isDraw)),
        getRecordId: (record) => record.id,
        duplicateMessage: 'El sorteo ya existe en la base compartida. Recarga antes de continuar.',
      });
      set({ draws, exclusions: result.exclusions, visibleDrawId: result.draw.id, visibleResult: result.draw });
      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: error instanceof Error ? error.message.split('\n') : ['No se ha podido realizar el sorteo.'],
      };
    }
  },
  addExclusion: (person) => {
    set((state) => {
      const exclusions = addManualExclusion(state.exclusions, person, createId('sorteo-exclusion'), nowIso());
      persist(state.draws, exclusions);
      return { exclusions };
    });
  },
  addExclusionWithConcurrencyCheck: async (person) => {
    try {
      const snapshot = await loadSharedSorteosSnapshot();
      const exclusions = addManualExclusion(snapshot.exclusions, person, createId('sorteo-exclusion'), nowIso());
      await saveSharedArray(EXCLUSIONS_STORAGE_KEY, JSON.stringify(exclusions), snapshot.exclusionsUpdatedAt);
      set({ draws: snapshot.draws, exclusions });
      return { ok: true, message: 'Exclusión añadida.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'No se ha podido añadir la exclusión.' };
    }
  },
  removeExclusion: (exclusionId) => {
    set((state) => {
      const exclusions = removeExclusionById(state.exclusions, exclusionId);
      persist(state.draws, exclusions);
      return { exclusions };
    });
  },
  removeExclusionWithConcurrencyCheck: async (exclusionId) => {
    try {
      const snapshot = await loadSharedSorteosSnapshot();
      const exclusions = removeExclusionById(snapshot.exclusions, exclusionId);
      await saveSharedArray(EXCLUSIONS_STORAGE_KEY, JSON.stringify(exclusions), snapshot.exclusionsUpdatedAt);
      set({ draws: snapshot.draws, exclusions });
      return { ok: true, message: 'Exclusión quitada.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'No se ha podido quitar la exclusión.' };
    }
  },
  viewDraw: (drawId) => {
    const draw = get().draws.find((candidate) => candidate.id === drawId) ?? null;
    set({ visibleDrawId: draw?.id ?? '', visibleResult: draw });
  },
  deleteDraw: (drawId, removeLinkedWinnerExclusions) => {
    set((state) => {
      const result = deleteSorteo(state.draws, state.exclusions, drawId, removeLinkedWinnerExclusions);
      persist(result.draws, result.exclusions);
      const shouldClearVisibleResult = state.visibleDrawId === drawId;
      return {
        draws: sortDraws(result.draws),
        exclusions: result.exclusions,
        visibleDrawId: shouldClearVisibleResult ? '' : state.visibleDrawId,
        visibleResult: shouldClearVisibleResult ? null : state.visibleResult,
      };
    });
  },
  deleteDrawWithConcurrencyCheck: async (drawId, removeLinkedWinnerExclusions) => {
    try {
      const snapshot = await loadSharedSorteosSnapshot();
      const result = deleteSorteo(snapshot.draws, snapshot.exclusions, drawId, removeLinkedWinnerExclusions);
      await saveSharedArray(DRAWS_STORAGE_KEY, JSON.stringify(sortDraws(result.draws)), snapshot.drawsUpdatedAt);
      await saveSharedArray(EXCLUSIONS_STORAGE_KEY, JSON.stringify(result.exclusions), snapshot.exclusionsUpdatedAt);
      set({ draws: sortDraws(result.draws), exclusions: result.exclusions, visibleDrawId: '', visibleResult: null });
      return { ok: true, message: 'Sorteo eliminado.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'No se ha podido eliminar el sorteo.' };
    }
  },
  resetDrawWinnerExclusions: (drawId) => {
    set((state) => {
      const exclusions = resetWinnerExclusionsForDraw(state.exclusions, drawId);
      persist(state.draws, exclusions);
      return { exclusions };
    });
  },
  resetDrawWinnerExclusionsWithConcurrencyCheck: async (drawId) => {
    try {
      const snapshot = await loadSharedSorteosSnapshot();
      const exclusions = resetWinnerExclusionsForDraw(snapshot.exclusions, drawId);
      await saveSharedArray(EXCLUSIONS_STORAGE_KEY, JSON.stringify(exclusions), snapshot.exclusionsUpdatedAt);
      set({ draws: snapshot.draws, exclusions });
      return { ok: true, message: 'Exclusiones reseteadas.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'No se han podido resetear las exclusiones.' };
    }
  },
  resetAllExclusions: () => {
    set((state) => {
      persist(state.draws, []);
      return { exclusions: [] };
    });
  },
  resetAllExclusionsWithConcurrencyCheck: async () => {
    try {
      const snapshot = await loadSharedSorteosSnapshot();
      await saveSharedArray(EXCLUSIONS_STORAGE_KEY, JSON.stringify([]), snapshot.exclusionsUpdatedAt);
      set({ draws: snapshot.draws, exclusions: [] });
      return { ok: true, message: 'Exclusiones reseteadas.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'No se han podido resetear las exclusiones.' };
    }
  },
}));

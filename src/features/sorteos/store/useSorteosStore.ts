import { create } from 'zustand';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
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

const DRAWS_STORAGE_KEY = 'traccion.v1.sorteos.draws';
const EXCLUSIONS_STORAGE_KEY = 'traccion.v1.sorteos.exclusions';

interface SorteosStoreState {
  draws: SorteosDraw[];
  exclusions: SorteosExclusion[];
  visibleDrawId: string;
  visibleResult: SorteosDraw | null;
  load: () => void;
  createDraw: (draft: SorteosDraft, people: SorteosPerson[]) => SorteosValidationResult;
  addExclusion: (person: SorteosPerson) => void;
  removeExclusion: (exclusionId: string) => void;
  viewDraw: (drawId: string) => void;
  deleteDraw: (drawId: string, removeLinkedWinnerExclusions: boolean) => void;
  resetDrawWinnerExclusions: (drawId: string) => void;
  resetAllExclusions: () => void;
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
  addExclusion: (person) => {
    set((state) => {
      const exclusions = addManualExclusion(state.exclusions, person, createId('sorteo-exclusion'), nowIso());
      persist(state.draws, exclusions);
      return { exclusions };
    });
  },
  removeExclusion: (exclusionId) => {
    set((state) => {
      const exclusions = removeExclusionById(state.exclusions, exclusionId);
      persist(state.draws, exclusions);
      return { exclusions };
    });
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
  resetDrawWinnerExclusions: (drawId) => {
    set((state) => {
      const exclusions = resetWinnerExclusionsForDraw(state.exclusions, drawId);
      persist(state.draws, exclusions);
      return { exclusions };
    });
  },
  resetAllExclusions: () => {
    set((state) => {
      persist(state.draws, []);
      return { exclusions: [] };
    });
  },
}));

import { create } from 'zustand';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import {
  buildVinculograma,
  type Vinculograma,
  type VinculogramaDraft,
} from '../domain/vinculograma';

const STORAGE_KEY = 'traccion.v1.vinculograma.records';

interface VinculogramaState {
  records: Vinculograma[];
  load: () => void;
  create: (draft: VinculogramaDraft) => string;
  update: (id: string, draft: VinculogramaDraft) => void;
  remove: (id: string) => void;
}

function isVinculograma(value: unknown): value is Vinculograma {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof Vinculograma, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.employeeNumber === 'string' &&
    typeof candidate.nombreCompleto === 'string' &&
    typeof candidate.linkedPerson === 'string' &&
    typeof candidate.requestDate === 'string' &&
    typeof candidate.expiryDate === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    (typeof candidate.deletedAt === 'string' || candidate.deletedAt === null)
  );
}

function readRecords(): Vinculograma[] {
  const stored = readStorageItem(STORAGE_KEY);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isVinculograma);
}

function persistRecords(records: Vinculograma[]): void {
  writeStorageItem(STORAGE_KEY, JSON.stringify(records));
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `vinculograma-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useVinculogramaStore = create<VinculogramaState>((set) => ({
  records: [],
  load: () => {
    set({ records: readRecords() });
  },
  create: (draft) => {
    const id = createId();
    set((state) => {
      const records = [...state.records, buildVinculograma(draft, nowIso(), id)];
      persistRecords(records);
      return { records };
    });
    return id;
  },
  update: (id, draft) => {
    set((state) => {
      const updatedAt = nowIso();
      const records = state.records.map((record) =>
        record.id === id ? buildVinculograma(draft, updatedAt, id, record) : record,
      );
      persistRecords(records);
      return { records };
    });
  },
  remove: (id) => {
    set((state) => {
      const updatedAt = nowIso();
      const records = state.records.map((record) =>
        record.id === id ? { ...record, updatedAt, deletedAt: updatedAt } : record,
      );
      persistRecords(records);
      return { records };
    });
  },
}));

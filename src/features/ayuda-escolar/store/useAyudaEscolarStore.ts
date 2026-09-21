import { create } from 'zustand';
import type { SchoolHelpRecord } from '../domain/ayudaEscolar';

const STORAGE_KEY = 'traccion.v1.ayuda-escolar.records';

interface SchoolHelpState {
  records: SchoolHelpRecord[];
  load: () => void;
  add: (record: SchoolHelpRecord) => void;
}

function readRecords(): SchoolHelpRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SchoolHelpRecord[]) : [];
  } catch {
    return [];
  }
}

function persist(records: SchoolHelpRecord[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export const useAyudaEscolarStore = create<SchoolHelpState>((set) => ({
  records: readRecords(),
  load: () => set({ records: readRecords() }),
  add: (record) =>
    set((state) => {
      const records = [record, ...state.records];
      persist(records);
      return { records };
    }),
}));

import { create } from 'zustand';
import { readStorageItem, writeJsonStorageAsync } from '../../../services/persistence';
import type { SchoolHelpRecord } from '../domain/ayudaEscolar';

const STORAGE_KEY = 'traccion.v1.ayudaEscolar.records';

interface SchoolHelpState {
  records: SchoolHelpRecord[];
  load: () => void;
  add: (record: SchoolHelpRecord) => Promise<{ ok: boolean; message: string }>;
}

function isSchoolHelpRecord(value: unknown): value is SchoolHelpRecord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SchoolHelpRecord>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.empleado === 'string' &&
    typeof candidate.nombre === 'string' &&
    typeof candidate.archivedAt === 'string' &&
    Array.isArray(candidate.files)
  );
}

function readRecords(): SchoolHelpRecord[] {
  const stored = readStorageItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isSchoolHelpRecord) : [];
  } catch {
    return [];
  }
}

export const useAyudaEscolarStore = create<SchoolHelpState>((set, get) => ({
  records: readRecords(),
  load: () => set({ records: readRecords() }),
  add: async (record) => {
    const records = [...get().records, record];
    const result = await writeJsonStorageAsync(STORAGE_KEY, records);
    if (!result.ok) return { ok: false, message: result.message };
    set({ records });
    return { ok: true, message: 'Registro de Ayuda escolar guardado.' };
  },
}));

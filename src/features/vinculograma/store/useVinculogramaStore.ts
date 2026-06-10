import { create } from 'zustand';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import { saveNewSharedArrayRecord, saveSharedArrayRecord } from '../../../services/sharedRecordPersistence';
import {
  buildVinculograma,
  type Vinculograma,
  type VinculogramaDraft,
} from '../domain/vinculograma';

const STORAGE_KEY = 'traccion.v1.vinculograma.records';

interface VinculogramaUpdateResult {
  ok: boolean;
  message: string;
  recordId?: string;
}

interface VinculogramaState {
  records: Vinculograma[];
  load: () => void;
  reloadFromStorage: () => void;
  create: (draft: VinculogramaDraft) => string;
  createWithConcurrencyCheck: (draft: VinculogramaDraft) => Promise<VinculogramaUpdateResult>;
  update: (id: string, draft: VinculogramaDraft) => void;
  updateWithConcurrencyCheck: (
    id: string,
    draft: VinculogramaDraft,
    expectedUpdatedAt: string | null,
  ) => Promise<VinculogramaUpdateResult>;
  removeWithConcurrencyCheck: (
    id: string,
    expectedUpdatedAt: string | null,
  ) => Promise<VinculogramaUpdateResult>;
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

function parseRecords(stored: string | null): Vinculograma[] {
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isVinculograma);
}

function readRecords(): Vinculograma[] {
  return parseRecords(readStorageItem(STORAGE_KEY));
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
  reloadFromStorage: () => {
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
  createWithConcurrencyCheck: async (draft) => {
    const id = createId();
    const record = buildVinculograma(draft, nowIso(), id);

    try {
      const result = await saveNewSharedArrayRecord<Vinculograma>({
        storageKey: STORAGE_KEY,
        newRecord: record,
        parseRecords,
        getRecordId: (item) => item.id,
        duplicateMessage:
          'El vínculo ya existe en la base compartida. Recarga antes de continuar.',
      });

      set({ records: result.records });
      return { ok: true, message: 'Vínculo creado.', recordId: result.newRecord.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se ha podido crear el vínculo.';
      return { ok: false, message };
    }
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
  updateWithConcurrencyCheck: async (id, draft, expectedUpdatedAt) => {
    try {
      const result = await saveSharedArrayRecord<Vinculograma>({
        storageKey: STORAGE_KEY,
        recordId: id,
        expectedUpdatedAt,
        parseRecords,
        getRecordId: (record) => record.id,
        getRecordUpdatedAt: (record) => record.updatedAt,
        updateRecord: (latestRecord) => buildVinculograma(draft, nowIso(), id, latestRecord),
        missingMessage: 'El vínculo ya no existe en la base compartida. Recarga antes de continuar.',
        conflictMessage: 'Este vínculo ha sido modificado por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
      });
      set({ records: result.records });
      return { ok: true, message: 'Vínculo guardado.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se ha podido guardar el vínculo.';
      return { ok: false, message };
    }
  },
  removeWithConcurrencyCheck: async (id, expectedUpdatedAt) => {
    try {
      const deletedAt = nowIso();
      const result = await saveSharedArrayRecord<Vinculograma>({
        storageKey: STORAGE_KEY,
        recordId: id,
        expectedUpdatedAt,
        parseRecords,
        getRecordId: (record) => record.id,
        getRecordUpdatedAt: (record) => record.updatedAt,
        updateRecord: (latestRecord) => ({ ...latestRecord, updatedAt: deletedAt, deletedAt }),
        missingMessage: 'El vínculo ya no existe en la base compartida. Recarga antes de continuar.',
        conflictMessage: 'Este vínculo ha sido modificado por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
      });
      set({ records: result.records });
      return { ok: true, message: 'Vínculo eliminado.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se ha podido eliminar el vínculo.';
      return { ok: false, message };
    }
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

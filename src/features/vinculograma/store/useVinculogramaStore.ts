import { create } from 'zustand';
import { readStorageItem } from '../../../services/persistence';
import { saveNewSharedArrayRecord, saveSharedArrayRecord } from '../../../services/sharedRecordPersistence';
import {
  buildVinculograma,
  type Vinculograma,
  type VinculogramaDraft,
} from '../domain/vinculograma';
import {
  deleteVinculogramaInSqlite,
  hasVinculogramaSqliteRepository,
  loadVinculogramaRecordsFromSqlite,
  loadVinculogramasFromSqlite,
  saveVinculogramaToSqlite,
} from './vinculogramaSqliteRepository';

const STORAGE_KEY = 'traccion.v1.vinculograma.records';

interface VinculogramaUpdateResult {
  ok: boolean;
  message: string;
  recordId?: string;
}

interface VinculogramaState {
  records: Vinculograma[];
  load: () => Promise<void>;
  reloadFromStorage: () => Promise<void>;
  createWithConcurrencyCheck: (draft: VinculogramaDraft) => Promise<VinculogramaUpdateResult>;
  updateWithConcurrencyCheck: (
    id: string,
    draft: VinculogramaDraft,
    expectedUpdatedAt: string | null,
  ) => Promise<VinculogramaUpdateResult>;
  removeWithConcurrencyCheck: (
    id: string,
    expectedUpdatedAt: string | null,
  ) => Promise<VinculogramaUpdateResult>;
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

function mirrorRecords(records: Vinculograma[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `vinculograma-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function areRecordsEquivalent(left: Vinculograma[], right: Vinculograma[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export const useVinculogramaStore = create<VinculogramaState>((set, get) => ({
  records: [],
  load: async () => {
    try {
      const sqliteRecords = await loadVinculogramasFromSqlite(parseRecords);
      if (sqliteRecords) {
        mirrorRecords(sqliteRecords);
        set({ records: sqliteRecords });
        return;
      }
    } catch {
      // Si SQLite no está disponible, se conserva la lectura legacy como fallback de arranque.
    }

    set({ records: readRecords() });
  },
  reloadFromStorage: async () => {
    // A diferencia de load(), aquí se compara el contenido antes de llamar a
    // set() para no provocar un re-render (y el parpadeo asociado) cuando el
    // poll detecta un cambio de updatedAt pero el contenido normalizado ya
    // coincide con el que tenemos en memoria.
    try {
      const sqliteRecords = await loadVinculogramasFromSqlite(parseRecords);
      if (sqliteRecords) {
        mirrorRecords(sqliteRecords);
        if (!areRecordsEquivalent(get().records, sqliteRecords)) {
          set({ records: sqliteRecords });
        }
        return;
      }
    } catch {
      // Si SQLite no está disponible, se conserva la lectura legacy como fallback.
    }

    const records = readRecords();
    if (!areRecordsEquivalent(get().records, records)) {
      set({ records });
    }
  },
  createWithConcurrencyCheck: async (draft) => {
    const id = createId();
    const record = buildVinculograma(draft, nowIso(), id);

    if (hasVinculogramaSqliteRepository()) {
      try {
        const result = await saveVinculogramaToSqlite(record, null);
        if (!result?.ok) {
          return { ok: false, message: result?.message ?? 'No se ha podido crear el vínculo.' };
        }

        const records = await loadVinculogramaRecordsFromSqlite();
        const parsedRecords = records
          ? records.flatMap((sqliteRecord) => parseRecords(`[${sqliteRecord.value}]`))
          : [...get().records, record];
        mirrorRecords(parsedRecords);
        set({ records: parsedRecords });
        return { ok: true, message: result.message, recordId: record.id };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se ha podido crear el vínculo.';
        return { ok: false, message };
      }
    }

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
  updateWithConcurrencyCheck: async (id, draft, expectedUpdatedAt) => {
    if (hasVinculogramaSqliteRepository()) {
      try {
        const currentRecord = get().records.find((record) => record.id === id);
        if (!currentRecord) {
          return {
            ok: false,
            message: 'El vínculo ya no existe en la base compartida. Recarga antes de continuar.',
          };
        }

        const record = buildVinculograma(draft, nowIso(), id, currentRecord);
        const result = await saveVinculogramaToSqlite(record, expectedUpdatedAt);
        if (!result?.ok) {
          return { ok: false, message: result?.message ?? 'No se ha podido guardar el vínculo.' };
        }

        const records = await loadVinculogramaRecordsFromSqlite();
        const parsedRecords = records
          ? records.flatMap((sqliteRecord) => parseRecords(`[${sqliteRecord.value}]`))
          : get().records.map((current) => (current.id === id ? record : current));
        mirrorRecords(parsedRecords);
        set({ records: parsedRecords });
        return { ok: true, message: result.message };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se ha podido guardar el vínculo.';
        return { ok: false, message };
      }
    }

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
    if (hasVinculogramaSqliteRepository()) {
      try {
        const currentRecord = get().records.find((record) => record.id === id);
        if (!currentRecord) {
          return {
            ok: false,
            message: 'El vínculo ya no existe en la base compartida. Recarga antes de continuar.',
          };
        }

        const result = await deleteVinculogramaInSqlite(currentRecord, expectedUpdatedAt);
        if (!result?.ok) {
          return { ok: false, message: result?.message ?? 'No se ha podido eliminar el vínculo.' };
        }

        const records = await loadVinculogramaRecordsFromSqlite();
        const parsedRecords = records
          ? records.flatMap((sqliteRecord) => parseRecords(`[${sqliteRecord.value}]`))
          : get().records.filter((record) => record.id !== id);
        mirrorRecords(parsedRecords);
        set({ records: parsedRecords });
        return { ok: true, message: result.message };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se ha podido eliminar el vínculo.';
        return { ok: false, message };
      }
    }

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
}));

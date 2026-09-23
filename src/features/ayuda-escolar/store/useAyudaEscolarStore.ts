import { create } from 'zustand';
import { publishDatabaseStatus } from '../../../services/databaseStatus';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import { saveNewSharedArrayRecord } from '../../../services/sharedRecordPersistence';
import type { SchoolHelpArchivedFile, SchoolHelpRecord } from '../domain/ayudaEscolar';

export const AYUDA_ESCOLAR_STORAGE_KEY = 'traccion.v1.ayuda-escolar.records';
const STORAGE_KEY = AYUDA_ESCOLAR_STORAGE_KEY;

interface SchoolHelpState {
  records: SchoolHelpRecord[];
  load: () => Promise<void>;
  reloadFromStorage: () => Promise<void>;
  add: (record: SchoolHelpRecord) => Promise<{ ok: boolean; message: string }>;
}

function isArchivedFile(value: unknown): value is SchoolHelpArchivedFile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SchoolHelpArchivedFile>;
  return (
    typeof candidate.originalName === 'string' &&
    typeof candidate.savedName === 'string' &&
    typeof candidate.savedPath === 'string'
  );
}

function isSchoolHelpRecord(value: unknown): value is SchoolHelpRecord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SchoolHelpRecord>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.employeeId === 'string' &&
    typeof candidate.employeeName === 'string' &&
    typeof candidate.senderName === 'string' &&
    typeof candidate.senderEmail === 'string' &&
    (typeof candidate.sentOnBehalfOfAnother === 'boolean' ||
      typeof candidate.sentOnBehalfOfAnother === 'undefined') &&
    typeof candidate.subject === 'string' &&
    typeof candidate.receivedAt === 'string' &&
    typeof candidate.archivedAt === 'string' &&
    Array.isArray(candidate.files) &&
    candidate.files.every(isArchivedFile)
  );
}

function sortRecords(records: SchoolHelpRecord[]): SchoolHelpRecord[] {
  return [...records].sort((left, right) => {
    const leftTime = Date.parse(left.archivedAt);
    const rightTime = Date.parse(right.archivedAt);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return right.id.localeCompare(left.id);
  });
}

function parseRecords(storageValue: string | null): SchoolHelpRecord[] {
  if (!storageValue) return [];

  try {
    const parsed: unknown = JSON.parse(storageValue);
    return Array.isArray(parsed) ? sortRecords(parsed.filter(isSchoolHelpRecord)) : [];
  } catch {
    return [];
  }
}

function readLocalRecords(): SchoolHelpRecord[] {
  return parseRecords(readStorageItem(STORAGE_KEY));
}

function mirrorRecords(records: SchoolHelpRecord[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

async function loadSharedRecords(): Promise<SchoolHelpRecord[] | null> {
  const getPersistedRecord = window.traccion?.getPersistedRecord;
  if (getPersistedRecord) {
    const snapshot = await getPersistedRecord(STORAGE_KEY);
    publishDatabaseStatus(snapshot.status);
    if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
      throw new Error(snapshot.status.message ?? 'SQLite compartida no disponible.');
    }
    return snapshot.record ? parseRecords(snapshot.record.value) : null;
  }

  const loadPersistedRecords = window.traccion?.loadPersistedRecords;
  if (!loadPersistedRecords) return null;

  const snapshot = await loadPersistedRecords();
  publishDatabaseStatus(snapshot.status);
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    throw new Error(snapshot.status.message ?? 'SQLite compartida no disponible.');
  }

  const record = snapshot.records.find((item) => item.key === STORAGE_KEY) ?? null;
  return record ? parseRecords(record.value) : null;
}

async function loadAndMigrateLegacyRecords(): Promise<SchoolHelpRecord[]> {
  const localRecords = readLocalRecords();

  try {
    const sharedRecords = await loadSharedRecords();
    if (sharedRecords !== null) {
      mirrorRecords(sharedRecords);
      return sharedRecords;
    }

    // Compatibilidad con instalaciones que ya habían usado Ayuda Escolar cuando
    // su seguimiento solo vivía en localStorage. Si SQLite todavía no tiene la
    // clave, se migra una única vez el histórico local a la base compartida.
    if (localRecords.length > 0) {
      const migration = await writeStorageItem(STORAGE_KEY, JSON.stringify(localRecords));
      if (migration.ok) {
        mirrorRecords(localRecords);
      }
    }
  } catch {
    // El bloqueo global de edición gestiona una SQLite no disponible. Se conserva
    // la caché local únicamente para poder visualizar/recuperar un histórico legacy.
  }

  return localRecords;
}

export const useAyudaEscolarStore = create<SchoolHelpState>((set, get) => ({
  records: [],
  load: async () => {
    const records = await loadAndMigrateLegacyRecords();
    set({ records });
  },
  reloadFromStorage: async () => {
    try {
      const sharedRecords = await loadSharedRecords();
      if (sharedRecords === null) return;
      if (JSON.stringify(sharedRecords) === JSON.stringify(get().records)) return;
      mirrorRecords(sharedRecords);
      set({ records: sharedRecords });
    } catch {
      // El polling global ya informa de los problemas de conectividad SQLite.
    }
  },
  add: async (record) => {
    try {
      const result = await saveNewSharedArrayRecord({
        storageKey: STORAGE_KEY,
        newRecord: record,
        parseRecords,
        getRecordId: (item) => item.id,
        duplicateMessage: 'Este registro de Ayuda Escolar ya existe en la base compartida.',
      });
      const records = sortRecords(result.records);
      mirrorRecords(records);
      set({ records });
      return { ok: true, message: 'Seguimiento guardado en SQLite compartida.' };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se ha podido guardar el seguimiento de Ayuda Escolar en SQLite compartida.';
      return { ok: false, message };
    }
  },
}));

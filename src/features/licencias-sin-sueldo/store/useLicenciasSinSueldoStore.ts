import { create } from 'zustand';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import {
  buildLicenciaSinSueldoRecord,
  isLicenciaSinSueldoEstado,
  isLicenciaSinSueldoTipo,
  LICENCIA_SIN_SUELDO_STORAGE_KEY,
  type LicenciaSinSueldoActualizacion,
  type LicenciaSinSueldoDraft,
  type LicenciaSinSueldoRecord,
} from '../domain/licenciaSinSueldo';

interface LicenciasSinSueldoState {
  records: LicenciaSinSueldoRecord[];
  load: () => void;
  reloadFromStorage: () => void;
  create: (draft: LicenciaSinSueldoDraft) => string;
  update: (id: string, draft: LicenciaSinSueldoDraft) => void;
  remove: (id: string) => void;
}

function isActualizacion(value: unknown): value is LicenciaSinSueldoActualizacion {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<Record<keyof LicenciaSinSueldoActualizacion, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.fecha === 'string' &&
    typeof candidate.texto === 'string'
  );
}

function isLicenciaSinSueldoRecord(value: unknown): value is LicenciaSinSueldoRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof LicenciaSinSueldoRecord, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.numeroEmpleado === 'string' &&
    typeof candidate.nombreCompleto === 'string' &&
    isLicenciaSinSueldoTipo(candidate.tipo) &&
    typeof candidate.fechaSolicitud === 'string' &&
    typeof candidate.fechaInicio === 'string' &&
    typeof candidate.fechaFin === 'string' &&
    isLicenciaSinSueldoEstado(candidate.estado) &&
    typeof candidate.observaciones === 'string' &&
    Array.isArray(candidate.actualizaciones) &&
    candidate.actualizaciones.every(isActualizacion) &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    (typeof candidate.deletedAt === 'string' || candidate.deletedAt === null)
  );
}

function readRecords(): LicenciaSinSueldoRecord[] {
  const stored = readStorageItem(LICENCIA_SIN_SUELDO_STORAGE_KEY);
  if (!stored) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isLicenciaSinSueldoRecord) : [];
  } catch {
    return [];
  }
}

function persistRecords(records: LicenciaSinSueldoRecord[]): void {
  writeStorageItem(LICENCIA_SIN_SUELDO_STORAGE_KEY, JSON.stringify(records));
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `licencia-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useLicenciasSinSueldoStore = create<LicenciasSinSueldoState>((set) => ({
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
      const records = [...state.records, buildLicenciaSinSueldoRecord(draft, nowIso(), id)];
      persistRecords(records);
      return { records };
    });
    return id;
  },
  update: (id, draft) => {
    set((state) => {
      const updatedAt = nowIso();
      const records = state.records.map((record) =>
        record.id === id ? buildLicenciaSinSueldoRecord(draft, updatedAt, id, record) : record,
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

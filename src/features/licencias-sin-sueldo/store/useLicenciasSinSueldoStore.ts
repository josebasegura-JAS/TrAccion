import { create } from 'zustand';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import { saveNewSharedArrayRecord, saveSharedArrayRecord } from '../../../services/sharedRecordPersistence';
import {
  deleteLicenciaSinSueldoInSqlite,
  hasLicenciaSinSueldoSqliteRepository,
  loadLicenciaSinSueldoRecordsFromSqlite,
  loadLicenciasSinSueldoFromSqlite,
  saveLicenciaSinSueldoToSqlite,
} from './licenciaSinSueldoSqliteRepository';
import { addAuditEvent, buildAuditChanges, buildUpdateSummary } from '../../../shared/audit/auditTrail';
import {
  buildLicenciaSinSueldoRecord,
  isLicenciaSinSueldoEstado,
  isLicenciaSinSueldoTipo,
  LICENCIA_SIN_SUELDO_STORAGE_KEY,
  type LicenciaSinSueldoActualizacion,
  type LicenciaSinSueldoDraft,
  type LicenciaSinSueldoRecord,
} from '../domain/licenciaSinSueldo';


const LICENCIAS_AUDIT_LABELS = {
  numeroEmpleado: 'Nº empleado',
  nombreCompleto: 'Nombre completo',
  tipo: 'Tipo',
  fechaSolicitud: 'Fecha solicitud',
  fechaInicio: 'Fecha inicio',
  fechaFin: 'Fecha fin',
  estado: 'Estado',
  observaciones: 'Observaciones',
} satisfies Partial<Record<keyof LicenciaSinSueldoDraft, string>>;

const LICENCIAS_AUDIT_FIELDS: Array<keyof LicenciaSinSueldoDraft> = [
  'numeroEmpleado',
  'nombreCompleto',
  'tipo',
  'fechaSolicitud',
  'fechaInicio',
  'fechaFin',
  'estado',
  'observaciones',
];

function pickLicenciaAuditSnapshot(
  record: LicenciaSinSueldoRecord | LicenciaSinSueldoDraft,
): Record<string, unknown> {
  return LICENCIAS_AUDIT_FIELDS.reduce<Record<string, unknown>>((snapshot, field) => {
    snapshot[field] = record[field];
    return snapshot;
  }, {});
}

function registerLicenciaUpdateAudit(
  previousRecord: LicenciaSinSueldoRecord,
  draft: LicenciaSinSueldoDraft,
): void {
  const changes = buildAuditChanges(
    pickLicenciaAuditSnapshot(previousRecord),
    pickLicenciaAuditSnapshot(draft),
    LICENCIAS_AUDIT_LABELS,
    LICENCIAS_AUDIT_FIELDS,
  );

  if (changes.length === 0) {
    return;
  }

  addAuditEvent({
    module: 'licencias-sin-sueldo',
    entityId: previousRecord.id,
    action: changes.some((change) => change.field === 'estado') ? 'status_changed' : 'updated',
    summary: buildUpdateSummary(changes),
    changes,
  });
}

interface LicenciaUpdateResult {
  ok: boolean;
  message: string;
  recordId?: string;
}

interface LicenciasSinSueldoState {
  records: LicenciaSinSueldoRecord[];
  load: () => Promise<void>;
  reloadFromStorage: () => Promise<void>;
  create: (draft: LicenciaSinSueldoDraft) => string;
  createWithConcurrencyCheck: (draft: LicenciaSinSueldoDraft) => Promise<LicenciaUpdateResult>;
  update: (id: string, draft: LicenciaSinSueldoDraft) => void;
  updateWithConcurrencyCheck: (
    id: string,
    draft: LicenciaSinSueldoDraft,
    expectedUpdatedAt: string | null,
  ) => Promise<LicenciaUpdateResult>;
  removeWithConcurrencyCheck: (
    id: string,
    expectedUpdatedAt: string | null,
  ) => Promise<LicenciaUpdateResult>;
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

function parseRecords(stored: string | null): LicenciaSinSueldoRecord[] {
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

function readRecords(): LicenciaSinSueldoRecord[] {
  return parseRecords(readStorageItem(LICENCIA_SIN_SUELDO_STORAGE_KEY));
}

function persistRecords(records: LicenciaSinSueldoRecord[]): void {
  writeStorageItem(LICENCIA_SIN_SUELDO_STORAGE_KEY, JSON.stringify(records));
}

function mirrorRecords(records: LicenciaSinSueldoRecord[]): void {
  window.localStorage.setItem(LICENCIA_SIN_SUELDO_STORAGE_KEY, JSON.stringify(records));
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `licencia-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useLicenciasSinSueldoStore = create<LicenciasSinSueldoState>((set, get) => ({
  records: [],
  load: async () => {
    try {
      const sqliteRecords = await loadLicenciasSinSueldoFromSqlite(parseRecords);
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
    await get().load();
  },
  create: (draft) => {
    const id = createId();
    set((state) => {
      const record = buildLicenciaSinSueldoRecord(draft, nowIso(), id);
      addAuditEvent({
        module: 'licencias-sin-sueldo',
        entityId: record.id,
        action: 'created',
        summary: 'Registro creado',
        changes: [],
      });
      const records = [...state.records, record];
      persistRecords(records);
      return { records };
    });
    return id;
  },
  createWithConcurrencyCheck: async (draft) => {
    const id = createId();
    const record = buildLicenciaSinSueldoRecord(draft, nowIso(), id);

    if (hasLicenciaSinSueldoSqliteRepository()) {
      try {
        const result = await saveLicenciaSinSueldoToSqlite(record, null);
        if (!result?.ok) {
          return { ok: false, message: result?.message ?? 'No se ha podido crear la solicitud.' };
        }

        addAuditEvent({
          module: 'licencias-sin-sueldo',
          entityId: record.id,
          action: 'created',
          summary: 'Registro creado',
          changes: [],
        });

        const records = await loadLicenciaSinSueldoRecordsFromSqlite();
        const parsedRecords = records
          ? records.flatMap((sqliteRecord) => parseRecords(`[${sqliteRecord.value}]`))
          : [...get().records, record];
        mirrorRecords(parsedRecords);
        set({ records: parsedRecords });
        return { ok: true, message: result.message, recordId: record.id };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se ha podido crear la solicitud.';
        return { ok: false, message };
      }
    }

    try {
      const result = await saveNewSharedArrayRecord<LicenciaSinSueldoRecord>({
        storageKey: LICENCIA_SIN_SUELDO_STORAGE_KEY,
        newRecord: record,
        parseRecords,
        getRecordId: (item) => item.id,
        duplicateMessage:
          'La solicitud ya existe en la base compartida. Recarga antes de continuar.',
      });

      addAuditEvent({
        module: 'licencias-sin-sueldo',
        entityId: result.newRecord.id,
        action: 'created',
        summary: 'Registro creado',
        changes: [],
      });

      set({ records: result.records });
      return { ok: true, message: 'Solicitud creada.', recordId: result.newRecord.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se ha podido crear la solicitud.';
      return { ok: false, message };
    }
  },
  update: (id, draft) => {
    set((state) => {
      const updatedAt = nowIso();
      const records = state.records.map((record) => {
        if (record.id !== id) {
          return record;
        }

        registerLicenciaUpdateAudit(record, draft);
        return buildLicenciaSinSueldoRecord(draft, updatedAt, id, record);
      });
      persistRecords(records);
      return { records };
    });
  },
  updateWithConcurrencyCheck: async (id, draft, expectedUpdatedAt) => {
    if (hasLicenciaSinSueldoSqliteRepository()) {
      try {
        const currentRecord = get().records.find((record) => record.id === id);
        if (!currentRecord) {
          return {
            ok: false,
            message: 'La solicitud ya no existe en la base compartida. Recarga antes de continuar.',
          };
        }

        registerLicenciaUpdateAudit(currentRecord, draft);
        const record = buildLicenciaSinSueldoRecord(draft, nowIso(), id, currentRecord);
        const result = await saveLicenciaSinSueldoToSqlite(record, expectedUpdatedAt);
        if (!result?.ok) {
          return { ok: false, message: result?.message ?? 'No se ha podido guardar la solicitud.' };
        }

        const records = await loadLicenciaSinSueldoRecordsFromSqlite();
        const parsedRecords = records
          ? records.flatMap((sqliteRecord) => parseRecords(`[${sqliteRecord.value}]`))
          : get().records.map((current) => (current.id === id ? record : current));
        mirrorRecords(parsedRecords);
        set({ records: parsedRecords });
        return { ok: true, message: result.message };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se ha podido guardar la solicitud.';
        return { ok: false, message };
      }
    }

    try {
      const result = await saveSharedArrayRecord<LicenciaSinSueldoRecord>({
        storageKey: LICENCIA_SIN_SUELDO_STORAGE_KEY,
        recordId: id,
        expectedUpdatedAt,
        parseRecords,
        getRecordId: (record) => record.id,
        getRecordUpdatedAt: (record) => record.updatedAt,
        updateRecord: (latestRecord) => {
          registerLicenciaUpdateAudit(latestRecord, draft);
          return buildLicenciaSinSueldoRecord(draft, nowIso(), id, latestRecord);
        },
        missingMessage: 'La solicitud ya no existe en la base compartida. Recarga antes de continuar.',
        conflictMessage: 'Esta solicitud ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
      });
      set({ records: result.records });
      return { ok: true, message: 'Solicitud guardada.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se ha podido guardar la solicitud.';
      return { ok: false, message };
    }
  },
  removeWithConcurrencyCheck: async (id, expectedUpdatedAt) => {
    if (hasLicenciaSinSueldoSqliteRepository()) {
      try {
        const currentRecord = get().records.find((record) => record.id === id);
        if (!currentRecord) {
          return {
            ok: false,
            message: 'La solicitud ya no existe en la base compartida. Recarga antes de continuar.',
          };
        }

        const result = await deleteLicenciaSinSueldoInSqlite(currentRecord, expectedUpdatedAt);
        if (!result?.ok) {
          return { ok: false, message: result?.message ?? 'No se ha podido eliminar la solicitud.' };
        }

        addAuditEvent({
          module: 'licencias-sin-sueldo',
          entityId: currentRecord.id,
          action: 'deleted',
          summary: 'Registro eliminado',
          changes: [],
        });

        const records = await loadLicenciaSinSueldoRecordsFromSqlite();
        const parsedRecords = records
          ? records.flatMap((sqliteRecord) => parseRecords(`[${sqliteRecord.value}]`))
          : get().records.filter((record) => record.id !== id);
        mirrorRecords(parsedRecords);
        set({ records: parsedRecords });
        return { ok: true, message: result.message };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se ha podido eliminar la solicitud.';
        return { ok: false, message };
      }
    }

    try {
      const deletedAt = nowIso();
      const result = await saveSharedArrayRecord<LicenciaSinSueldoRecord>({
        storageKey: LICENCIA_SIN_SUELDO_STORAGE_KEY,
        recordId: id,
        expectedUpdatedAt,
        parseRecords,
        getRecordId: (record) => record.id,
        getRecordUpdatedAt: (record) => record.updatedAt,
        updateRecord: (latestRecord) => {
          addAuditEvent({
            module: 'licencias-sin-sueldo',
            entityId: latestRecord.id,
            action: 'deleted',
            summary: 'Registro eliminado',
            changes: [],
          });
          return { ...latestRecord, updatedAt: deletedAt, deletedAt };
        },
        missingMessage: 'La solicitud ya no existe en la base compartida. Recarga antes de continuar.',
        conflictMessage: 'Esta solicitud ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
      });
      set({ records: result.records });
      return { ok: true, message: 'Solicitud eliminada.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se ha podido eliminar la solicitud.';
      return { ok: false, message };
    }
  },
  remove: (id) => {
    set((state) => {
      const updatedAt = nowIso();
      const records = state.records.map((record) => {
        if (record.id !== id) {
          return record;
        }

        addAuditEvent({
          module: 'licencias-sin-sueldo',
          entityId: record.id,
          action: 'deleted',
          summary: 'Registro eliminado',
          changes: [],
        });
        return { ...record, updatedAt, deletedAt: updatedAt };
      });
      persistRecords(records);
      return { records };
    });
  },
}));

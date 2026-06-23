import { create } from 'zustand';
import { readStorageItem } from '../../../services/persistence';
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
  createWithConcurrencyCheck: (draft: LicenciaSinSueldoDraft) => Promise<LicenciaUpdateResult>;
  updateWithConcurrencyCheck: (
    id: string,
    draft: LicenciaSinSueldoDraft,
    expectedUpdatedAt: string | null,
  ) => Promise<LicenciaUpdateResult>;
  removeWithConcurrencyCheck: (
    id: string,
    expectedUpdatedAt: string | null,
  ) => Promise<LicenciaUpdateResult>;
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

function areRecordsEquivalent(
  left: LicenciaSinSueldoRecord[],
  right: LicenciaSinSueldoRecord[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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
    // A diferencia de load(), aquí se compara el contenido antes de llamar a
    // set() para no provocar un re-render (y el parpadeo/pérdida de foco
    // asociados) cuando el poll detecta un cambio de updatedAt pero el
    // contenido normalizado ya coincide con el que tenemos en memoria.
    try {
      const sqliteRecords = await loadLicenciasSinSueldoFromSqlite(parseRecords);
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
    const record = buildLicenciaSinSueldoRecord(draft, nowIso(), id);

    if (hasLicenciaSinSueldoSqliteRepository()) {
      try {
        const records = await loadLicenciaSinSueldoRecordsFromSqlite();
        if (records !== null) {
          if (records.some((sqliteRecord) => sqliteRecord.id === id)) {
            return {
              ok: false,
              message: 'La solicitud ya existe en la base compartida. Recarga antes de continuar.',
            };
          }

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

          // Construimos la lista a partir de lo que ya habíamos leído de SQLite
          // justo antes de guardar, en vez de releer aquí: si la base deja de
          // estar disponible justo después de guardar (p.ej. SMB intermitente),
          // evitamos mezclar un registro ya persistido con una lista basada en
          // memoria local potencialmente desactualizada respecto a otros usuarios.
          const parsedRecords = [
            record,
            ...records.flatMap((sqliteRecord) => parseRecords(`[${sqliteRecord.value}]`)),
          ];
          mirrorRecords(parsedRecords);
          set({ records: parsedRecords });
          return { ok: true, message: result.message, recordId: record.id };
        }
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
  updateWithConcurrencyCheck: async (id, draft, expectedUpdatedAt) => {
    if (hasLicenciaSinSueldoSqliteRepository()) {
      try {
        const records = await loadLicenciaSinSueldoRecordsFromSqlite();
        if (records !== null) {
          const currentSqliteRecord = records.find((sqliteRecord) => sqliteRecord.id === id);
          const currentRecord = currentSqliteRecord
            ? parseRecords(`[${currentSqliteRecord.value}]`)[0]
            : null;
          if (!currentSqliteRecord || !currentRecord) {
            return {
              ok: false,
              message: 'La solicitud ya no existe en la base compartida. Recarga antes de continuar.',
            };
          }

          if (expectedUpdatedAt && currentSqliteRecord.updatedAt !== expectedUpdatedAt) {
            return {
              ok: false,
              message: 'Esta solicitud ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
            };
          }

          registerLicenciaUpdateAudit(currentRecord, draft);
          const record = buildLicenciaSinSueldoRecord(draft, nowIso(), id, currentRecord);
          const result = await saveLicenciaSinSueldoToSqlite(record, currentSqliteRecord.updatedAt);
          if (!result?.ok) {
            return { ok: false, message: result?.message ?? 'No se ha podido guardar la solicitud.' };
          }

          // Igual que en createWithConcurrencyCheck: construimos la lista a
          // partir de lo leído justo antes de guardar, sin releer después,
          // para no mezclar un registro recién persistido con una lista
          // basada en memoria local si SQLite deja de responder justo después.
          const parsedRecords = records.flatMap((sqliteRecord) =>
            sqliteRecord.id === id ? [record] : parseRecords(`[${sqliteRecord.value}]`),
          );
          mirrorRecords(parsedRecords);
          set({ records: parsedRecords });
          return { ok: true, message: result.message };
        }
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
        const records = await loadLicenciaSinSueldoRecordsFromSqlite();
        if (records !== null) {
          const currentSqliteRecord = records.find((sqliteRecord) => sqliteRecord.id === id);
          const currentRecord = currentSqliteRecord
            ? parseRecords(`[${currentSqliteRecord.value}]`)[0]
            : null;
          if (!currentSqliteRecord || !currentRecord) {
            return {
              ok: false,
              message: 'La solicitud ya no existe en la base compartida. Recarga antes de continuar.',
            };
          }

          if (expectedUpdatedAt && currentSqliteRecord.updatedAt !== expectedUpdatedAt) {
            return {
              ok: false,
              message: 'Esta solicitud ha sido modificada por otro usuario. Recarga antes de eliminarla.',
            };
          }

          const result = await deleteLicenciaSinSueldoInSqlite(currentRecord, currentSqliteRecord.updatedAt);
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

          // Mismo criterio que en create/update: usamos lo leído antes de
          // borrar, sin releer después, para no mezclar el borrado ya
          // persistido con una lista basada en memoria local si SQLite deja
          // de responder justo después.
          const parsedRecords = records
            .filter((sqliteRecord) => sqliteRecord.id !== id)
            .flatMap((sqliteRecord) => parseRecords(`[${sqliteRecord.value}]`));
          mirrorRecords(parsedRecords);
          set({ records: parsedRecords });
          return { ok: true, message: result.message };
        }
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
}));

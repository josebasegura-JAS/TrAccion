import { create } from 'zustand';
import type { Employee } from '../../plantilla/domain/employee';
import { EMPTY_TELETRABAJO_FILTERS, type TeletrabajoFilters } from '../domain/filters';
import {
  importEncuestaFromFile,
  type EncuestaParseOptions,
  type ImportEncuestaResult,
} from '../domain/importEncuesta';
import {
  importTeletrabajoPuestosFromFile,
  normalizeTeletrabajoPuesto,
  normalizeTeletrabajoPuestoDraft,
  type TeletrabajoPuesto,
  type TeletrabajoPuestoDraft,
} from '../domain/puestosTeletrabajo';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import { saveNewSharedArrayRecord, saveSharedArrayRecord } from '../../../services/sharedRecordPersistence';
import {
  addAuditEvent,
  buildAuditChanges,
  buildUpdateSummary,
} from '../../../shared/audit/auditTrail';
import {
  EMPTY_TELETRABAJO_DRAFT,
  TELETRABAJO_ESTADOS,
  TELETRABAJO_TIPOS_SOLICITUD,
  normalizeDiasTeletrabajo,
  type TeletrabajoDraft,
  type TeletrabajoSolicitud,
} from '../domain/solicitud';

const STORAGE_KEY = 'traccion.v1.teletrabajo.solicitudes';
const PUESTOS_STORAGE_KEY = 'traccion.v1.teletrabajo.puestos';

const TELETRABAJO_AUDIT_LABELS = {
  empleado: 'Empleado',
  nombreApellidos: 'Nombre y apellidos',
  puestoNomina: 'Puesto nómina',
  puestoOrganizativo: 'Puesto organizativo',
  residencia: 'Residencia',
  dni: 'DNI',
  direccionTeletrabajo: 'Dirección teletrabajo',
  estado: 'Estado',
  tipoSolicitud: 'Tipo solicitud',
  diasTeletrabajo: 'Días de teletrabajo',
  fechaSolicitud: 'Fecha solicitud',
  fechaOrdenador: 'Fecha ordenador',
  fechaCascos: 'Fecha cascos',
  periodo: 'Periodo',
  observaciones: 'Observaciones',
  validacionSeguridadInformatica: 'Validación Seguridad Informática',
  validacionPrevencion: 'Validación Prevención',
  validacionJefatura: 'Validación Jefatura',
} satisfies Partial<Record<keyof TeletrabajoDraft, string>>;

const TELETRABAJO_AUDIT_FIELDS: Array<keyof TeletrabajoDraft> = [
  'empleado',
  'nombreApellidos',
  'puestoNomina',
  'puestoOrganizativo',
  'residencia',
  'dni',
  'direccionTeletrabajo',
  'estado',
  'tipoSolicitud',
  'diasTeletrabajo',
  'fechaSolicitud',
  'fechaOrdenador',
  'fechaCascos',
  'periodo',
  'observaciones',
  'validacionSeguridadInformatica',
  'validacionPrevencion',
  'validacionJefatura',
];

function pickTeletrabajoAuditSnapshot(
  solicitud: TeletrabajoSolicitud | TeletrabajoDraft,
): Record<string, unknown> {
  return TELETRABAJO_AUDIT_FIELDS.reduce<Record<string, unknown>>((snapshot, field) => {
    snapshot[field] = solicitud[field];
    return snapshot;
  }, {});
}

function registerTeletrabajoUpdateAudit(
  previousSolicitud: TeletrabajoSolicitud,
  draft: TeletrabajoDraft,
): void {
  const normalizedDraft = normalizeDraft(draft);
  const changes = buildAuditChanges(
    pickTeletrabajoAuditSnapshot(previousSolicitud),
    pickTeletrabajoAuditSnapshot(normalizedDraft),
    TELETRABAJO_AUDIT_LABELS,
    TELETRABAJO_AUDIT_FIELDS,
  );

  if (changes.length === 0) {
    return;
  }

  addAuditEvent({
    module: 'teletrabajo',
    entityId: previousSolicitud.id,
    action: changes.some((change) => change.field === 'estado') ? 'status_changed' : 'updated',
    summary: buildUpdateSummary(changes),
    changes,
  });
}

interface TeletrabajoUpdateResult {
  ok: boolean;
  message: string;
  recordId?: string;
}

interface TeletrabajoStateStore {
  solicitudes: TeletrabajoSolicitud[];
  puestosTeletrabajo: TeletrabajoPuesto[];
  selectedSolicitudId: string;
  filters: TeletrabajoFilters;
  load: () => void;
  reloadFromStorage: () => void;
  create: (draft: TeletrabajoDraft) => void;
  createWithConcurrencyCheck: (draft: TeletrabajoDraft) => Promise<TeletrabajoUpdateResult>;
  update: (id: string, draft: TeletrabajoDraft) => void;
  updateWithConcurrencyCheck: (
    id: string,
    draft: TeletrabajoDraft,
    expectedUpdatedAt: string | null,
  ) => Promise<TeletrabajoUpdateResult>;
  importEncuesta: (
    file: File,
    employees: readonly Employee[],
    options?: EncuestaParseOptions,
  ) => Promise<ImportEncuestaResult>;
  createPuestoTeletrabajo: (draft: TeletrabajoPuestoDraft) => void;
  updatePuestoTeletrabajo: (id: string, draft: TeletrabajoPuestoDraft) => void;
  removePuestoTeletrabajo: (id: string) => void;
  importPuestosTeletrabajo: (file: File) => Promise<number>;
  importPuestosTeletrabajoDrafts: (drafts: readonly TeletrabajoPuestoDraft[]) => number;
  remove: (id: string) => void;
  removeWithConcurrencyCheck: (
    id: string,
    expectedUpdatedAt: string | null,
  ) => Promise<TeletrabajoUpdateResult>;
  selectSolicitud: (solicitudId: string) => void;
  setFilter: <K extends keyof TeletrabajoFilters>(key: K, value: TeletrabajoFilters[K]) => void;
}

function isTeletrabajoSolicitud(value: unknown): value is TeletrabajoSolicitud {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof TeletrabajoSolicitud, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.empleado === 'string' &&
    typeof candidate.nombreApellidos === 'string' &&
    typeof candidate.estado === 'string' &&
    (TELETRABAJO_ESTADOS as readonly string[]).includes(candidate.estado) &&
    typeof candidate.tipoSolicitud === 'string' &&
    (TELETRABAJO_TIPOS_SOLICITUD as readonly string[]).includes(candidate.tipoSolicitud)
  );
}

function normalizeSolicitud(solicitud: TeletrabajoSolicitud): TeletrabajoSolicitud {
  const createdAt = solicitud.createdAt ?? new Date().toISOString();

  return {
    id: solicitud.id,
    empleado: solicitud.empleado ?? EMPTY_TELETRABAJO_DRAFT.empleado,
    nombreApellidos: solicitud.nombreApellidos ?? EMPTY_TELETRABAJO_DRAFT.nombreApellidos,
    puestoNomina: solicitud.puestoNomina ?? EMPTY_TELETRABAJO_DRAFT.puestoNomina,
    puestoOrganizativo: solicitud.puestoOrganizativo ?? EMPTY_TELETRABAJO_DRAFT.puestoOrganizativo,
    residencia: solicitud.residencia ?? EMPTY_TELETRABAJO_DRAFT.residencia,
    dni: solicitud.dni ?? EMPTY_TELETRABAJO_DRAFT.dni,
    direccionTeletrabajo:
      solicitud.direccionTeletrabajo ?? EMPTY_TELETRABAJO_DRAFT.direccionTeletrabajo,
    estado: solicitud.estado,
    tipoSolicitud: solicitud.tipoSolicitud,
    diasTeletrabajo: Array.isArray(solicitud.diasTeletrabajo)
      ? normalizeDiasTeletrabajo(solicitud.diasTeletrabajo)
      : EMPTY_TELETRABAJO_DRAFT.diasTeletrabajo,
    fechaSolicitud: solicitud.fechaSolicitud ?? EMPTY_TELETRABAJO_DRAFT.fechaSolicitud,
    fechaOrdenador: solicitud.fechaOrdenador ?? EMPTY_TELETRABAJO_DRAFT.fechaOrdenador,
    fechaCascos: solicitud.fechaCascos ?? EMPTY_TELETRABAJO_DRAFT.fechaCascos,
    periodo: solicitud.periodo ?? EMPTY_TELETRABAJO_DRAFT.periodo,
    observaciones: solicitud.observaciones ?? EMPTY_TELETRABAJO_DRAFT.observaciones,
    validacionSeguridadInformatica: Boolean(solicitud.validacionSeguridadInformatica),
    validacionPrevencion: Boolean(solicitud.validacionPrevencion),
    validacionJefatura: Boolean(solicitud.validacionJefatura),
    createdAt,
    updatedAt: solicitud.updatedAt ?? createdAt,
    deletedAt: solicitud.deletedAt ?? null,
  };
}

function parseSolicitudes(stored: string | null): TeletrabajoSolicitud[] {
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isTeletrabajoSolicitud).map(normalizeSolicitud);
}

function readSolicitudes(): TeletrabajoSolicitud[] {
  return parseSolicitudes(readStorageItem(STORAGE_KEY));
}

function persistSolicitudes(solicitudes: TeletrabajoSolicitud[]): void {
  writeStorageItem(STORAGE_KEY, JSON.stringify(solicitudes));
}

function isTeletrabajoPuesto(value: unknown): value is TeletrabajoPuesto {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof TeletrabajoPuesto, unknown>>;
  return typeof candidate.id === 'string' && typeof candidate.puesto === 'string';
}

function normalizePuestoTeletrabajo(puesto: TeletrabajoPuesto): TeletrabajoPuesto {
  const createdAt = puesto.createdAt ?? new Date().toISOString();
  return {
    id: puesto.id,
    ...normalizeTeletrabajoPuestoDraft({
      puesto: puesto.puesto,
      maxSolicitudes: puesto.maxSolicitudes,
      observaciones: puesto.observaciones ?? '',
    }),
    createdAt,
    updatedAt: puesto.updatedAt ?? createdAt,
    deletedAt: puesto.deletedAt ?? null,
  };
}

function readPuestosTeletrabajo(): TeletrabajoPuesto[] {
  const stored = readStorageItem(PUESTOS_STORAGE_KEY);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isTeletrabajoPuesto).map(normalizePuestoTeletrabajo);
}

function persistPuestosTeletrabajo(puestosTeletrabajo: TeletrabajoPuesto[]): void {
  writeStorageItem(PUESTOS_STORAGE_KEY, JSON.stringify(puestosTeletrabajo));
}

function createPuestoTeletrabajoId(): string {
  return `teletrabajo-puesto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function upsertPuestosTeletrabajo(
  current: TeletrabajoPuesto[],
  drafts: TeletrabajoPuestoDraft[],
): TeletrabajoPuesto[] {
  const now = new Date().toISOString();
  const puestosByKey = new Map(
    current.map((puesto) => [normalizeTeletrabajoPuesto(puesto.puesto), puesto]),
  );

  drafts.forEach((draft) => {
    const normalizedDraft = normalizeTeletrabajoPuestoDraft(draft);
    if (!normalizedDraft.puesto) {
      return;
    }

    const key = normalizeTeletrabajoPuesto(normalizedDraft.puesto);
    const previous = puestosByKey.get(key);
    puestosByKey.set(key, {
      id: previous?.id ?? createPuestoTeletrabajoId(),
      ...normalizedDraft,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    });
  });

  return Array.from(puestosByKey.values()).sort((first, second) =>
    first.puesto.localeCompare(second.puesto, 'es', { numeric: true, sensitivity: 'base' }),
  );
}

function firstVisibleSolicitudId(solicitudes: TeletrabajoSolicitud[]): string {
  return solicitudes.find((solicitud) => !solicitud.deletedAt)?.id ?? '';
}

function createSolicitudId(): string {
  return `teletrabajo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeDraft(draft: TeletrabajoDraft): TeletrabajoDraft {
  return {
    ...draft,
    empleado: draft.empleado.trim(),
    nombreApellidos: draft.nombreApellidos.trim(),
    puestoNomina: draft.puestoNomina.trim(),
    puestoOrganizativo: draft.puestoOrganizativo.trim(),
    residencia: draft.residencia.trim(),
    dni: draft.dni.trim(),
    direccionTeletrabajo: draft.direccionTeletrabajo.trim(),
    fechaSolicitud: draft.fechaSolicitud.trim(),
    fechaOrdenador: draft.fechaOrdenador.trim(),
    fechaCascos: draft.fechaCascos.trim(),
    periodo: draft.periodo.trim(),
    observaciones: draft.observaciones.trim(),
    diasTeletrabajo: normalizeDiasTeletrabajo(draft.diasTeletrabajo),
  };
}

export const useTeletrabajoStore = create<TeletrabajoStateStore>((set, get) => ({
  solicitudes: [],
  puestosTeletrabajo: [],
  selectedSolicitudId: '',
  filters: EMPTY_TELETRABAJO_FILTERS,
  load: () => {
    const solicitudes = readSolicitudes();
    const puestosTeletrabajo = readPuestosTeletrabajo();
    set({
      solicitudes,
      puestosTeletrabajo,
      selectedSolicitudId: firstVisibleSolicitudId(solicitudes),
    });
  },
  reloadFromStorage: () => {
    const solicitudes = readSolicitudes();
    const puestosTeletrabajo = readPuestosTeletrabajo();
    set((state) => ({
      solicitudes,
      puestosTeletrabajo,
      selectedSolicitudId: solicitudes.some(
        (solicitud) => solicitud.id === state.selectedSolicitudId,
      )
        ? state.selectedSolicitudId
        : firstVisibleSolicitudId(solicitudes),
    }));
  },
  create: (draft) => {
    set((state) => {
      const now = new Date().toISOString();
      const solicitud: TeletrabajoSolicitud = {
        id: createSolicitudId(),
        ...normalizeDraft(draft),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      addAuditEvent({
        module: 'teletrabajo',
        entityId: solicitud.id,
        action: 'created',
        summary: 'Registro creado',
        changes: [],
      });
      const solicitudes = [...state.solicitudes, solicitud];
      persistSolicitudes(solicitudes);
      return { solicitudes, selectedSolicitudId: solicitud.id };
    });
  },
  createWithConcurrencyCheck: async (draft) => {
    const now = new Date().toISOString();
    const solicitud: TeletrabajoSolicitud = {
      id: createSolicitudId(),
      ...normalizeDraft(draft),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    try {
      const result = await saveNewSharedArrayRecord<TeletrabajoSolicitud>({
        storageKey: STORAGE_KEY,
        newRecord: solicitud,
        parseRecords: parseSolicitudes,
        getRecordId: (record) => record.id,
        duplicateMessage:
          'La solicitud ya existe en la base compartida. Recarga antes de continuar.',
      });

      addAuditEvent({
        module: 'teletrabajo',
        entityId: result.newRecord.id,
        action: 'created',
        summary: 'Registro creado',
        changes: [],
      });

      set({ solicitudes: result.records, selectedSolicitudId: result.newRecord.id });
      return { ok: true, message: 'Solicitud creada.', recordId: result.newRecord.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se ha podido crear la solicitud.';
      return { ok: false, message };
    }
  },
  update: (id, draft) => {
    set((state) => {
      const now = new Date().toISOString();
      const normalizedDraft = normalizeDraft(draft);
      const solicitudes = state.solicitudes.map((solicitud) => {
        if (solicitud.id !== id) {
          return solicitud;
        }

        registerTeletrabajoUpdateAudit(solicitud, normalizedDraft);
        return { ...solicitud, ...normalizedDraft, updatedAt: now };
      });
      persistSolicitudes(solicitudes);
      return { solicitudes, selectedSolicitudId: id };
    });
  },
  updateWithConcurrencyCheck: async (id, draft, expectedUpdatedAt) => {
    const normalizedDraft = normalizeDraft(draft);
    try {
      const result = await saveSharedArrayRecord<TeletrabajoSolicitud>({
        storageKey: STORAGE_KEY,
        recordId: id,
        expectedUpdatedAt,
        parseRecords: parseSolicitudes,
        getRecordId: (solicitud) => solicitud.id,
        getRecordUpdatedAt: (solicitud) => solicitud.updatedAt,
        updateRecord: (latestSolicitud) => {
          registerTeletrabajoUpdateAudit(latestSolicitud, normalizedDraft);
          return {
            ...latestSolicitud,
            ...normalizedDraft,
            updatedAt: new Date().toISOString(),
          };
        },
        missingMessage: 'La solicitud ya no existe en la base compartida. Recarga antes de continuar.',
        conflictMessage: 'Esta solicitud ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
      });
      set({ solicitudes: result.records, selectedSolicitudId: id });
      return { ok: true, message: 'Solicitud guardada.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se ha podido guardar la solicitud.';
      return { ok: false, message };
    }
  },
  importEncuesta: async (file, employees, options = {}) => {
    const result = await importEncuestaFromFile(file, employees, get().solicitudes, options);

    if (result.diagnostics.unresolvedPuestos.length > 0) {
      return result;
    }

    set(() => {
      persistSolicitudes(result.solicitudes);
      return {
        solicitudes: result.solicitudes,
        selectedSolicitudId: firstVisibleSolicitudId(result.solicitudes),
      };
    });
    return result;
  },
  createPuestoTeletrabajo: (draft) => {
    set((state) => {
      const puestosTeletrabajo = upsertPuestosTeletrabajo(state.puestosTeletrabajo, [draft]);
      persistPuestosTeletrabajo(puestosTeletrabajo);
      return { puestosTeletrabajo };
    });
  },
  updatePuestoTeletrabajo: (id, draft) => {
    set((state) => {
      const normalizedDraft = normalizeTeletrabajoPuestoDraft(draft);
      const now = new Date().toISOString();
      const puestosTeletrabajo = state.puestosTeletrabajo
        .map((puesto) =>
          puesto.id === id ? { ...puesto, ...normalizedDraft, updatedAt: now } : puesto,
        )
        .sort((first, second) =>
          first.puesto.localeCompare(second.puesto, 'es', { numeric: true, sensitivity: 'base' }),
        );
      persistPuestosTeletrabajo(puestosTeletrabajo);
      return { puestosTeletrabajo };
    });
  },
  removePuestoTeletrabajo: (id) => {
    set((state) => {
      const now = new Date().toISOString();
      const puestosTeletrabajo = state.puestosTeletrabajo.map((puesto) =>
        puesto.id === id ? { ...puesto, deletedAt: now, updatedAt: now } : puesto,
      );
      persistPuestosTeletrabajo(puestosTeletrabajo);
      return { puestosTeletrabajo };
    });
  },
  importPuestosTeletrabajo: async (file) => {
    const drafts = await importTeletrabajoPuestosFromFile(file);
    set((state) => {
      const puestosTeletrabajo = upsertPuestosTeletrabajo(state.puestosTeletrabajo, drafts);
      persistPuestosTeletrabajo(puestosTeletrabajo);
      return { puestosTeletrabajo };
    });
    return drafts.length;
  },
  importPuestosTeletrabajoDrafts: (drafts) => {
    const normalizedDrafts = drafts.map((draft) => normalizeTeletrabajoPuestoDraft(draft));
    set((state) => {
      const puestosTeletrabajo = upsertPuestosTeletrabajo(
        state.puestosTeletrabajo,
        normalizedDrafts,
      );
      persistPuestosTeletrabajo(puestosTeletrabajo);
      return { puestosTeletrabajo };
    });
    return normalizedDrafts.filter((draft) => draft.puesto.trim()).length;
  },
  remove: (id) => {
    set((state) => {
      const now = new Date().toISOString();
      const solicitudes = state.solicitudes.map((solicitud) => {
        if (solicitud.id !== id) {
          return solicitud;
        }

        addAuditEvent({
          module: 'teletrabajo',
          entityId: solicitud.id,
          action: 'deleted',
          summary: 'Registro eliminado',
          changes: [],
        });
        return { ...solicitud, deletedAt: now, updatedAt: now };
      });
      persistSolicitudes(solicitudes);
      return { solicitudes, selectedSolicitudId: firstVisibleSolicitudId(solicitudes) };
    });
  },
  removeWithConcurrencyCheck: async (id, expectedUpdatedAt) => {
    try {
      const deletedAt = new Date().toISOString();
      const result = await saveSharedArrayRecord<TeletrabajoSolicitud>({
        storageKey: STORAGE_KEY,
        recordId: id,
        expectedUpdatedAt,
        parseRecords: parseSolicitudes,
        getRecordId: (solicitud) => solicitud.id,
        getRecordUpdatedAt: (solicitud) => solicitud.updatedAt,
        updateRecord: (latestSolicitud) => {
          addAuditEvent({
            module: 'teletrabajo',
            entityId: latestSolicitud.id,
            action: 'deleted',
            summary: 'Registro eliminado',
            changes: [],
          });
          return { ...latestSolicitud, deletedAt, updatedAt: deletedAt };
        },
        missingMessage: 'La solicitud ya no existe en la base compartida. Recarga antes de continuar.',
        conflictMessage: 'Esta solicitud ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
      });
      set({
        solicitudes: result.records,
        selectedSolicitudId: firstVisibleSolicitudId(result.records),
      });
      return { ok: true, message: 'Solicitud eliminada.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se ha podido eliminar la solicitud.';
      return { ok: false, message };
    }
  },
  selectSolicitud: (solicitudId) => set({ selectedSolicitudId: solicitudId }),
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
}));

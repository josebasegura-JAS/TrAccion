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
import {
  clearPersistenceBusy,
  publishPersistenceBusy,
  readStorageItem,
  waitForNextPaint,
  writeStorageItem,
} from '../../../services/persistence';
import { saveNewSharedArrayRecord, saveSharedArrayRecord } from '../../../services/sharedRecordPersistence';
import {
  deleteTeletrabajoSolicitudInSqlite,
  hasTeletrabajoSqliteRepository,
  loadTeletrabajoRecordsFromSqlite,
  loadTeletrabajoSolicitudesFromSqlite,
  saveTeletrabajoSolicitudToSqlite,
} from './teletrabajoSqliteRepository';
import {
  enqueueAuditEvent,
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

let latestPuestosTeletrabajoUpdatedAtById = new Map<string, string>();

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
  revisado: 'Revisado',
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
  'revisado',
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

  enqueueAuditEvent({
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

interface TeletrabajoPeriodoCreationResult extends TeletrabajoUpdateResult {
  created: number;
  ignored: number;
}

interface CreateTeletrabajoPeriodoOptions {
  periodo: string;
  sourcePeriodo: string;
  copyFromPrevious: boolean;
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
  createPeriodo: (options: CreateTeletrabajoPeriodoOptions) => Promise<TeletrabajoPeriodoCreationResult>;
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
    revisado: Boolean(solicitud.revisado),
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

function parseSingleSolicitud(storageValue: string): TeletrabajoSolicitud | null {
  try {
    return parseSolicitudes(`[${storageValue}]`)[0] ?? null;
  } catch {
    return null;
  }
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


async function readPuestosTeletrabajoFromSqlite(): Promise<TeletrabajoPuesto[] | null> {
  const loader = window.traccion?.loadTeletrabajoPuestoRecords;
  if (!loader) {
    return null;
  }

  const snapshot = await loader();
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    return null;
  }

  latestPuestosTeletrabajoUpdatedAtById = new Map(
    snapshot.records.map((record) => [record.id, record.updatedAt]),
  );

  const puestos = snapshot.records
    .map((record): TeletrabajoPuesto | null => {
      try {
        const parsed: unknown = JSON.parse(record.value);
        return isTeletrabajoPuesto(parsed) ? normalizePuestoTeletrabajo(parsed) : null;
      } catch {
        return null;
      }
    })
    .filter((puesto): puesto is TeletrabajoPuesto => Boolean(puesto));

  writeStorageItem(PUESTOS_STORAGE_KEY, JSON.stringify(puestos));
  return puestos;
}

async function persistPuestosTeletrabajoInSqlite(puestosTeletrabajo: TeletrabajoPuesto[]): Promise<boolean> {
  const saver = window.traccion?.saveTeletrabajoPuestoRecordIfUnchanged;
  if (!saver) {
    return false;
  }

  for (const puesto of puestosTeletrabajo) {
    const result = await saver({
      id: puesto.id,
      value: JSON.stringify(puesto),
      expectedUpdatedAt: latestPuestosTeletrabajoUpdatedAtById.get(puesto.id) ?? null,
    });
    if (!result.ok) {
      throw new Error(result.message);
    }
    if (result.currentUpdatedAt) {
      latestPuestosTeletrabajoUpdatedAtById.set(puesto.id, result.currentUpdatedAt);
    }
  }

  return true;
}

function persistPuestosTeletrabajo(puestosTeletrabajo: TeletrabajoPuesto[]): void {
  writeStorageItem(PUESTOS_STORAGE_KEY, JSON.stringify(puestosTeletrabajo));

  void (async () => {
    try {
      await persistPuestosTeletrabajoInSqlite(puestosTeletrabajo);
    } catch (error) {
      console.warn('Puestos teletrabajables no guardados en SQLite.', error);
    }
  })();
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

function getSolicitudPeriodoKey(solicitud: Pick<TeletrabajoSolicitud, 'empleado' | 'periodo'>): string {
  return `${solicitud.empleado.trim()}::${solicitud.periodo.trim()}`;
}

function buildSolicitudesForNewPeriodo(
  solicitudes: readonly TeletrabajoSolicitud[],
  options: CreateTeletrabajoPeriodoOptions,
): { created: TeletrabajoSolicitud[]; ignored: number } {
  const periodo = options.periodo.trim();
  const sourcePeriodo = options.sourcePeriodo.trim();
  const existingKeys = new Set(
    solicitudes
      .filter((solicitud) => !solicitud.deletedAt)
      .map((solicitud) => getSolicitudPeriodoKey(solicitud)),
  );

  if (!options.copyFromPrevious || !sourcePeriodo) {
    return { created: [], ignored: 0 };
  }

  const now = new Date().toISOString();
  const sourceSolicitudes = solicitudes.filter(
    (solicitud) =>
      !solicitud.deletedAt &&
      solicitud.periodo.trim() === sourcePeriodo &&
      (solicitud.estado === 'aprobada' || solicitud.estado === 'analizada'),
  );

  const created: TeletrabajoSolicitud[] = [];
  let ignored = 0;

  sourceSolicitudes.forEach((solicitud) => {
    const candidate: TeletrabajoSolicitud = {
      ...solicitud,
      id: createSolicitudId(),
      periodo,
      estado: 'pendiente',
      tipoSolicitud: 'renovacion',
      fechaSolicitud: '',
      revisado: false,
      validacionSeguridadInformatica: false,
      validacionPrevencion: false,
      validacionJefatura: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const key = getSolicitudPeriodoKey(candidate);
    if (existingKeys.has(key)) {
      ignored += 1;
      return;
    }
    existingKeys.add(key);
    created.push(candidate);
  });

  return { created, ignored };
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
    revisado: Boolean(draft.revisado),
  };
}

function hasTeletrabajoDraftChanges(
  solicitud: TeletrabajoSolicitud,
  normalizedDraft: TeletrabajoDraft,
): boolean {
  return TELETRABAJO_AUDIT_FIELDS.some((field) => {
    const previousValue = solicitud[field];
    const nextValue = normalizedDraft[field];

    if (Array.isArray(previousValue) || Array.isArray(nextValue)) {
      return JSON.stringify(previousValue ?? []) !== JSON.stringify(nextValue ?? []);
    }

    return previousValue !== nextValue;
  });
}

async function withTeletrabajoBusy<T>(message: string, operation: () => Promise<T>): Promise<T> {
  publishPersistenceBusy(STORAGE_KEY, message);
  await waitForNextPaint();

  try {
    return await operation();
  } finally {
    clearPersistenceBusy(STORAGE_KEY, 'Operación de Teletrabajo finalizada.');
  }
}

function buildTeletrabajoState(
  solicitudes: TeletrabajoSolicitud[],
  puestosTeletrabajo: TeletrabajoPuesto[],
  selectedSolicitudId?: string,
): Pick<TeletrabajoStateStore, 'solicitudes' | 'puestosTeletrabajo' | 'selectedSolicitudId'> {
  return {
    solicitudes,
    puestosTeletrabajo,
    selectedSolicitudId: selectedSolicitudId && solicitudes.some((solicitud) => solicitud.id === selectedSolicitudId)
      ? selectedSolicitudId
      : firstVisibleSolicitudId(solicitudes),
  };
}

async function loadSolicitudesFromSqliteOrStorage(): Promise<TeletrabajoSolicitud[]> {
  if (hasTeletrabajoSqliteRepository()) {
    const sqliteSolicitudes = await loadTeletrabajoSolicitudesFromSqlite(parseSolicitudes);
    if (sqliteSolicitudes !== null) {
      return sqliteSolicitudes;
    }
  }

  return readSolicitudes();
}

function logTeletrabajoPersistenceError(action: string, error: unknown): void {
  console.error(`[${action}] No se ha podido acceder a Teletrabajo en SQLite.`, error);
}

export const useTeletrabajoStore = create<TeletrabajoStateStore>((set, get) => ({
  solicitudes: [],
  puestosTeletrabajo: [],
  selectedSolicitudId: '',
  filters: EMPTY_TELETRABAJO_FILTERS,
  load: () => {
    const solicitudes = readSolicitudes();
    const puestosTeletrabajo = readPuestosTeletrabajo();
    set(buildTeletrabajoState(solicitudes, puestosTeletrabajo));
    void readPuestosTeletrabajoFromSqlite()
      .then((sqlitePuestos) => {
        if (sqlitePuestos) {
          set((state) => buildTeletrabajoState(state.solicitudes, sqlitePuestos, state.selectedSolicitudId));
        }
      })
      .catch((error) => console.warn('Puestos teletrabajables no cargados desde SQLite.', error));
    void loadSolicitudesFromSqliteOrStorage()
      .then((nextSolicitudes) =>
        set((state) => buildTeletrabajoState(nextSolicitudes, state.puestosTeletrabajo, state.selectedSolicitudId)),
      )
      .catch((error) => logTeletrabajoPersistenceError('loadTeletrabajo', error));
  },
  reloadFromStorage: () => {
    const solicitudes = readSolicitudes();
    const puestosTeletrabajo = readPuestosTeletrabajo();
    set((state) => buildTeletrabajoState(solicitudes, puestosTeletrabajo, state.selectedSolicitudId));
    void readPuestosTeletrabajoFromSqlite()
      .then((sqlitePuestos) => {
        if (sqlitePuestos) {
          set((state) => buildTeletrabajoState(state.solicitudes, sqlitePuestos, state.selectedSolicitudId));
        }
      })
      .catch((error) => console.warn('Puestos teletrabajables no recargados desde SQLite.', error));
    void loadSolicitudesFromSqliteOrStorage()
      .then((nextSolicitudes) =>
        set((state) => buildTeletrabajoState(nextSolicitudes, state.puestosTeletrabajo, state.selectedSolicitudId)),
      )
      .catch((error) => logTeletrabajoPersistenceError('reloadTeletrabajoFromStorage', error));
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
      enqueueAuditEvent({
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
      return await withTeletrabajoBusy('Guardando solicitud de Teletrabajo...', async () => {
        if (hasTeletrabajoSqliteRepository()) {
          const records = await loadTeletrabajoRecordsFromSqlite();
          if (records !== null) {
            if (records.some((record) => record.id === solicitud.id)) {
              throw new Error('La solicitud ya existe en la base compartida. Recarga antes de continuar.');
            }

            const saveResult = await saveTeletrabajoSolicitudToSqlite(solicitud, null);
            if (!saveResult?.ok) {
              throw new Error(saveResult?.message ?? 'No se ha podido crear la solicitud.');
            }

            enqueueAuditEvent({
              module: 'teletrabajo',
              entityId: solicitud.id,
              action: 'created',
              summary: 'Registro creado',
              changes: [],
            });

            const solicitudes = [
              ...records.flatMap((record) => parseSolicitudes(`[${record.value}]`)),
              solicitud,
            ];
            set({ solicitudes, selectedSolicitudId: solicitud.id });
            return { ok: true, message: 'Solicitud creada.', recordId: solicitud.id };
          }
        }

        const result = await saveNewSharedArrayRecord<TeletrabajoSolicitud>({
          storageKey: STORAGE_KEY,
          newRecord: solicitud,
          parseRecords: parseSolicitudes,
          getRecordId: (record) => record.id,
          duplicateMessage:
            'La solicitud ya existe en la base compartida. Recarga antes de continuar.',
        });

        enqueueAuditEvent({
          module: 'teletrabajo',
          entityId: result.newRecord.id,
          action: 'created',
          summary: 'Registro creado',
          changes: [],
        });

        set({ solicitudes: result.records, selectedSolicitudId: result.newRecord.id });
        return { ok: true, message: 'Solicitud creada.', recordId: result.newRecord.id };
      });
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
    const currentSolicitud = get().solicitudes.find((solicitud) => solicitud.id === id);

    if (currentSolicitud && !hasTeletrabajoDraftChanges(currentSolicitud, normalizedDraft)) {
      return { ok: true, message: 'Sin cambios que guardar.' };
    }

    try {
      return await withTeletrabajoBusy('Guardando solicitud de Teletrabajo...', async () => {
        if (hasTeletrabajoSqliteRepository()) {
          const records = await loadTeletrabajoRecordsFromSqlite();
          if (records !== null) {
            const currentRecord = records.find((record) => record.id === id);
            const latestSolicitud = currentRecord ? parseSingleSolicitud(currentRecord.value) : null;
            if (!currentRecord || !latestSolicitud) {
              throw new Error('La solicitud ya no existe en la base compartida. Recarga antes de continuar.');
            }

            if (expectedUpdatedAt && currentRecord.updatedAt !== expectedUpdatedAt) {
              throw new Error('Esta solicitud ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.');
            }

            registerTeletrabajoUpdateAudit(latestSolicitud, normalizedDraft);
            const updatedSolicitud: TeletrabajoSolicitud = {
              ...latestSolicitud,
              ...normalizedDraft,
              updatedAt: new Date().toISOString(),
            };
            const saveResult = await saveTeletrabajoSolicitudToSqlite(
              updatedSolicitud,
              currentRecord.updatedAt,
            );
            if (!saveResult?.ok) {
              throw new Error(saveResult?.message ?? 'No se ha podido guardar la solicitud.');
            }

            const solicitudes = records.flatMap((record) =>
              record.id === id ? [updatedSolicitud] : parseSolicitudes(`[${record.value}]`),
            );
            set({ solicitudes, selectedSolicitudId: id });
            return { ok: true, message: 'Solicitud guardada.' };
          }
        }

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
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se ha podido guardar la solicitud.';
      return { ok: false, message };
    }
  },
  importEncuesta: async (file, employees, options = {}) => {
    const baseSolicitudes = await loadSolicitudesFromSqliteOrStorage();
    const result = await importEncuestaFromFile(file, employees, baseSolicitudes, options);

    if (result.diagnostics.unresolvedPuestos.length > 0) {
      return result;
    }

    if (hasTeletrabajoSqliteRepository()) {
      const records = await loadTeletrabajoRecordsFromSqlite();
      if (records !== null) {
        const expectedUpdatedAtById = new Map(records.map((record) => [record.id, record.updatedAt]));
        for (const solicitud of result.solicitudes) {
          const saveResult = await saveTeletrabajoSolicitudToSqlite(
            solicitud,
            expectedUpdatedAtById.get(solicitud.id) ?? null,
          );
          if (!saveResult?.ok) {
            throw new Error(saveResult?.message ?? 'No se ha podido importar la encuesta en SQLite.');
          }
        }
        set({
          solicitudes: result.solicitudes,
          selectedSolicitudId: firstVisibleSolicitudId(result.solicitudes),
        });
        return result;
      }
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
  createPeriodo: async (options) => {
    const periodo = options.periodo.trim();
    const sourcePeriodo = options.sourcePeriodo.trim();

    if (!periodo) {
      return { ok: false, message: 'Indica el nombre del nuevo periodo.', created: 0, ignored: 0 };
    }

    if (options.copyFromPrevious && !sourcePeriodo) {
      return { ok: false, message: 'Selecciona el periodo origen.', created: 0, ignored: 0 };
    }

    try {
      return await withTeletrabajoBusy('Creando nuevo periodo de Teletrabajo...', async () => {
        const baseSolicitudes = await loadSolicitudesFromSqliteOrStorage();
        const { created, ignored } = buildSolicitudesForNewPeriodo(baseSolicitudes, {
          periodo,
          sourcePeriodo,
          copyFromPrevious: options.copyFromPrevious,
        });

        if (options.copyFromPrevious && created.length === 0) {
          const message = ignored > 0
            ? `No se han creado solicitudes nuevas: ya existían ${ignored} empleado${ignored === 1 ? '' : 's'} en el periodo ${periodo}.`
            : `No hay solicitudes aprobadas o analizadas en el periodo ${sourcePeriodo}.`;
          return { ok: false, message, created: 0, ignored };
        }

        if (hasTeletrabajoSqliteRepository()) {
          const records = await loadTeletrabajoRecordsFromSqlite();
          if (records !== null) {
            for (const solicitud of created) {
              const saveResult = await saveTeletrabajoSolicitudToSqlite(solicitud, null);
              if (!saveResult?.ok) {
                throw new Error(saveResult?.message ?? 'No se ha podido crear el periodo en SQLite.');
              }
              enqueueAuditEvent({
                module: 'teletrabajo',
                entityId: solicitud.id,
                action: 'created',
                summary: `Registro creado para el periodo ${periodo}`,
                changes: [],
              });
            }

            const solicitudes = [...baseSolicitudes, ...created];
            set((state) => ({
              solicitudes,
              selectedSolicitudId: created[0]?.id ?? state.selectedSolicitudId,
              filters: { ...state.filters, periodo },
            }));
            return {
              ok: true,
              message: created.length > 0
                ? `Periodo ${periodo} creado con ${created.length} solicitud${created.length === 1 ? '' : 'es'} renovada${created.length === 1 ? '' : 's'}.`
                : `Periodo ${periodo} preparado. Crea nuevas solicitudes manuales con ese periodo.`,
              created: created.length,
              ignored,
            };
          }
        }

        const solicitudes = [...baseSolicitudes, ...created];
        persistSolicitudes(solicitudes);
        created.forEach((solicitud) => {
          enqueueAuditEvent({
            module: 'teletrabajo',
            entityId: solicitud.id,
            action: 'created',
            summary: `Registro creado para el periodo ${periodo}`,
            changes: [],
          });
        });
        set((state) => ({
          solicitudes,
          selectedSolicitudId: created[0]?.id ?? state.selectedSolicitudId,
          filters: { ...state.filters, periodo },
        }));
        return {
          ok: true,
          message: created.length > 0
            ? `Periodo ${periodo} creado con ${created.length} solicitud${created.length === 1 ? '' : 'es'} renovada${created.length === 1 ? '' : 's'}.`
            : `Periodo ${periodo} preparado. Crea nuevas solicitudes manuales con ese periodo.`,
          created: created.length,
          ignored,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se ha podido crear el periodo.';
      return { ok: false, message, created: 0, ignored: 0 };
    }
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

        enqueueAuditEvent({
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
      return await withTeletrabajoBusy('Eliminando solicitud de Teletrabajo...', async () => {
        if (hasTeletrabajoSqliteRepository()) {
          const records = await loadTeletrabajoRecordsFromSqlite();
          if (records !== null) {
            const currentRecord = records.find((record) => record.id === id);
            const latestSolicitud = currentRecord ? parseSingleSolicitud(currentRecord.value) : null;
            if (!currentRecord || !latestSolicitud) {
              throw new Error('La solicitud ya no existe en la base compartida. Recarga antes de continuar.');
            }

            if (expectedUpdatedAt && currentRecord.updatedAt !== expectedUpdatedAt) {
              throw new Error('Esta solicitud ha sido modificada por otro usuario. Recarga antes de eliminarla.');
            }

            const saveResult = await deleteTeletrabajoSolicitudInSqlite(
              latestSolicitud,
              currentRecord.updatedAt,
            );
            if (!saveResult?.ok) {
              throw new Error(saveResult?.message ?? 'No se ha podido eliminar la solicitud.');
            }

            enqueueAuditEvent({
              module: 'teletrabajo',
              entityId: latestSolicitud.id,
              action: 'deleted',
              summary: 'Registro eliminado',
              changes: [],
            });

            const solicitudes = records
              .filter((record) => record.id !== id)
              .flatMap((record) => parseSolicitudes(`[${record.value}]`));
            set({
              solicitudes,
              selectedSolicitudId: firstVisibleSolicitudId(solicitudes),
            });
            return { ok: true, message: 'Solicitud eliminada.' };
          }
        }

        const deletedAt = new Date().toISOString();
        const result = await saveSharedArrayRecord<TeletrabajoSolicitud>({
          storageKey: STORAGE_KEY,
          recordId: id,
          expectedUpdatedAt,
          parseRecords: parseSolicitudes,
          getRecordId: (solicitud) => solicitud.id,
          getRecordUpdatedAt: (solicitud) => solicitud.updatedAt,
          updateRecord: (latestSolicitud) => {
            enqueueAuditEvent({
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
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se ha podido eliminar la solicitud.';
      return { ok: false, message };
    }
  },
  selectSolicitud: (solicitudId) => set({ selectedSolicitudId: solicitudId }),
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
}));

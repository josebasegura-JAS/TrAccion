import { create } from 'zustand';
import type { Employee } from '../../plantilla/domain/employee';
import { EMPTY_TELETRABAJO_FILTERS, type TeletrabajoFilters } from '../domain/filters';
import {
  importEncuestaFromFile,
  importHistoricoTeletrabajoFromFile,
  type EncuestaParseOptions,
  type ImportEncuestaResult,
  type ImportHistoricoTeletrabajoResult,
} from '../domain/importEncuesta';
import {
  isGrupoCobertura,
  normalizeGrupoCoberturaDraft,
  normalizeGrupoCoberturaNombre,
  type GrupoCobertura,
  type GrupoCoberturaDraft,
} from '../domain/gruposCobertura';
import {
  importTeletrabajoPuestosFromFile,
  normalizeTeletrabajoPuesto,
  normalizeTeletrabajoPuestoDraft,
  type TeletrabajoPuesto,
  type TeletrabajoPuestoDraft,
  type TeletrabajoPuestoImportRow,
} from '../domain/puestosTeletrabajo';
import {
  clearPersistenceBusy,
  publishPersistenceBusy,
  readStorageItem,
  waitForNextPaint,
  writeStorageItem,
} from '../../../services/persistence';
import {
  saveNewSharedArrayRecord,
  saveSharedArrayRecord,
} from '../../../services/sharedRecordPersistence';
import {
  deleteTeletrabajoSolicitudInSqlite,
  hasTeletrabajoSqliteRepository,
  loadTeletrabajoRecordsFromSqlite,
  loadTeletrabajoSolicitudesFromSqlite,
  saveTeletrabajoSolicitudesToSqlite,
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
const GRUPOS_COBERTURA_STORAGE_KEY = 'traccion.v1.teletrabajo.gruposCobertura';

let latestPuestosTeletrabajoUpdatedAtById = new Map<string, string>();
let latestGruposCoberturaUpdatedAtById = new Map<string, string>();

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
  observacionesRrll: 'Observaciones RRLL',
  validacionSeguridadInformatica: 'Validación Seguridad Informática',
  validacionPrevencion: 'Validación Prevención',
  validacionJefatura: 'Validación Jefatura',
  validacionDireccion: 'Validación Dirección',
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
  'observacionesRrll',
  'validacionSeguridadInformatica',
  'validacionPrevencion',
  'validacionJefatura',
  'validacionDireccion',
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

interface PendingHistoricoImport extends ImportHistoricoTeletrabajoResult {
  /** Solicitudes existentes en el momento de calcular la previsualización, usadas para auditoría/concurrencia al confirmar. */
  baseSolicitudes: TeletrabajoSolicitud[];
}

interface TeletrabajoStateStore {
  solicitudes: TeletrabajoSolicitud[];
  puestosTeletrabajo: TeletrabajoPuesto[];
  gruposCobertura: GrupoCobertura[];
  selectedSolicitudId: string;
  filters: TeletrabajoFilters;
  pendingHistoricoImport: PendingHistoricoImport | null;
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
  previewImportHistorico: (
    file: File,
    employees: readonly Employee[],
  ) => Promise<ImportHistoricoTeletrabajoResult>;
  confirmImportHistorico: () => Promise<ImportHistoricoTeletrabajoResult>;
  cancelImportHistorico: () => void;
  createPeriodo: (
    options: CreateTeletrabajoPeriodoOptions,
  ) => Promise<TeletrabajoPeriodoCreationResult>;
  createPuestoTeletrabajo: (draft: TeletrabajoPuestoDraft) => Promise<TeletrabajoUpdateResult>;
  updatePuestoTeletrabajo: (
    id: string,
    draft: TeletrabajoPuestoDraft,
  ) => Promise<TeletrabajoUpdateResult>;
  removePuestoTeletrabajo: (id: string) => Promise<TeletrabajoUpdateResult>;
  importPuestosTeletrabajo: (file: File) => Promise<number>;
  importPuestosTeletrabajoDrafts: (rows: readonly TeletrabajoPuestoImportRow[]) => number;
  createGrupoCobertura: (draft: GrupoCoberturaDraft) => Promise<TeletrabajoUpdateResult>;
  updateGrupoCobertura: (
    id: string,
    draft: GrupoCoberturaDraft,
  ) => Promise<TeletrabajoUpdateResult>;
  removeGrupoCobertura: (id: string) => Promise<TeletrabajoUpdateResult>;
  setPuestoGrupoCobertura: (
    puestoId: string,
    grupoCoberturaId: string | null,
  ) => Promise<TeletrabajoUpdateResult>;
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
    observacionesRrll: solicitud.observacionesRrll ?? EMPTY_TELETRABAJO_DRAFT.observacionesRrll,
    validacionSeguridadInformatica: Boolean(solicitud.validacionSeguridadInformatica),
    validacionPrevencion: Boolean(solicitud.validacionPrevencion),
    validacionJefatura: Boolean(solicitud.validacionJefatura),
    validacionDireccion: Boolean(solicitud.validacionDireccion),
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
      dotacionComputable: puesto.dotacionComputable ?? 0,
      grupoCoberturaId: puesto.grupoCoberturaId ?? null,
      observaciones: puesto.observaciones ?? '',
    }),
    createdAt,
    updatedAt: puesto.updatedAt ?? createdAt,
    deletedAt: puesto.deletedAt ?? null,
  };
}

/**
 * Lee el campo de texto libre `grupoCobertura` que pudiera venir de un
 * registro legacy guardado antes de la migración a Grupos de cobertura como
 * entidad propia. Los registros nuevos no tienen esta propiedad.
 */
function readLegacyGrupoCoberturaNombre(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return '';
  }
  const candidate = (value as { grupoCobertura?: unknown }).grupoCobertura;
  return typeof candidate === 'string' ? candidate.trim() : '';
}

/**
 * Migra, una sola vez, los puestos que aún tengan el antiguo campo de texto
 * libre `grupoCobertura` (de instalaciones previas a esta versión) creando un
 * Grupo de cobertura real por cada nombre de texto distinto encontrado, con
 * la presencialidad mínima igual al máximo declarado entre esos puestos
 * (igual que calculaba antes el propio código), y enlazando cada puesto al
 * grupo resultante mediante grupoCoberturaId.
 */
function migrateLegacyGruposCobertura(
  rawPuestos: unknown[],
  puestos: TeletrabajoPuesto[],
  gruposExistentes: GrupoCobertura[],
): { puestos: TeletrabajoPuesto[]; gruposCobertura: GrupoCobertura[]; migrated: boolean } {
  const legacyNombreById = new Map<string, string>();
  rawPuestos.forEach((raw) => {
    if (!raw || typeof raw !== 'object') {
      return;
    }
    const id = (raw as { id?: unknown }).id;
    const nombre = readLegacyGrupoCoberturaNombre(raw);
    if (typeof id === 'string' && nombre) {
      legacyNombreById.set(id, nombre);
    }
  });

  if (legacyNombreById.size === 0) {
    return { puestos, gruposCobertura: gruposExistentes, migrated: false };
  }

  const now = new Date().toISOString();
  const gruposByNombreKey = new Map<string, GrupoCobertura>(
    gruposExistentes
      .filter((grupo) => !grupo.deletedAt)
      .map((grupo) => [normalizeGrupoCoberturaNombre(grupo.nombre), grupo]),
  );
  const maximaPorNombreKey = new Map<string, number>();

  puestos.forEach((puesto) => {
    const nombre = legacyNombreById.get(puesto.id);
    if (!nombre) {
      return;
    }
    const key = normalizeGrupoCoberturaNombre(nombre);
    maximaPorNombreKey.set(key, Math.max(maximaPorNombreKey.get(key) ?? 0, puesto.maxSolicitudes ?? 0));
  });

  const gruposNuevos: GrupoCobertura[] = [];
  const puestosMigrados = puestos.map((puesto) => {
    const nombre = legacyNombreById.get(puesto.id);
    if (!nombre) {
      return puesto;
    }

    const key = normalizeGrupoCoberturaNombre(nombre);
    let grupo = gruposByNombreKey.get(key);
    if (!grupo) {
      grupo = {
        id: createGrupoCoberturaId(),
        nombre,
        presencialidadMinima: maximaPorNombreKey.get(key) ?? 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      gruposByNombreKey.set(key, grupo);
      gruposNuevos.push(grupo);
    }

    return { ...puesto, grupoCoberturaId: grupo.id };
  });

  return {
    puestos: puestosMigrados,
    gruposCobertura: [...gruposExistentes, ...gruposNuevos],
    migrated: true,
  };
}

function readPuestosTeletrabajo(): { puestos: TeletrabajoPuesto[]; rawRecords: unknown[] } {
  const stored = readStorageItem(PUESTOS_STORAGE_KEY);
  if (!stored) {
    return { puestos: [], rawRecords: [] };
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return { puestos: [], rawRecords: [] };
  }

  return {
    puestos: parsed.filter(isTeletrabajoPuesto).map(normalizePuestoTeletrabajo),
    rawRecords: parsed,
  };
}

async function readPuestosTeletrabajoFromSqlite(): Promise<{ puestos: TeletrabajoPuesto[]; rawRecords: unknown[] } | null> {
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

  const rawRecords: unknown[] = [];
  const puestos = snapshot.records
    .map((record): TeletrabajoPuesto | null => {
      try {
        const parsed: unknown = JSON.parse(record.value);
        rawRecords.push(parsed);
        return isTeletrabajoPuesto(parsed) ? normalizePuestoTeletrabajo(parsed) : null;
      } catch {
        return null;
      }
    })
    .filter((puesto): puesto is TeletrabajoPuesto => Boolean(puesto));

  return { puestos, rawRecords };
}

async function persistPuestosTeletrabajoInSqlite(
  puestosTeletrabajo: TeletrabajoPuesto[],
): Promise<boolean> {
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

/**
 * Persiste TODA la lista de puestos en localStorage y, en segundo plano, en
 * SQLite registro a registro. Pensada solo para operaciones que legítimamente
 * tocan muchos puestos a la vez (migración legacy, importación masiva), donde
 * el resultado se ve en el siguiente reload. NO usar para una edición de un
 * solo puesto desde el modal: ahí se debe usar persistPuestoTeletrabajoRecord,
 * que guarda solo ese registro y permite avisar al usuario si hay conflicto.
 */
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

/**
 * Persiste un único puesto (creación, edición o baja lógica de un registro
 * concreto desde el modal). A diferencia de persistPuestosTeletrabajo, espera
 * el resultado real de SQLite y lo devuelve, para que el caller pueda avisar
 * al usuario si otra persona modificó ese mismo puesto mientras tanto.
 */
async function persistPuestoTeletrabajoRecord(
  allPuestos: TeletrabajoPuesto[],
  puesto: TeletrabajoPuesto,
): Promise<{ ok: boolean; message: string }> {
  writeStorageItem(PUESTOS_STORAGE_KEY, JSON.stringify(allPuestos));

  const saver = window.traccion?.saveTeletrabajoPuestoRecordIfUnchanged;
  if (!saver) {
    return { ok: true, message: '' };
  }

  try {
    const result = await saver({
      id: puesto.id,
      value: JSON.stringify(puesto),
      expectedUpdatedAt: latestPuestosTeletrabajoUpdatedAtById.get(puesto.id) ?? null,
    });
    if (!result.ok) {
      return {
        ok: false,
        message:
          result.message ||
          'Este puesto ha sido modificado por otra persona. Recarga antes de continuar.',
      };
    }
    if (result.currentUpdatedAt) {
      latestPuestosTeletrabajoUpdatedAtById.set(puesto.id, result.currentUpdatedAt);
    }
    return { ok: true, message: '' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No se ha podido guardar el puesto.',
    };
  }
}

function createPuestoTeletrabajoId(): string {
  return `teletrabajo-puesto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createGrupoCoberturaId(): string {
  return `teletrabajo-grupo-cobertura-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeGrupoCobertura(grupo: GrupoCobertura): GrupoCobertura {
  const createdAt = grupo.createdAt ?? new Date().toISOString();
  return {
    id: grupo.id,
    ...normalizeGrupoCoberturaDraft({
      nombre: grupo.nombre,
      presencialidadMinima: grupo.presencialidadMinima,
    }),
    createdAt,
    updatedAt: grupo.updatedAt ?? createdAt,
    deletedAt: grupo.deletedAt ?? null,
  };
}

function readGruposCobertura(): GrupoCobertura[] {
  const stored = readStorageItem(GRUPOS_COBERTURA_STORAGE_KEY);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isGrupoCobertura).map(normalizeGrupoCobertura);
}

async function readGruposCoberturaFromSqlite(): Promise<GrupoCobertura[] | null> {
  const loader = window.traccion?.loadTeletrabajoGrupoCoberturaRecords;
  if (!loader) {
    return null;
  }

  const snapshot = await loader();
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    return null;
  }

  latestGruposCoberturaUpdatedAtById = new Map(
    snapshot.records.map((record) => [record.id, record.updatedAt]),
  );

  return snapshot.records
    .map((record): GrupoCobertura | null => {
      try {
        const parsed: unknown = JSON.parse(record.value);
        return isGrupoCobertura(parsed) ? normalizeGrupoCobertura(parsed) : null;
      } catch {
        return null;
      }
    })
    .filter((grupo): grupo is GrupoCobertura => Boolean(grupo));
}

async function persistGruposCoberturaInSqlite(gruposCobertura: GrupoCobertura[]): Promise<boolean> {
  const saver = window.traccion?.saveTeletrabajoGrupoCoberturaRecordIfUnchanged;
  if (!saver) {
    return false;
  }

  for (const grupo of gruposCobertura) {
    const result = await saver({
      id: grupo.id,
      value: JSON.stringify(grupo),
      expectedUpdatedAt: latestGruposCoberturaUpdatedAtById.get(grupo.id) ?? null,
    });
    if (!result.ok) {
      throw new Error(result.message);
    }
    if (result.currentUpdatedAt) {
      latestGruposCoberturaUpdatedAtById.set(grupo.id, result.currentUpdatedAt);
    }
  }

  return true;
}

/**
 * Persiste TODA la lista de grupos en localStorage y, en segundo plano, en
 * SQLite registro a registro. Pensada solo para operaciones que legítimamente
 * tocan muchos grupos a la vez (migración legacy), donde el resultado se ve
 * en el siguiente reload. NO usar para una edición de un solo grupo desde el
 * modal: ahí se debe usar persistGrupoCoberturaRecord, que guarda solo ese
 * registro y permite avisar al usuario si hay conflicto.
 */
function persistGruposCobertura(gruposCobertura: GrupoCobertura[]): void {
  writeStorageItem(GRUPOS_COBERTURA_STORAGE_KEY, JSON.stringify(gruposCobertura));

  void (async () => {
    try {
      await persistGruposCoberturaInSqlite(gruposCobertura);
    } catch (error) {
      console.warn('Grupos de cobertura no guardados en SQLite.', error);
    }
  })();
}

/**
 * Persiste un único grupo de cobertura (creación, edición o baja lógica de un
 * registro concreto desde el modal). A diferencia de persistGruposCobertura,
 * espera el resultado real de SQLite y lo devuelve, para que el caller pueda
 * avisar al usuario si otra persona modificó ese mismo grupo mientras tanto.
 */
async function persistGrupoCoberturaRecord(
  allGrupos: GrupoCobertura[],
  grupo: GrupoCobertura,
): Promise<{ ok: boolean; message: string }> {
  writeStorageItem(GRUPOS_COBERTURA_STORAGE_KEY, JSON.stringify(allGrupos));

  const saver = window.traccion?.saveTeletrabajoGrupoCoberturaRecordIfUnchanged;
  if (!saver) {
    return { ok: true, message: '' };
  }

  try {
    const result = await saver({
      id: grupo.id,
      value: JSON.stringify(grupo),
      expectedUpdatedAt: latestGruposCoberturaUpdatedAtById.get(grupo.id) ?? null,
    });
    if (!result.ok) {
      return {
        ok: false,
        message:
          result.message ||
          'Este grupo de cobertura ha sido modificado por otra persona. Recarga antes de continuar.',
      };
    }
    if (result.currentUpdatedAt) {
      latestGruposCoberturaUpdatedAtById.set(grupo.id, result.currentUpdatedAt);
    }
    return { ok: true, message: '' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No se ha podido guardar el grupo de cobertura.',
    };
  }
}

async function loadGruposCoberturaFromSqliteOrStorage(): Promise<GrupoCobertura[]> {
  const sqliteGrupos = await readGruposCoberturaFromSqlite();
  return sqliteGrupos ?? readGruposCobertura();
}

function areGruposCoberturaEquivalent(left: GrupoCobertura[], right: GrupoCobertura[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function upsertPuestosTeletrabajo(
  current: TeletrabajoPuesto[],
  drafts: readonly Partial<TeletrabajoPuestoDraft>[],
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

function getSolicitudPeriodoKey(
  solicitud: Pick<TeletrabajoSolicitud, 'empleado' | 'periodo'>,
): string {
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
      validacionJefatura: EMPTY_TELETRABAJO_DRAFT.validacionJefatura,
      validacionDireccion: false,
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
    observacionesRrll: (draft.observacionesRrll ?? '').trim(),
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
  gruposCobertura: GrupoCobertura[],
  selectedSolicitudId?: string,
): Pick<
  TeletrabajoStateStore,
  'solicitudes' | 'puestosTeletrabajo' | 'gruposCobertura' | 'selectedSolicitudId'
> {
  return {
    solicitudes,
    puestosTeletrabajo,
    gruposCobertura,
    selectedSolicitudId:
      selectedSolicitudId && solicitudes.some((solicitud) => solicitud.id === selectedSolicitudId)
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

function areSolicitudesEquivalent(
  left: TeletrabajoSolicitud[],
  right: TeletrabajoSolicitud[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function arePuestosTeletrabajoEquivalent(
  left: TeletrabajoPuesto[],
  right: TeletrabajoPuesto[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Carga puestos y grupos de cobertura juntos y, si encuentra puestos con el
 * antiguo campo de texto libre `grupoCobertura` sin migrar todavía, crea los
 * grupos correspondientes y persiste tanto los puestos enlazados como los
 * grupos nuevos. Se ejecuta tanto en el arranque (load) como en cada
 * recarga (reloadFromStorage) pero es una operación idempotente: una vez
 * migrado un puesto, ya no vuelve a tener el campo legacy en el registro guardado.
 */
async function loadPuestosYGruposConMigracion(): Promise<{
  puestos: TeletrabajoPuesto[];
  gruposCobertura: GrupoCobertura[];
}> {
  const [puestosResult, gruposCobertura] = await Promise.all([
    readPuestosTeletrabajoFromSqlite().then((result) => result ?? readPuestosTeletrabajo()),
    loadGruposCoberturaFromSqliteOrStorage(),
  ]);

  const migrated = migrateLegacyGruposCobertura(
    puestosResult.rawRecords,
    puestosResult.puestos,
    gruposCobertura,
  );

  if (migrated.migrated) {
    const gruposNuevosCount = migrated.gruposCobertura.length - gruposCobertura.length;
    persistGruposCobertura(migrated.gruposCobertura);
    persistPuestosTeletrabajo(migrated.puestos);
    console.warn(
      `Migrados ${gruposNuevosCount} grupo(s) de cobertura desde el campo de texto libre legacy.`,
    );
  }

  return { puestos: migrated.puestos, gruposCobertura: migrated.gruposCobertura };
}

/**
 * Resuelve una lista de nombres de grupo de cobertura (tal como vienen del
 * fichero importado) a ids de grupos existentes, creando un grupo nuevo (con
 * presencialidad mínima 0, a completar luego en el modal de grupos) por cada
 * nombre que no coincida con ninguno ya dado de alta.
 */
function resolveGrupoCoberturaNombresToIds(
  nombres: readonly string[],
  gruposExistentes: GrupoCobertura[],
): { gruposCobertura: GrupoCobertura[]; idByNombreKey: Map<string, string> } {
  const now = new Date().toISOString();
  const gruposByNombreKey = new Map<string, GrupoCobertura>(
    gruposExistentes
      .filter((grupo) => !grupo.deletedAt)
      .map((grupo) => [normalizeGrupoCoberturaNombre(grupo.nombre), grupo]),
  );
  const idByNombreKey = new Map<string, string>();
  const gruposNuevos: GrupoCobertura[] = [];

  nombres.forEach((nombre) => {
    const trimmed = (nombre ?? '').trim();
    if (!trimmed) {
      return;
    }
    const key = normalizeGrupoCoberturaNombre(trimmed);
    let grupo = gruposByNombreKey.get(key);
    if (!grupo) {
      grupo = {
        id: createGrupoCoberturaId(),
        nombre: trimmed,
        presencialidadMinima: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      gruposByNombreKey.set(key, grupo);
      gruposNuevos.push(grupo);
    }
    idByNombreKey.set(key, grupo.id);
  });

  return { gruposCobertura: [...gruposExistentes, ...gruposNuevos], idByNombreKey };
}

function logTeletrabajoPersistenceError(action: string, error: unknown): void {
  console.error(`[${action}] No se ha podido acceder a Teletrabajo en SQLite.`, error);
}

export const useTeletrabajoStore = create<TeletrabajoStateStore>((set, get) => ({
  solicitudes: [],
  puestosTeletrabajo: [],
  gruposCobertura: [],
  selectedSolicitudId: '',
  filters: EMPTY_TELETRABAJO_FILTERS,
  pendingHistoricoImport: null,
  load: () => {
    const solicitudes = readSolicitudes();
    const puestosTeletrabajo = readPuestosTeletrabajo().puestos;
    const gruposCobertura = readGruposCobertura();
    set(buildTeletrabajoState(solicitudes, puestosTeletrabajo, gruposCobertura));
    void loadPuestosYGruposConMigracion()
      .then(({ puestos, gruposCobertura: nextGruposCobertura }) => {
        set((state) =>
          buildTeletrabajoState(
            state.solicitudes,
            puestos,
            nextGruposCobertura,
            state.selectedSolicitudId,
          ),
        );
      })
      .catch((error) => console.warn('Puestos/grupos de cobertura no cargados desde SQLite.', error));
    void loadSolicitudesFromSqliteOrStorage()
      .then((nextSolicitudes) =>
        set((state) =>
          buildTeletrabajoState(
            nextSolicitudes,
            state.puestosTeletrabajo,
            state.gruposCobertura,
            state.selectedSolicitudId,
          ),
        ),
      )
      .catch((error) => logTeletrabajoPersistenceError('loadTeletrabajo', error));
  },
  reloadFromStorage: () => {
    void Promise.all([loadSolicitudesFromSqliteOrStorage(), loadPuestosYGruposConMigracion()])
      .then(([nextSolicitudes, { puestos: nextPuestosTeletrabajo, gruposCobertura: nextGruposCobertura }]) => {
        set((state) => {
          const hasSolicitudesChanged = !areSolicitudesEquivalent(
            state.solicitudes,
            nextSolicitudes,
          );
          const hasPuestosChanged = !arePuestosTeletrabajoEquivalent(
            state.puestosTeletrabajo,
            nextPuestosTeletrabajo,
          );
          const hasGruposChanged = !areGruposCoberturaEquivalent(
            state.gruposCobertura,
            nextGruposCobertura,
          );

          if (!hasSolicitudesChanged && !hasPuestosChanged && !hasGruposChanged) {
            return state;
          }

          return buildTeletrabajoState(
            nextSolicitudes,
            nextPuestosTeletrabajo,
            nextGruposCobertura,
            state.selectedSolicitudId,
          );
        });
      })
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
              throw new Error(
                'La solicitud ya existe en la base compartida. Recarga antes de continuar.',
              );
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
      const message =
        error instanceof Error ? error.message : 'No se ha podido crear la solicitud.';
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
            const latestSolicitud = currentRecord
              ? parseSingleSolicitud(currentRecord.value)
              : null;
            if (!currentRecord || !latestSolicitud) {
              throw new Error(
                'La solicitud ya no existe en la base compartida. Recarga antes de continuar.',
              );
            }

            if (expectedUpdatedAt && currentRecord.updatedAt !== expectedUpdatedAt) {
              throw new Error(
                'Esta solicitud ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
              );
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
          missingMessage:
            'La solicitud ya no existe en la base compartida. Recarga antes de continuar.',
          conflictMessage:
            'Esta solicitud ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
        });
        set({ solicitudes: result.records, selectedSolicitudId: id });
        return { ok: true, message: 'Solicitud guardada.' };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se ha podido guardar la solicitud.';
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
        const expectedUpdatedAtById = new Map(
          records.map((record) => [record.id, record.updatedAt]),
        );
        const batchResult = await saveTeletrabajoSolicitudesToSqlite(
          result.solicitudes.map((solicitud) => ({
            solicitud,
            expectedUpdatedAt: expectedUpdatedAtById.get(solicitud.id) ?? null,
          })),
        );
        if (!batchResult?.ok) {
          throw new Error(
            batchResult?.message ?? 'No se ha podido importar la encuesta en SQLite.',
          );
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
  previewImportHistorico: async (file, employees) => {
    const baseSolicitudes = await loadSolicitudesFromSqliteOrStorage();
    const result = await importHistoricoTeletrabajoFromFile(file, employees, baseSolicitudes);
    set({ pendingHistoricoImport: { ...result, baseSolicitudes } });
    return result;
  },
  cancelImportHistorico: () => {
    set({ pendingHistoricoImport: null });
  },
  confirmImportHistorico: async () => {
    return withTeletrabajoBusy('Importando histórico de Teletrabajo...', async () => {
      const pending = get().pendingHistoricoImport;
      if (!pending) {
        throw new Error('No hay ninguna importación de histórico pendiente de confirmar.');
      }

      const { baseSolicitudes, ...result } = pending;
      const changedIds = new Set<string>();
      const previousById = new Map(baseSolicitudes.map((solicitud) => [solicitud.id, solicitud]));

      result.solicitudes.forEach((solicitud) => {
        const previous = previousById.get(solicitud.id);
        if (!previous) {
          changedIds.add(solicitud.id);
          enqueueAuditEvent({
            module: 'teletrabajo',
            entityId: solicitud.id,
            action: 'created',
            summary: `Registro histórico importado para el periodo ${result.periodo}`,
            changes: [],
          });
          return;
        }

        if (previous.deletedAt || hasTeletrabajoDraftChanges(previous, solicitud)) {
          changedIds.add(solicitud.id);
          registerTeletrabajoUpdateAudit(previous, solicitud);
        }
      });

      if (hasTeletrabajoSqliteRepository()) {
        const records = await loadTeletrabajoRecordsFromSqlite();
        if (records !== null) {
          const expectedUpdatedAtById = new Map(
            records.map((record) => [record.id, record.updatedAt]),
          );
          const changedSolicitudes = result.solicitudes.filter((candidate) =>
            changedIds.has(candidate.id),
          );
          const batchResult = await saveTeletrabajoSolicitudesToSqlite(
            changedSolicitudes.map((solicitud) => ({
              solicitud,
              expectedUpdatedAt: expectedUpdatedAtById.get(solicitud.id) ?? null,
            })),
          );
          if (!batchResult?.ok) {
            throw new Error(
              batchResult?.message ?? 'No se ha podido importar el histórico en SQLite.',
            );
          }
          set({
            solicitudes: result.solicitudes,
            selectedSolicitudId: firstVisibleSolicitudId(result.solicitudes),
            filters: { ...get().filters, periodo: result.periodo },
            pendingHistoricoImport: null,
          });
          return result;
        }
      }

      set(() => {
        persistSolicitudes(result.solicitudes);
        return {
          solicitudes: result.solicitudes,
          selectedSolicitudId: firstVisibleSolicitudId(result.solicitudes),
          filters: { ...get().filters, periodo: result.periodo },
          pendingHistoricoImport: null,
        };
      });
      return result;
    });
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
          const message =
            ignored > 0
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
                throw new Error(
                  saveResult?.message ?? 'No se ha podido crear el periodo en SQLite.',
                );
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
              message:
                created.length > 0
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
          message:
            created.length > 0
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
  createPuestoTeletrabajo: async (draft) => {
    const puestosTeletrabajo = upsertPuestosTeletrabajo(get().puestosTeletrabajo, [draft]);
    const created = puestosTeletrabajo.find(
      (puesto) => normalizeTeletrabajoPuesto(puesto.puesto) === normalizeTeletrabajoPuesto(draft.puesto),
    );
    set({ puestosTeletrabajo });

    if (!created) {
      return { ok: true, message: 'Puesto teletrabajable añadido.' };
    }

    const result = await persistPuestoTeletrabajoRecord(puestosTeletrabajo, created);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    return { ok: true, message: 'Puesto teletrabajable añadido.', recordId: created.id };
  },
  updatePuestoTeletrabajo: async (id, draft) => {
    const normalizedDraft = normalizeTeletrabajoPuestoDraft(draft);
    const now = new Date().toISOString();
    const puestosTeletrabajo = get()
      .puestosTeletrabajo.map((puesto) =>
        puesto.id === id ? { ...puesto, ...normalizedDraft, updatedAt: now } : puesto,
      )
      .sort((first, second) =>
        first.puesto.localeCompare(second.puesto, 'es', { numeric: true, sensitivity: 'base' }),
      );
    set({ puestosTeletrabajo });

    const updated = puestosTeletrabajo.find((puesto) => puesto.id === id);
    if (!updated) {
      return { ok: true, message: 'Puesto teletrabajable actualizado.' };
    }

    const result = await persistPuestoTeletrabajoRecord(puestosTeletrabajo, updated);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    return { ok: true, message: 'Puesto teletrabajable actualizado.', recordId: id };
  },
  removePuestoTeletrabajo: async (id) => {
    const now = new Date().toISOString();
    const puestosTeletrabajo = get().puestosTeletrabajo.map((puesto) =>
      puesto.id === id ? { ...puesto, deletedAt: now, updatedAt: now } : puesto,
    );
    set({ puestosTeletrabajo });

    const removed = puestosTeletrabajo.find((puesto) => puesto.id === id);
    if (!removed) {
      return { ok: true, message: 'Puesto teletrabajable eliminado.' };
    }

    const result = await persistPuestoTeletrabajoRecord(puestosTeletrabajo, removed);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    return { ok: true, message: 'Puesto teletrabajable eliminado.', recordId: id };
  },
  importPuestosTeletrabajo: async (file) => {
    const rows = await importTeletrabajoPuestosFromFile(file);
    set((state) => {
      const { gruposCobertura, idByNombreKey } = resolveGrupoCoberturaNombresToIds(
        rows.map((row) => row.grupoCoberturaNombre),
        state.gruposCobertura,
      );
      const draftsConGrupo = rows.map((row) => ({
        ...row.draft,
        grupoCoberturaId:
          idByNombreKey.get(normalizeGrupoCoberturaNombre(row.grupoCoberturaNombre)) ?? null,
      }));
      const puestosTeletrabajo = upsertPuestosTeletrabajo(state.puestosTeletrabajo, draftsConGrupo);
      persistPuestosTeletrabajo(puestosTeletrabajo);
      if (gruposCobertura !== state.gruposCobertura) {
        persistGruposCobertura(gruposCobertura);
      }
      return { puestosTeletrabajo, gruposCobertura };
    });
    return rows.length;
  },
  importPuestosTeletrabajoDrafts: (rows) => {
    set((state) => {
      const { gruposCobertura, idByNombreKey } = resolveGrupoCoberturaNombresToIds(
        rows.map((row) => row.grupoCoberturaNombre),
        state.gruposCobertura,
      );
      const normalizedDrafts = rows.map((row) =>
        normalizeTeletrabajoPuestoDraft({
          ...row.draft,
          grupoCoberturaId:
            idByNombreKey.get(normalizeGrupoCoberturaNombre(row.grupoCoberturaNombre)) ?? null,
        }),
      );
      const puestosTeletrabajo = upsertPuestosTeletrabajo(state.puestosTeletrabajo, normalizedDrafts);
      persistPuestosTeletrabajo(puestosTeletrabajo);
      if (gruposCobertura !== state.gruposCobertura) {
        persistGruposCobertura(gruposCobertura);
      }
      return { puestosTeletrabajo, gruposCobertura };
    });
    return rows.filter((row) => row.draft.puesto.trim()).length;
  },
  createGrupoCobertura: async (draft) => {
    const id = createGrupoCoberturaId();
    const now = new Date().toISOString();
    const normalizedDraft = normalizeGrupoCoberturaDraft(draft);
    const nuevoGrupo: GrupoCobertura = {
      id,
      ...normalizedDraft,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const gruposCobertura = [...get().gruposCobertura, nuevoGrupo].sort((first, second) =>
      first.nombre.localeCompare(second.nombre, 'es', { numeric: true, sensitivity: 'base' }),
    );
    set({ gruposCobertura });

    const result = await persistGrupoCoberturaRecord(gruposCobertura, nuevoGrupo);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    return { ok: true, message: 'Grupo de cobertura creado.', recordId: id };
  },
  updateGrupoCobertura: async (id, draft) => {
    const normalizedDraft = normalizeGrupoCoberturaDraft(draft);
    const now = new Date().toISOString();
    const gruposCobertura = get()
      .gruposCobertura.map((grupo) =>
        grupo.id === id ? { ...grupo, ...normalizedDraft, updatedAt: now } : grupo,
      )
      .sort((first, second) =>
        first.nombre.localeCompare(second.nombre, 'es', { numeric: true, sensitivity: 'base' }),
      );
    set({ gruposCobertura });

    const updated = gruposCobertura.find((grupo) => grupo.id === id);
    if (!updated) {
      return { ok: true, message: 'Grupo de cobertura actualizado.' };
    }

    const result = await persistGrupoCoberturaRecord(gruposCobertura, updated);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    return { ok: true, message: 'Grupo de cobertura actualizado.', recordId: id };
  },
  removeGrupoCobertura: async (id) => {
    const now = new Date().toISOString();
    const state = get();
    const gruposCobertura = state.gruposCobertura.map((grupo) =>
      grupo.id === id ? { ...grupo, deletedAt: now, updatedAt: now } : grupo,
    );
    // Los puestos que estaban en el grupo eliminado quedan sin grupo (cobertura individual),
    // en vez de quedar enlazados a un grupo borrado de forma invisible.
    const puestosTeletrabajo = state.puestosTeletrabajo.map((puesto) =>
      puesto.grupoCoberturaId === id
        ? { ...puesto, grupoCoberturaId: null, updatedAt: now }
        : puesto,
    );
    set({ gruposCobertura, puestosTeletrabajo });

    const removedGrupo = gruposCobertura.find((grupo) => grupo.id === id);
    const grupoResult = removedGrupo
      ? await persistGrupoCoberturaRecord(gruposCobertura, removedGrupo)
      : { ok: true, message: '' };
    if (!grupoResult.ok) {
      return { ok: false, message: grupoResult.message };
    }

    // Los puestos que quedaron desenlazados también deben persistirse, uno a
    // uno, para no arrastrar el patrón de "guardar toda la lista".
    const puestosDesenlazados = puestosTeletrabajo.filter(
      (puesto, index) => puesto !== state.puestosTeletrabajo[index] && puesto.grupoCoberturaId === null,
    );
    for (const puesto of puestosDesenlazados) {
      const puestoResult = await persistPuestoTeletrabajoRecord(puestosTeletrabajo, puesto);
      if (!puestoResult.ok) {
        return {
          ok: false,
          message: `Grupo eliminado, pero no se ha podido actualizar el puesto «${puesto.puesto}»: ${puestoResult.message}`,
        };
      }
    }

    return { ok: true, message: 'Grupo de cobertura eliminado.', recordId: id };
  },
  setPuestoGrupoCobertura: async (puestoId, grupoCoberturaId) => {
    const now = new Date().toISOString();
    const puestosTeletrabajo = get().puestosTeletrabajo.map((puesto) =>
      puesto.id === puestoId ? { ...puesto, grupoCoberturaId, updatedAt: now } : puesto,
    );
    set({ puestosTeletrabajo });

    const updated = puestosTeletrabajo.find((puesto) => puesto.id === puestoId);
    if (!updated) {
      return { ok: true, message: 'Puesto actualizado.' };
    }

    const result = await persistPuestoTeletrabajoRecord(puestosTeletrabajo, updated);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    return { ok: true, message: 'Puesto actualizado.', recordId: puestoId };
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
            const latestSolicitud = currentRecord
              ? parseSingleSolicitud(currentRecord.value)
              : null;
            if (!currentRecord || !latestSolicitud) {
              throw new Error(
                'La solicitud ya no existe en la base compartida. Recarga antes de continuar.',
              );
            }

            if (expectedUpdatedAt && currentRecord.updatedAt !== expectedUpdatedAt) {
              throw new Error(
                'Esta solicitud ha sido modificada por otro usuario. Recarga antes de eliminarla.',
              );
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
          missingMessage:
            'La solicitud ya no existe en la base compartida. Recarga antes de continuar.',
          conflictMessage:
            'Esta solicitud ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
        });
        set({
          solicitudes: result.records,
          selectedSolicitudId: firstVisibleSolicitudId(result.records),
        });
        return { ok: true, message: 'Solicitud eliminada.' };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se ha podido eliminar la solicitud.';
      return { ok: false, message };
    }
  },
  selectSolicitud: (solicitudId) => set({ selectedSolicitudId: solicitudId }),
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
}));

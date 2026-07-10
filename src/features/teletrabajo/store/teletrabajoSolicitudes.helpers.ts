import type { TeletrabajoPuesto } from '../domain/puestosTeletrabajo';
import type { GrupoCobertura } from '../domain/gruposCobertura';
import {
  EMPTY_TELETRABAJO_DRAFT,
  TELETRABAJO_ESTADOS,
  TELETRABAJO_TIPOS_SOLICITUD,
  normalizeDiasTeletrabajo,
  type TeletrabajoDraft,
  type TeletrabajoSolicitud,
} from '../domain/solicitud';
import {
  clearPersistenceBusy,
  publishPersistenceBusy,
  readStorageItem,
  waitForNextPaint,
  writeStorageItem,
} from '../../../services/persistence';
import {
  enqueueAuditEvent,
  buildAuditChanges,
  buildUpdateSummary,
} from '../../../shared/audit/auditTrail';
import {
  hasTeletrabajoSqliteRepository,
  loadTeletrabajoSolicitudesFromSqlite,
} from './teletrabajoSqliteRepository';

export const STORAGE_KEY = 'traccion.v1.teletrabajo.solicitudes';

export interface CreateTeletrabajoPeriodoOptions {
  periodo: string;
  sourcePeriodo: string;
  copyFromPrevious: boolean;
}

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
  validacionJefatura: 'Validación Jefatura evaluación',
  validacionJefaturaRepetir: 'Validación Jefatura repetir',
  validacionDireccion: 'Validación Dirección',
  revisado: 'Revisado',
} satisfies Partial<Record<keyof TeletrabajoDraft, string>>;

export const TELETRABAJO_AUDIT_FIELDS: Array<keyof TeletrabajoDraft> = [
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
  'validacionJefaturaRepetir',
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

export function registerTeletrabajoUpdateAudit(
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

export function isTeletrabajoSolicitud(value: unknown): value is TeletrabajoSolicitud {
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

export function normalizeSolicitud(solicitud: TeletrabajoSolicitud): TeletrabajoSolicitud {
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
    validacionJefatura: solicitud.validacionJefatura ?? EMPTY_TELETRABAJO_DRAFT.validacionJefatura,
    validacionJefaturaRepetir:
      solicitud.validacionJefaturaRepetir ?? EMPTY_TELETRABAJO_DRAFT.validacionJefaturaRepetir,
    validacionDireccion: Boolean(solicitud.validacionDireccion),
    revisado: Boolean(solicitud.revisado),
    createdAt,
    updatedAt: solicitud.updatedAt ?? createdAt,
    deletedAt: solicitud.deletedAt ?? null,
  };
}

export function parseSolicitudes(stored: string | null): TeletrabajoSolicitud[] {
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isTeletrabajoSolicitud).map(normalizeSolicitud);
}

export function readSolicitudes(): TeletrabajoSolicitud[] {
  return parseSolicitudes(readStorageItem(STORAGE_KEY));
}

export function parseSingleSolicitud(storageValue: string): TeletrabajoSolicitud | null {
  try {
    return parseSolicitudes(`[${storageValue}]`)[0] ?? null;
  } catch {
    return null;
  }
}

export function persistSolicitudes(solicitudes: TeletrabajoSolicitud[]): void {
  writeStorageItem(STORAGE_KEY, JSON.stringify(solicitudes));
}

export function firstVisibleSolicitudId(solicitudes: TeletrabajoSolicitud[]): string {
  return solicitudes.find((solicitud) => !solicitud.deletedAt)?.id ?? '';
}

export function createSolicitudId(): string {
  return `teletrabajo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getSolicitudPeriodoKey(
  solicitud: Pick<TeletrabajoSolicitud, 'empleado' | 'periodo'>,
): string {
  return `${solicitud.empleado.trim()}::${solicitud.periodo.trim()}`;
}

export function buildSolicitudesForNewPeriodo(
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
      validacionJefaturaRepetir: EMPTY_TELETRABAJO_DRAFT.validacionJefaturaRepetir,
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

export function normalizeDraft(draft: TeletrabajoDraft): TeletrabajoDraft {
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
    validacionJefaturaRepetir: Boolean(draft.validacionJefaturaRepetir),
    revisado: Boolean(draft.revisado),
  };
}

export function hasTeletrabajoDraftChanges(
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

export async function withTeletrabajoBusy<T>(message: string, operation: () => Promise<T>): Promise<T> {
  publishPersistenceBusy(STORAGE_KEY, message);
  await waitForNextPaint();

  try {
    return await operation();
  } finally {
    clearPersistenceBusy(STORAGE_KEY, 'Operación de Teletrabajo finalizada.');
  }
}

export function buildTeletrabajoState(
  solicitudes: TeletrabajoSolicitud[],
  puestosTeletrabajo: TeletrabajoPuesto[],
  gruposCobertura: GrupoCobertura[],
  selectedSolicitudId?: string,
): {
  solicitudes: TeletrabajoSolicitud[];
  puestosTeletrabajo: TeletrabajoPuesto[];
  gruposCobertura: GrupoCobertura[];
  selectedSolicitudId: string;
} {
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

export async function loadSolicitudesFromSqliteOrStorage(): Promise<TeletrabajoSolicitud[]> {
  if (hasTeletrabajoSqliteRepository()) {
    const sqliteSolicitudes = await loadTeletrabajoSolicitudesFromSqlite(parseSolicitudes);
    if (sqliteSolicitudes !== null) {
      return sqliteSolicitudes;
    }
  }

  return readSolicitudes();
}

export function areSolicitudesEquivalent(
  left: TeletrabajoSolicitud[],
  right: TeletrabajoSolicitud[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function logTeletrabajoPersistenceError(action: string, error: unknown): void {
  console.error(`[${action}] No se ha podido acceder a Teletrabajo en SQLite.`, error);
}

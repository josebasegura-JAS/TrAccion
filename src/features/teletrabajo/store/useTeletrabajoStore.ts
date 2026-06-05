import { create } from 'zustand';
import { EMPTY_TELETRABAJO_FILTERS, type TeletrabajoFilters } from '../domain/filters';
import {
  EMPTY_TELETRABAJO_DRAFT,
  TELETRABAJO_ESTADOS,
  TELETRABAJO_TIPOS_SOLICITUD,
  normalizeDiasTeletrabajo,
  type TeletrabajoDraft,
  type TeletrabajoSolicitud,
} from '../domain/solicitud';

const STORAGE_KEY = 'traccion.v1.teletrabajo.solicitudes';

interface TeletrabajoStateStore {
  solicitudes: TeletrabajoSolicitud[];
  selectedSolicitudId: string;
  filters: TeletrabajoFilters;
  load: () => void;
  create: (draft: TeletrabajoDraft) => void;
  update: (id: string, draft: TeletrabajoDraft) => void;
  remove: (id: string) => void;
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

function readSolicitudes(): TeletrabajoSolicitud[] {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isTeletrabajoSolicitud).map(normalizeSolicitud);
}

function persistSolicitudes(solicitudes: TeletrabajoSolicitud[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(solicitudes));
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
    periodo: draft.periodo.trim(),
    observaciones: draft.observaciones.trim(),
    diasTeletrabajo: normalizeDiasTeletrabajo(draft.diasTeletrabajo),
  };
}

export const useTeletrabajoStore = create<TeletrabajoStateStore>((set) => ({
  solicitudes: [],
  selectedSolicitudId: '',
  filters: EMPTY_TELETRABAJO_FILTERS,
  load: () => {
    const solicitudes = readSolicitudes();
    set({ solicitudes, selectedSolicitudId: firstVisibleSolicitudId(solicitudes) });
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
      const solicitudes = [...state.solicitudes, solicitud];
      persistSolicitudes(solicitudes);
      return { solicitudes, selectedSolicitudId: solicitud.id };
    });
  },
  update: (id, draft) => {
    set((state) => {
      const now = new Date().toISOString();
      const solicitudes = state.solicitudes.map((solicitud) =>
        solicitud.id === id
          ? { ...solicitud, ...normalizeDraft(draft), updatedAt: now }
          : solicitud,
      );
      persistSolicitudes(solicitudes);
      return { solicitudes, selectedSolicitudId: id };
    });
  },
  remove: (id) => {
    set((state) => {
      const now = new Date().toISOString();
      const solicitudes = state.solicitudes.map((solicitud) =>
        solicitud.id === id ? { ...solicitud, deletedAt: now, updatedAt: now } : solicitud,
      );
      persistSolicitudes(solicitudes);
      return { solicitudes, selectedSolicitudId: firstVisibleSolicitudId(solicitudes) };
    });
  },
  selectSolicitud: (solicitudId) => set({ selectedSolicitudId: solicitudId }),
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
}));

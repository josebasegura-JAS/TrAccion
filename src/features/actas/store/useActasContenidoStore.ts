import { create } from 'zustand';
import { readJsonStorage, writeJsonStorageAsync } from '../../../services/persistence';
import {
  buildAsistenciaFromCenso,
  buildEmptyActaContenido,
  type ActaAcuerdo,
  type ActaAcuerdoDraft,
  type ActaAsistenciaEntry,
  type ActaContenido,
  type ActaPunto,
  type ActaPuntoDraft,
  type ActaRecesoDraft,
  type ActaVotacion,
  type ActaVotacionDraft,
  type ActaVotacionPosicion,
} from '../domain/actaContenido';
import {
  isValidCensoMiembroDraft,
  normalizeCensoMiembroNombre,
  type CensoMiembro,
  type CensoMiembroDraft,
} from '../domain/censo';

const STORAGE_KEY_CENSO = 'traccion.v1.actas.censo';
const STORAGE_KEY_CONTENIDOS = 'traccion.v1.actas.contenidos';

interface ActasContenidoState {
  censo: CensoMiembro[];
  contenidos: Record<string, ActaContenido>;
}

interface ActasContenidoStore extends ActasContenidoState {
  load: () => void;
  reloadFromStorage: () => void;
  addCensoMiembro: (draft: CensoMiembroDraft) => Promise<{ ok: boolean; message: string }>;
  updateCensoMiembro: (id: string, draft: CensoMiembroDraft) => Promise<{ ok: boolean; message: string }>;
  toggleCensoMiembroDisabled: (id: string) => Promise<{ ok: boolean; message: string }>;
  ensureContenido: (actaId: string, seedPuntos?: ActaPuntoDraft[]) => ActaContenido;
  updateContenido: (
    actaId: string,
    updater: (contenido: ActaContenido) => ActaContenido,
  ) => Promise<{ ok: boolean; message: string }>;
}

function createId(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isCensoMiembro(value: unknown): value is CensoMiembro {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<Record<keyof CensoMiembro, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.tipoActa === 'string' &&
    typeof candidate.grupo === 'string' &&
    typeof candidate.nombre === 'string' &&
    typeof candidate.organizacion === 'string' &&
    typeof candidate.disabled === 'boolean' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

function isActaContenido(value: unknown): value is ActaContenido {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<Record<keyof ActaContenido, unknown>>;
  return (
    typeof candidate.actaId === 'string' &&
    Array.isArray(candidate.asistencia) &&
    Array.isArray(candidate.puntos) &&
    Array.isArray(candidate.acuerdos) &&
    Array.isArray(candidate.votaciones) &&
    Array.isArray(candidate.recesos)
  );
}

function isCensoArray(value: unknown): value is CensoMiembro[] {
  return Array.isArray(value) && value.every(isCensoMiembro);
}

function isContenidosMap(value: unknown): value is Record<string, ActaContenido> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    Object.values(value as Record<string, unknown>).every(isActaContenido)
  );
}

function readCenso(): CensoMiembro[] {
  return readJsonStorage(STORAGE_KEY_CENSO, [], isCensoArray);
}

function readContenidos(): Record<string, ActaContenido> {
  return readJsonStorage(STORAGE_KEY_CONTENIDOS, {}, isContenidosMap);
}

async function persistCenso(censo: CensoMiembro[]): Promise<{ ok: boolean; message: string }> {
  const result = await writeJsonStorageAsync(STORAGE_KEY_CENSO, censo);
  return { ok: result.ok, message: result.message };
}

async function persistContenidos(
  contenidos: Record<string, ActaContenido>,
): Promise<{ ok: boolean; message: string }> {
  const result = await writeJsonStorageAsync(STORAGE_KEY_CONTENIDOS, contenidos);
  return { ok: result.ok, message: result.message };
}

export const useActasContenidoStore = create<ActasContenidoStore>((set, get) => ({
  censo: readCenso(),
  contenidos: readContenidos(),

  load: () => {
    set({ censo: readCenso(), contenidos: readContenidos() });
  },

  reloadFromStorage: () => {
    set({ censo: readCenso(), contenidos: readContenidos() });
  },

  addCensoMiembro: async (draft) => {
    if (!isValidCensoMiembroDraft(draft)) {
      return { ok: false, message: 'El nombre es obligatorio.' };
    }

    const now = new Date().toISOString();
    const miembro: CensoMiembro = {
      id: createId('censo'),
      tipoActa: draft.tipoActa,
      grupo: draft.grupo,
      nombre: normalizeCensoMiembroNombre(draft.nombre),
      organizacion: draft.organizacion.trim(),
      disabled: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const censo = [...get().censo, miembro];
    const result = await persistCenso(censo);
    if (result.ok) {
      set({ censo });
    }
    return result;
  },

  updateCensoMiembro: async (id, draft) => {
    if (!isValidCensoMiembroDraft(draft)) {
      return { ok: false, message: 'El nombre es obligatorio.' };
    }

    const now = new Date().toISOString();
    const censo = get().censo.map((miembro) =>
      miembro.id === id
        ? {
            ...miembro,
            tipoActa: draft.tipoActa,
            grupo: draft.grupo,
            nombre: normalizeCensoMiembroNombre(draft.nombre),
            organizacion: draft.organizacion.trim(),
            updatedAt: now,
          }
        : miembro,
    );

    const result = await persistCenso(censo);
    if (result.ok) {
      set({ censo });
    }
    return result;
  },

  toggleCensoMiembroDisabled: async (id) => {
    const now = new Date().toISOString();
    const censo = get().censo.map((miembro) =>
      miembro.id === id ? { ...miembro, disabled: !miembro.disabled, updatedAt: now } : miembro,
    );

    const result = await persistCenso(censo);
    if (result.ok) {
      set({ censo });
    }
    return result;
  },

  ensureContenido: (actaId, seedPuntos = []) => {
    const existing = get().contenidos[actaId];
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const asistenciaSeed = buildAsistenciaFromCenso(get().censo);
    const contenido: ActaContenido = {
      ...buildEmptyActaContenido(actaId, now),
      asistencia: asistenciaSeed.map((entry) => ({ ...entry, id: createId('asistencia') })),
      puntos: seedPuntos.map((punto, index) => ({ ...punto, id: createId('punto'), orden: index + 1 })),
    };

    const contenidos = { ...get().contenidos, [actaId]: contenido };
    set({ contenidos });
    void persistContenidos(contenidos);
    return contenido;
  },

  updateContenido: async (actaId, updater) => {
    const current = get().contenidos[actaId] ?? buildEmptyActaContenido(actaId, new Date().toISOString());
    const updated: ActaContenido = { ...updater(current), updatedAt: new Date().toISOString() };
    const contenidos = { ...get().contenidos, [actaId]: updated };

    const result = await persistContenidos(contenidos);
    if (result.ok) {
      set({ contenidos });
    }
    return result;
  },
}));

// -- Helpers de conveniencia para los componentes -----------------------
// Construyen el `updater` de updateContenido a partir de operaciones
// concretas, para no repetir el mapeo de arrays en cada sitio de la UI.

export function withUpdatedAsistenciaEntry(
  entryId: string,
  patch: Partial<Omit<ActaAsistenciaEntry, 'id'>>,
): (contenido: ActaContenido) => ActaContenido {
  return (contenido) => ({
    ...contenido,
    asistencia: contenido.asistencia.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)),
  });
}

export function withAddedReceso(draft: ActaRecesoDraft): (contenido: ActaContenido) => ActaContenido {
  return (contenido) => ({
    ...contenido,
    recesos: [...contenido.recesos, { ...draft, id: createId('receso') }],
  });
}

export function withUpdatedReceso(
  recesoId: string,
  patch: Partial<ActaRecesoDraft>,
): (contenido: ActaContenido) => ActaContenido {
  return (contenido) => ({
    ...contenido,
    recesos: contenido.recesos.map((receso) => (receso.id === recesoId ? { ...receso, ...patch } : receso)),
  });
}

export function withRemovedReceso(recesoId: string): (contenido: ActaContenido) => ActaContenido {
  return (contenido) => ({
    ...contenido,
    recesos: contenido.recesos.filter((receso) => receso.id !== recesoId),
  });
}

export function withAddedPunto(draft: ActaPuntoDraft): (contenido: ActaContenido) => ActaContenido {
  return (contenido) => ({
    ...contenido,
    puntos: [
      ...contenido.puntos,
      { ...draft, id: createId('punto'), orden: contenido.puntos.length + 1 } satisfies ActaPunto,
    ],
  });
}

export function withUpdatedPunto(
  puntoId: string,
  patch: Partial<Omit<ActaPunto, 'id' | 'orden'>>,
): (contenido: ActaContenido) => ActaContenido {
  return (contenido) => ({
    ...contenido,
    puntos: contenido.puntos.map((punto) => (punto.id === puntoId ? { ...punto, ...patch } : punto)),
  });
}

export function withRemovedPunto(puntoId: string): (contenido: ActaContenido) => ActaContenido {
  return (contenido) => ({
    ...contenido,
    puntos: contenido.puntos
      .filter((punto) => punto.id !== puntoId)
      .map((punto, index) => ({ ...punto, orden: index + 1 })),
    acuerdos: contenido.acuerdos.filter((acuerdo) => acuerdo.puntoId !== puntoId),
    votaciones: contenido.votaciones.filter((votacion) => votacion.puntoId !== puntoId),
  });
}

export function withMovedPunto(puntoId: string, direction: 'up' | 'down'): (contenido: ActaContenido) => ActaContenido {
  return (contenido) => {
    const index = contenido.puntos.findIndex((punto) => punto.id === puntoId);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= contenido.puntos.length) {
      return contenido;
    }

    const puntos = [...contenido.puntos];
    [puntos[index], puntos[targetIndex]] = [puntos[targetIndex], puntos[index]];

    return { ...contenido, puntos: puntos.map((punto, i) => ({ ...punto, orden: i + 1 })) };
  };
}

export function withAddedAcuerdo(draft: ActaAcuerdoDraft): (contenido: ActaContenido) => ActaContenido {
  return (contenido) => ({
    ...contenido,
    acuerdos: [
      ...contenido.acuerdos,
      { ...draft, id: createId('acuerdo'), tareaSeguimientoId: null } satisfies ActaAcuerdo,
    ],
  });
}

export function withUpdatedAcuerdo(
  acuerdoId: string,
  patch: Partial<Omit<ActaAcuerdo, 'id'>>,
): (contenido: ActaContenido) => ActaContenido {
  return (contenido) => ({
    ...contenido,
    acuerdos: contenido.acuerdos.map((acuerdo) => (acuerdo.id === acuerdoId ? { ...acuerdo, ...patch } : acuerdo)),
  });
}

export function withRemovedAcuerdo(acuerdoId: string): (contenido: ActaContenido) => ActaContenido {
  return (contenido) => ({
    ...contenido,
    acuerdos: contenido.acuerdos.filter((acuerdo) => acuerdo.id !== acuerdoId),
  });
}

export function withAddedVotacion(draft: ActaVotacionDraft): (contenido: ActaContenido) => ActaContenido {
  return (contenido) => ({
    ...contenido,
    votaciones: [...contenido.votaciones, { ...draft, id: createId('votacion') } satisfies ActaVotacion],
  });
}

export function withUpdatedVotacionTema(
  votacionId: string,
  tema: string,
): (contenido: ActaContenido) => ActaContenido {
  return (contenido) => ({
    ...contenido,
    votaciones: contenido.votaciones.map((votacion) => (votacion.id === votacionId ? { ...votacion, tema } : votacion)),
  });
}

export function withRemovedVotacion(votacionId: string): (contenido: ActaContenido) => ActaContenido {
  return (contenido) => ({
    ...contenido,
    votaciones: contenido.votaciones.filter((votacion) => votacion.id !== votacionId),
  });
}

export function withUpsertedVotacionPosicion(
  votacionId: string,
  organizacion: string,
  patch: Partial<Omit<ActaVotacionPosicion, 'organizacion'>>,
): (contenido: ActaContenido) => ActaContenido {
  return (contenido) => ({
    ...contenido,
    votaciones: contenido.votaciones.map((votacion) => {
      if (votacion.id !== votacionId) {
        return votacion;
      }

      const existingIndex = votacion.posiciones.findIndex((entry) => entry.organizacion === organizacion);
      const posiciones = [...votacion.posiciones];
      if (existingIndex >= 0) {
        posiciones[existingIndex] = { ...posiciones[existingIndex], ...patch };
      } else {
        posiciones.push({ organizacion, posicion: 'pendiente', fecha: null, observacion: '', ...patch });
      }

      return { ...votacion, posiciones };
    }),
  });
}

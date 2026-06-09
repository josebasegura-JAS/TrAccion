import { create } from 'zustand';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import {
  ACTA_STATES,
  EMPTY_ACTA_DRAFT,
  buildActaObservacionesFromSession,
  isActaState,
  isActaType,
  type Acta,
  type ActaAlegacion,
  type ActaDraft,
  type ActaUpdateEntry,
  type ActaState,
  type CreateActaFromSessionInput,
} from '../domain/acta';

const STORAGE_KEY = 'traccion.v1.actas.records';

interface ActasStateStore {
  actas: Acta[];
  load: () => void;
  reloadFromStorage: () => void;
  create: (draft: ActaDraft) => string;
  update: (actaId: string, draft: ActaDraft) => void;
  addUpdate: (actaId: string, text: string) => void;
  closeActa: (actaId: string) => void;
  remove: (actaId: string) => void;
  createFromSession: (input: CreateActaFromSessionInput) => string;
}

function createActaId(): string {
  return `acta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function persistActas(actas: Acta[]): void {
  writeStorageItem(STORAGE_KEY, JSON.stringify(actas));
}

function isActaAlegacion(value: unknown): value is ActaAlegacion {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof ActaAlegacion, unknown>>;
  return (
    typeof candidate.sindicato === 'string' &&
    typeof candidate.presentada === 'boolean' &&
    typeof candidate.fecha === 'string' &&
    typeof candidate.observacion === 'string'
  );
}


function isActaUpdateEntry(value: unknown): value is ActaUpdateEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof ActaUpdateEntry, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.fecha === 'string' &&
    typeof candidate.texto === 'string'
  );
}

function isActa(value: unknown): value is Acta {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof Acta, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.titulo === 'string' &&
    isActaType(candidate.tipo) &&
    typeof candidate.fechaSesion === 'string'
  );
}

function normalizeActa(acta: Acta): Acta {
  const createdAt = acta.createdAt ?? new Date().toISOString();
  const updatedAt = acta.updatedAt ?? createdAt;
  const estado = isActaState(acta.estado) ? acta.estado : ACTA_STATES[0];
  const alegaciones = Array.isArray(acta.alegaciones) ? acta.alegaciones.filter(isActaAlegacion) : [];
  const actualizaciones = Array.isArray(acta.actualizaciones)
    ? acta.actualizaciones.filter(isActaUpdateEntry)
    : [];

  return {
    id: acta.id,
    titulo: acta.titulo,
    tipo: acta.tipo,
    fechaSesion: acta.fechaSesion,
    fechaCreacion: acta.fechaCreacion ?? createdAt.slice(0, 10),
    estado,
    fechaLimite: typeof acta.fechaLimite === 'string' ? acta.fechaLimite : '',
    observaciones: acta.observaciones ?? '',
    alegaciones,
    actualizaciones,
    actaPath: typeof acta.actaPath === 'string' ? acta.actaPath : '',
    closedAt: typeof acta.closedAt === 'string' ? acta.closedAt : null,
    createdAt,
    updatedAt,
    sourceSessionId: typeof acta.sourceSessionId === 'string' ? acta.sourceSessionId : null,
  };
}

function readActas(): Acta[] {
  const stored = readStorageItem(STORAGE_KEY);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  return Array.isArray(parsed) ? parsed.filter(isActa).map(normalizeActa) : [];
}

function buildActaFromDraft(draft: ActaDraft, sourceSessionId: string | null): Acta {
  const now = new Date().toISOString();
  return {
    id: createActaId(),
    titulo: draft.titulo.trim(),
    tipo: draft.tipo,
    fechaSesion: draft.fechaSesion,
    fechaCreacion: now.slice(0, 10),
    estado: draft.estado,
    fechaLimite: draft.fechaLimite,
    observaciones: draft.observaciones.trim(),
    alegaciones: draft.alegaciones,
    actualizaciones: draft.actualizaciones,
    actaPath: draft.actaPath.trim(),
    closedAt: draft.estado === 'Cerrada' ? now : null,
    createdAt: now,
    updatedAt: now,
    sourceSessionId,
  };
}

export const useActasStore = create<ActasStateStore>((set, get) => ({
  actas: [],
  load: () => set({ actas: readActas() }),
  reloadFromStorage: () => set({ actas: readActas() }),
  create: (draft) => {
    const acta = buildActaFromDraft(draft, null);
    set((state) => {
      const actas = [acta, ...state.actas];
      persistActas(actas);
      return { actas };
    });
    return acta.id;
  },
  update: (actaId, draft) => {
    set((state) => {
      const now = new Date().toISOString();
      const actas = state.actas.map((acta) =>
        acta.id === actaId
          ? {
              ...acta,
              titulo: draft.titulo.trim(),
              tipo: draft.tipo,
              fechaSesion: draft.fechaSesion,
              estado: draft.estado,
              fechaLimite: draft.fechaLimite,
              observaciones: draft.observaciones.trim(),
              alegaciones: draft.alegaciones,
              actualizaciones: draft.actualizaciones,
              actaPath: draft.actaPath.trim(),
              closedAt: draft.estado === 'Cerrada' ? acta.closedAt ?? now : null,
              updatedAt: now,
            }
          : acta,
      );
      persistActas(actas);
      return { actas };
    });
  },
  addUpdate: (actaId, text) => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      return;
    }

    set((state) => {
      const now = new Date().toISOString();
      const actas = state.actas.map((acta) =>
        acta.id === actaId
          ? {
              ...acta,
              actualizaciones: [
                {
                  id: `acta-update-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                  fecha: now,
                  texto: trimmedText,
                },
                ...acta.actualizaciones,
              ],
              updatedAt: now,
            }
          : acta,
      );
      persistActas(actas);
      return { actas };
    });
  },
  closeActa: (actaId) => {
    set((state) => {
      const now = new Date().toISOString();
      const closedState: ActaState = 'Cerrada';
      const actas: Acta[] = state.actas.map((acta) =>
        acta.id === actaId
          ? {
              ...acta,
              estado: closedState,
              closedAt: acta.closedAt ?? now,
              updatedAt: now,
            }
          : acta,
      );
      persistActas(actas);
      return { actas };
    });
  },
  remove: (actaId) => {
    set((state) => {
      const actas = state.actas.filter((acta) => acta.id !== actaId);
      persistActas(actas);
      return { actas };
    });
  },
  createFromSession: (input) => {
    const existing = get().actas.find((acta) => acta.sourceSessionId === input.session.id);
    if (existing) {
      return existing.id;
    }

    const draft: ActaDraft = {
      ...EMPTY_ACTA_DRAFT,
      titulo: input.session.title,
      tipo: input.tipo,
      fechaSesion: input.session.date,
      observaciones: buildActaObservacionesFromSession(input.session, input.treatedTasks),
    };
    const acta = buildActaFromDraft(draft, input.session.id);
    set((state) => {
      const actas = [acta, ...state.actas];
      persistActas(actas);
      return { actas };
    });
    return acta.id;
  },
}));

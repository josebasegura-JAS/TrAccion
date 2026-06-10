import { create } from 'zustand';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import {
  ACTA_STATES,
  EMPTY_ACTA_DRAFT,
  buildActaObservacionesFromSession,
  createDefaultActaTypes,
  isActaState,
  isActaType,
  normalizeActaTypeName,
  type Acta,
  type ActaAlegacion,
  type ActaDraft,
  type ActaTypeDefinition,
  type ActaUpdateEntry,
  type ActaState,
  type CreateActaFromSessionInput,
} from '../domain/acta';

const STORAGE_KEY = 'traccion.v1.actas.records';
const ACTA_TYPES_STORAGE_KEY = 'traccion.v1.actas.types';

interface ActasStateStore {
  actas: Acta[];
  actaTypes: ActaTypeDefinition[];
  load: () => void;
  reloadFromStorage: () => void;
  create: (draft: ActaDraft) => string;
  update: (actaId: string, draft: ActaDraft) => void;
  addUpdate: (actaId: string, text: string) => void;
  closeActa: (actaId: string) => void;
  remove: (actaId: string) => void;
  createFromSession: (input: CreateActaFromSessionInput) => string;
  createActaType: (nombre: string) => { ok: boolean; message?: string };
  toggleActaType: (typeId: string) => void;
  removeActaType: (typeId: string) => { ok: boolean; message?: string };
}

function createActaId(): string {
  return `acta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createActaTypeId(nombre: string): string {
  const slug = normalizeActaTypeName(nombre)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `acta-type-${slug || Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function persistActas(actas: Acta[]): void {
  writeStorageItem(STORAGE_KEY, JSON.stringify(actas));
}

function persistActaTypes(actaTypes: ActaTypeDefinition[]): void {
  writeStorageItem(ACTA_TYPES_STORAGE_KEY, JSON.stringify(actaTypes));
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

function isStoredActaType(value: unknown): value is ActaTypeDefinition {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof ActaTypeDefinition, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.nombre === 'string' &&
    typeof candidate.disabled === 'boolean'
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
    tipo: normalizeActaTypeName(acta.tipo),
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

function normalizeActaType(type: ActaTypeDefinition): ActaTypeDefinition {
  const createdAt = typeof type.createdAt === 'string' ? type.createdAt : new Date().toISOString();
  return {
    id: type.id,
    nombre: normalizeActaTypeName(type.nombre),
    disabled: type.disabled,
    createdAt,
    updatedAt: typeof type.updatedAt === 'string' ? type.updatedAt : createdAt,
  };
}

function dedupeActaTypes(types: ActaTypeDefinition[]): ActaTypeDefinition[] {
  const byName = new Map<string, ActaTypeDefinition>();
  for (const type of types.map(normalizeActaType)) {
    const key = type.nombre.toLowerCase();
    if (type.nombre && !byName.has(key)) {
      byName.set(key, type);
    }
  }
  return [...byName.values()].sort((first, second) => first.nombre.localeCompare(second.nombre, 'es'));
}

function readActas(): Acta[] {
  const stored = readStorageItem(STORAGE_KEY);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  return Array.isArray(parsed) ? parsed.filter(isActa).map(normalizeActa) : [];
}

function readActaTypes(actas: Acta[]): ActaTypeDefinition[] {
  const stored = readStorageItem(ACTA_TYPES_STORAGE_KEY);
  const parsed: unknown = stored ? JSON.parse(stored) : null;
  const storedTypes = Array.isArray(parsed) ? parsed.filter(isStoredActaType) : [];
  const now = new Date().toISOString();
  const typesFromActas = actas.map((acta) => ({
    id: createActaTypeId(acta.tipo),
    nombre: acta.tipo,
    disabled: false,
    createdAt: now,
    updatedAt: now,
  }));
  const types = dedupeActaTypes([...createDefaultActaTypes(), ...storedTypes, ...typesFromActas]);

  if (!stored || storedTypes.length !== types.length) {
    persistActaTypes(types);
  }

  return types;
}

function buildActaFromDraft(draft: ActaDraft, sourceSessionId: string | null): Acta {
  const now = new Date().toISOString();
  return {
    id: createActaId(),
    titulo: draft.titulo.trim(),
    tipo: normalizeActaTypeName(draft.tipo),
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

function loadActasState(): Pick<ActasStateStore, 'actas' | 'actaTypes'> {
  const actas = readActas();
  return { actas, actaTypes: readActaTypes(actas) };
}

export const useActasStore = create<ActasStateStore>((set, get) => ({
  actas: [],
  actaTypes: [],
  load: () => set(loadActasState()),
  reloadFromStorage: () => set(loadActasState()),
  create: (draft) => {
    const acta = buildActaFromDraft(draft, null);
    set((state) => {
      const actas = [acta, ...state.actas];
      persistActas(actas);
      return { actas, actaTypes: readActaTypes(actas) };
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
              tipo: normalizeActaTypeName(draft.tipo),
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
      return { actas, actaTypes: readActaTypes(actas) };
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
      return { actas, actaTypes: readActaTypes(actas) };
    });
    return acta.id;
  },
  createActaType: (nombre) => {
    const normalizedName = normalizeActaTypeName(nombre);
    if (!normalizedName) {
      return { ok: false, message: 'Indica un nombre de tipo de acta.' };
    }

    const exists = get().actaTypes.some((type) => type.nombre.toLowerCase() === normalizedName.toLowerCase());
    if (exists) {
      return { ok: false, message: 'Ya existe un tipo de acta con ese nombre.' };
    }

    set((state) => {
      const now = new Date().toISOString();
      const actaTypes = dedupeActaTypes([
        ...state.actaTypes,
        {
          id: createActaTypeId(normalizedName),
          nombre: normalizedName,
          disabled: false,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      persistActaTypes(actaTypes);
      return { actaTypes };
    });

    return { ok: true };
  },
  toggleActaType: (typeId) => {
    set((state) => {
      const now = new Date().toISOString();
      const actaTypes = state.actaTypes.map((type) =>
        type.id === typeId ? { ...type, disabled: !type.disabled, updatedAt: now } : type,
      );
      persistActaTypes(actaTypes);
      return { actaTypes };
    });
  },
  removeActaType: (typeId) => {
    const type = get().actaTypes.find((item) => item.id === typeId);
    if (!type) {
      return { ok: false, message: 'No se ha encontrado el tipo de acta.' };
    }

    const hasChildren = get().actas.some((acta) => acta.tipo.toLowerCase() === type.nombre.toLowerCase());
    if (hasChildren) {
      return { ok: false, message: 'No se puede eliminar porque tiene actas asociadas. Puedes deshabilitarlo.' };
    }

    set((state) => {
      const actaTypes = state.actaTypes.filter((item) => item.id !== typeId);
      persistActaTypes(actaTypes);
      return { actaTypes };
    });

    return { ok: true };
  },
}));

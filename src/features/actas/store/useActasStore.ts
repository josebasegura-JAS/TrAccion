import { create } from 'zustand';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import {
  deleteSharedArrayRecord,
  saveNewSharedArrayRecord,
  saveSharedArrayMutation,
  saveSharedArrayRecord,
} from '../../../services/sharedRecordPersistence';
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

export const ACTAS_STORAGE_KEY = 'traccion.v1.actas.records';
const STORAGE_KEY = ACTAS_STORAGE_KEY;
const ACTA_TYPES_STORAGE_KEY = 'traccion.v1.actas.types';

interface ActasStateStore {
  actas: Acta[];
  actaTypes: ActaTypeDefinition[];
  hasLoadedHistoricalActas: boolean;
  load: () => void;
  loadHistoricalActas: () => void;
  reloadFromStorage: () => void;
  create: (draft: ActaDraft) => string;
  createWithConcurrencyCheck: (
    draft: ActaDraft,
  ) => Promise<{ ok: boolean; message: string; recordId?: string }>;
  update: (actaId: string, draft: ActaDraft) => void;
  updateWithConcurrencyCheck: (
    actaId: string,
    draft: ActaDraft,
    expectedUpdatedAt: string | null,
  ) => Promise<{ ok: boolean; message: string }>;
  addUpdate: (actaId: string, text: string) => void;
  closeActa: (actaId: string) => void;
  remove: (actaId: string) => void;
  removeWithConcurrencyCheck: (
    actaId: string,
    expectedUpdatedAt: string | null,
  ) => Promise<{ ok: boolean; message: string }>;
  createFromSession: (input: CreateActaFromSessionInput) => string;
  createFromSessionWithConcurrencyCheck: (
    input: CreateActaFromSessionInput,
  ) => Promise<{ ok: boolean; message: string; recordId?: string }>;
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

function mergeActasById(primary: Acta[], secondary: Acta[]): Acta[] {
  const byId = new Map<string, Acta>();
  for (const acta of secondary) {
    byId.set(acta.id, acta);
  }
  for (const acta of primary) {
    byId.set(acta.id, acta);
  }
  return [...byId.values()];
}

function persistActas(actas: Acta[]): Acta[] {
  const mergedActas = mergeActasById(actas, readActas());
  writeStorageItem(STORAGE_KEY, JSON.stringify(mergedActas));
  return mergedActas;
}

function persistExactActas(actas: Acta[]): Acta[] {
  writeStorageItem(STORAGE_KEY, JSON.stringify(actas));
  return actas;
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
  const alegaciones = Array.isArray(acta.alegaciones)
    ? acta.alegaciones.filter(isActaAlegacion)
    : [];
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
  return [...byName.values()].sort((first, second) =>
    first.nombre.localeCompare(second.nombre, 'es'),
  );
}

function readActas(): Acta[] {
  const stored = readStorageItem(STORAGE_KEY);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  return Array.isArray(parsed) ? parsed.filter(isActa).map(normalizeActa) : [];
}

function parseActasSnapshot(storageValue: string | null): Acta[] {
  if (!storageValue) {
    return [];
  }

  const parsed: unknown = JSON.parse(storageValue);
  return Array.isArray(parsed) ? parsed.filter(isActa).map(normalizeActa) : [];
}

function buildUpdatedActaFromDraft(acta: Acta, draft: ActaDraft, now: string): Acta {
  return {
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
    closedAt: draft.estado === 'Cerrada' ? (acta.closedAt ?? now) : null,
    updatedAt: now,
  };
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

function isOpenActa(acta: Acta): boolean {
  return acta.estado !== 'Cerrada';
}

function sortActasForState(actas: Acta[]): Acta[] {
  return [...actas].sort((first, second) => {
    const firstDate = first.fechaSesion || first.fechaCreacion || first.createdAt;
    const secondDate = second.fechaSesion || second.fechaCreacion || second.createdAt;
    return secondDate.localeCompare(firstDate);
  });
}

function selectVisibleActasForState(
  actas: Acta[],
  includeHistorical: boolean,
  keepActaId?: string,
): Acta[] {
  if (includeHistorical) {
    return actas;
  }

  const visibleActas = actas.filter(isOpenActa);
  const keptActa = keepActaId ? actas.find((acta) => acta.id === keepActaId) : undefined;
  if (keptActa && !visibleActas.some((acta) => acta.id === keptActa.id)) {
    return [keptActa, ...visibleActas];
  }
  return visibleActas;
}

function loadActasState(
  includeHistorical: boolean,
): Pick<ActasStateStore, 'actas' | 'actaTypes' | 'hasLoadedHistoricalActas'> {
  const allActas = readActas();
  const actas = includeHistorical ? allActas : allActas.filter(isOpenActa);
  return {
    actas: sortActasForState(actas),
    actaTypes: readActaTypes(allActas),
    hasLoadedHistoricalActas: includeHistorical,
  };
}

export const useActasStore = create<ActasStateStore>((set, get) => ({
  actas: [],
  actaTypes: [],
  hasLoadedHistoricalActas: false,
  load: () => set(loadActasState(false)),
  loadHistoricalActas: () => set(loadActasState(true)),
  reloadFromStorage: () => set(loadActasState(get().hasLoadedHistoricalActas)),
  create: (draft) => {
    const acta = buildActaFromDraft(draft, null);
    set((state) => {
      const actas = persistActas([acta, ...state.actas]);
      const visibleActas = selectVisibleActasForState(
        actas,
        state.hasLoadedHistoricalActas,
        acta.id,
      );
      return { actas: sortActasForState(visibleActas), actaTypes: readActaTypes(actas) };
    });
    return acta.id;
  },
  createWithConcurrencyCheck: async (draft) => {
    try {
      const acta = buildActaFromDraft(draft, null);
      const result = await saveNewSharedArrayRecord<Acta>({
        storageKey: STORAGE_KEY,
        newRecord: acta,
        parseRecords: parseActasSnapshot,
        getRecordId: (record) => record.id,
        duplicateMessage: 'El acta ya existe en la base compartida. Recarga antes de continuar.',
      });
      set((state) => ({
        actas: sortActasForState(
          selectVisibleActasForState(result.records, state.hasLoadedHistoricalActas),
        ),
        actaTypes: readActaTypes(result.records),
      }));
      return { ok: true, message: 'Acta creada.', recordId: result.newRecord.id };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'No se ha podido crear el acta.',
      };
    }
  },
  update: (actaId, draft) => {
    set((state) => {
      const now = new Date().toISOString();
      const actas = persistActas(
        state.actas.map((acta) =>
          acta.id === actaId ? buildUpdatedActaFromDraft(acta, draft, now) : acta,
        ),
      );
      const visibleActas = selectVisibleActasForState(
        actas,
        state.hasLoadedHistoricalActas,
        actaId,
      );
      return { actas: sortActasForState(visibleActas), actaTypes: readActaTypes(actas) };
    });
  },
  updateWithConcurrencyCheck: async (actaId, draft, expectedUpdatedAt) => {
    try {
      const result = await saveSharedArrayRecord<Acta>({
        storageKey: STORAGE_KEY,
        recordId: actaId,
        expectedUpdatedAt,
        parseRecords: parseActasSnapshot,
        getRecordId: (record) => record.id,
        getRecordUpdatedAt: (record) => record.updatedAt,
        updateRecord: (latestActa) =>
          buildUpdatedActaFromDraft(latestActa, draft, new Date().toISOString()),
        missingMessage: 'El acta ya no existe en la base compartida. Recarga antes de continuar.',
        conflictMessage:
          'Esta acta ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
      });
      set((state) => ({
        actas: sortActasForState(
          selectVisibleActasForState(result.records, state.hasLoadedHistoricalActas),
        ),
        actaTypes: readActaTypes(result.records),
      }));
      return { ok: true, message: 'Acta guardada.' };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'No se ha podido guardar el acta.',
      };
    }
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
      const persistedActas = persistActas(actas);
      const visibleActas = selectVisibleActasForState(
        persistedActas,
        state.hasLoadedHistoricalActas,
        actaId,
      );
      return { actas: sortActasForState(visibleActas) };
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
      const persistedActas = persistActas(actas);
      const visibleActas = selectVisibleActasForState(
        persistedActas,
        state.hasLoadedHistoricalActas,
        actaId,
      );
      return { actas: sortActasForState(visibleActas) };
    });
  },
  remove: (actaId) => {
    set((state) => {
      const actas = persistExactActas(readActas().filter((acta) => acta.id !== actaId));
      const visibleActas = selectVisibleActasForState(actas, state.hasLoadedHistoricalActas);
      return { actas: sortActasForState(visibleActas), actaTypes: readActaTypes(actas) };
    });
  },
  removeWithConcurrencyCheck: async (actaId, expectedUpdatedAt) => {
    try {
      const result = await deleteSharedArrayRecord<Acta>({
        storageKey: STORAGE_KEY,
        recordId: actaId,
        expectedUpdatedAt,
        parseRecords: parseActasSnapshot,
        getRecordId: (record) => record.id,
        getRecordUpdatedAt: (record) => record.updatedAt,
        missingMessage: 'El acta ya no existe en la base compartida. Recarga antes de continuar.',
        conflictMessage:
          'Esta acta ha sido modificada por otro usuario. Recarga antes de eliminarla.',
      });
      set((state) => ({
        actas: sortActasForState(
          selectVisibleActasForState(result.records, state.hasLoadedHistoricalActas),
        ),
        actaTypes: readActaTypes(result.records),
      }));
      return { ok: true, message: 'Acta eliminada.' };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'No se ha podido eliminar el acta.',
      };
    }
  },
  createFromSession: (input) => {
    const existing = readActas().find((acta) => acta.sourceSessionId === input.session.id);
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
      const actas = persistActas([acta, ...state.actas]);
      const visibleActas = selectVisibleActasForState(actas, state.hasLoadedHistoricalActas);
      return { actas: sortActasForState(visibleActas), actaTypes: readActaTypes(actas) };
    });
    return acta.id;
  },
  createFromSessionWithConcurrencyCheck: async (input) => {
    try {
      let recordId = '';
      const result = await saveSharedArrayMutation<Acta>({
        storageKey: STORAGE_KEY,
        parseRecords: parseActasSnapshot,
        updateRecords: (latestActas) => {
          const existing = latestActas.find((acta) => acta.sourceSessionId === input.session.id);
          if (existing) {
            recordId = existing.id;
            return latestActas;
          }

          const draft: ActaDraft = {
            ...EMPTY_ACTA_DRAFT,
            titulo: input.session.title,
            tipo: input.tipo,
            fechaSesion: input.session.date,
            observaciones: buildActaObservacionesFromSession(input.session, input.treatedTasks),
          };
          const acta = buildActaFromDraft(draft, input.session.id);
          recordId = acta.id;
          return [acta, ...latestActas];
        },
      });
      set((state) => ({
        actas: sortActasForState(
          selectVisibleActasForState(result.records, state.hasLoadedHistoricalActas),
        ),
        actaTypes: readActaTypes(result.records),
      }));
      return { ok: true, message: 'Acta creada desde la sesión.', recordId };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : 'No se ha podido crear el acta desde la sesión.',
      };
    }
  },
  createActaType: (nombre) => {
    const normalizedName = normalizeActaTypeName(nombre);
    if (!normalizedName) {
      return { ok: false, message: 'Indica un nombre de tipo de acta.' };
    }

    const exists = get().actaTypes.some(
      (type) => type.nombre.toLowerCase() === normalizedName.toLowerCase(),
    );
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

    const hasChildren = readActas().some(
      (acta) => acta.tipo.toLowerCase() === type.nombre.toLowerCase(),
    );
    if (hasChildren) {
      return {
        ok: false,
        message: 'No se puede eliminar porque tiene actas asociadas. Puedes deshabilitarlo.',
      };
    }

    set((state) => {
      const actaTypes = state.actaTypes.filter((item) => item.id !== typeId);
      persistActaTypes(actaTypes);
      return { actaTypes };
    });

    return { ok: true };
  },
}));

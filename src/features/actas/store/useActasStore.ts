import { create } from 'zustand';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import {
  deleteSharedArrayRecord,
  saveNewSharedArrayRecord,
  saveSharedArrayMutation,
  saveSharedArrayRecord,
} from '../../../services/sharedRecordPersistence';
import { enqueueAuditEvent, buildAuditChanges, buildUpdateSummary } from '../../../shared/audit/auditTrail';
import {
  deleteActaInSqlite,
  hasActaSqliteRepository,
  loadActaRecordsFromSqlite,
  loadActasFromSqlite,
  saveActaToSqlite,
} from './actaSqliteRepository';
import {
  deleteActaTypeInSqlite,
  hasActaTypesSqliteRepository,
  loadActaTypeRecordsFromSqlite,
  saveActaTypeToSqlite,
  saveActaTypesToSqlite,
} from './actaTypesSqliteRepository';
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
  create: (draft: ActaDraft) => Promise<string>;
  createWithConcurrencyCheck: (
    draft: ActaDraft,
  ) => Promise<{ ok: boolean; message: string; recordId?: string }>;
  update: (actaId: string, draft: ActaDraft) => Promise<void>;
  updateWithConcurrencyCheck: (
    actaId: string,
    draft: ActaDraft,
    expectedUpdatedAt: string | null,
  ) => Promise<{ ok: boolean; message: string }>;
  addUpdate: (actaId: string, text: string) => Promise<void>;
  closeActa: (actaId: string) => Promise<void>;
  remove: (actaId: string) => Promise<void>;
  removeWithConcurrencyCheck: (
    actaId: string,
    expectedUpdatedAt: string | null,
  ) => Promise<{ ok: boolean; message: string }>;
  createFromSession: (input: CreateActaFromSessionInput) => Promise<string>;
  createFromSessionWithConcurrencyCheck: (
    input: CreateActaFromSessionInput,
  ) => Promise<{ ok: boolean; message: string; recordId?: string }>;
  createActaType: (nombre: string) => Promise<{ ok: boolean; message?: string }>;
  toggleActaType: (typeId: string) => Promise<{ ok: boolean; message?: string }>;
  removeActaType: (typeId: string) => Promise<{ ok: boolean; message?: string }>;
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

async function persistActas(actas: Acta[]): Promise<Acta[]> {
  const mergedActas = mergeActasById(actas, readActas());
  const result = await writeStorageItem(STORAGE_KEY, JSON.stringify(mergedActas));
  if (!result.ok) {
    throw new Error(result.message);
  }
  return mergedActas;
}

async function persistExactActas(actas: Acta[]): Promise<Acta[]> {
  const result = await writeStorageItem(STORAGE_KEY, JSON.stringify(actas));
  if (!result.ok) {
    throw new Error(result.message);
  }
  return actas;
}

async function persistActaTypes(actaTypes: ActaTypeDefinition[]): Promise<void> {
  const result = await writeStorageItem(ACTA_TYPES_STORAGE_KEY, JSON.stringify(actaTypes));
  if (!result.ok) {
    throw new Error(result.message);
  }
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
  const rawEstado = (acta as unknown as { estado?: unknown }).estado;
  const estado =
    rawEstado === 'Pendiente de redactar'
      ? ACTA_STATES[0]
      : isActaState(rawEstado)
        ? rawEstado
        : ACTA_STATES[0];
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
    deletedAt: typeof type.deletedAt === 'string' ? type.deletedAt : null,
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

function parseSingleActa(storageValue: string): Acta | null {
  try {
    return parseActasSnapshot(`[${storageValue}]`)[0] ?? null;
  } catch {
    return null;
  }
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
    deletedAt: null,
  }));
  const types = dedupeActaTypes([...createDefaultActaTypes(), ...storedTypes, ...typesFromActas]);

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

function buildActasState(
  allActas: Acta[],
  includeHistorical: boolean,
): Pick<ActasStateStore, 'actas' | 'actaTypes' | 'hasLoadedHistoricalActas'> {
  const actas = includeHistorical ? allActas : allActas.filter(isOpenActa);
  return {
    actas: sortActasForState(actas),
    actaTypes: readActaTypes(allActas),
    hasLoadedHistoricalActas: includeHistorical,
  };
}

function loadActasState(
  includeHistorical: boolean,
): Pick<ActasStateStore, 'actas' | 'actaTypes' | 'hasLoadedHistoricalActas'> {
  return buildActasState(readActas(), includeHistorical);
}

// Mapa en memoria id -> updatedAt SQLite, usado para hacer comprobaciones de
// concurrencia (OCC) al editar/eliminar tipos de acta sin que la UI tenga que
// gestionar el token de versión explícitamente, igual que el resto del store
// gestiona expectedUpdatedAt para las propias actas.
let actaTypeSqliteUpdatedAt = new Map<string, string>();

function updateActaTypeSqliteUpdatedAtMap(types: ActaTypeDefinition[]): void {
  actaTypeSqliteUpdatedAt = new Map(types.map((type) => [type.id, type.updatedAt]));
}

/**
 * Carga los tipos de acta desde SQLite si el repositorio está activo. Si no
 * hay tipos en SQLite todavía (primer arranque tras esta migración), siembra
 * la tabla con los tipos calculados desde localStorage/actas existentes en
 * un único guardado por lotes, para no perder los tipos ya en uso.
 */
async function loadActaTypesPreferringSqlite(actas: Acta[]): Promise<ActaTypeDefinition[]> {
  if (!hasActaTypesSqliteRepository()) {
    return readActaTypes(actas);
  }

  const sqliteRecords = await loadActaTypeRecordsFromSqlite();
  if (sqliteRecords === null) {
    return readActaTypes(actas);
  }

  if (sqliteRecords.length > 0) {
    const sqliteTypes = sqliteRecords
      .flatMap((record) => {
        try {
          return [JSON.parse(record.value) as ActaTypeDefinition];
        } catch {
          return [];
        }
      })
      .filter(isStoredActaType)
      .map(normalizeActaType);
    updateActaTypeSqliteUpdatedAtMap(sqliteTypes);
    return dedupeActaTypes(sqliteTypes);
  }

  // Tabla vacía: siembra inicial desde localStorage/actas existentes.
  const fallbackTypes = readActaTypes(actas);
  const seedResult = await saveActaTypesToSqlite(
    fallbackTypes.map((type) => ({ record: type, expectedUpdatedAt: null })),
  );
  if (seedResult?.ok) {
    const reloadedRecords = await loadActaTypeRecordsFromSqlite();
    if (reloadedRecords) {
      const reloadedTypes = reloadedRecords
        .flatMap((record) => {
          try {
            return [JSON.parse(record.value) as ActaTypeDefinition];
          } catch {
            return [];
          }
        })
        .filter(isStoredActaType)
        .map(normalizeActaType);
      updateActaTypeSqliteUpdatedAtMap(reloadedTypes);
      return dedupeActaTypes(reloadedTypes);
    }
  }
  return fallbackTypes;
}

async function buildActasStateWithSqliteTypes(
  allActas: Acta[],
  includeHistorical: boolean,
): Promise<Pick<ActasStateStore, 'actas' | 'actaTypes' | 'hasLoadedHistoricalActas'>> {
  const actas = includeHistorical ? allActas : allActas.filter(isOpenActa);
  return {
    actas: sortActasForState(actas),
    actaTypes: await loadActaTypesPreferringSqlite(allActas),
    hasLoadedHistoricalActas: includeHistorical,
  };
}

async function loadActasStateFromSqliteOrStorage(
  includeHistorical: boolean,
): Promise<Pick<ActasStateStore, 'actas' | 'actaTypes' | 'hasLoadedHistoricalActas'>> {
  if (hasActaSqliteRepository()) {
    const sqliteActas = await loadActasFromSqlite(parseActasSnapshot);
    if (sqliteActas !== null) {
      return buildActasStateWithSqliteTypes(sqliteActas, includeHistorical);
    }
  }

  return buildActasStateWithSqliteTypes(readActas(), includeHistorical);
}

function logActaPersistenceError(action: string, error: unknown): void {
  console.error(`[${action}] No se ha podido guardar el acta compartida.`, error);
}

export const useActasStore = create<ActasStateStore>((set, get) => ({
  actas: [],
  actaTypes: [],
  hasLoadedHistoricalActas: false,
  load: () => {
    set(loadActasState(false));
    void loadActasStateFromSqliteOrStorage(false)
      .then((nextState) => set(nextState))
      .catch((error) => logActaPersistenceError('loadActas', error));
  },
  loadHistoricalActas: () => {
    set(loadActasState(true));
    void loadActasStateFromSqliteOrStorage(true)
      .then((nextState) => set(nextState))
      .catch((error) => logActaPersistenceError('loadHistoricalActas', error));
  },
  reloadFromStorage: () => {
    const includeHistorical = get().hasLoadedHistoricalActas;
    set(loadActasState(includeHistorical));
    void loadActasStateFromSqliteOrStorage(includeHistorical)
      .then((nextState) => set(nextState))
      .catch((error) => logActaPersistenceError('reloadActasFromStorage', error));
  },
  create: async (draft) => {
    const acta = buildActaFromDraft(draft, null);
    const state = get();
    const actas = await persistActas([acta, ...state.actas]);
    const visibleActas = selectVisibleActasForState(
      actas,
      state.hasLoadedHistoricalActas,
      acta.id,
    );
    set({ actas: sortActasForState(visibleActas), actaTypes: readActaTypes(actas) });
    return acta.id;
  },
  createWithConcurrencyCheck: async (draft) => {
    try {
      const acta = buildActaFromDraft(draft, null);

      if (hasActaSqliteRepository()) {
        const records = await loadActaRecordsFromSqlite();
        if (records !== null) {
          if (records.some((record) => record.id === acta.id)) {
            throw new Error('El acta ya existe en la base compartida. Recarga antes de continuar.');
          }

          const saveResult = await saveActaToSqlite(acta, null);
          if (!saveResult?.ok) {
            throw new Error(saveResult?.message ?? 'No se ha podido crear el acta.');
          }

          const allActas = [acta, ...records.flatMap((record) => parseActasSnapshot(`[${record.value}]`))];
          set((state) => ({
            actas: sortActasForState(
              selectVisibleActasForState(allActas, state.hasLoadedHistoricalActas, acta.id),
            ),
            actaTypes: readActaTypes(allActas),
          }));
          return { ok: true, message: 'Acta creada.', recordId: acta.id };
        }
      }

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
  update: async (actaId, draft) => {
    const state = get();
    const now = new Date().toISOString();
    const actas = await persistActas(
      state.actas.map((acta) =>
        acta.id === actaId ? buildUpdatedActaFromDraft(acta, draft, now) : acta,
      ),
    );
    const visibleActas = selectVisibleActasForState(
      actas,
      state.hasLoadedHistoricalActas,
      actaId,
    );
    set({ actas: sortActasForState(visibleActas), actaTypes: readActaTypes(actas) });
  },
  updateWithConcurrencyCheck: async (actaId, draft, expectedUpdatedAt) => {
    try {
      if (hasActaSqliteRepository()) {
        const records = await loadActaRecordsFromSqlite();
        if (records !== null) {
          const currentRecord = records.find((record) => record.id === actaId);
          const latestActa = currentRecord ? parseSingleActa(currentRecord.value) : null;
          if (!currentRecord || !latestActa) {
            throw new Error('El acta ya no existe en la base compartida. Recarga antes de continuar.');
          }

          if (expectedUpdatedAt && currentRecord.updatedAt !== expectedUpdatedAt) {
            throw new Error('Esta acta ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.');
          }

          const updatedActa = buildUpdatedActaFromDraft(latestActa, draft, new Date().toISOString());
          const saveResult = await saveActaToSqlite(updatedActa, currentRecord.updatedAt);
          if (!saveResult?.ok) {
            throw new Error(saveResult?.message ?? 'No se ha podido guardar el acta.');
          }

          const allActas = records.flatMap((record) =>
            record.id === actaId ? [updatedActa] : parseActasSnapshot(`[${record.value}]`),
          );
          const changes = buildAuditChanges(
            latestActa as unknown as Record<string, unknown>,
            updatedActa as unknown as Record<string, unknown>,
            { titulo: 'Título', tipo: 'Tipo', estado: 'Estado', fechaSesion: 'Fecha sesión', fechaLimite: 'Fecha límite' },
            ['titulo', 'tipo', 'estado', 'fechaSesion', 'fechaLimite'],
          );
          if (changes.length > 0) {
            enqueueAuditEvent({
              module: 'actas',
              entityId: actaId,
              action: changes.some((c) => c.field === 'estado') ? 'status_changed' : 'updated',
              summary: buildUpdateSummary(changes),
              changes,
            });
          }
          set((state) => ({
            actas: sortActasForState(
              selectVisibleActasForState(allActas, state.hasLoadedHistoricalActas, actaId),
            ),
            actaTypes: readActaTypes(allActas),
          }));
          return { ok: true, message: 'Acta guardada.' };
        }
      }

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
      const updatedActa = result.updatedRecord;
      const previousActa = result.records.find((a) => a.id === actaId);
      if (previousActa) {
        const changes = buildAuditChanges(
          previousActa as unknown as Record<string, unknown>,
          updatedActa as unknown as Record<string, unknown>,
          { titulo: 'Título', tipo: 'Tipo', estado: 'Estado', fechaSesion: 'Fecha sesión', fechaLimite: 'Fecha límite' },
          ['titulo', 'tipo', 'estado', 'fechaSesion', 'fechaLimite'],
        );
        if (changes.length > 0) {
          enqueueAuditEvent({
            module: 'actas',
            entityId: actaId,
            action: changes.some((c) => c.field === 'estado') ? 'status_changed' : 'updated',
            summary: buildUpdateSummary(changes),
            changes,
          });
        }
      }
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
  addUpdate: async (actaId, text) => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      return;
    }

    const state = get();
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
    const persistedActas = await persistActas(actas);
    const visibleActas = selectVisibleActasForState(
      persistedActas,
      state.hasLoadedHistoricalActas,
      actaId,
    );
    set({ actas: sortActasForState(visibleActas) });
  },
  closeActa: async (actaId) => {
    const state = get();
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
    const persistedActas = await persistActas(actas);
    const visibleActas = selectVisibleActasForState(
      persistedActas,
      state.hasLoadedHistoricalActas,
      actaId,
    );
    set({ actas: sortActasForState(visibleActas) });
  },
  remove: async (actaId) => {
    const state = get();
    const actas = await persistExactActas(readActas().filter((acta) => acta.id !== actaId));
    const visibleActas = selectVisibleActasForState(actas, state.hasLoadedHistoricalActas);
    set({ actas: sortActasForState(visibleActas), actaTypes: readActaTypes(actas) });
  },
  removeWithConcurrencyCheck: async (actaId, expectedUpdatedAt) => {
    try {
      if (hasActaSqliteRepository()) {
        const records = await loadActaRecordsFromSqlite();
        if (records !== null) {
          const currentRecord = records.find((record) => record.id === actaId);
          const latestActa = currentRecord ? parseSingleActa(currentRecord.value) : null;
          if (!currentRecord || !latestActa) {
            throw new Error('El acta ya no existe en la base compartida. Recarga antes de continuar.');
          }

          if (expectedUpdatedAt && currentRecord.updatedAt !== expectedUpdatedAt) {
            throw new Error('Esta acta ha sido modificada por otro usuario. Recarga antes de eliminarla.');
          }

          const saveResult = await deleteActaInSqlite(latestActa, currentRecord.updatedAt);
          if (!saveResult?.ok) {
            throw new Error(saveResult?.message ?? 'No se ha podido eliminar el acta.');
          }

          const allActas = records
            .filter((record) => record.id !== actaId)
            .flatMap((record) => parseActasSnapshot(`[${record.value}]`));
          set((state) => ({
            actas: sortActasForState(
              selectVisibleActasForState(allActas, state.hasLoadedHistoricalActas),
            ),
            actaTypes: readActaTypes(allActas),
          }));
          return { ok: true, message: 'Acta eliminada.' };
        }
      }

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
  createFromSession: async (input) => {
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
    const state = get();
    const actas = await persistActas([acta, ...state.actas]);
    const visibleActas = selectVisibleActasForState(actas, state.hasLoadedHistoricalActas);
    set({ actas: sortActasForState(visibleActas), actaTypes: readActaTypes(actas) });
    return acta.id;
  },
  createFromSessionWithConcurrencyCheck: async (input) => {
    try {
      let recordId = '';

      if (hasActaSqliteRepository()) {
        const records = await loadActaRecordsFromSqlite();
        if (records !== null) {
          const latestActas = records.flatMap((record) => parseActasSnapshot(`[${record.value}]`));
          const existing = latestActas.find((acta) => acta.sourceSessionId === input.session.id);
          if (existing) {
            recordId = existing.id;
            set((state) => ({
              actas: sortActasForState(
                selectVisibleActasForState(latestActas, state.hasLoadedHistoricalActas, recordId),
              ),
              actaTypes: readActaTypes(latestActas),
            }));
            return { ok: true, message: 'Acta creada desde la sesión.', recordId };
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
          const saveResult = await saveActaToSqlite(acta, null);
          if (!saveResult?.ok) {
            throw new Error(saveResult?.message ?? 'No se ha podido crear el acta desde la sesión.');
          }

          const allActas = [acta, ...latestActas];
          set((state) => ({
            actas: sortActasForState(
              selectVisibleActasForState(allActas, state.hasLoadedHistoricalActas, recordId),
            ),
            actaTypes: readActaTypes(allActas),
          }));
          return { ok: true, message: 'Acta creada desde la sesión.', recordId };
        }
      }

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
  createActaType: async (nombre) => {
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

    const now = new Date().toISOString();
    const newType: ActaTypeDefinition = {
      id: createActaTypeId(normalizedName),
      nombre: normalizedName,
      disabled: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    if (hasActaTypesSqliteRepository()) {
      try {
        const saveResult = await saveActaTypeToSqlite(newType, null);
        if (!saveResult?.ok) {
          return { ok: false, message: saveResult?.message ?? 'No se ha podido crear el tipo de acta.' };
        }
        if (saveResult.currentUpdatedAt) {
          actaTypeSqliteUpdatedAt.set(newType.id, saveResult.currentUpdatedAt);
        }
        set((state) => ({ actaTypes: dedupeActaTypes([...state.actaTypes, newType]) }));
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'No se ha podido crear el tipo de acta.',
        };
      }
    }

    try {
      const actaTypes = dedupeActaTypes([...get().actaTypes, newType]);
      await persistActaTypes(actaTypes);
      set({ actaTypes });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'No se ha podido crear el tipo de acta.',
      };
    }
  },
  toggleActaType: async (typeId) => {
    const type = get().actaTypes.find((item) => item.id === typeId);
    if (!type) {
      return { ok: false, message: 'No se ha encontrado el tipo de acta.' };
    }

    const now = new Date().toISOString();
    const updatedType: ActaTypeDefinition = { ...type, disabled: !type.disabled, updatedAt: now };

    if (hasActaTypesSqliteRepository()) {
      try {
        const expectedUpdatedAt = actaTypeSqliteUpdatedAt.get(typeId) ?? null;
        const saveResult = await saveActaTypeToSqlite(updatedType, expectedUpdatedAt);
        if (!saveResult?.ok) {
          return {
            ok: false,
            message: saveResult?.message ?? 'Este tipo de acta ha sido modificado por otro usuario. Recarga antes de continuar.',
          };
        }
        if (saveResult.currentUpdatedAt) {
          actaTypeSqliteUpdatedAt.set(typeId, saveResult.currentUpdatedAt);
        }
        set((state) => ({
          actaTypes: state.actaTypes.map((item) => (item.id === typeId ? updatedType : item)),
        }));
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'No se ha podido actualizar el tipo de acta.',
        };
      }
    }

    try {
      const actaTypes = get().actaTypes.map((item) => (item.id === typeId ? updatedType : item));
      await persistActaTypes(actaTypes);
      set({ actaTypes });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'No se ha podido actualizar el tipo de acta.',
      };
    }
  },
  removeActaType: async (typeId) => {
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

    if (hasActaTypesSqliteRepository()) {
      try {
        const expectedUpdatedAt = actaTypeSqliteUpdatedAt.get(typeId) ?? null;
        const deleteResult = await deleteActaTypeInSqlite(type, expectedUpdatedAt);
        if (!deleteResult?.ok) {
          return {
            ok: false,
            message: deleteResult?.message ?? 'Este tipo de acta ha sido modificado por otro usuario. Recarga antes de continuar.',
          };
        }
        actaTypeSqliteUpdatedAt.delete(typeId);
        set((state) => ({ actaTypes: state.actaTypes.filter((item) => item.id !== typeId) }));
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'No se ha podido eliminar el tipo de acta.',
        };
      }
    }

    try {
      const actaTypes = get().actaTypes.filter((item) => item.id !== typeId);
      await persistActaTypes(actaTypes);
      set({ actaTypes });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'No se ha podido eliminar el tipo de acta.',
      };
    }
  },
}));

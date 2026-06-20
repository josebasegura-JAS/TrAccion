import { create } from 'zustand';
import { readStorageItem } from '../../services/persistence';
import {
  deleteSharedArrayRecord,
  saveNewSharedArrayRecord,
  saveSharedArrayMutation,
  saveSharedArrayRecord,
} from '../../services/sharedRecordPersistence';
import { enqueueAuditEvent, buildAuditChanges, buildUpdateSummary } from '../../shared/audit/auditTrail';
import {
  deleteSessionRecordInSqlite,
  hasSessionSqliteRepository,
  loadAllSessionRecordsFromSqlite,
  saveSessionRecordToSqlite,
  type SessionSqliteModuleId,
} from './sessionSqliteRepository';
import {
  EMPTY_MANAGED_SESSION_DRAFT,
  isManagedSession,
  normalizeManagedSession,
  type ManagedSession,
  type ManagedSessionDraft,
  type SessionModuleConfig,
} from './session';

export interface ManagedSessionStateStore {
  sessions: ManagedSession[];
  hasLoadedHistoricalSessions: boolean;
  load: () => void;
  loadHistoricalSessions: () => void;
  reloadFromStorage: () => void;
  create: (draft: ManagedSessionDraft) => string;
  createWithConcurrencyCheck: (
    draft: ManagedSessionDraft,
  ) => Promise<{ ok: boolean; message: string; sessionId?: string }>;
  importSessions: (
    drafts: Array<{ externalKey: string; draft: ManagedSessionDraft; taskIds: string[] }>,
  ) => number;
  importSessionsWithConcurrencyCheck: (
    drafts: Array<{ externalKey: string; draft: ManagedSessionDraft; taskIds: string[] }>,
  ) => Promise<{ ok: boolean; message: string; importedCount: number }>;
  remove: (sessionId: string) => void;
  removeWithConcurrencyCheck: (
    sessionId: string,
    expectedUpdatedAt: string | null,
  ) => Promise<{ ok: boolean; message: string }>;
  update: (sessionId: string, draft: ManagedSessionDraft) => void;
  updateWithConcurrencyCheck: (
    sessionId: string,
    draft: ManagedSessionDraft,
    expectedUpdatedAt: string | null,
  ) => Promise<{ ok: boolean; message: string; session?: ManagedSession }>;
  addTask: (sessionId: string, taskId: string) => void;
  addTaskWithConcurrencyCheck: (
    sessionId: string,
    taskId: string,
    expectedUpdatedAt: string | null,
  ) => Promise<{ ok: boolean; message: string; session?: ManagedSession }>;
  removeTask: (sessionId: string, taskId: string) => void;
  removeTaskWithConcurrencyCheck: (
    sessionId: string,
    taskId: string,
    expectedUpdatedAt: string | null,
  ) => Promise<{ ok: boolean; message: string; session?: ManagedSession }>;
  moveTask: (sessionId: string, taskId: string, direction: 'up' | 'down') => void;
  moveTaskWithConcurrencyCheck: (
    sessionId: string,
    taskId: string,
    direction: 'up' | 'down',
    expectedUpdatedAt: string | null,
  ) => Promise<{ ok: boolean; message: string; session?: ManagedSession }>;
  closeSession: (sessionId: string, treatedTaskIds: string[]) => void;
  closeSessionWithConcurrencyCheck: (
    sessionId: string,
    treatedTaskIds: string[],
    expectedUpdatedAt: string | null,
  ) => Promise<{ ok: boolean; message: string; session?: ManagedSession }>;
}

function createSessionId(moduleId: string): string {
  return `${moduleId}-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseManagedSessionsSnapshot(
  storageValue: string | null,
  defaultTitle: string,
): ManagedSession[] {
  if (!storageValue) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(storageValue);
    return Array.isArray(parsed)
      ? parsed
          .filter(isManagedSession)
          .map((session) => normalizeManagedSession(session, defaultTitle))
      : [];
  } catch {
    return [];
  }
}

function parseManagedSession(rawValue: string, defaultTitle: string): ManagedSession | null {
  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    // El soft-delete vive como campo adicional en el value_json de SQLite,
    // fuera del tipo ManagedSession. Si está marcado, se descarta aquí.
    if (typeof (parsed as { deletedAt?: unknown }).deletedAt === 'string') {
      return null;
    }
    return isManagedSession(parsed) ? normalizeManagedSession(parsed, defaultTitle) : null;
  } catch {
    return null;
  }
}

/**
 * Lee todas las sesiones del módulo. Si el módulo tiene tabla nativa
 * (comité), lee de ahí. Si no (paritaria, por ahora), cae al blob legacy.
 */
async function readSessionsFromNativeOrBlob(config: SessionModuleConfig): Promise<ManagedSession[]> {
  const moduleId = config.moduleId as SessionSqliteModuleId;
  if (hasSessionSqliteRepository(moduleId)) {
    const records = await loadAllSessionRecordsFromSqlite(moduleId);
    if (records !== null) {
      const sessions: ManagedSession[] = [];
      for (const record of records) {
        const parsed = parseManagedSession(record.value, config.newSessionDefaultTitle);
        if (parsed) {
          sessions.push(parsed);
        }
      }
      return sessions;
    }
  }

  return readSessions(config);
}

function readSessions(config: SessionModuleConfig): ManagedSession[] {
  return parseManagedSessionsSnapshot(
    readStorageItem(config.storageKey),
    config.newSessionDefaultTitle,
  );
}

function filterSessionsForState(
  sessions: ManagedSession[],
  includeHistorical: boolean,
  keepVisibleSessionIds: ReadonlySet<string> = new Set(),
): ManagedSession[] {
  return includeHistorical
    ? sessions
    : sessions.filter(
        (session) => session.status === 'open' || keepVisibleSessionIds.has(session.id),
      );
}

function getVisibleSessionIds(sessions: ManagedSession[]): Set<string> {
  return new Set(sessions.map((session) => session.id));
}

function areManagedSessionsEquivalent(left: ManagedSession[], right: ManagedSession[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getSessionId(session: ManagedSession): string {
  return session.id;
}

function getSessionUpdatedAt(session: ManagedSession): string | null {
  return session.updatedAt ?? null;
}

function logSessionPersistenceError(action: string, error: unknown): void {
  console.error(`[${action}] No se ha podido guardar la sesión compartida.`, error);
}

/**
 * Actualiza una sesión existente aplicando `transform`. Si el módulo tiene
 * tabla nativa, usa concurrencia por registro individual (expectedUpdatedAt
 * de la sesión). Si no, cae al patrón de blob compartido (saveSharedArrayRecord),
 * que sigue usando el expectedUpdatedAt del blob completo internamente.
 */
async function updateSessionRecord(
  config: SessionModuleConfig,
  sessionId: string,
  expectedUpdatedAt: string | null,
  transform: (latestSession: ManagedSession) => ManagedSession,
  messages: { missingMessage: string; conflictMessage: string },
): Promise<{ records: ManagedSession[]; updatedRecord: ManagedSession; previousRecord: ManagedSession }> {
  const moduleId = config.moduleId as SessionSqliteModuleId;

  if (hasSessionSqliteRepository(moduleId)) {
    const records = await loadAllSessionRecordsFromSqlite(moduleId);
    if (records !== null) {
      const currentRecord = records.find((record) => record.id === sessionId);
      if (!currentRecord) {
        throw new Error(messages.missingMessage);
      }

      const latestSession = parseManagedSession(currentRecord.value, config.newSessionDefaultTitle);
      if (!latestSession) {
        throw new Error(messages.missingMessage);
      }

      if (expectedUpdatedAt && currentRecord.updatedAt !== expectedUpdatedAt) {
        throw new Error(messages.conflictMessage);
      }

      const updatedSession = transform(latestSession);
      const saveResult = await saveSessionRecordToSqlite(
        moduleId,
        config.storageKey,
        sessionId,
        JSON.stringify(updatedSession),
        currentRecord.updatedAt,
      );
      if (!saveResult.ok) {
        throw new Error(saveResult.message);
      }

      const allSessions: ManagedSession[] = [];
      for (const record of records) {
        const parsed =
          record.id === sessionId
            ? updatedSession
            : parseManagedSession(record.value, config.newSessionDefaultTitle);
        if (parsed) {
          allSessions.push(parsed);
        }
      }
      return { records: allSessions, updatedRecord: updatedSession, previousRecord: latestSession };
    }
  }

  const result = await saveSharedArrayRecord<ManagedSession>({
    storageKey: config.storageKey,
    recordId: sessionId,
    expectedUpdatedAt,
    parseRecords: (storageValue) =>
      parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
    getRecordId: getSessionId,
    getRecordUpdatedAt: getSessionUpdatedAt,
    updateRecord: transform,
    missingMessage: messages.missingMessage,
    conflictMessage: messages.conflictMessage,
  });
  const previousRecord = result.records.find((record) => record.id === sessionId) ?? result.updatedRecord;
  return { records: result.records, updatedRecord: result.updatedRecord, previousRecord };
}

/**
 * Crea una sesión nueva. Con tabla nativa, inserta directamente (sin leer
 * el array completo). Sin tabla nativa, cae al patrón de blob compartido.
 */
async function createSessionRecord(
  config: SessionModuleConfig,
  session: ManagedSession,
): Promise<{ records: ManagedSession[]; newRecord: ManagedSession }> {
  const moduleId = config.moduleId as SessionSqliteModuleId;

  if (hasSessionSqliteRepository(moduleId)) {
    const saveResult = await saveSessionRecordToSqlite(
      moduleId,
      config.storageKey,
      session.id,
      JSON.stringify(session),
      null,
    );
    if (!saveResult.ok) {
      throw new Error(saveResult.message);
    }

    const records = await loadAllSessionRecordsFromSqlite(moduleId);
    const allSessions: ManagedSession[] = [];
    for (const record of records ?? []) {
      const parsed = parseManagedSession(record.value, config.newSessionDefaultTitle);
      if (parsed) {
        allSessions.push(parsed);
      }
    }
    return { records: allSessions, newRecord: session };
  }

  return saveNewSharedArrayRecord<ManagedSession>({
    storageKey: config.storageKey,
    newRecord: session,
    parseRecords: (storageValue) =>
      parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
    getRecordId: getSessionId,
    duplicateMessage: 'La sesión ya existe en la base compartida. Recarga antes de continuar.',
  });
}

/**
 * Importa varias sesiones nuevas a la vez, evitando duplicados según
 * `computeNewSessions` (que recibe el array actual y devuelve solo las
 * sesiones a insertar). Con tabla nativa, inserta cada una individualmente.
 * Sin tabla nativa, hace una única mutación de array (saveSharedArrayMutation).
 */
async function importSessionRecords(
  config: SessionModuleConfig,
  computeNewSessions: (latestSessions: ManagedSession[]) => ManagedSession[],
): Promise<{ records: ManagedSession[]; importedSessions: ManagedSession[] }> {
  const moduleId = config.moduleId as SessionSqliteModuleId;

  if (hasSessionSqliteRepository(moduleId)) {
    const records = await loadAllSessionRecordsFromSqlite(moduleId);
    if (records !== null) {
      const latestSessions: ManagedSession[] = [];
      for (const record of records) {
        const parsed = parseManagedSession(record.value, config.newSessionDefaultTitle);
        if (parsed) {
          latestSessions.push(parsed);
        }
      }

      const newSessions = computeNewSessions(latestSessions);
      for (const session of newSessions) {
        const saveResult = await saveSessionRecordToSqlite(
          moduleId,
          config.storageKey,
          session.id,
          JSON.stringify(session),
          null,
        );
        if (!saveResult.ok) {
          throw new Error(saveResult.message);
        }
      }

      return { records: [...newSessions, ...latestSessions], importedSessions: newSessions };
    }
  }

  let importedSessions: ManagedSession[] = [];
  const result = await saveSharedArrayMutation<ManagedSession>({
    storageKey: config.storageKey,
    parseRecords: (storageValue) =>
      parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
    updateRecords: (latestSessions) => {
      importedSessions = computeNewSessions(latestSessions);
      return importedSessions.length === 0 ? latestSessions : [...importedSessions, ...latestSessions];
    },
  });
  return { records: result.records, importedSessions };
}

/**
 * Elimina una sesión. Con tabla nativa, marca deletedAt (soft-delete) en el
 * value_json. Sin tabla nativa, cae al patrón de blob compartido.
 */
async function removeSessionRecord(
  config: SessionModuleConfig,
  sessionId: string,
  expectedUpdatedAt: string | null,
): Promise<{ records: ManagedSession[] }> {
  const moduleId = config.moduleId as SessionSqliteModuleId;

  if (hasSessionSqliteRepository(moduleId)) {
    const records = await loadAllSessionRecordsFromSqlite(moduleId);
    if (records !== null) {
      const currentRecord = records.find((record) => record.id === sessionId);
      if (!currentRecord) {
        throw new Error('La sesión ya no existe en la base compartida. Recarga antes de continuar.');
      }
      if (expectedUpdatedAt && currentRecord.updatedAt !== expectedUpdatedAt) {
        throw new Error('La sesión ha sido modificada por otro usuario. Recarga antes de eliminarla.');
      }

      const deleteResult = await deleteSessionRecordInSqlite(
        moduleId,
        config.storageKey,
        sessionId,
        currentRecord.value,
        currentRecord.updatedAt,
      );
      if (!deleteResult.ok) {
        throw new Error(deleteResult.message);
      }

      const remainingSessions: ManagedSession[] = [];
      for (const record of records) {
        if (record.id === sessionId) {
          continue;
        }
        const parsed = parseManagedSession(record.value, config.newSessionDefaultTitle);
        if (parsed) {
          remainingSessions.push(parsed);
        }
      }
      return { records: remainingSessions };
    }
  }

  return deleteSharedArrayRecord<ManagedSession>({
    storageKey: config.storageKey,
    recordId: sessionId,
    expectedUpdatedAt,
    parseRecords: (storageValue) =>
      parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
    getRecordId: getSessionId,
    getRecordUpdatedAt: getSessionUpdatedAt,
    missingMessage: 'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
    conflictMessage: 'La sesión ha sido modificada por otro usuario. Recarga antes de eliminarla.',
  });
}

function buildSessionFromDraft(
  config: SessionModuleConfig,
  draft: ManagedSessionDraft,
): ManagedSession {
  const now = new Date().toISOString();
  return {
    id: createSessionId(config.moduleId),
    date: draft.date,
    code: draft.code.trim(),
    title: draft.title.trim() || `${config.newSessionDefaultTitle} ${draft.date}`.trim(),
    notes: draft.notes.trim(),
    status: 'open',
    items: [],
    treatedTaskIds: [],
    untreatedTaskIds: [],
    createdAt: now,
    updatedAt: now,
    closedAt: null,
  };
}

function buildUpdatedSessionFromDraft(
  config: SessionModuleConfig,
  session: ManagedSession,
  draft: ManagedSessionDraft,
): ManagedSession {
  return {
    ...session,
    date: draft.date,
    code: draft.code.trim(),
    title: draft.title.trim() || `${config.newSessionDefaultTitle} ${draft.date}`.trim(),
    notes: draft.notes.trim(),
    updatedAt: new Date().toISOString(),
  };
}

function addTaskToSession(session: ManagedSession, taskId: string): ManagedSession {
  if (session.status === 'closed' || session.items.includes(taskId)) {
    return session;
  }

  return { ...session, items: [...session.items, taskId], updatedAt: new Date().toISOString() };
}

function removeTaskFromSession(session: ManagedSession, taskId: string): ManagedSession {
  if (session.status === 'closed') {
    return session;
  }

  return {
    ...session,
    items: session.items.filter((item) => item !== taskId),
    updatedAt: new Date().toISOString(),
  };
}

function moveTaskInSession(
  session: ManagedSession,
  taskId: string,
  direction: 'up' | 'down',
): ManagedSession {
  if (session.status === 'closed') {
    return session;
  }

  const currentIndex = session.items.indexOf(taskId);
  const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= session.items.length) {
    return session;
  }

  const items = [...session.items];
  const [item] = items.splice(currentIndex, 1);
  if (!item) {
    return session;
  }
  items.splice(nextIndex, 0, item);
  return { ...session, items, updatedAt: new Date().toISOString() };
}

export function createManagedSessionStore(config: SessionModuleConfig) {
  return create<ManagedSessionStateStore>((set, get) => ({
    sessions: [],
    hasLoadedHistoricalSessions: false,
    load: () => {
      void readSessionsFromNativeOrBlob(config)
        .then((sessions) =>
          set({
            sessions: filterSessionsForState(sessions, false),
            hasLoadedHistoricalSessions: false,
          }),
        )
        .catch((error) => logSessionPersistenceError('loadSessions', error));
    },
    loadHistoricalSessions: () => {
      void readSessionsFromNativeOrBlob(config)
        .then((sessions) =>
          set({
            sessions: filterSessionsForState(sessions, true),
            hasLoadedHistoricalSessions: true,
          }),
        )
        .catch((error) => logSessionPersistenceError('loadHistoricalSessions', error));
    },
    reloadFromStorage: () => {
      void readSessionsFromNativeOrBlob(config)
        .then((sessions) => {
          const nextSessions = filterSessionsForState(
            sessions,
            get().hasLoadedHistoricalSessions,
            getVisibleSessionIds(get().sessions),
          );
          // Compara contenido antes de actualizar el estado para evitar el
          // re-render (y el parpadeo asociado) cuando el poll detecta cambio
          // de updatedAt pero el contenido normalizado ya coincide con el
          // que tenemos en memoria.
          if (!areManagedSessionsEquivalent(get().sessions, nextSessions)) {
            set({ sessions: nextSessions });
          }
        })
        .catch((error) => logSessionPersistenceError('reloadSessionsFromStorage', error));
    },
    create: (draft) => {
      const session = buildSessionFromDraft(config, draft);

      void createSessionRecord(config, session)
        .then((result) =>
          set((state) => ({
            sessions: filterSessionsForState(
              result.records,
              state.hasLoadedHistoricalSessions,
              getVisibleSessionIds(state.sessions),
            ),
          })),
        )
        .catch((error) => logSessionPersistenceError('createSession', error));

      return session.id;
    },
    createWithConcurrencyCheck: async (draft) => {
      try {
        const session = buildSessionFromDraft(config, draft);
        const result = await createSessionRecord(config, session);

        set((state) => ({
          sessions: filterSessionsForState(
              result.records,
              state.hasLoadedHistoricalSessions,
              getVisibleSessionIds(state.sessions),
            ),
        }));
        return { ok: true, message: 'Sesión creada.', sessionId: session.id };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'No se ha podido crear la sesión.',
        };
      }
    },
    importSessions: (drafts) => {
      let estimatedImportedCount = 0;
      const importedSessionIds = new Set<string>();

      void importSessionRecords(config, (latestSessions) => {
        const now = new Date().toISOString();
        const existingKeys = new Set(
          latestSessions
            .map((session) => session.notes.match(/ImportKey:([^\s]+)/)?.[1])
            .filter((value): value is string => Boolean(value)),
        );
        const importedSessions: ManagedSession[] = [];

        drafts.forEach(({ externalKey, draft, taskIds }) => {
          const normalizedCode = draft.code.trim().toLowerCase();
          const isDuplicate =
            existingKeys.has(externalKey) ||
            latestSessions.some(
              (session) =>
                session.code.trim().toLowerCase() === normalizedCode &&
                session.date === draft.date,
            );

          if (isDuplicate) {
            return;
          }

          const closedAt = draft.date ? `${draft.date}T00:00:00.000Z` : now;

          const importedSessionId = createSessionId(config.moduleId);
          importedSessionIds.add(importedSessionId);
          importedSessions.push({
            id: importedSessionId,
            date: draft.date,
            code: draft.code.trim(),
            title: draft.title.trim() || `${config.newSessionDefaultTitle} ${draft.date}`.trim(),
            notes: `${draft.notes.trim() ? `${draft.notes.trim()} ` : ''}ImportKey:${externalKey}`,
            status: 'closed',
            items: taskIds,
            treatedTaskIds: taskIds,
            untreatedTaskIds: [],
            createdAt: closedAt,
            updatedAt: now,
            closedAt,
          });
        });

        estimatedImportedCount = importedSessions.length;
        return importedSessions;
      })
        .then((result) =>
          set((state) => ({
            sessions: filterSessionsForState(
              result.records,
              state.hasLoadedHistoricalSessions,
              new Set([...getVisibleSessionIds(state.sessions), ...importedSessionIds]),
            ),
          })),
        )
        .catch((error) => logSessionPersistenceError('importSessions', error));

      return estimatedImportedCount;
    },
    importSessionsWithConcurrencyCheck: async (drafts) => {
      try {
        let importedCount = 0;
        const importedSessionIds = new Set<string>();
        const result = await importSessionRecords(config, (latestSessions) => {
          const now = new Date().toISOString();
          const existingKeys = new Set(
            latestSessions
              .map((session) => session.notes.match(/ImportKey:([^\s]+)/)?.[1])
              .filter((value): value is string => Boolean(value)),
          );
          const importedSessions: ManagedSession[] = [];

          drafts.forEach(({ externalKey, draft, taskIds }) => {
            const normalizedCode = draft.code.trim().toLowerCase();
            const isDuplicate =
              existingKeys.has(externalKey) ||
              latestSessions.some(
                (session) =>
                  session.code.trim().toLowerCase() === normalizedCode &&
                  session.date === draft.date,
              );

            if (isDuplicate) {
              return;
            }

            const closedAt = draft.date ? `${draft.date}T00:00:00.000Z` : now;

            const importedSessionId = createSessionId(config.moduleId);
            importedSessionIds.add(importedSessionId);
            importedSessions.push({
              id: importedSessionId,
              date: draft.date,
              code: draft.code.trim(),
              title:
                draft.title.trim() || `${config.newSessionDefaultTitle} ${draft.date}`.trim(),
              notes: `${draft.notes.trim() ? `${draft.notes.trim()} ` : ''}ImportKey:${externalKey}`,
              status: 'closed',
              items: taskIds,
              treatedTaskIds: taskIds,
              untreatedTaskIds: [],
              createdAt: closedAt,
              updatedAt: now,
              closedAt,
            });
          });

          importedCount = importedSessions.length;
          return importedSessions;
        });

        set((state) => ({
          sessions: filterSessionsForState(
            result.records,
            state.hasLoadedHistoricalSessions,
            new Set([...getVisibleSessionIds(state.sessions), ...importedSessionIds]),
          ),
        }));
        return { ok: true, message: 'Sesiones importadas.', importedCount };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error ? error.message : 'No se han podido importar las sesiones.',
          importedCount: 0,
        };
      }
    },
    remove: (sessionId) => {
      void removeSessionRecord(config, sessionId, null)
        .then((result) =>
          set((state) => ({
            sessions: filterSessionsForState(
              result.records,
              state.hasLoadedHistoricalSessions,
              getVisibleSessionIds(state.sessions),
            ),
          })),
        )
        .catch((error) => logSessionPersistenceError('removeSession', error));
    },
    removeWithConcurrencyCheck: async (sessionId, expectedUpdatedAt) => {
      try {
        const result = await removeSessionRecord(config, sessionId, expectedUpdatedAt);

        set((state) => ({
          sessions: filterSessionsForState(
              result.records,
              state.hasLoadedHistoricalSessions,
              getVisibleSessionIds(state.sessions),
            ),
        }));
        return { ok: true, message: 'Sesión eliminada.' };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'No se ha podido eliminar la sesión.',
        };
      }
    },
    update: (sessionId, draft) => {
      void updateSessionRecord(
        config,
        sessionId,
        null,
        (latestSession) => buildUpdatedSessionFromDraft(config, latestSession, draft),
        {
          missingMessage: 'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
          conflictMessage:
            'La sesión ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
        },
      )
        .then((result) =>
          set((state) => ({
            sessions: filterSessionsForState(
              result.records,
              state.hasLoadedHistoricalSessions,
              getVisibleSessionIds(state.sessions),
            ),
          })),
        )
        .catch((error) => logSessionPersistenceError('updateSession', error));
    },
    updateWithConcurrencyCheck: async (sessionId, draft, expectedUpdatedAt) => {
      try {
        const result = await updateSessionRecord(
          config,
          sessionId,
          expectedUpdatedAt,
          (latestSession) => buildUpdatedSessionFromDraft(config, latestSession, draft),
          {
            missingMessage:
              'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
            conflictMessage:
              'La sesión ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
          },
        );

        const changes = buildAuditChanges(
          result.previousRecord as unknown as Record<string, unknown>,
          result.updatedRecord as unknown as Record<string, unknown>,
          { title: 'Título', date: 'Fecha', code: 'Código' },
          ['title', 'date', 'code'],
        );
        if (changes.length > 0) {
          enqueueAuditEvent({
            module: config.moduleId as 'comite' | 'paritaria',
            entityId: sessionId,
            action: 'updated',
            summary: buildUpdateSummary(changes),
            changes,
          });
        }

        set((state) => ({
          sessions: filterSessionsForState(
              result.records,
              state.hasLoadedHistoricalSessions,
              getVisibleSessionIds(state.sessions),
            ),
        }));
        return { ok: true, message: 'Sesión guardada.', session: result.updatedRecord };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'No se ha podido guardar la sesión.',
        };
      }
    },
    addTask: (sessionId, taskId) => {
      void updateSessionRecord(
        config,
        sessionId,
        null,
        (latestSession) => addTaskToSession(latestSession, taskId),
        {
          missingMessage: 'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
          conflictMessage:
            'La sesión ha sido modificada por otro usuario. Recarga antes de añadir puntos.',
        },
      )
        .then((result) =>
          set((state) => ({
            sessions: filterSessionsForState(
              result.records,
              state.hasLoadedHistoricalSessions,
              getVisibleSessionIds(state.sessions),
            ),
          })),
        )
        .catch((error) => logSessionPersistenceError('addSessionTask', error));
    },
    addTaskWithConcurrencyCheck: async (sessionId, taskId, expectedUpdatedAt) => {
      try {
        const result = await updateSessionRecord(
          config,
          sessionId,
          expectedUpdatedAt,
          (latestSession) => addTaskToSession(latestSession, taskId),
          {
            missingMessage:
              'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
            conflictMessage:
              'La sesión ha sido modificada por otro usuario. Recarga antes de añadir puntos.',
          },
        );

        set((state) => ({
          sessions: filterSessionsForState(
              result.records,
              state.hasLoadedHistoricalSessions,
              getVisibleSessionIds(state.sessions),
            ),
        }));
        return { ok: true, message: 'Punto añadido.', session: result.updatedRecord };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'No se ha podido añadir el punto.',
        };
      }
    },
    removeTask: (sessionId, taskId) => {
      void updateSessionRecord(
        config,
        sessionId,
        null,
        (latestSession) => removeTaskFromSession(latestSession, taskId),
        {
          missingMessage: 'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
          conflictMessage:
            'La sesión ha sido modificada por otro usuario. Recarga antes de quitar puntos.',
        },
      )
        .then((result) =>
          set((state) => ({
            sessions: filterSessionsForState(
              result.records,
              state.hasLoadedHistoricalSessions,
              getVisibleSessionIds(state.sessions),
            ),
          })),
        )
        .catch((error) => logSessionPersistenceError('removeSessionTask', error));
    },
    removeTaskWithConcurrencyCheck: async (sessionId, taskId, expectedUpdatedAt) => {
      try {
        const result = await updateSessionRecord(
          config,
          sessionId,
          expectedUpdatedAt,
          (latestSession) => removeTaskFromSession(latestSession, taskId),
          {
            missingMessage:
              'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
            conflictMessage:
              'La sesión ha sido modificada por otro usuario. Recarga antes de quitar puntos.',
          },
        );

        set((state) => ({
          sessions: filterSessionsForState(
              result.records,
              state.hasLoadedHistoricalSessions,
              getVisibleSessionIds(state.sessions),
            ),
        }));
        return { ok: true, message: 'Punto quitado.', session: result.updatedRecord };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'No se ha podido quitar el punto.',
        };
      }
    },
    moveTask: (sessionId, taskId, direction) => {
      void updateSessionRecord(
        config,
        sessionId,
        null,
        (latestSession) => moveTaskInSession(latestSession, taskId, direction),
        {
          missingMessage: 'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
          conflictMessage:
            'La sesión ha sido modificada por otro usuario. Recarga antes de reordenar puntos.',
        },
      )
        .then((result) =>
          set((state) => ({
            sessions: filterSessionsForState(
              result.records,
              state.hasLoadedHistoricalSessions,
              getVisibleSessionIds(state.sessions),
            ),
          })),
        )
        .catch((error) => logSessionPersistenceError('moveSessionTask', error));
    },
    moveTaskWithConcurrencyCheck: async (sessionId, taskId, direction, expectedUpdatedAt) => {
      try {
        const result = await updateSessionRecord(
          config,
          sessionId,
          expectedUpdatedAt,
          (latestSession) => moveTaskInSession(latestSession, taskId, direction),
          {
            missingMessage:
              'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
            conflictMessage:
              'La sesión ha sido modificada por otro usuario. Recarga antes de reordenar puntos.',
          },
        );

        set((state) => ({
          sessions: filterSessionsForState(
              result.records,
              state.hasLoadedHistoricalSessions,
              getVisibleSessionIds(state.sessions),
            ),
        }));
        return { ok: true, message: 'Orden actualizado.', session: result.updatedRecord };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'No se ha podido reordenar el punto.',
        };
      }
    },
    closeSession: (sessionId, treatedTaskIds) => {
      void updateSessionRecord(
        config,
        sessionId,
        null,
        (latestSession) => {
          if (latestSession.status === 'closed') {
            throw new Error('La sesión ya está cerrada. Recarga antes de continuar.');
          }

          const now = new Date().toISOString();
          const treatedSet = new Set(treatedTaskIds);
          const treated = latestSession.items.filter((taskId) => treatedSet.has(taskId));
          const untreated = latestSession.items.filter((taskId) => !treatedSet.has(taskId));
          return {
            ...latestSession,
            status: 'closed',
            treatedTaskIds: treated,
            untreatedTaskIds: untreated,
            updatedAt: now,
            closedAt: now,
          };
        },
        {
          missingMessage: 'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
          conflictMessage:
            'La sesión ha sido modificada por otro usuario. Recarga antes de cerrar para no sobrescribir cambios.',
        },
      )
        .then((result) =>
          set((state) => ({
            sessions: filterSessionsForState(
              result.records,
              state.hasLoadedHistoricalSessions,
              getVisibleSessionIds(state.sessions),
            ),
          })),
        )
        .catch((error) => logSessionPersistenceError('closeSession', error));
    },

    closeSessionWithConcurrencyCheck: async (sessionId, treatedTaskIds, expectedUpdatedAt) => {
      try {
        const result = await updateSessionRecord(
          config,
          sessionId,
          expectedUpdatedAt,
          (latestSession) => {
            if (latestSession.status === 'closed') {
              throw new Error('La sesión ya está cerrada. Recarga antes de continuar.');
            }

            const now = new Date().toISOString();
            const treatedSet = new Set(treatedTaskIds);
            const treated = latestSession.items.filter((taskId) => treatedSet.has(taskId));
            const untreated = latestSession.items.filter((taskId) => !treatedSet.has(taskId));
            return {
              ...latestSession,
              status: 'closed',
              treatedTaskIds: treated,
              untreatedTaskIds: untreated,
              updatedAt: now,
              closedAt: now,
            };
          },
          {
            missingMessage:
              'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
            conflictMessage:
              'La sesión ha sido modificada por otro usuario. Recarga antes de cerrar para no sobrescribir cambios.',
          },
        );

        set((state) => ({
          sessions: filterSessionsForState(
              result.records,
              state.hasLoadedHistoricalSessions,
              getVisibleSessionIds(state.sessions),
            ),
        }));
        return { ok: true, message: 'Sesión cerrada.', session: result.updatedRecord };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'No se ha podido cerrar la sesión.',
        };
      }
    },
  }));
}

export { EMPTY_MANAGED_SESSION_DRAFT };

import { create } from 'zustand';
import { readStorageItem } from '../../services/persistence';
import {
  deleteSharedArrayRecord,
  saveSharedArrayMutation,
  saveSharedArrayRecord,
} from '../../services/sharedRecordPersistence';
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

function getSessionId(session: ManagedSession): string {
  return session.id;
}

function getSessionUpdatedAt(session: ManagedSession): string | null {
  return session.updatedAt ?? null;
}

function logSessionPersistenceError(action: string, error: unknown): void {
  console.error(`[${action}] No se ha podido guardar la sesión compartida.`, error);
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
    load: () =>
      set({
        sessions: filterSessionsForState(readSessions(config), false),
        hasLoadedHistoricalSessions: false,
      }),
    loadHistoricalSessions: () =>
      set({
        sessions: filterSessionsForState(readSessions(config), true),
        hasLoadedHistoricalSessions: true,
      }),
    reloadFromStorage: () =>
      set({
        sessions: filterSessionsForState(
          readSessions(config),
          get().hasLoadedHistoricalSessions,
          getVisibleSessionIds(get().sessions),
        ),
      }),
    create: (draft) => {
      const session = buildSessionFromDraft(config, draft);

      void saveSharedArrayMutation<ManagedSession>({
        storageKey: config.storageKey,
        parseRecords: (storageValue) =>
          parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
        updateRecords: (latestSessions) => {
          if (latestSessions.some((existingSession) => existingSession.id === session.id)) {
            throw new Error(
              'La sesión ya existe en la base compartida. Recarga antes de continuar.',
            );
          }

          return [session, ...latestSessions];
        },
      })
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
        const result = await saveSharedArrayMutation<ManagedSession>({
          storageKey: config.storageKey,
          parseRecords: (storageValue) =>
            parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
          updateRecords: (latestSessions) => {
            if (latestSessions.some((existingSession) => existingSession.id === session.id)) {
              throw new Error(
                'La sesión ya existe en la base compartida. Recarga antes de continuar.',
              );
            }

            return [session, ...latestSessions];
          },
        });

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

      void saveSharedArrayMutation<ManagedSession>({
        storageKey: config.storageKey,
        parseRecords: (storageValue) =>
          parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
        updateRecords: (latestSessions) => {
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
          return importedSessions.length === 0
            ? latestSessions
            : [...importedSessions, ...latestSessions];
        },
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
        const result = await saveSharedArrayMutation<ManagedSession>({
          storageKey: config.storageKey,
          parseRecords: (storageValue) =>
            parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
          updateRecords: (latestSessions) => {
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
            return importedSessions.length === 0
              ? latestSessions
              : [...importedSessions, ...latestSessions];
          },
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
      void deleteSharedArrayRecord<ManagedSession>({
        storageKey: config.storageKey,
        recordId: sessionId,
        expectedUpdatedAt: null,
        parseRecords: (storageValue) =>
          parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
        getRecordId: getSessionId,
        getRecordUpdatedAt: getSessionUpdatedAt,
        missingMessage: 'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
        conflictMessage:
          'La sesión ha sido modificada por otro usuario. Recarga antes de eliminarla.',
      })
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
        const result = await deleteSharedArrayRecord<ManagedSession>({
          storageKey: config.storageKey,
          recordId: sessionId,
          expectedUpdatedAt,
          parseRecords: (storageValue) =>
            parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
          getRecordId: getSessionId,
          getRecordUpdatedAt: getSessionUpdatedAt,
          missingMessage:
            'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
          conflictMessage:
            'La sesión ha sido modificada por otro usuario. Recarga antes de eliminarla.',
        });

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
      void saveSharedArrayRecord<ManagedSession>({
        storageKey: config.storageKey,
        recordId: sessionId,
        expectedUpdatedAt: null,
        parseRecords: (storageValue) =>
          parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
        getRecordId: getSessionId,
        getRecordUpdatedAt: getSessionUpdatedAt,
        updateRecord: (latestSession) => buildUpdatedSessionFromDraft(config, latestSession, draft),
        missingMessage: 'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
        conflictMessage:
          'La sesión ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
      })
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
        const result = await saveSharedArrayRecord<ManagedSession>({
          storageKey: config.storageKey,
          recordId: sessionId,
          expectedUpdatedAt,
          parseRecords: (storageValue) =>
            parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
          getRecordId: getSessionId,
          getRecordUpdatedAt: getSessionUpdatedAt,
          updateRecord: (latestSession) =>
            buildUpdatedSessionFromDraft(config, latestSession, draft),
          missingMessage:
            'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
          conflictMessage:
            'La sesión ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
        });

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
      void saveSharedArrayRecord<ManagedSession>({
        storageKey: config.storageKey,
        recordId: sessionId,
        expectedUpdatedAt: null,
        parseRecords: (storageValue) =>
          parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
        getRecordId: getSessionId,
        getRecordUpdatedAt: getSessionUpdatedAt,
        updateRecord: (latestSession) => addTaskToSession(latestSession, taskId),
        missingMessage: 'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
        conflictMessage:
          'La sesión ha sido modificada por otro usuario. Recarga antes de añadir puntos.',
      })
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
        const result = await saveSharedArrayRecord<ManagedSession>({
          storageKey: config.storageKey,
          recordId: sessionId,
          expectedUpdatedAt,
          parseRecords: (storageValue) =>
            parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
          getRecordId: getSessionId,
          getRecordUpdatedAt: getSessionUpdatedAt,
          updateRecord: (latestSession) => addTaskToSession(latestSession, taskId),
          missingMessage:
            'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
          conflictMessage:
            'La sesión ha sido modificada por otro usuario. Recarga antes de añadir puntos.',
        });

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
      void saveSharedArrayRecord<ManagedSession>({
        storageKey: config.storageKey,
        recordId: sessionId,
        expectedUpdatedAt: null,
        parseRecords: (storageValue) =>
          parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
        getRecordId: getSessionId,
        getRecordUpdatedAt: getSessionUpdatedAt,
        updateRecord: (latestSession) => removeTaskFromSession(latestSession, taskId),
        missingMessage: 'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
        conflictMessage:
          'La sesión ha sido modificada por otro usuario. Recarga antes de quitar puntos.',
      })
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
        const result = await saveSharedArrayRecord<ManagedSession>({
          storageKey: config.storageKey,
          recordId: sessionId,
          expectedUpdatedAt,
          parseRecords: (storageValue) =>
            parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
          getRecordId: getSessionId,
          getRecordUpdatedAt: getSessionUpdatedAt,
          updateRecord: (latestSession) => removeTaskFromSession(latestSession, taskId),
          missingMessage:
            'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
          conflictMessage:
            'La sesión ha sido modificada por otro usuario. Recarga antes de quitar puntos.',
        });

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
      void saveSharedArrayRecord<ManagedSession>({
        storageKey: config.storageKey,
        recordId: sessionId,
        expectedUpdatedAt: null,
        parseRecords: (storageValue) =>
          parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
        getRecordId: getSessionId,
        getRecordUpdatedAt: getSessionUpdatedAt,
        updateRecord: (latestSession) => moveTaskInSession(latestSession, taskId, direction),
        missingMessage: 'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
        conflictMessage:
          'La sesión ha sido modificada por otro usuario. Recarga antes de reordenar puntos.',
      })
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
        const result = await saveSharedArrayRecord<ManagedSession>({
          storageKey: config.storageKey,
          recordId: sessionId,
          expectedUpdatedAt,
          parseRecords: (storageValue) =>
            parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
          getRecordId: getSessionId,
          getRecordUpdatedAt: getSessionUpdatedAt,
          updateRecord: (latestSession) => moveTaskInSession(latestSession, taskId, direction),
          missingMessage:
            'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
          conflictMessage:
            'La sesión ha sido modificada por otro usuario. Recarga antes de reordenar puntos.',
        });

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
      void saveSharedArrayMutation<ManagedSession>({
        storageKey: config.storageKey,
        parseRecords: (storageValue) =>
          parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
        updateRecords: (latestSessions) => {
          const latestSession = latestSessions.find((session) => session.id === sessionId);
          if (!latestSession) {
            throw new Error(
              'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
            );
          }

          if (latestSession.status === 'closed') {
            throw new Error('La sesión ya está cerrada. Recarga antes de continuar.');
          }

          const now = new Date().toISOString();
          const treatedSet = new Set(treatedTaskIds);
          return latestSessions.map((session) => {
            if (session.id !== sessionId) {
              return session;
            }

            const treated = session.items.filter((taskId) => treatedSet.has(taskId));
            const untreated = session.items.filter((taskId) => !treatedSet.has(taskId));
            return {
              ...session,
              status: 'closed',
              treatedTaskIds: treated,
              untreatedTaskIds: untreated,
              updatedAt: now,
              closedAt: now,
            };
          });
        },
      })
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
        let closedSession: ManagedSession | undefined;
        const result = await saveSharedArrayMutation<ManagedSession>({
          storageKey: config.storageKey,
          parseRecords: (storageValue) =>
            parseManagedSessionsSnapshot(storageValue, config.newSessionDefaultTitle),
          updateRecords: (latestSessions) => {
            const latestSession = latestSessions.find((session) => session.id === sessionId);
            if (!latestSession) {
              throw new Error(
                'La sesión ya no existe en la base compartida. Recarga antes de continuar.',
              );
            }

            if (latestSession.status === 'closed') {
              throw new Error('La sesión ya está cerrada. Recarga antes de continuar.');
            }

            const latestUpdatedAt = latestSession.updatedAt ?? null;
            if (expectedUpdatedAt && latestUpdatedAt !== expectedUpdatedAt) {
              throw new Error(
                'La sesión ha sido modificada por otro usuario. Recarga antes de cerrar para no sobrescribir cambios.',
              );
            }

            const now = new Date().toISOString();
            const treatedSet = new Set(treatedTaskIds);
            return latestSessions.map((session) => {
              if (session.id !== sessionId) {
                return session;
              }

              const treated = session.items.filter((taskId) => treatedSet.has(taskId));
              const untreated = session.items.filter((taskId) => !treatedSet.has(taskId));
              closedSession = {
                ...session,
                status: 'closed',
                treatedTaskIds: treated,
                untreatedTaskIds: untreated,
                updatedAt: now,
                closedAt: now,
              };
              return closedSession;
            });
          },
        });

        set((state) => ({
          sessions: filterSessionsForState(
              result.records,
              state.hasLoadedHistoricalSessions,
              getVisibleSessionIds(state.sessions),
            ),
        }));
        return { ok: true, message: 'Sesión cerrada.', session: closedSession };
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

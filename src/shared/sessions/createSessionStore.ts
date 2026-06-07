import { create } from 'zustand';
import { readStorageItem, writeStorageItem } from '../../services/persistence';
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
  load: () => void;
  reloadFromStorage: () => void;
  create: (draft: ManagedSessionDraft) => string;
  remove: (sessionId: string) => void;
  addTask: (sessionId: string, taskId: string) => void;
  removeTask: (sessionId: string, taskId: string) => void;
  moveTask: (sessionId: string, taskId: string, direction: 'up' | 'down') => void;
  closeSession: (sessionId: string, treatedTaskIds: string[]) => void;
}

function createSessionId(moduleId: string): string {
  return `${moduleId}-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readSessions(config: SessionModuleConfig): ManagedSession[] {
  const stored = readStorageItem(config.storageKey);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  return Array.isArray(parsed)
    ? parsed.filter(isManagedSession).map((session) => normalizeManagedSession(session, config.newSessionDefaultTitle))
    : [];
}

function persistSessions(storageKey: string, sessions: ManagedSession[]): void {
  writeStorageItem(storageKey, JSON.stringify(sessions));
}

function updateSessionList(
  sessions: ManagedSession[],
  sessionId: string,
  updater: (session: ManagedSession) => ManagedSession,
): ManagedSession[] {
  return sessions.map((session) => (session.id === sessionId ? updater(session) : session));
}

export function createManagedSessionStore(config: SessionModuleConfig) {
  return create<ManagedSessionStateStore>((set) => ({
    sessions: [],
    load: () => set({ sessions: readSessions(config) }),
    reloadFromStorage: () => set({ sessions: readSessions(config) }),
    create: (draft) => {
      const now = new Date().toISOString();
      const session: ManagedSession = {
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

      set((state) => {
        const sessions = [session, ...state.sessions];
        persistSessions(config.storageKey, sessions);
        return { sessions };
      });

      return session.id;
    },
    remove: (sessionId) => {
      set((state) => {
        const sessions = state.sessions.filter((session) => session.id !== sessionId);
        persistSessions(config.storageKey, sessions);
        return { sessions };
      });
    },
    addTask: (sessionId, taskId) => {
      set((state) => {
        const now = new Date().toISOString();
        const sessions = updateSessionList(state.sessions, sessionId, (session) => {
          if (session.status === 'closed' || session.items.includes(taskId)) {
            return session;
          }

          return { ...session, items: [...session.items, taskId], updatedAt: now };
        });
        persistSessions(config.storageKey, sessions);
        return { sessions };
      });
    },
    removeTask: (sessionId, taskId) => {
      set((state) => {
        const now = new Date().toISOString();
        const sessions = updateSessionList(state.sessions, sessionId, (session) => {
          if (session.status === 'closed') {
            return session;
          }

          return { ...session, items: session.items.filter((item) => item !== taskId), updatedAt: now };
        });
        persistSessions(config.storageKey, sessions);
        return { sessions };
      });
    },
    moveTask: (sessionId, taskId, direction) => {
      set((state) => {
        const now = new Date().toISOString();
        const sessions = updateSessionList(state.sessions, sessionId, (session) => {
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
          return { ...session, items, updatedAt: now };
        });
        persistSessions(config.storageKey, sessions);
        return { sessions };
      });
    },
    closeSession: (sessionId, treatedTaskIds) => {
      set((state) => {
        const now = new Date().toISOString();
        const treatedSet = new Set(treatedTaskIds);
        const sessions = updateSessionList(state.sessions, sessionId, (session) => {
          if (session.status === 'closed') {
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
        persistSessions(config.storageKey, sessions);
        return { sessions };
      });
    },
  }));
}

export { EMPTY_MANAGED_SESSION_DRAFT };

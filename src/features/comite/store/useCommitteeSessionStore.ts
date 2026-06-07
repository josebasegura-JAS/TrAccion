import { create } from 'zustand';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import {
  EMPTY_COMMITTEE_SESSION_DRAFT,
  type CommitteeSession,
  type CommitteeSessionDraft,
} from '../domain/comite';

const STORAGE_KEY = 'traccion.v1.comite.sessions';

interface CommitteeSessionStateStore {
  sessions: CommitteeSession[];
  load: () => void;
  reloadFromStorage: () => void;
  create: (draft: CommitteeSessionDraft) => string;
  remove: (sessionId: string) => void;
  addTask: (sessionId: string, taskId: string) => void;
  removeTask: (sessionId: string, taskId: string) => void;
  moveTask: (sessionId: string, taskId: string, direction: 'up' | 'down') => void;
  closeSession: (sessionId: string, treatedTaskIds: string[]) => void;
}

function createSessionId(): string {
  return `committee-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function persistSessions(sessions: CommitteeSession[]): void {
  writeStorageItem(STORAGE_KEY, JSON.stringify(sessions));
}

function isCommitteeSession(value: unknown): value is CommitteeSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof CommitteeSession, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.date === 'string' &&
    typeof candidate.code === 'string' &&
    typeof candidate.title === 'string' &&
    (candidate.status === 'open' || candidate.status === 'closed')
  );
}

function normalizeSession(session: CommitteeSession): CommitteeSession {
  const createdAt = session.createdAt ?? new Date().toISOString();
  const updatedAt = session.updatedAt ?? createdAt;
  const items = Array.isArray(session.items)
    ? session.items.filter((item): item is string => typeof item === 'string')
    : [];
  const treatedTaskIds = Array.isArray(session.treatedTaskIds)
    ? session.treatedTaskIds.filter((item): item is string => typeof item === 'string')
    : [];
  const untreatedTaskIds = Array.isArray(session.untreatedTaskIds)
    ? session.untreatedTaskIds.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    id: session.id,
    date: session.date,
    code: session.code,
    title: session.title || `Comité ${session.date || ''}`.trim(),
    notes: session.notes ?? EMPTY_COMMITTEE_SESSION_DRAFT.notes,
    status: session.status === 'closed' ? 'closed' : 'open',
    items,
    treatedTaskIds,
    untreatedTaskIds,
    createdAt,
    updatedAt,
    closedAt: session.closedAt ?? null,
  };
}

function readSessions(): CommitteeSession[] {
  const stored = readStorageItem(STORAGE_KEY);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  return Array.isArray(parsed) ? parsed.filter(isCommitteeSession).map(normalizeSession) : [];
}

function updateSessionList(
  sessions: CommitteeSession[],
  sessionId: string,
  updater: (session: CommitteeSession) => CommitteeSession,
): CommitteeSession[] {
  return sessions.map((session) => (session.id === sessionId ? updater(session) : session));
}

export const useCommitteeSessionStore = create<CommitteeSessionStateStore>((set) => ({
  sessions: [],
  load: () => set({ sessions: readSessions() }),
  reloadFromStorage: () => set({ sessions: readSessions() }),
  create: (draft) => {
    const now = new Date().toISOString();
    const session: CommitteeSession = {
      id: createSessionId(),
      date: draft.date,
      code: draft.code.trim(),
      title: draft.title.trim() || `Comité ${draft.date}`,
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
      persistSessions(sessions);
      return { sessions };
    });

    return session.id;
  },
  remove: (sessionId) => {
    set((state) => {
      const sessions = state.sessions.filter((session) => session.id !== sessionId);
      persistSessions(sessions);
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
      persistSessions(sessions);
      return { sessions };
    });
  },
  removeTask: (sessionId, taskId) => {
    set((state) => {
      const now = new Date().toISOString();
      const sessions = updateSessionList(state.sessions, sessionId, (session) => ({
        ...session,
        items: session.items.filter((itemId) => itemId !== taskId),
        updatedAt: now,
      }));
      persistSessions(sessions);
      return { sessions };
    });
  },
  moveTask: (sessionId, taskId, direction) => {
    set((state) => {
      const now = new Date().toISOString();
      const sessions = updateSessionList(state.sessions, sessionId, (session) => {
        const currentIndex = session.items.indexOf(taskId);
        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

        if (
          session.status === 'closed' ||
          currentIndex < 0 ||
          targetIndex < 0 ||
          targetIndex >= session.items.length
        ) {
          return session;
        }

        const items = [...session.items];
        const [item] = items.splice(currentIndex, 1);
        items.splice(targetIndex, 0, item);
        return { ...session, items, updatedAt: now };
      });
      persistSessions(sessions);
      return { sessions };
    });
  },
  closeSession: (sessionId, treatedTaskIds) => {
    set((state) => {
      const now = new Date().toISOString();
      const treatedTaskIdSet = new Set(treatedTaskIds);
      const sessions = updateSessionList(state.sessions, sessionId, (session) => {
        if (session.status === 'closed') {
          return session;
        }

        return {
          ...session,
          status: 'closed',
          treatedTaskIds: session.items.filter((taskId) => treatedTaskIdSet.has(taskId)),
          untreatedTaskIds: session.items.filter((taskId) => !treatedTaskIdSet.has(taskId)),
          updatedAt: now,
          closedAt: now,
        };
      });
      persistSessions(sessions);
      return { sessions };
    });
  },
}));

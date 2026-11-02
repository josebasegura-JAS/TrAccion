import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCommitteeSessionStore } from '../../features/comite/store/useCommitteeSessionStore';
import type { ManagedSession } from './session';

describe('Sesiones: la desconexión no sustituye la última lectura válida', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    useCommitteeSessionStore.setState({ sessions: [], hasLoadedHistoricalSessions: false });
  });

  it('conserva sesiones al fallar una recarga SQLite', async () => {
    const previous = {
      id: 'session-1', date: '2026-11-02', code: 'CE-2026', title: 'Comité',
      notes: '', status: 'open' as const, items: [], treatedTaskIds: [], untreatedTaskIds: [],
      createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z', closedAt: null,
    } satisfies ManagedSession;
    useCommitteeSessionStore.setState({ sessions: [previous] });
    const loader = vi.fn(async () => ({ status: { ready: false, phase: 'reconnecting' }, records: [] }));
    Object.defineProperty(window, 'traccion', { configurable: true, value: {
      loadComiteSessionRecords: loader,
      saveComiteSessionRecordIfUnchanged: vi.fn(),
    } });
    useCommitteeSessionStore.getState().reloadFromStorage();
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useCommitteeSessionStore.getState().sessions).toEqual([previous]);
  });
});

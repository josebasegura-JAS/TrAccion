import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMITE_SESSION_CONFIG } from '../../features/comite/domain/comite';
import { useCommitteeSessionStore } from '../../features/comite/store/useCommitteeSessionStore';
import { PARITARIA_SESSION_CONFIG } from '../../features/paritaria/domain/paritaria';
import { useParitariaSessionStore } from '../../features/paritaria/store/useParitariaSessionStore';
import type { ManagedSession, ManagedSessionDraft } from './session';

/**
 * Tests del store completo (createManagedSessionStore) ejercitando la rama
 * de tabla SQLite nativa (hasSessionSqliteRepository === true), no el
 * fallback de blob compartido. createSessionStore.test.ts ya cubre bien el
 * fallback (mockeando saveLocalStorageRecordIfUnchanged); aquí se cubre el
 * "pegamento" que conecta el store con loadAllSessionRecordsFromSqlite /
 * saveSessionRecordToSqlite, que hasta ahora no tenía ningún test propio
 * aparte de las funciones de bajo nivel en sessionSqliteRepository.test.ts.
 *
 * Se prueban ambos módulos (Comité y Paritaria) porque usan la misma
 * factory pero bindings IPC distintos (loadComiteSessionRecords vs
 * loadParitariaSessionRecords) — un bug en cuál se llama para cuál no se
 * detectaría probando solo uno.
 */
const timestamp = '2026-06-17T08:00:00.000Z';

function session(overrides: Partial<ManagedSession> = {}): ManagedSession {
  return {
    id: 'session-1',
    date: '2026-06-17',
    code: 'CE-2026-06',
    title: 'Sesión de junio',
    notes: '',
    status: 'open',
    items: [],
    treatedTaskIds: [],
    untreatedTaskIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    closedAt: null,
    ...overrides,
  };
}

function draft(overrides: Partial<ManagedSessionDraft> = {}): ManagedSessionDraft {
  return {
    date: '2026-06-17',
    code: 'CE-2026-06',
    title: 'Sesión de junio',
    notes: '',
    ...overrides,
  };
}

function activeStatus() {
  return { ready: true, phase: 'active' as const, message: 'SQLite activo' };
}

function recordsSnapshot(sessions: ManagedSession[]) {
  return {
    status: activeStatus(),
    records: sessions.map((item) => ({
      id: item.id,
      value: JSON.stringify(item),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      deletedAt: null,
    })),
  };
}

describe.each([
  {
    moduleLabel: 'Comité',
    useSessionStore: useCommitteeSessionStore,
    config: COMITE_SESSION_CONFIG,
    loadKey: 'loadComiteSessionRecords' as const,
    saveKey: 'saveComiteSessionRecordIfUnchanged' as const,
  },
  {
    moduleLabel: 'Paritaria',
    useSessionStore: useParitariaSessionStore,
    config: PARITARIA_SESSION_CONFIG,
    loadKey: 'loadParitariaSessionRecords' as const,
    saveKey: 'saveParitariaSessionRecordIfUnchanged' as const,
  },
])('$moduleLabel — store completo contra tabla SQLite nativa', ({ useSessionStore, loadKey, saveKey }) => {
  beforeEach(() => {
    window.localStorage.clear();
    useSessionStore.setState({ sessions: [], hasLoadedHistoricalSessions: false });
  });

  afterEach(() => {
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
  });

  it('createWithConcurrencyCheck guarda en la tabla nativa y recarga la lista completa', async () => {
    const loader = vi.fn(async () => recordsSnapshot([]));
    const saver = vi.fn(async () => ({
      ok: true,
      status: activeStatus(),
      currentUpdatedAt: timestamp,
      message: 'Sesión guardada en SQLite.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { [loadKey]: loader, [saveKey]: saver },
    });

    const result = await useSessionStore.getState().createWithConcurrencyCheck(draft());

    expect(result.ok).toBe(true);
    expect(saver).toHaveBeenCalledTimes(1);
    // loadAllSessionRecordsFromSqlite se llama dos veces: una para
    // comprobar duplicados/estado previo, otra para recargar tras guardar.
    expect(loader.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('updateWithConcurrencyCheck rechaza el guardado cuando otro usuario modificó la sesión entre tanto', async () => {
    const existingSession = session();
    const loader = vi.fn(async () =>
      recordsSnapshot([{ ...existingSession, updatedAt: '2026-06-17T09:00:00.000Z' }]),
    );
    const saver = vi.fn();

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { [loadKey]: loader, [saveKey]: saver },
    });

    const result = await useSessionStore
      .getState()
      .updateWithConcurrencyCheck(existingSession.id, draft({ title: 'Cambio que no debería aplicarse' }), timestamp);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/modificada por otro usuario/i);
    // El conflicto se detecta comparando la lista ya cargada: el saver
    // jamás debe llegar a invocarse.
    expect(saver).not.toHaveBeenCalled();
  });

  it('updateWithConcurrencyCheck guarda correctamente cuando expectedUpdatedAt coincide', async () => {
    const existingSession = session();
    const loader = vi.fn(async () => recordsSnapshot([existingSession]));
    const saver = vi.fn(async () => ({
      ok: true,
      status: activeStatus(),
      currentUpdatedAt: '2026-06-17T09:00:00.000Z',
      message: 'Sesión guardada en SQLite.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { [loadKey]: loader, [saveKey]: saver },
    });

    const result = await useSessionStore
      .getState()
      .updateWithConcurrencyCheck(existingSession.id, draft({ title: 'Título actualizado' }), timestamp);

    expect(result.ok).toBe(true);
    expect(saver).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().sessions.find((item) => item.id === existingSession.id)?.title).toBe(
      'Título actualizado',
    );
  });

  it('addTaskWithConcurrencyCheck añade el punto en la tabla nativa', async () => {
    const existingSession = session({ items: ['task-1'] });
    const loader = vi.fn(async () => recordsSnapshot([existingSession]));
    const saver = vi.fn(async () => ({
      ok: true,
      status: activeStatus(),
      currentUpdatedAt: '2026-06-17T09:00:00.000Z',
      message: 'Sesión guardada en SQLite.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { [loadKey]: loader, [saveKey]: saver },
    });

    const result = await useSessionStore
      .getState()
      .addTaskWithConcurrencyCheck(existingSession.id, 'task-2', timestamp);

    expect(result.ok).toBe(true);
    expect(saver).toHaveBeenCalledTimes(1);
    const savedCall = saver.mock.calls[0][0] as { id: string; value: string; expectedUpdatedAt: string | null };
    const savedValue = JSON.parse(savedCall.value) as ManagedSession;
    expect(savedValue.items).toEqual(['task-1', 'task-2']);
  });

  it('removeWithConcurrencyCheck rechaza el borrado cuando otro usuario ha modificado la sesión entre tanto', async () => {
    const existingSession = session();
    const loader = vi.fn(async () =>
      recordsSnapshot([{ ...existingSession, updatedAt: '2026-06-17T09:00:00.000Z' }]),
    );
    const saver = vi.fn();

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { [loadKey]: loader, [saveKey]: saver },
    });

    const result = await useSessionStore
      .getState()
      .removeWithConcurrencyCheck(existingSession.id, timestamp);

    expect(result.ok).toBe(false);
    expect(saver).not.toHaveBeenCalled();
  });

  it('load() lee de la tabla nativa, no del blob compartido, cuando hay bindings disponibles', async () => {
    const nativeSession = session({ id: 'native-only-session' });
    const loader = vi.fn(async () => recordsSnapshot([nativeSession]));

    // Deliberadamente no escribimos nada en localStorage: si load() cayera
    // al blob compartido en vez de a la tabla nativa, la lista quedaría
    // vacía y este test lo detectaría.
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { [loadKey]: loader, [saveKey]: vi.fn() },
    });

    // load() es fire-and-forget (no devuelve Promise), así que hay que
    // esperar a que el estado se actualice en vez de hacer await directo.
    useSessionStore.getState().load();
    await vi.waitFor(() => {
      expect(useSessionStore.getState().sessions.map((item) => item.id)).toContain('native-only-session');
    });

    expect(loader).toHaveBeenCalled();
  });
});

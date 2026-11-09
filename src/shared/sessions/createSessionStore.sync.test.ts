import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMITE_SESSION_CONFIG } from '../../features/comite/domain/comite';
import { createManagedSessionStore } from './createSessionStore';
import type { ManagedSession } from './session';

const status = { ready: true, phase: 'active', message: 'SQLite activo' } as const;

function session(title: string, updatedAt: string): ManagedSession {
  return {
    id: 'comite-session-1',
    date: '2026-11-09',
    code: 'CE-2026-11',
    title,
    notes: '',
    observations: '',
    status: 'open',
    items: [],
    treatedTaskIds: [],
    untreatedTaskIds: [],
    createdAt: '2026-11-09T06:00:00.000Z',
    updatedAt,
    closedAt: null,
  };
}

function snapshot(record: ManagedSession) {
  return {
    status,
    records: [{
      id: record.id,
      value: JSON.stringify(record),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      deletedAt: null,
    }],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
});

describe('recarga multiusuario de sesiones de Comité', () => {
  it('no resuelve la sincronización hasta leer SQLite y aplicar el estado', async () => {
    const pending = deferred<ReturnType<typeof snapshot>>();
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadComiteSessionRecords: vi.fn(() => pending.promise),
        saveComiteSessionRecordIfUnchanged: vi.fn(),
      },
    });
    const store = createManagedSessionStore(COMITE_SESSION_CONFIG);
    let completed = false;
    const reload = store.getState().reloadFromStorage().then(() => { completed = true; });

    await Promise.resolve();
    expect(completed).toBe(false);
    expect(store.getState().sessions).toEqual([]);

    pending.resolve(snapshot(session('Versión compartida', '2026-11-09T06:05:00.000Z')));
    await reload;
    expect(completed).toBe(true);
    expect(store.getState().sessions[0].title).toBe('Versión compartida');
  });

  it('descarta una lectura antigua que termina después de una más reciente', async () => {
    const first = deferred<ReturnType<typeof snapshot>>();
    const second = deferred<ReturnType<typeof snapshot>>();
    const load = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadComiteSessionRecords: load,
        saveComiteSessionRecordIfUnchanged: vi.fn(),
      },
    });
    const store = createManagedSessionStore(COMITE_SESSION_CONFIG);
    const oldReload = store.getState().reloadFromStorage();
    const newReload = store.getState().reloadFromStorage();

    second.resolve(snapshot(session('Nueva', '2026-11-09T06:10:00.000Z')));
    await newReload;
    expect(store.getState().sessions[0].title).toBe('Nueva');

    first.resolve(snapshot(session('Antigua', '2026-11-09T06:01:00.000Z')));
    await oldReload;
    expect(store.getState().sessions[0].title).toBe('Nueva');
  });

  it('propaga un error de lectura para que el coordinador conserve la recarga pendiente', async () => {
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadComiteSessionRecords: vi.fn().mockRejectedValue(new Error('Error de lectura SMB')),
        saveComiteSessionRecordIfUnchanged: vi.fn(),
      },
    });
    const store = createManagedSessionStore(COMITE_SESSION_CONFIG);
    await expect(store.getState().reloadFromStorage()).rejects.toThrow('Error de lectura SMB');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readyStatus: TraccionDatabaseStatus = {
  ready: true,
  engine: 'sqlite',
  phase: 'ready',
};

type TestModule = typeof import('./externalDataSync');

type TestContext = {
  module: TestModule;
  reloadRegisteredSyncableStores: ReturnType<typeof vi.fn>;
  flushPendingSqliteWrites: ReturnType<typeof vi.fn>;
  readHydrationMetadata: ReturnType<typeof vi.fn>;
  applyPersistedRecordsSnapshotToLocalStorage: ReturnType<typeof vi.fn>;
  setActiveSharedEditing: (active: boolean) => void;
};

function tokenSnapshot(
  overrides: Partial<TraccionPersistedRecordsTokenSnapshot> = {},
): TraccionPersistedRecordsTokenSnapshot {
  return {
    status: readyStatus,
    refreshToken: 'token-1',
    latestUpdatedAt: '2026-06-19T08:00:00.000Z',
    taskRecordsUpdatedAt: null,
    sorteosDrawsUpdatedAt: null,
    sorteosExclusionsUpdatedAt: null,
    directStoreUpdatedAt: {},
    ...overrides,
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function loadExternalDataSyncTestContext(): Promise<TestContext> {
  vi.resetModules();

  let activeSharedEditing = false;
  const reloadRegisteredSyncableStores = vi.fn();
  const flushPendingSqliteWrites = vi.fn(async () => 0);
  const readHydrationMetadata = vi.fn(() => ({
    lastUpdatedAt: '2026-06-19T08:00:00.000Z',
    sqlitePath: 'Z:/TrAccion/traccion.sqlite',
    refreshToken: 'token-1',
    strategy: 'sqlite' as const,
  }));
  const applyPersistedRecordsSnapshotToLocalStorage = vi.fn();

  vi.doMock('./syncableStoreRegistrations', () => ({}));
  vi.doMock('./syncableStoreRegistry', () => ({
    reloadRegisteredSyncableStores,
  }));
  vi.doMock('./sharedEditingActivity', () => ({
    hasActiveSharedEditing: () => activeSharedEditing,
    subscribeSharedEditingActivity: () => () => undefined,
  }));
  vi.doMock('./persistence', () => ({
    applyPersistedRecordsSnapshotToLocalStorage,
    flushPendingSqliteWrites,
    readHydrationMetadata,
    subscribeToPersistenceFeedback: () => () => undefined,
  }));

  const module = await import('./externalDataSync');

  return {
    module,
    reloadRegisteredSyncableStores,
    flushPendingSqliteWrites,
    readHydrationMetadata,
    applyPersistedRecordsSnapshotToLocalStorage,
    setActiveSharedEditing: (active: boolean) => {
      activeSharedEditing = active;
    },
  };
}

describe('externalDataSync multiusuario', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  it('no recarga stores si solo cambia el refreshToken compartido', async () => {
    const getPersistedRecordsToken = vi.fn(async () =>
      tokenSnapshot({ refreshToken: 'token-2' }),
    );
    window.traccion = {
      getPersistedRecordsToken,
      loadPersistedRecords: vi.fn(),
    } as unknown as TraccionApi;

    const { module, reloadRegisteredSyncableStores } = await loadExternalDataSyncTestContext();

    module.startExternalDataSyncPolling();
    await flushPromises();

    expect(getPersistedRecordsToken).toHaveBeenCalledTimes(1);
    expect(reloadRegisteredSyncableStores).not.toHaveBeenCalled();
    expect(module.useExternalDataSyncStatus).toBeDefined();

    module.stopExternalDataSyncPolling();
  });

  it('recarga únicamente el store directo que cambia en otro equipo', async () => {
    const getPersistedRecordsToken = vi
      .fn()
      .mockResolvedValueOnce(
        tokenSnapshot({
          refreshToken: 'token-1',
          directStoreUpdatedAt: { teletrabajo: '2026-06-19T08:00:00.000Z' },
        }),
      )
      .mockResolvedValueOnce(
        tokenSnapshot({
          refreshToken: 'token-2',
          directStoreUpdatedAt: { teletrabajo: '2026-06-19T08:05:00.000Z' },
        }),
      );

    window.traccion = {
      getPersistedRecordsToken,
      loadPersistedRecords: vi.fn(),
    } as unknown as TraccionApi;

    const { module, reloadRegisteredSyncableStores } = await loadExternalDataSyncTestContext();

    module.startExternalDataSyncPolling();
    await flushPromises();
    expect(reloadRegisteredSyncableStores).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(12_000);
    await flushPromises();

    expect(reloadRegisteredSyncableStores).toHaveBeenCalledTimes(1);
    expect(reloadRegisteredSyncableStores).toHaveBeenCalledWith(['teletrabajo'], {
      silentPersistenceFeedback: true,
    });

    module.stopExternalDataSyncPolling();
  });

  it('no consulta SQLite mientras hay edición compartida activa', async () => {
    const getPersistedRecordsToken = vi.fn(async () => tokenSnapshot());
    window.traccion = {
      getPersistedRecordsToken,
      loadPersistedRecords: vi.fn(),
    } as unknown as TraccionApi;

    const { module, reloadRegisteredSyncableStores, setActiveSharedEditing } =
      await loadExternalDataSyncTestContext();
    setActiveSharedEditing(true);

    module.startExternalDataSyncPolling();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(12_000);
    await flushPromises();

    expect(getPersistedRecordsToken).not.toHaveBeenCalled();
    expect(reloadRegisteredSyncableStores).not.toHaveBeenCalled();

    module.stopExternalDataSyncPolling();
  });

  it('aplica snapshot legacy y recarga solo los módulos afectados', async () => {
    const loadPersistedRecords = vi.fn(async (): Promise<TraccionPersistedRecordsSnapshot> => ({
      ...tokenSnapshot({
        refreshToken: 'token-2',
        latestUpdatedAt: '2026-06-19T08:05:00.000Z',
      }),
      records: [
        {
          key: 'traccion.v1.teletrabajo.solicitudes',
          value: '[{"id":"solicitud-1"}]',
          updatedAt: '2026-06-19T08:05:00.000Z',
        },
      ],
    }));
    const getPersistedRecordsToken = vi
      .fn()
      .mockResolvedValueOnce(tokenSnapshot({ refreshToken: 'token-1' }))
      .mockResolvedValueOnce(
        tokenSnapshot({
          refreshToken: 'token-2',
          latestUpdatedAt: '2026-06-19T08:05:00.000Z',
        }),
      );

    window.traccion = {
      getPersistedRecordsToken,
      loadPersistedRecords,
    } as unknown as TraccionApi;

    const {
      module,
      reloadRegisteredSyncableStores,
      applyPersistedRecordsSnapshotToLocalStorage,
    } = await loadExternalDataSyncTestContext();

    module.startExternalDataSyncPolling();
    await flushPromises();

    await vi.advanceTimersByTimeAsync(12_000);
    await flushPromises();

    expect(loadPersistedRecords).toHaveBeenCalledTimes(1);
    expect(applyPersistedRecordsSnapshotToLocalStorage).toHaveBeenCalledTimes(1);
    expect(reloadRegisteredSyncableStores).toHaveBeenCalledWith(['teletrabajo'], {
      silentPersistenceFeedback: true,
    });

    module.stopExternalDataSyncPolling();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readyStatus: TraccionDatabaseStatus = {
  ready: true,
  engine: 'sqlite',
  phase: 'active',
  isDefaultPath: false,
};

const tokenSnapshot: TraccionPersistedRecordsTokenSnapshot = {
  status: readyStatus,
  refreshToken: 'token-recovered',
  latestUpdatedAt: '2026-10-15T09:00:00.000Z',
  taskRecordsUpdatedAt: '2026-10-15T09:00:00.000Z',
  sorteosDrawsUpdatedAt: '2026-10-15T09:00:00.000Z',
  sorteosExclusionsUpdatedAt: '2026-10-15T09:00:00.000Z',
  directStoreUpdatedAt: { teletrabajo: '2026-10-15T09:00:00.000Z' },
};

const persistedSnapshot: TraccionPersistedRecordsSnapshot = {
  ...tokenSnapshot,
  records: [],
};

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('externalDataSync recuperación de red', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();

    vi.doMock('./syncableStoreRegistrations', () => ({}));
    vi.doMock('./syncableStoreRegistry', () => ({
      reloadRegisteredSyncableStores: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock('./sharedEditingActivity', () => ({
      hasActiveSharedEditing: () => false,
      subscribeSharedEditingActivity: () => () => undefined,
    }));
    vi.doMock('./persistence', () => ({
      applyPersistedRecordsSnapshotToLocalStorage: vi.fn(),
      isPersistenceFeedbackSilent: () => false,
      readHydrationMetadata: vi.fn(() => null),
      readStorageItem: vi.fn(() => null),
      subscribeToPersistenceFeedback: () => () => undefined,
    }));
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

  it('reanuda el polling conservando tokens y sin una segunda consulta inmediata', async () => {
    const loadPersistedRecords = vi.fn().mockResolvedValue(persistedSnapshot);
    const getPersistedRecordsToken = vi.fn().mockResolvedValue(tokenSnapshot);

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      writable: true,
      value: {
        loadPersistedRecords,
        getPersistedRecordsToken,
      } as unknown as TraccionApi,
    });

    const sync = await import('./externalDataSync');

    await sync.forceExternalDataRefreshAfterRecovery();
    expect(loadPersistedRecords).toHaveBeenCalledTimes(1);
    expect(getPersistedRecordsToken).toHaveBeenCalledTimes(1);

    sync.startExternalDataSyncPolling({ preserveSeenTokens: true, runImmediately: false });
    await flushPromises();

    expect(loadPersistedRecords).toHaveBeenCalledTimes(1);
    expect(getPersistedRecordsToken).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(12_000);
    await flushPromises();

    expect(getPersistedRecordsToken).toHaveBeenCalledTimes(2);
    expect(loadPersistedRecords).toHaveBeenCalledTimes(1);

    sync.stopExternalDataSyncPolling();
  });
});

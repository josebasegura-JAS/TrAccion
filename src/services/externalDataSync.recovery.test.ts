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
      refreshRegisteredStoresAfterRecovery: vi.fn().mockResolvedValue(undefined),
      flushDeferredSyncStoresForView: vi.fn().mockResolvedValue(undefined),
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
  it('no repite la recuperación si otro equipo guarda durante la recarga', async () => {
    const later = { ...tokenSnapshot, taskRecordsUpdatedAt: '2026-10-15T09:01:00.000Z' };
    const getPersistedRecordsToken = vi.fn().mockResolvedValue(later);
    const loadPersistedRecords = vi.fn().mockResolvedValue(persistedSnapshot);
    window.traccion = { getPersistedRecordsToken, loadPersistedRecords } as unknown as TraccionApi;

    const sync = await import('./externalDataSync');
    const registry = await import('./syncableStoreRegistry');
    await expect(sync.forceExternalDataRefreshAfterRecovery()).resolves.toBeUndefined();
    expect(loadPersistedRecords).toHaveBeenCalledTimes(1);
    expect(registry.refreshRegisteredStoresAfterRecovery).toHaveBeenCalledTimes(1);
    expect(getPersistedRecordsToken).toHaveBeenCalledTimes(1);
  });

  it('detecta en el siguiente sondeo los cambios producidos durante la recuperación', async () => {
    const later = { ...tokenSnapshot, taskRecordsUpdatedAt: '2026-10-15T09:01:00.000Z' };
    const getPersistedRecordsToken = vi.fn().mockResolvedValue(later);
    const loadPersistedRecords = vi.fn().mockResolvedValue(persistedSnapshot);
    window.traccion = { getPersistedRecordsToken, loadPersistedRecords } as unknown as TraccionApi;

    const sync = await import('./externalDataSync');
    const registry = await import('./syncableStoreRegistry');
    await sync.forceExternalDataRefreshAfterRecovery();

    sync.startExternalDataSyncPolling({ preserveSeenTokens: true, runImmediately: false });
    await vi.advanceTimersByTimeAsync(12_000);
    await flushPromises();

    expect(registry.reloadRegisteredSyncableStores).toHaveBeenCalledWith(['tareas'], {
      silentPersistenceFeedback: true,
      deferInactive: true,
    });
    expect(loadPersistedRecords).toHaveBeenCalledTimes(1);
    sync.stopExternalDataSyncPolling();
  });

  it('bloquea la recuperación cuando SQLite deja de estar accesible tras recargar', async () => {
    const unavailable = {
      ...tokenSnapshot,
      status: { ...readyStatus, ready: false, phase: 'locked', message: 'SMB desconectado' } as TraccionDatabaseStatus,
    };
    const getPersistedRecordsToken = vi.fn().mockResolvedValue(unavailable);
    const loadPersistedRecords = vi.fn().mockResolvedValue(persistedSnapshot);
    window.traccion = { getPersistedRecordsToken, loadPersistedRecords } as unknown as TraccionApi;

    const sync = await import('./externalDataSync');
    await expect(sync.forceExternalDataRefreshAfterRecovery()).rejects.toThrow('SMB desconectado');
  });

  it('no confirma recuperación si falla la recarga del módulo activo', async () => {
    const loadPersistedRecords = vi.fn().mockResolvedValue(persistedSnapshot);
    const getPersistedRecordsToken = vi.fn().mockResolvedValue(tokenSnapshot);
    window.traccion = { getPersistedRecordsToken, loadPersistedRecords } as unknown as TraccionApi;

    const registry = await import('./syncableStoreRegistry');
    vi.mocked(registry.refreshRegisteredStoresAfterRecovery).mockRejectedValueOnce(new Error('Fallo de lectura SQLite'));
    const sync = await import('./externalDataSync');

    await expect(sync.forceExternalDataRefreshAfterRecovery()).rejects.toThrow('Fallo de lectura SQLite');
    expect(getPersistedRecordsToken).not.toHaveBeenCalled();
  });

});

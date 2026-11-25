import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  environment: vi.fn(() => 'test'),
  start: vi.fn(),
  legacySave: vi.fn(),
  legacyStatus: vi.fn(),
}));
vi.mock('./persistence/traccionEnvironment.js', () => ({ getTraccionEnvironment: mocks.environment }));
vi.mock('./persistence/persistenceRuntime.js', () => ({ getPersistenceUserDataPath: () => '/tmp/traccion-test' }));
vi.mock('./sqlitePersistence.js', () => ({
  savePersistedRecordIfUnchanged: mocks.legacySave,
  getSqliteStatus: mocks.legacyStatus,
}));
vi.mock('./persistence/taskBatchPersistence.js', () => ({}));
vi.mock('./persistence/ticketRestauranteAtomicCalendarRemoval.js', () => ({}));
vi.mock('./persistence/ticketRestauranteAtomicPeopleImport.js', () => ({}));
vi.mock('./sqliteEngineWorkerClient.js', () => ({ startIsolatedTestEngine: mocks.start }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

describe('Selección exclusiva del motor SQLite', () => {
  it('no permite activar el motor experimental en producción', async () => {
    mocks.environment.mockReturnValue('production');
    vi.stubEnv('TRACCION_SQLITE_ENGINE_EXPERIMENT', '1');
    const facade = await import('./sqlitePersistenceFacade.js');
    expect(facade.isIsolatedEngineEnabled()).toBe(false);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('mantiene el motor elegido y no recurre al antiguo ante un fallo remoto', async () => {
    mocks.environment.mockReturnValue('test');
    vi.stubEnv('TRACCION_SQLITE_ENGINE_EXPERIMENT', '1');
    const call = vi.fn().mockRejectedValue(new Error('timeout simulado'));
    mocks.start.mockReturnValue({
      call, exited: new Promise<number>(() => undefined),
      getState: () => 'uncertain',
    });
    const facade = await import('./sqlitePersistenceFacade.js');
    expect(facade.isIsolatedEngineEnabled()).toBe(true);
    vi.stubEnv('TRACCION_SQLITE_ENGINE_EXPERIMENT', '0');
    const record = { key: 'test', value: '{}', expectedUpdatedAt: null };
    await expect(facade.savePersistedRecordIfUnchanged(record)).rejects.toThrow('timeout simulado');
    expect(facade.getSqliteStatus().ready).toBe(false);
    await expect(facade.savePersistedRecordIfUnchanged(record)).rejects.toThrow('no disponible');
    expect(call).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.legacySave).not.toHaveBeenCalled();
    expect(mocks.legacyStatus).not.toHaveBeenCalled();
  });
});

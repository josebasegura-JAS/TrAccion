import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reloadRegisteredSyncableStores: vi.fn(),
}));
vi.mock('./syncableStoreRegistry', () => ({
  reloadRegisteredSyncableStores: mocks.reloadRegisteredSyncableStores,
}));

beforeEach(() => {
  vi.resetModules();
  mocks.reloadRegisteredSyncableStores.mockReset();
});

describe('reintentos de sincronización cuando fallan recargas SQLite', () => {
  it('conserva una recarga de Tareas fallida en el siguiente ciclo', async () => {
    mocks.reloadRegisteredSyncableStores
      .mockRejectedValueOnce(new Error('SMB temporalmente inaccesible'))
      .mockResolvedValueOnce(undefined);
    const { reloadIntegratedStores } = await import('./externalDataSync');

    await expect(reloadIntegratedStores(['tareas'])).rejects.toThrow('SMB');
    await expect(reloadIntegratedStores(['comite-sesiones'])).resolves.toBeUndefined();
    expect(mocks.reloadRegisteredSyncableStores).toHaveBeenNthCalledWith(
      2, ['tareas', 'comite-sesiones'], { silentPersistenceFeedback: true, deferInactive: true },
    );
  });

  it('conserva la obligación de recargar todos los stores tras fallo de recuperación', async () => {
    mocks.reloadRegisteredSyncableStores
      .mockRejectedValueOnce(new Error('corte de conexión'))
      .mockResolvedValueOnce(undefined);
    const { reloadIntegratedStores } = await import('./externalDataSync');

    await expect(reloadIntegratedStores()).rejects.toThrow('corte');
    await reloadIntegratedStores(['tareas']);
    expect(mocks.reloadRegisteredSyncableStores).toHaveBeenNthCalledWith(
      2, undefined, { silentPersistenceFeedback: true, deferInactive: true },
    );
  });

  it('descarta pendientes una vez aplicada la recarga y no duplica módulos', async () => {
    mocks.reloadRegisteredSyncableStores
      .mockRejectedValueOnce(new Error('error momentáneo'))
      .mockResolvedValue(undefined);
    const { reloadIntegratedStores } = await import('./externalDataSync');
    await expect(reloadIntegratedStores(['tareas', 'tareas'])).rejects.toThrow('momentáneo');
    await reloadIntegratedStores(['tareas', 'paritaria-sesiones']);
    expect(mocks.reloadRegisteredSyncableStores).toHaveBeenNthCalledWith(
      2, ['tareas', 'paritaria-sesiones'], { silentPersistenceFeedback: true, deferInactive: true },
    );
    await reloadIntegratedStores(['actas']);
    expect(mocks.reloadRegisteredSyncableStores).toHaveBeenNthCalledWith(
      3, ['actas'], { silentPersistenceFeedback: true, deferInactive: true },
    );
  });
});

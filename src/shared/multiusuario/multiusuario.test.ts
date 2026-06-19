import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadRegistry(): Promise<typeof import('../../services/syncableStoreRegistry')> {
  vi.resetModules();
  return import('../../services/syncableStoreRegistry');
}

describe('multiusuario sync registry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('recarga solo los stores solicitados tras el debounce', async () => {
    const { registerSyncableStore, reloadRegisteredSyncableStores } = await loadRegistry();
    const reloadTeletrabajo = vi.fn();
    const reloadPlantilla = vi.fn();

    registerSyncableStore({ id: 'teletrabajo', reloadFromStorage: reloadTeletrabajo });
    registerSyncableStore({ id: 'plantilla', reloadFromStorage: reloadPlantilla });

    reloadRegisteredSyncableStores(['teletrabajo']);

    expect(reloadTeletrabajo).not.toHaveBeenCalled();
    expect(reloadPlantilla).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(50);

    expect(reloadTeletrabajo).toHaveBeenCalledTimes(1);
    expect(reloadPlantilla).not.toHaveBeenCalled();
  });

  it('agrupa recargas repetidas del mismo store en una sola ejecución', async () => {
    const { registerSyncableStore, reloadRegisteredSyncableStores } = await loadRegistry();
    const reloadTeletrabajo = vi.fn();

    registerSyncableStore({ id: 'teletrabajo', reloadFromStorage: reloadTeletrabajo });

    reloadRegisteredSyncableStores(['teletrabajo']);
    await vi.advanceTimersByTimeAsync(25);
    reloadRegisteredSyncableStores(['teletrabajo']);
    await vi.advanceTimersByTimeAsync(49);

    expect(reloadTeletrabajo).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(reloadTeletrabajo).toHaveBeenCalledTimes(1);
  });

  it('no recarga stores no registrados aunque vengan en la lista de cambios', async () => {
    const { registerSyncableStore, reloadRegisteredSyncableStores } = await loadRegistry();
    const reloadTeletrabajo = vi.fn();

    registerSyncableStore({ id: 'teletrabajo', reloadFromStorage: reloadTeletrabajo });

    reloadRegisteredSyncableStores(['criterios-rrll']);
    await vi.advanceTimersByTimeAsync(50);

    expect(reloadTeletrabajo).not.toHaveBeenCalled();
  });

  it('recarga todos los stores registrados si no se especifica filtro', async () => {
    const { registerSyncableStore, reloadRegisteredSyncableStores } = await loadRegistry();
    const reloadTeletrabajo = vi.fn();
    const reloadPlantilla = vi.fn();

    registerSyncableStore({ id: 'teletrabajo', reloadFromStorage: reloadTeletrabajo });
    registerSyncableStore({ id: 'plantilla', reloadFromStorage: reloadPlantilla });

    reloadRegisteredSyncableStores();
    await vi.advanceTimersByTimeAsync(50);

    expect(reloadTeletrabajo).toHaveBeenCalledTimes(1);
    expect(reloadPlantilla).toHaveBeenCalledTimes(1);
  });
});

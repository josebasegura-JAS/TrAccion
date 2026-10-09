import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSyncableStore, reloadRegisteredSyncableStores } from './syncableStoreRegistry';

describe('reloadRegisteredSyncableStores', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('no resuelve hasta que termina la hidratación asíncrona del store', async () => {
    vi.useFakeTimers();
    let resolveHydration: (() => void) | undefined;
    const hydration = new Promise<void>((resolve) => {
      resolveHydration = resolve;
    });
    const reload = vi.fn(() => hydration);
    const id = 'pr13-async-hydration';
    registerSyncableStore({ id, reloadFromStorage: reload });

    let settled = false;
    const refresh = reloadRegisteredSyncableStores([id]).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(50);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    resolveHydration?.();
    await refresh;
    expect(settled).toBe(true);
  });

  it('mantiene pendientes todos los callers cuando se renueva el debounce', async () => {
    vi.useFakeTimers();
    const reload = vi.fn(async () => undefined);
    const id = 'pr13-debounce';
    registerSyncableStore({ id, reloadFromStorage: reload });

    const first = reloadRegisteredSyncableStores([id]);
    await vi.advanceTimersByTimeAsync(25);
    const second = reloadRegisteredSyncableStores([id]);

    await vi.advanceTimersByTimeAsync(49);
    expect(reload).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([first, second]);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

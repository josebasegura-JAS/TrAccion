import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushDeferredSyncStoresForView, getDeferredSyncStoreIds, registerSyncableStore, reloadRegisteredSyncableStores, setActiveSyncView } from './syncableStoreRegistry';

describe('reloadRegisteredSyncableStores', () => {
  afterEach(() => {
    setActiveSyncView('dashboard');
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
  it('serializa recargas del mismo store sin perder la segunda solicitud', async () => {
    vi.useFakeTimers();
    let finishFirst: (() => void) | undefined;
    const firstExecution = new Promise<void>((resolve) => { finishFirst = resolve; });
    let started = 0;
    let concurrent = 0;
    let maxConcurrent = 0;
    const reload = vi.fn(async () => {
      started += 1;
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      if (started === 1) await firstExecution;
      concurrent -= 1;
    });
    const id = 'pr1-serialized-reload';
    registerSyncableStore({ id, reloadFromStorage: reload });

    const first = reloadRegisteredSyncableStores([id]);
    await vi.advanceTimersByTimeAsync(50);
    expect(reload).toHaveBeenCalledTimes(1);

    const second = reloadRegisteredSyncableStores([id]);
    await vi.advanceTimersByTimeAsync(50);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(maxConcurrent).toBe(1);

    finishFirst?.();
    await Promise.all([first, second]);
    expect(reload).toHaveBeenCalledTimes(2);
    expect(maxConcurrent).toBe(1);
  });

  it('reintenta una recarga posterior aunque la anterior haya fallado', async () => {
    vi.useFakeTimers();
    let rejectFirst: ((reason?: unknown) => void) | undefined;
    const firstExecution = new Promise<void>((_, reject) => { rejectFirst = reject; });
    let callCount = 0;
    const reload = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) await firstExecution;
    });
    const id = 'pr1-retry-after-failure';
    registerSyncableStore({ id, reloadFromStorage: reload });
    const first = reloadRegisteredSyncableStores([id]);
    // Registrar el rechazo antes de provocar el fallo.
    const firstFailure = expect(first).rejects.toThrow('Fallo simulado');
    await vi.advanceTimersByTimeAsync(50);
    const second = reloadRegisteredSyncableStores([id]);
    await vi.advanceTimersByTimeAsync(50);
    rejectFirst?.(new Error('Fallo simulado'));
    await firstFailure;
    await second;
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('aplaza los módulos fuera de la pantalla y los carga antes de abrirlos', async () => {
    vi.useFakeTimers();
    setActiveSyncView('dashboard');
    const reload = vi.fn(async () => undefined);
    registerSyncableStore({ id: 'presupuestos', reloadFromStorage: reload });
    await reloadRegisteredSyncableStores(['presupuestos'], { deferInactive: true });
    expect(reload).not.toHaveBeenCalled();
    expect(getDeferredSyncStoreIds()).toContain('presupuestos');

    const flush = flushDeferredSyncStoresForView('presupuestos');
    await vi.advanceTimersByTimeAsync(50);
    await flush;
    expect(reload).toHaveBeenCalledOnce();
    expect(getDeferredSyncStoreIds()).not.toContain('presupuestos');
  });

  it('mantiene activos los datos del Dashboard aunque solicite diferimiento', async () => {
    vi.useFakeTimers();
    setActiveSyncView('dashboard');
    const reload = vi.fn(async () => undefined);
    registerSyncableStore({ id: 'comite-sesiones', reloadFromStorage: reload });
    const refresh = reloadRegisteredSyncableStores(['comite-sesiones'], { deferInactive: true });
    await vi.advanceTimersByTimeAsync(50);
    await refresh;
    expect(reload).toHaveBeenCalledOnce();
    expect(getDeferredSyncStoreIds()).not.toContain('comite-sesiones');
  });

  it('una invalidación nueva durante la carga no se pierde al completar la anterior', async () => {
    vi.useFakeTimers();
    setActiveSyncView('presupuestos');
    let release: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const reload = vi.fn(() => waiting);
    registerSyncableStore({ id: 'presupuestos', reloadFromStorage: reload });
    const first = reloadRegisteredSyncableStores(['presupuestos'], { deferInactive: true });
    await vi.advanceTimersByTimeAsync(50);
    setActiveSyncView('dashboard');
    await reloadRegisteredSyncableStores(['presupuestos'], { deferInactive: true });
    release?.();
    await first;
    expect(getDeferredSyncStoreIds()).toContain('presupuestos');

    const next = flushDeferredSyncStoresForView('presupuestos');
    await vi.advanceTimersByTimeAsync(50);
    await next;
    expect(reload).toHaveBeenCalledTimes(2);
    expect(getDeferredSyncStoreIds()).not.toContain('presupuestos');
  });

});

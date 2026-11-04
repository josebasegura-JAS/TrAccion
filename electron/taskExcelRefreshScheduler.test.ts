import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDebouncedSerialRefresh } from './taskExcelRefreshScheduler.js';

describe('taskExcelRefreshScheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('agrupa varios guardados próximos en una única regeneración', async () => {
    const work = vi.fn(async () => undefined);
    const onError = vi.fn();
    const refresh = createDebouncedSerialRefresh(work, onError, 1500);
    refresh.schedule();
    await vi.advanceTimersByTimeAsync(900);
    refresh.schedule();
    await vi.advanceTimersByTimeAsync(1499);
    expect(work).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(work).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('conserva un cambio ocurrido durante la exportación sin solapar trabajos', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    let running = 0;
    let maxConcurrent = 0;
    let invocation = 0;
    const work = vi.fn(async () => {
      invocation += 1;
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      if (invocation === 1) await pending;
      running -= 1;
    });
    const refresh = createDebouncedSerialRefresh(work, vi.fn(), 1500);
    refresh.schedule();
    await vi.advanceTimersByTimeAsync(1500);
    expect(work).toHaveBeenCalledTimes(1);
    refresh.schedule();
    refresh.schedule();
    await vi.advanceTimersByTimeAsync(1500);
    expect(work).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1500);
    expect(work).toHaveBeenCalledTimes(2);
    expect(maxConcurrent).toBe(1);
  });

  it('notifica errores y permite una regeneración posterior', async () => {
    const onError = vi.fn();
    const work = vi.fn()
      .mockRejectedValueOnce(new Error('ruta SMB inaccesible'))
      .mockResolvedValueOnce(undefined);
    const refresh = createDebouncedSerialRefresh(work, onError, 1500);
    refresh.schedule();
    await vi.advanceTimersByTimeAsync(1500);
    expect(onError).toHaveBeenCalledTimes(1);
    refresh.schedule();
    await vi.advanceTimersByTimeAsync(1500);
    expect(work).toHaveBeenCalledTimes(2);
  });
  it('ejecuta como máximo a los dos minutos aunque sigan llegando guardados', async () => {
    const work = vi.fn(async () => undefined);
    const refresh = createDebouncedSerialRefresh(work, vi.fn(), 45_000, 120_000);
    refresh.schedule();
    for (let i = 0; i < 4; i += 1) {
      await vi.advanceTimersByTimeAsync(30_000);
      if (i < 3) refresh.schedule();
    }
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('no ejecuta antes de 45 segundos desde el último cambio si no llega al límite', async () => {
    const work = vi.fn(async () => undefined);
    const refresh = createDebouncedSerialRefresh(work, vi.fn(), 45_000, 120_000);
    refresh.schedule();
    await vi.advanceTimersByTimeAsync(35_000);
    refresh.schedule();
    await vi.advanceTimersByTimeAsync(44_999);
    expect(work).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(work).toHaveBeenCalledTimes(1);
  });

});

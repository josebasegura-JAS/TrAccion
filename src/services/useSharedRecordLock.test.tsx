import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSharedRecordLock } from './useSharedRecordLock';

vi.mock('./persistence', () => ({
  clearPersistenceBusy: vi.fn(),
  publishPersistenceBusy: vi.fn(),
  waitForNextPaint: vi.fn(async () => undefined),
}));
vi.mock('./sharedEditingActivity', () => ({
  markSharedEditingActive: vi.fn(),
  markSharedEditingInactive: vi.fn(),
}));

type LockResult = TraccionRecordLockResult;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function acquired(): LockResult {
  return { ok: true, status: 'acquired', lock: null, message: 'Bloqueo adquirido.' };
}

const payload = { module: 'tareas', recordId: 'task-lock-race' };

describe('useSharedRecordLock: cancelación y relevo multiusuario', () => {
  const acquire = vi.fn();
  const release = vi.fn();

  beforeEach(() => {
    acquire.mockReset();
    release.mockReset();
    release.mockResolvedValue({ ok: true, status: 'released', lock: null, message: 'Liberado.' });
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { acquireRecordLock: acquire, releaseRecordLock: release },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
  });

  it('libera una adquisición exitosa aunque el editor se desmontara antes de recibirla', async () => {
    const late = deferred<LockResult>();
    acquire.mockReturnValueOnce(late.promise);
    const editor = renderHook(() => useSharedRecordLock({ ...payload, enabled: true }));
    await waitFor(() => expect(acquire).toHaveBeenCalledTimes(1));

    editor.unmount();
    expect(release).not.toHaveBeenCalled();

    await act(async () => { late.resolve(acquired()); });
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
    expect(release).toHaveBeenCalledWith(payload);
  });

  it('espera a liberar la reserva anterior antes de adquirir la misma tarea nuevamente', async () => {
    const late = deferred<LockResult>();
    const released = deferred<LockResult>();
    acquire.mockReturnValueOnce(late.promise).mockResolvedValue(acquired());
    release.mockReturnValueOnce(released.promise);

    const first = renderHook(() => useSharedRecordLock({ ...payload, enabled: true }));
    await waitFor(() => expect(acquire).toHaveBeenCalledTimes(1));
    first.unmount();

    const second = renderHook(() => useSharedRecordLock({ ...payload, enabled: true }));
    await act(async () => { await Promise.resolve(); });
    expect(acquire).toHaveBeenCalledTimes(1);

    await act(async () => { late.resolve(acquired()); });
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
    expect(acquire).toHaveBeenCalledTimes(1);

    await act(async () => { released.resolve({ ok: true, status: 'released', lock: null, message: 'Liberado.' }); });
    await waitFor(() => expect(acquire).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(second.result.current.status).toBe('acquired'));
    second.unmount();
    await waitFor(() => expect(release).toHaveBeenCalledTimes(2));
  });

  it('libera de forma normal si la adquisición había terminado antes del cierre', async () => {
    acquire.mockResolvedValue(acquired());
    const editor = renderHook(() => useSharedRecordLock({ ...payload, enabled: true }));
    await waitFor(() => expect(editor.result.current.status).toBe('acquired'));

    editor.unmount();
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
  });
});

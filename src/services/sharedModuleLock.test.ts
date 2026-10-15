import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withSharedModuleLocks } from './sharedModuleLock';

const acquired = { ok: true, status: 'acquired', lock: null, message: '' } as const;
const released = { ok: true, status: 'released', lock: null, message: '' } as const;

describe('withSharedModuleLocks', () => {
  const acquireRecordLock = vi.fn();
  const heartbeatRecordLock = vi.fn();
  const releaseRecordLock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    acquireRecordLock.mockResolvedValue(acquired);
    heartbeatRecordLock.mockResolvedValue(acquired);
    releaseRecordLock.mockResolvedValue(released);
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { acquireRecordLock, heartbeatRecordLock, releaseRecordLock },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mantiene compatibles las operaciones existentes que ignoran el guard', async () => {
    await expect(
      withSharedModuleLocks([{ module: 'tareas', label: 'Tareas' }], async () => 'ok'),
    ).resolves.toBe('ok');
    expect(heartbeatRecordLock).toHaveBeenCalledTimes(1);
    expect(releaseRecordLock).toHaveBeenCalledTimes(1);
  });

  it('no inicia la operación si la verificación inmediata detecta que el lock ya es ajeno', async () => {
    heartbeatRecordLock.mockResolvedValueOnce({
      ok: false,
      status: 'locked',
      lock: {
        ownerId: 'otro',
        ownerName: 'Rosa',
        machineName: 'PC-RRLL',
        acquiredAt: '2026-10-14T08:00:00.000Z',
        expiresAt: '2026-10-14T08:01:00.000Z',
      },
      message: '',
    });
    const operation = vi.fn(async () => 'ok');

    await expect(
      withSharedModuleLocks([{ module: 'sorteos', label: 'Sorteos' }], operation),
    ).rejects.toThrow('ahora lo tiene Rosa@PC-RRLL');

    expect(operation).not.toHaveBeenCalled();
    expect(releaseRecordLock).toHaveBeenCalledTimes(1);
  });

  it('marca el guard como perdido cuando falla el heartbeat y bloquea la escritura posterior', async () => {
    heartbeatRecordLock.mockResolvedValueOnce(acquired);
    heartbeatRecordLock.mockRejectedValueOnce(new Error('network down'));
    let continueOperation!: () => void;
    const waitForHeartbeat = new Promise<void>((resolve) => { continueOperation = resolve; });
    let writeExecuted = false;

    const operation = withSharedModuleLocks(
      [{ module: 'tareas', label: 'Tareas' }],
      async (guard) => {
        await waitForHeartbeat;
        guard.assertActive();
        writeExecuted = true;
      },
    );

    await vi.advanceTimersByTimeAsync(10_000);
    continueOperation();

    await expect(operation).rejects.toThrow('network down');
    expect(writeExecuted).toBe(false);
    expect(releaseRecordLock).toHaveBeenCalledTimes(1);
  });

  it('convierte un heartbeat que informa lock ajeno en un error legible', async () => {
    heartbeatRecordLock.mockResolvedValueOnce(acquired);
    heartbeatRecordLock.mockResolvedValueOnce({
      ok: false,
      status: 'locked',
      lock: {
        ownerId: 'otro',
        ownerName: 'Rosa',
        machineName: 'PC-RRLL',
        acquiredAt: '2026-10-14T08:00:00.000Z',
        expiresAt: '2026-10-14T08:01:00.000Z',
      },
      message: '',
    });
    let continueOperation!: () => void;
    const waitForHeartbeat = new Promise<void>((resolve) => { continueOperation = resolve; });

    const operation = withSharedModuleLocks(
      [{ module: 'comite', label: 'Comité' }],
      async (guard) => {
        await waitForHeartbeat;
        guard.assertActive();
      },
    );

    await vi.advanceTimersByTimeAsync(10_000);
    continueOperation();

    await expect(operation).rejects.toThrow('ahora lo tiene Rosa@PC-RRLL');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  publishDatabaseStatus: vi.fn(),
  refreshDatabaseStatus: vi.fn(),
  publishDatabaseConnectivityBlock: vi.fn(),
  forceExternalDataRefreshAfterRecovery: vi.fn(),
  publishDatabaseConnectivityState: vi.fn(),
}));

vi.mock('./databaseStatus', () => ({
  publishDatabaseStatus: mocks.publishDatabaseStatus,
  refreshDatabaseStatus: mocks.refreshDatabaseStatus,
}));

vi.mock('./editingAvailability', () => ({
  publishDatabaseConnectivityBlock: mocks.publishDatabaseConnectivityBlock,
}));

vi.mock('./externalDataSync', () => ({
  forceExternalDataRefreshAfterRecovery: mocks.forceExternalDataRefreshAfterRecovery,
}));

vi.mock('./databaseConnectivityState', () => ({
  publishDatabaseConnectivityState: mocks.publishDatabaseConnectivityState,
}));

const activeStatus = {
  ready: true,
  engine: 'better-sqlite3' as const,
  phase: 'active' as const,
  path: '\\\\servidor\\rrll\\traccion.sqlite',
  schemaVersion: 17,
  isDefaultPath: false,
  lockPath: '\\\\servidor\\rrll\\traccion.sqlite.lockdir',
};

const errorStatus = {
  ...activeStatus,
  ready: false,
  phase: 'error' as const,
  message: 'Recurso de red no disponible.',
};

function installFakeWindow(databaseHealthCheck: ReturnType<typeof vi.fn>) {
  const listeners = new Map<string, Set<() => void>>();
  const fakeWindow = {
    traccion: { databaseHealthCheck },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    addEventListener: vi.fn((type: string, listener: () => void) => {
      const current = listeners.get(type) ?? new Set<() => void>();
      current.add(listener);
      listeners.set(type, current);
    }),
    removeEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    }),
    dispatch: (type: string) => {
      listeners.get(type)?.forEach((listener) => listener());
    },
  };

  vi.stubGlobal('window', fakeWindow);
  return fakeWindow;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.refreshDatabaseStatus.mockResolvedValue(activeStatus);
  mocks.forceExternalDataRefreshAfterRecovery.mockResolvedValue(undefined);
});

describe('databaseHealthMonitor', () => {
  it('mantiene el estado conectado cuando el chequeo de la base compartida es correcto', async () => {
    const databaseHealthCheck = vi.fn().mockResolvedValue({
      ok: true,
      status: activeStatus,
      checkedAt: '2026-10-05T12:00:00.000Z',
      message: 'SQLite compartida accesible.',
    });
    installFakeWindow(databaseHealthCheck);
    const monitor = await import('./databaseHealthMonitor');

    monitor.startDatabaseHealthMonitor();
    await vi.advanceTimersByTimeAsync(0);

    expect(databaseHealthCheck).toHaveBeenCalledTimes(1);
    expect(mocks.publishDatabaseStatus).toHaveBeenCalledWith(activeStatus);
    expect(mocks.publishDatabaseConnectivityState).toHaveBeenCalledWith(
      'connected',
      'SQLite compartida accesible.',
    );
    expect(mocks.publishDatabaseConnectivityBlock).not.toHaveBeenCalledWith(
      true,
      expect.any(String),
      'health-monitor',
    );

    monitor.stopDatabaseHealthMonitor();
  });

  it('bloquea edición y entra en reconexión cuando falla el health check', async () => {
    const databaseHealthCheck = vi.fn().mockResolvedValue({
      ok: false,
      status: errorStatus,
      checkedAt: '2026-10-05T12:00:00.000Z',
      message: 'No se puede acceder al recurso SMB.',
    });
    installFakeWindow(databaseHealthCheck);
    const monitor = await import('./databaseHealthMonitor');

    monitor.startDatabaseHealthMonitor();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.publishDatabaseConnectivityBlock).toHaveBeenCalledWith(
      true,
      expect.stringContaining('No se puede acceder al recurso SMB.'),
      'health-monitor',
    );
    expect(mocks.publishDatabaseConnectivityState).toHaveBeenCalledWith(
      'reconnecting',
      'Conexión interrumpida. Reconectando con la base compartida…',
      1,
    );

    monitor.stopDatabaseHealthMonitor();
  });

  it('al recuperar red sincroniza datos antes de desbloquear la edición', async () => {
    const databaseHealthCheck = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: errorStatus,
        checkedAt: '2026-10-05T12:00:00.000Z',
        message: 'Red interrumpida.',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: activeStatus,
        checkedAt: '2026-10-05T12:00:02.000Z',
        message: 'SQLite recuperada.',
      });
    installFakeWindow(databaseHealthCheck);
    const monitor = await import('./databaseHealthMonitor');

    monitor.startDatabaseHealthMonitor();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(databaseHealthCheck).toHaveBeenCalledTimes(2);
    expect(mocks.refreshDatabaseStatus).toHaveBeenCalledTimes(1);
    expect(mocks.forceExternalDataRefreshAfterRecovery).toHaveBeenCalledTimes(1);

    const blockCalls = mocks.publishDatabaseConnectivityBlock.mock.calls;
    const syncingBlockIndex = blockCalls.findIndex((call) =>
      call[0] === true && String(call[1]).includes('Actualizando los datos compartidos'),
    );
    const unblockIndex = blockCalls.findIndex((call) => call[0] === false);
    expect(syncingBlockIndex).toBeGreaterThanOrEqual(0);
    expect(unblockIndex).toBeGreaterThan(syncingBlockIndex);

    expect(mocks.publishDatabaseConnectivityState).toHaveBeenCalledWith(
      'syncing',
      'Conexión recuperada. Actualizando los datos compartidos…',
    );
    expect(mocks.publishDatabaseConnectivityState).toHaveBeenCalledWith(
      'recovered',
      'Conexión restablecida · datos compartidos actualizados.',
    );

    monitor.stopDatabaseHealthMonitor();
  });

  it('el evento offline de Windows bloquea de inmediato y fuerza una comprobación de reconexión', async () => {
    const databaseHealthCheck = vi.fn().mockResolvedValue({
      ok: false,
      status: errorStatus,
      checkedAt: '2026-10-05T12:00:00.000Z',
      message: 'Sin red.',
    });
    const fakeWindow = installFakeWindow(databaseHealthCheck);
    const monitor = await import('./databaseHealthMonitor');

    monitor.startDatabaseHealthMonitor();
    fakeWindow.dispatch('offline');

    expect(mocks.publishDatabaseConnectivityBlock).toHaveBeenCalledWith(
      true,
      'Windows ha informado de una pérdida de red. Reconectando con la base compartida…',
      'health-monitor',
    );
    expect(mocks.publishDatabaseConnectivityState).toHaveBeenCalledWith(
      'reconnecting',
      'Conexión interrumpida. Reconectando con la base compartida…',
      1,
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(databaseHealthCheck).toHaveBeenCalledTimes(1);

    monitor.stopDatabaseHealthMonitor();
  });
});

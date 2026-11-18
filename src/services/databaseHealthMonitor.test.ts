import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  publishDatabaseStatus: vi.fn(),
  refreshDatabaseStatus: vi.fn(),
  publishDatabaseConnectivityBlock: vi.fn(),
  forceExternalDataRefreshAfterRecovery: vi.fn(),
  startExternalDataSyncPolling: vi.fn(),
  stopExternalDataSyncPolling: vi.fn(),
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
  startExternalDataSyncPolling: mocks.startExternalDataSyncPolling,
  stopExternalDataSyncPolling: mocks.stopExternalDataSyncPolling,
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
    expect(mocks.stopExternalDataSyncPolling).not.toHaveBeenCalled();
    expect(mocks.publishDatabaseConnectivityBlock).not.toHaveBeenCalledWith(
      true,
      expect.any(String),
      'health-monitor',
    );

    monitor.stopDatabaseHealthMonitor();
  });

  it('pausa el polling, bloquea edición y entra en reconexión cuando falla el health check', async () => {
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

    expect(mocks.stopExternalDataSyncPolling).toHaveBeenCalledTimes(1);
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

  it('al recuperar red sincroniza datos y reactiva el polling antes de desbloquear la edición', async () => {
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
    expect(mocks.stopExternalDataSyncPolling).toHaveBeenCalled();
    expect(mocks.refreshDatabaseStatus).toHaveBeenCalledTimes(1);
    expect(mocks.forceExternalDataRefreshAfterRecovery).toHaveBeenCalledTimes(1);
    expect(mocks.startExternalDataSyncPolling).toHaveBeenCalledTimes(1);

    const stopOrder = mocks.stopExternalDataSyncPolling.mock.invocationCallOrder[0];
    const refreshOrder = mocks.forceExternalDataRefreshAfterRecovery.mock.invocationCallOrder[0];
    const pollingOrder = mocks.startExternalDataSyncPolling.mock.invocationCallOrder[0];
    expect(refreshOrder).toBeGreaterThan(stopOrder);
    expect(pollingOrder).toBeGreaterThan(refreshOrder);

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

  it('el evento offline de Windows pausa el polling, bloquea de inmediato y fuerza una comprobación', async () => {
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

    expect(mocks.stopExternalDataSyncPolling).toHaveBeenCalledTimes(1);
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

  it('el evento online se trata como transición y verifica SQLite antes de reactivar edición', async () => {
    const databaseHealthCheck = vi.fn().mockResolvedValue({
      ok: true,
      status: activeStatus,
      checkedAt: '2026-10-05T12:00:00.000Z',
      message: 'SQLite accesible.',
    });
    const fakeWindow = installFakeWindow(databaseHealthCheck);
    const monitor = await import('./databaseHealthMonitor');

    monitor.startDatabaseHealthMonitor();
    fakeWindow.dispatch('online');

    // El evento online no prueba que SQLite haya perdido conexión.
    expect(mocks.stopExternalDataSyncPolling).not.toHaveBeenCalled();
    expect(mocks.publishDatabaseConnectivityBlock).not.toHaveBeenCalledWith(
      true,
      expect.any(String),
      'health-monitor',
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(databaseHealthCheck).toHaveBeenCalledTimes(1);
    // Solo se verifica la base; no se fuerza un refresco completo por un
    // cambio de conectividad que nunca causó una desconexión confirmada.
    expect(mocks.forceExternalDataRefreshAfterRecovery).not.toHaveBeenCalled();
    expect(mocks.startExternalDataSyncPolling).not.toHaveBeenCalled();

    monitor.stopDatabaseHealthMonitor();
  });

  it('el primer timeout lento no bloquea la edición; el segundo sí', async () => {
    const databaseHealthCheck = vi.fn(() => new Promise<never>(() => undefined));
    installFakeWindow(databaseHealthCheck);
    const monitor = await import('./databaseHealthMonitor');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      monitor.startDatabaseHealthMonitor();
      await vi.advanceTimersByTimeAsync(6_000);
      expect(mocks.publishDatabaseConnectivityBlock).not.toHaveBeenCalledWith(
        true, expect.any(String), 'health-monitor',
      );
      expect(mocks.stopExternalDataSyncPolling).not.toHaveBeenCalled();

      // Primera comprobación agotada, nueva comprobación a los 5 s.
      await vi.advanceTimersByTimeAsync(11_000);
      expect(databaseHealthCheck).toHaveBeenCalledTimes(2);
      expect(mocks.publishDatabaseConnectivityBlock).toHaveBeenCalledWith(
        true, expect.stringContaining('La comprobación SQLite superó 6 s.'),
        'health-monitor',
      );
    } finally {
      monitor.stopDatabaseHealthMonitor();
      warn.mockRestore();
    }
  });

  it('un timeout aislado seguido de verificación correcta no provoca reconexión', async () => {
    const databaseHealthCheck = vi.fn()
      .mockImplementationOnce(() => new Promise<never>(() => undefined))
      .mockResolvedValue({ ok: true, status: activeStatus, checkedAt: '2026-11-04', message: 'Accesible.' });
    installFakeWindow(databaseHealthCheck);
    const monitor = await import('./databaseHealthMonitor');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      monitor.startDatabaseHealthMonitor();
      await vi.advanceTimersByTimeAsync(11_000);
      expect(databaseHealthCheck).toHaveBeenCalledTimes(2);
      expect(mocks.publishDatabaseConnectivityBlock).not.toHaveBeenCalledWith(
        true, expect.any(String), 'health-monitor',
      );
    } finally {
      monitor.stopDatabaseHealthMonitor();
      warn.mockRestore();
    }
  });

  it('un evento change de conexión no bloquea sin error SQLite', async () => {
    const databaseHealthCheck = vi.fn().mockResolvedValue({
      ok: true, status: activeStatus, checkedAt: '2026-11-04', message: 'Accesible.',
    });
    const fakeWindow = installFakeWindow(databaseHealthCheck);
    const monitor = await import('./databaseHealthMonitor');
    monitor.startDatabaseHealthMonitor();
    fakeWindow.dispatch('online');
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.stopExternalDataSyncPolling).not.toHaveBeenCalled();
    expect(mocks.publishDatabaseConnectivityBlock).not.toHaveBeenCalledWith(
      true, expect.any(String), 'health-monitor',
    );
    monitor.stopDatabaseHealthMonitor();
  });
  it('si la recuperación supera 60 s, bloquea edición y no repite recargas mientras sigue pendiente', async () => {
    let finishRecovery!: () => void;
    const pendingRecovery = new Promise<void>((resolve) => { finishRecovery = resolve; });
    mocks.forceExternalDataRefreshAfterRecovery.mockImplementationOnce(() => pendingRecovery);

    const check = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: errorStatus, checkedAt: '2026-11-04', message: 'SMB caída.' })
      .mockResolvedValue({ ok: true, status: activeStatus, checkedAt: '2026-11-04', message: 'Conexión comprobada.' });
    installFakeWindow(check);
    const monitor = await import('./databaseHealthMonitor');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      monitor.startDatabaseHealthMonitor();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(mocks.forceExternalDataRefreshAfterRecovery).toHaveBeenCalledTimes(1);
      expect(mocks.startExternalDataSyncPolling).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(60_000);
      expect(mocks.startExternalDataSyncPolling).not.toHaveBeenCalled();
      expect(mocks.publishDatabaseConnectivityBlock).not.toHaveBeenCalledWith(
        false, expect.any(String), 'health-monitor',
      );
      await vi.advanceTimersByTimeAsync(10_000);
      expect(mocks.forceExternalDataRefreshAfterRecovery).toHaveBeenCalledTimes(1);

      // Aunque la recarga antigua termine tarde, ella sola no desbloquea.
      finishRecovery();
      // Resolver la promesa anterior sin ejecutar todavía el siguiente
      // temporizador de verificación. La operación caducada no desbloquea.
      await Promise.resolve();
      await Promise.resolve();
      expect(mocks.startExternalDataSyncPolling).not.toHaveBeenCalled();
    } finally {
      monitor.stopDatabaseHealthMonitor();
      warn.mockRestore();
    }
  });

  it('un evento offline invalida una recuperación anterior y no reactiva la edición por su resultado', async () => {
    let finishRecovery!: () => void;
    mocks.forceExternalDataRefreshAfterRecovery.mockImplementationOnce(() =>
      new Promise<void>((resolve) => { finishRecovery = resolve; }),
    );
    const check = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: errorStatus, checkedAt: '2026-11-04', message: 'Sin red.' })
      .mockResolvedValue({ ok: true, status: activeStatus, checkedAt: '2026-11-04', message: 'Conectada.' });
    const fakeWindow = installFakeWindow(check);
    const monitor = await import('./databaseHealthMonitor');
    try {
      monitor.startDatabaseHealthMonitor();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(2_000);
      fakeWindow.dispatch('offline');
      finishRecovery();
      await Promise.resolve();
      await Promise.resolve();
      expect(mocks.startExternalDataSyncPolling).not.toHaveBeenCalled();
      expect(mocks.publishDatabaseConnectivityState).not.toHaveBeenCalledWith(
        'recovered', expect.any(String),
      );
    } finally {
      monitor.stopDatabaseHealthMonitor();
    }
  });

  it('detener el monitor durante una recarga impide que una respuesta tardía reactive escrituras', async () => {
    let finishRecovery!: () => void;
    mocks.forceExternalDataRefreshAfterRecovery.mockImplementationOnce(() =>
      new Promise<void>((resolve) => { finishRecovery = resolve; }),
    );
    const check = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: errorStatus, checkedAt: '2026-11-04', message: 'Sin red.' })
      .mockResolvedValue({ ok: true, status: activeStatus, checkedAt: '2026-11-04', message: 'Conectada.' });
    installFakeWindow(check);
    const monitor = await import('./databaseHealthMonitor');
    monitor.startDatabaseHealthMonitor();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2_000);
    monitor.stopDatabaseHealthMonitor();
    mocks.startExternalDataSyncPolling.mockClear();
    finishRecovery();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.startExternalDataSyncPolling).not.toHaveBeenCalled();
  });

});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ConnectionRecoverySplash, getRecoveryStepStatuses } from './ConnectionRecoverySplash';
import { publishDatabaseConnectivityState } from '../services/databaseConnectivityState';

vi.mock('../services/databaseHealthMonitor', () => ({
  getConnectionDiagnostics: () => ({
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    consecutiveFailures: 0,
    lastCheckDurationMs: null,
    checking: false,
  }),
  subscribeConnectionDiagnostics: () => () => undefined,
}));

afterEach(() => {
  cleanup();
  publishDatabaseConnectivityState('connected');
  vi.useRealTimers();
});

describe('ConnectionRecoverySplash', () => {
  it('muestra las fases correctas sin atribuir pasos completados durante la reconexión', () => {
    expect(getRecoveryStepStatuses('reconnecting')).toEqual(['done', 'active', 'pending', 'pending']);
    expect(getRecoveryStepStatuses('syncing')).toEqual(['done', 'done', 'active', 'pending']);
    expect(getRecoveryStepStatuses('recovered')).toEqual(['done', 'done', 'done', 'done']);
  });

  it('bloquea la aplicación y restaura la interacción cuando SQLite se recupera', async () => {
    const background = document.createElement('div');
    background.setAttribute('data-testid', 'background');
    document.body.appendChild(background);
    const { unmount } = render(<ConnectionRecoverySplash />);
    expect(screen.queryByRole('dialog', { name: 'TrAcción' })).toBeNull();

    await act(async () => {
      publishDatabaseConnectivityState('reconnecting', 'SMB no disponible', 1);
    });
    const overlay = screen.getByRole('dialog', { name: 'TrAcción' });
    expect(overlay.getAttribute('aria-modal')).toBe('true');
    expect(background.inert).toBe(true);
    expect(screen.getByText('Comprobar acceso a SQLite compartida')).toBeTruthy();

    await act(async () => {
      publishDatabaseConnectivityState('syncing', 'Recuperando datos compartidos');
    });
    expect(screen.getByText('Recuperando datos compartidos')).toBeTruthy();
    expect(background.inert).toBe(true);

    await act(async () => {
      publishDatabaseConnectivityState('recovered', 'Conexión restablecida');
    });
    expect(screen.queryByRole('dialog', { name: 'TrAcción' })).toBeNull();
    expect(background.inert).toBe(false);
    unmount();
    background.remove();
  });

  it('no sustituye la política de reinicio seguro ni muestra el botón inmediatamente', async () => {
    render(<ConnectionRecoverySplash />);
    await act(async () => {
      publishDatabaseConnectivityState('reconnecting', 'Sin red', 1);
    });
    expect(screen.queryByRole('button', { name: 'Reiniciar TrAcción' })).toBeNull();
  });
});

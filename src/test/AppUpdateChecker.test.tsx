import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppUpdateChecker } from '../components/AppUpdateChecker';

describe('AppUpdateChecker', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
  });

  afterEach(() => {
    cleanup();
  });

  it('no muestra ningún diálogo si window.traccion no está disponible', async () => {
    render(<AppUpdateChecker />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('no muestra ningún diálogo si no hay actualización disponible', async () => {
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        checkForAppUpdate: vi.fn(async () => ({
          updateAvailable: false,
          currentVersion: '1.0.5',
          latestVersion: null,
          message: null,
        })),
      },
    });

    render(<AppUpdateChecker />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('pregunta antes de actualizar cuando hay una versión nueva, y aplica solo si se confirma', async () => {
    const applyAppUpdate = vi.fn(async () => ({ ok: true, message: 'Actualización en curso.' }));
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        checkForAppUpdate: vi.fn(async () => ({
          updateAvailable: true,
          currentVersion: '1.0.5',
          latestVersion: '1.0.9',
          message: null,
        })),
        applyAppUpdate,
      },
    });

    render(<AppUpdateChecker />);

    await screen.findByRole('dialog');
    expect(screen.getByText(/V1\.0\.9/)).toBeInTheDocument();
    expect(applyAppUpdate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /actualizar ahora/i }));

    await waitFor(() => expect(applyAppUpdate).toHaveBeenCalledTimes(1));
  });

  it('no aplica la actualización si la persona elige "Más tarde"', async () => {
    const applyAppUpdate = vi.fn();
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        checkForAppUpdate: vi.fn(async () => ({
          updateAvailable: true,
          currentVersion: '1.0.5',
          latestVersion: '1.0.9',
          message: null,
        })),
        applyAppUpdate,
      },
    });

    render(<AppUpdateChecker />);

    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /más tarde/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(applyAppUpdate).not.toHaveBeenCalled();
  });

  it('muestra un aviso de error si la actualización confirmada no se puede aplicar', async () => {
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        checkForAppUpdate: vi.fn(async () => ({
          updateAvailable: true,
          currentVersion: '1.0.5',
          latestVersion: '1.0.9',
          message: null,
        })),
        applyAppUpdate: vi.fn(async () => ({
          ok: false,
          message: 'No se ha encontrado ningún .exe en la carpeta de actualizaciones.',
        })),
      },
    });

    render(<AppUpdateChecker />);

    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /actualizar ahora/i }));

    await screen.findByText(/no se ha podido aplicar la actualización/i);
  });
});

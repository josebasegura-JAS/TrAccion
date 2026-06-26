import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppDialog } from '../components/ui/AppDialog';

describe('AppDialog', () => {
  afterEach(() => {
    cleanup();
  });

  it('renderiza un alert con el título y mensaje, y un único botón de confirmación', () => {
    const onConfirm = vi.fn();
    render(<AppDialog message="Operación completada." mode="alert" onConfirm={onConfirm} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Operación completada.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ok/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancelar/i })).not.toBeInTheDocument();
  });

  it('renderiza un confirm con botones de cancelar y confirmar', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <AppDialog
        message="¿Seguro que quieres continuar?"
        mode="confirm"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /aceptar/i })).toBeInTheDocument();
  });

  it('respeta las etiquetas personalizadas de los botones', () => {
    render(
      <AppDialog
        cancelLabel="Más tarde"
        confirmLabel="Actualizar ahora"
        message="Hay una versión nueva disponible."
        mode="confirm"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Más tarde' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /actualizar ahora/i })).toBeInTheDocument();
  });

  it('sigue mostrando el botón de confirmar incluso con un mensaje muy largo (el contenido hace scroll, no el botón)', () => {
    const longMessage = Array.from({ length: 40 }, (_, index) => `Línea de aviso número ${index + 1}.`).join(
      '\n',
    );

    render(<AppDialog message={longMessage} mode="alert" onConfirm={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    // El panel del diálogo debe limitar su altura total (no crecer sin
    // límite con el contenido), y el bloque de mensaje debe poder
    // desplazarse dentro de ese límite en vez de desbordar la pantalla.
    expect(dialog.className).toContain('max-h-');
    expect(dialog.className).toContain('overflow-hidden');
    expect(screen.getByRole('button', { name: /ok/i })).toBeInTheDocument();
    expect(screen.getByText(/Línea de aviso número 1\./)).toBeInTheDocument();
    expect(screen.getByText(/Línea de aviso número 40\./)).toBeInTheDocument();
  });
});

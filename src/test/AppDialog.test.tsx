import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppDialog } from '../components/ui/AppDialog';

describe('AppDialog', () => {
  afterEach(() => {
    cleanup();
  });

  it('usa Información y Cerrar como fallback de un aviso informativo', () => {
    const onConfirm = vi.fn();
    render(<AppDialog message="Operación completada." mode="alert" onConfirm={onConfirm} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Información' })).toBeInTheDocument();
    expect(screen.getByText('Operación completada.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancelar/i })).not.toBeInTheDocument();
  });

  it('diferencia los títulos de warning y error sin recurrir a Aviso', () => {
    const { rerender } = render(
      <AppDialog message="Revisa la configuración." mode="alert" onConfirm={vi.fn()} type="warning" />,
    );

    expect(screen.getByRole('heading', { name: 'Atención' })).toBeInTheDocument();

    rerender(
      <AppDialog message="No se ha podido completar la operación." mode="alert" onConfirm={vi.fn()} type="error" />,
    );

    expect(screen.getByRole('heading', { name: 'Error' })).toBeInTheDocument();
  });

  it('usa Continuar en confirmaciones no destructivas cuando el flujo no personaliza la acción', () => {
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

    expect(screen.getByRole('heading', { name: 'Confirmar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
  });

  it('distingue las confirmaciones destructivas y evita el genérico Aceptar', () => {
    render(
      <AppDialog
        danger
        message="Esta acción puede provocar pérdida de información."
        mode="confirm"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Confirmar acción' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar' })).not.toBeInTheDocument();
  });

  it('respeta títulos y etiquetas personalizadas de negocio', () => {
    render(
      <AppDialog
        cancelLabel="Más tarde"
        confirmLabel="Actualizar ahora"
        message="Hay una versión nueva disponible."
        mode="confirm"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        title="Actualizar TrAcción"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Actualizar TrAcción' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Más tarde' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /actualizar ahora/i })).toBeInTheDocument();
  });

  it('sigue mostrando la acción incluso con un mensaje muy largo', () => {
    const longMessage = Array.from({ length: 40 }, (_, index) => `Línea de aviso número ${index + 1}.`).join(
      '\n',
    );

    render(<AppDialog message={longMessage} mode="alert" onConfirm={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('max-h-');
    expect(dialog.className).toContain('overflow-hidden');
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
    expect(screen.getByText(/Línea de aviso número 1\./)).toBeInTheDocument();
    expect(screen.getByText(/Línea de aviso número 40\./)).toBeInTheDocument();
  });
});

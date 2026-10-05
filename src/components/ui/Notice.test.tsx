import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Notice } from './Notice';

describe('Notice', () => {
  afterEach(() => {
    cleanup();
  });

  it('renderiza el contenido pasado como children', () => {
    render(<Notice>Mensaje informativo</Notice>);

    expect(screen.getByText('Mensaje informativo')).toBeInTheDocument();
  });

  it('usa el tono "muted" por defecto con contraste reforzado', () => {
    const { container } = render(<Notice>Mensaje</Notice>);

    expect(container.firstChild).toHaveClass(
      'border-metro-border',
      'bg-metro-surface',
      'text-metro-secondary',
    );
  });

  it('aplica las clases del tono "error"', () => {
    const { container } = render(<Notice tone="error">Ha ocurrido un error</Notice>);

    expect(container.firstChild).toHaveClass('border-red-400/40', 'text-red-100');
  });

  it('aplica las clases del tono "success"', () => {
    const { container } = render(<Notice tone="success">Guardado correctamente</Notice>);

    expect(container.firstChild).toHaveClass('border-metro-success/30');
  });

  it('aplica las clases del tono "warning"', () => {
    const { container } = render(<Notice tone="warning">Aviso importante</Notice>);

    expect(container.firstChild).toHaveClass('border-amber-400/40');
  });

  it('solo crea una región viva cuando se solicita', () => {
    const { rerender } = render(<Notice>Estático</Notice>);
    expect(screen.getByText('Estático').closest('[aria-live]')).toBeNull();

    rerender(<Notice live="polite">Bloqueado por otro usuario</Notice>);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');

    rerender(<Notice live="assertive" tone="error">Error de guardado</Notice>);
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });

  it('permite título y acción sin convertir todo el aviso en un botón', () => {
    const onAction = vi.fn();
    render(
      <Notice actionLabel="Reintentar" onAction={onAction} title="No se ha podido guardar" tone="error">
        Comprueba la conexión y vuelve a intentarlo.
      </Notice>,
    );

    expect(screen.getByText('No se ha podido guardar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('combina className adicional con las clases base', () => {
    const { container } = render(<Notice className="mt-3">Mensaje con margen</Notice>);

    expect(container.firstChild).toHaveClass('mt-3', 'rounded-xl');
  });
});

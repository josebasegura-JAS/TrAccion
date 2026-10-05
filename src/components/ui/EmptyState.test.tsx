import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  afterEach(() => {
    cleanup();
  });

  it('muestra título y descripción con una jerarquía estable', () => {
    render(
      <EmptyState
        description="Crea el primer registro para empezar."
        title="Todavía no hay registros"
      />,
    );

    expect(screen.getByText('Todavía no hay registros')).toBeInTheDocument();
    expect(screen.getByText('Crea el primer registro para empezar.')).toBeInTheDocument();
  });

  it('convierte el vacío en accionable cuando recibe una acción', () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        actionLabel="Crear registro"
        onAction={onAction}
        title="Sin registros"
      />,
    );

    const action = screen.getByRole('button', { name: 'Crear registro' });
    action.focus();
    expect(action).toHaveFocus();

    fireEvent.click(action);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('permite una variante compacta para tablas y paneles densos', () => {
    const { container } = render(<EmptyState size="compact" title="Sin resultados" />);

    expect(container.firstChild).toHaveClass('py-4');
    expect(container.firstChild).not.toHaveClass('py-7');
  });
});

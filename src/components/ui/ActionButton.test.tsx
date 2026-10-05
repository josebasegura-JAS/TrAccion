import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionButton } from './ActionButton';

describe('ActionButton', () => {
  afterEach(() => {
    cleanup();
  });

  it('usa el tamaño compacto por defecto para mantener homogéneas las barras de acciones', () => {
    render(<ActionButton variant="secondary">Acción</ActionButton>);

    const button = screen.getByRole('button', { name: 'Acción' });
    expect(button).toHaveClass('h-8', 'text-xs');
    expect(button).not.toHaveClass('h-10', 'text-sm');
  });

  it('diferencia Crear de Añadir en el contrato de copy', () => {
    const { rerender } = render(<ActionButton variant="create" />);

    expect(screen.getByRole('button', { name: 'Crear' })).toHaveTextContent('Crear');

    rerender(<ActionButton variant="add" />);
    expect(screen.getByRole('button', { name: 'Añadir' })).toHaveTextContent('Añadir');
  });

  it('muestra texto por defecto y usa la etiqueta de la variante como aria-label', () => {
    render(<ActionButton variant="delete" onClick={() => undefined} />);

    const button = screen.getByRole('button', { name: 'Eliminar' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Eliminar');
  });

  it('muestra el texto cuando iconOnly es false', () => {
    render(
      <ActionButton iconOnly={false} variant="save" onClick={() => undefined}>
        Guardar cambios
      </ActionButton>,
    );

    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toHaveTextContent(
      'Guardar cambios',
    );
  });

  it('es enfocable por teclado y expone un foco visible coherente', () => {
    render(<ActionButton variant="secondary">Abrir</ActionButton>);

    const button = screen.getByRole('button', { name: 'Abrir' });
    button.focus();

    expect(button).toHaveFocus();
    expect(button).toHaveClass('focus-visible:outline-metro-red');
  });

  it('dispara onClick al pulsar', () => {
    const handleClick = vi.fn();
    render(
      <ActionButton iconOnly={false} variant="add" onClick={handleClick}>
        Añadir seguimiento
      </ActionButton>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Añadir seguimiento' }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('se deshabilita y no dispara onClick cuando disabled es true', () => {
    const handleClick = vi.fn();
    render(
      <ActionButton disabled iconOnly={false} variant="save" onClick={handleClick}>
        Guardar
      </ActionButton>,
    );

    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('con loading=true se deshabilita, marca aria-busy y respeta reduced motion', () => {
    const handleClick = vi.fn();
    const { container } = render(
      <ActionButton iconOnly={false} loading variant="save" onClick={handleClick}>
        Guardando...
      </ActionButton>,
    );

    const button = screen.getByRole('button', { name: 'Guardando...' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.motion-reduce\\:animate-none')).toBeInTheDocument();

    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('respeta un title explícito para el aria-label', () => {
    render(
      <ActionButton title="Eliminar tarea concreta" variant="delete" onClick={() => undefined} />,
    );

    expect(screen.getByRole('button', { name: 'Eliminar tarea concreta' })).toBeInTheDocument();
  });

  it('la variante outlook usa "Outlook" como etiqueta por defecto', () => {
    render(<ActionButton variant="outlook" onClick={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Outlook' })).toBeInTheDocument();
  });
});

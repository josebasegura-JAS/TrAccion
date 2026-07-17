import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionButton } from './ActionButton';

describe('ActionButton', () => {
  afterEach(() => {
    cleanup();
  });

  it('muestra solo el icono por defecto (iconOnly) y usa la etiqueta de la variante como aria-label', () => {
    render(<ActionButton variant="delete" onClick={() => undefined} />);

    const button = screen.getByRole('button', { name: 'Eliminar' });
    expect(button).toBeInTheDocument();
    expect(button).not.toHaveTextContent('Eliminar');
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

  it('dispara onClick al pulsar', () => {
    const handleClick = vi.fn();
    render(
      <ActionButton iconOnly={false} variant="add" onClick={handleClick}>
        Nueva tarea
      </ActionButton>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Nueva tarea' }));

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

  it('con loading=true se deshabilita, marca aria-busy y no dispara onClick', () => {
    const handleClick = vi.fn();
    render(
      <ActionButton iconOnly={false} loading variant="save" onClick={handleClick}>
        Guardando...
      </ActionButton>,
    );

    const button = screen.getByRole('button', { name: 'Guardando...' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('respeta un title explícito para el aria-label', () => {
    render(
      <ActionButton title="Eliminar tarea concreta" variant="delete" onClick={() => undefined} />,
    );

    expect(screen.getByRole('button', { name: 'Eliminar tarea concreta' })).toBeInTheDocument();
  });
});

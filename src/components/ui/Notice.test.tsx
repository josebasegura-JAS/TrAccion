import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Notice } from './Notice';

describe('Notice', () => {
  afterEach(() => {
    cleanup();
  });

  it('renderiza el contenido pasado como children', () => {
    render(<Notice>Mensaje informativo</Notice>);

    expect(screen.getByText('Mensaje informativo')).toBeInTheDocument();
  });

  it('usa el tono "muted" por defecto', () => {
    render(<Notice>Mensaje</Notice>);

    expect(screen.getByText('Mensaje')).toHaveClass('border-metro-border', 'bg-metro-surface');
  });

  it('aplica las clases del tono "error"', () => {
    render(<Notice tone="error">Ha ocurrido un error</Notice>);

    expect(screen.getByText('Ha ocurrido un error')).toHaveClass(
      'border-red-400/40',
      'text-red-100',
    );
  });

  it('aplica las clases del tono "success"', () => {
    render(<Notice tone="success">Guardado correctamente</Notice>);

    expect(screen.getByText('Guardado correctamente')).toHaveClass('border-metro-success/30');
  });

  it('aplica las clases del tono "warning"', () => {
    render(<Notice tone="warning">Aviso importante</Notice>);

    expect(screen.getByText('Aviso importante')).toHaveClass('border-amber-400/40');
  });

  it('combina className adicional con las clases base', () => {
    render(<Notice className="mt-3">Mensaje con margen</Notice>);

    expect(screen.getByText('Mensaje con margen')).toHaveClass('mt-3', 'rounded-xl');
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Field, Input } from './Field';

describe('Field', () => {
  afterEach(() => {
    cleanup();
  });

  it('asocia la etiqueta con el id existente del control', () => {
    render(
      <Field label="Empleado">
        <Input id="employee-number" />
      </Field>,
    );

    const input = screen.getByRole('textbox', { name: 'Empleado' });
    expect(input).toHaveAttribute('id', 'employee-number');
    expect(screen.getByText('Empleado').closest('label')).toHaveAttribute('for', 'employee-number');
  });

  it('mantiene hint y error asociados mediante aria-describedby', () => {
    render(
      <Field error="Valor obligatorio" hint="Introduce el número de empleado" label="Empleado">
        <Input />
      </Field>,
    );

    const input = screen.getByRole('textbox', { name: 'Empleado' });
    const describedBy = input.getAttribute('aria-describedby') ?? '';

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(describedBy).toContain('-error');
    expect(describedBy).toContain('-hint');
    expect(screen.getByText('Valor obligatorio')).toBeInTheDocument();
    expect(screen.getByText('Introduce el número de empleado')).toBeInTheDocument();
  });
});

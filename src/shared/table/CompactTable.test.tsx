import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CompactTable, CompactTableBody, CompactTableHead } from './CompactTable';

describe('CompactTable', () => {
  afterEach(() => {
    cleanup();
  });

  it('propaga la densidad de la tabla a cabecera y cuerpo', () => {
    const { container } = render(
      <CompactTable density="comfortable">
        <CompactTableHead>
          <tr><th>Nombre</th></tr>
        </CompactTableHead>
        <CompactTableBody>
          <tr><td>Registro</td></tr>
        </CompactTableBody>
      </CompactTable>,
    );

    expect(container.querySelector('table')).toHaveAttribute('data-density', 'comfortable');
    expect(container.querySelector('thead')).toHaveAttribute('data-density', 'comfortable');
    expect(container.querySelector('tbody')).toHaveAttribute('data-density', 'comfortable');
  });

  it('permite sobrescribir la densidad de una sección de forma explícita', () => {
    const { container } = render(
      <CompactTable density="comfortable">
        <CompactTableHead density="compact">
          <tr><th>Nombre</th></tr>
        </CompactTableHead>
        <CompactTableBody>
          <tr><td>Registro</td></tr>
        </CompactTableBody>
      </CompactTable>,
    );

    expect(container.querySelector('thead')).toHaveAttribute('data-density', 'compact');
    expect(container.querySelector('tbody')).toHaveAttribute('data-density', 'comfortable');
  });
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTable, type DataTableColumn } from './DataTable';

type Row = { id: string; name: string };
type ColumnId = 'name';

const columns: Array<DataTableColumn<Row, ColumnId>> = [
  {
    id: 'name',
    header: 'Nombre',
    accessor: (row) => row.name,
    width: 180,
  },
];

describe('DataTable keyboard', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(() => ({
        disconnect: vi.fn(),
        observe: vi.fn(),
        takeRecords: vi.fn(() => []),
        unobserve: vi.fn(),
      })),
    );

    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderTable(onRowClick: (row: Row) => void) {
    return render(
      <DataTable
        ariaLabel="Tabla de prueba"
        columnWidths={{}}
        columns={columns}
        emptyMessage="Sin registros"
        getRowId={(row) => row.id}
        onColumnWidthChange={() => undefined}
        onRowClick={onRowClick}
        onSortChange={() => undefined}
        rows={[{ id: '1', name: 'Registro uno' }]}
        sort={null}
      />,
    );
  }

  it('permite enfocar una fila interactiva', () => {
    renderTable(() => undefined);

    const row = screen.getByText('Registro uno').closest('tr');
    expect(row).not.toBeNull();

    row?.focus();
    expect(row).toHaveFocus();
  });

  it('activa la fila con Enter', () => {
    const onRowClick = vi.fn();
    renderTable(onRowClick);

    const row = screen.getByText('Registro uno').closest('tr');
    expect(row).not.toBeNull();

    fireEvent.keyDown(row as HTMLTableRowElement, { key: 'Enter' });
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it('activa la fila con Espacio sin desplazar la página', () => {
    const onRowClick = vi.fn();
    renderTable(onRowClick);

    const row = screen.getByText('Registro uno').closest('tr');
    expect(row).not.toBeNull();

    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ' ' });
    row?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });
});

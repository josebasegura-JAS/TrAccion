import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTable, type DataTableColumn } from './DataTable';

type Row = { id: string; title: string; items: string[] };
type Column = 'title';
const initial: Row[] = [
  { id: 'a', title: 'Primera tarea', items: ['Acción A'] },
  { id: 'b', title: 'Segunda tarea', items: [] },
  { id: 'c', title: 'Tercera tarea', items: ['Acción C'] },
];

function ExpandableTable({ onOpen, rows = initial }: { onOpen: (row: Row) => void; rows?: Row[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<{ columnId: Column; direction: 'asc' | 'desc' } | null>(null);
  const columns: Array<DataTableColumn<Row, Column>> = [{
    id: 'title',
    header: 'Título',
    accessor: (row) => row.title,
    sortable: true,
    width: 300,
    render: (row) => (
      <span>
        {row.items.length > 0 && (
          <button
            aria-expanded={expanded.has(row.id)}
            aria-label={`Ver acciones de ${row.title}`}
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((old) => {
                const next = new Set(old);
                if (next.has(row.id)) next.delete(row.id);
                else next.add(row.id);
                return next;
              });
            }}
            type="button"
          >
            Expandir
          </button>
        )}
        {row.title}
      </span>
    ),
  }];
  return (
    <DataTable
      ariaLabel="Tareas"
      columns={columns}
      rows={rows}
      sort={sort}
      onSortChange={setSort}
      columnWidths={{}}
      onColumnWidthChange={() => undefined}
      getRowId={(row) => row.id}
      emptyMessage="Sin tareas"
      onRowClick={onOpen}
      isRowExpanded={(row) => expanded.has(row.id) && row.items.length > 0}
      renderExpandedRow={(row) => <ul>{row.items.map((item) => <li key={item}>{item}</li>)}</ul>}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', vi.fn(() => ({
    disconnect: vi.fn(), observe: vi.fn(), takeRecords: vi.fn(() => []), unobserve: vi.fn(),
  })));
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('DataTable: detalle expandido opcional', () => {
  it('expande y contrae debajo de la tarea sin abrir su editor', () => {
    const onOpen = vi.fn();
    render(<ExpandableTable onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver acciones de Primera tarea' }));
    expect(screen.getByText('Acción A')).toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ver acciones de Primera tarea' }));
    expect(screen.queryByText('Acción A')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('row', { name: /Primera tarea/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('permite desplegar varias tareas y conserva el vínculo al ordenar', () => {
    render(<ExpandableTable onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver acciones de Primera tarea' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver acciones de Tercera tarea' }));
    expect(screen.getByText('Acción A')).toBeInTheDocument();
    expect(screen.getByText('Acción C')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Título/ }));
    expect(screen.getByRole('columnheader', { name: /Título/ })).toHaveAttribute('aria-sort', 'ascending');
    const rowsAsc = screen.getAllByRole('row');
    expect(rowsAsc[1]).toHaveTextContent('Primera tarea');
    expect(rowsAsc[2]).toHaveAttribute('data-expanded-for', 'a');
    expect(rowsAsc[2]).toHaveTextContent('Acción A');
    expect(rowsAsc[4]).toHaveTextContent('Tercera tarea');
    expect(rowsAsc[5]).toHaveAttribute('data-expanded-for', 'c');
    expect(rowsAsc[5]).toHaveTextContent('Acción C');

    fireEvent.click(screen.getByRole('button', { name: /Título/ }));
    expect(screen.getByRole('columnheader', { name: /Título/ })).toHaveAttribute('aria-sort', 'descending');
    const rowsDesc = screen.getAllByRole('row');
    expect(rowsDesc[1]).toHaveTextContent('Tercera tarea');
    expect(rowsDesc[2]).toHaveAttribute('data-expanded-for', 'c');
    expect(rowsDesc[2]).toHaveTextContent('Acción C');
    expect(rowsDesc[4]).toHaveTextContent('Primera tarea');
    expect(rowsDesc[5]).toHaveAttribute('data-expanded-for', 'a');
    expect(rowsDesc[5]).toHaveTextContent('Acción A');
  });

  it('no incluye detalle si la tarea no tiene acciones o desaparece del filtro', () => {
    const view = render(<ExpandableTable onOpen={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Ver acciones de Segunda tarea' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver acciones de Primera tarea' }));
    expect(screen.getByText('Acción A')).toBeInTheDocument();
    view.rerender(<ExpandableTable onOpen={vi.fn()} rows={initial.slice(1)} />);
    expect(screen.queryByText('Acción A')).not.toBeInTheDocument();
  });
});

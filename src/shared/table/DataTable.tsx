import { type PointerEvent as ReactPointerEvent, type ReactNode, useMemo, useRef } from 'react';
import { sortDataTableRows } from './tableSorting';
import type { TableSortState } from './useTableViewPreferences';

export type DataTableSortValue = string | number | Date | null | undefined;

export interface DataTableColumn<Row, ColumnId extends string> {
  id: ColumnId;
  header: string;
  accessor?: (row: Row) => DataTableSortValue;
  render?: (row: Row) => ReactNode;
  width: number;
  minWidth?: number;
  maxWidth?: number;
  sortable?: boolean;
  resizable?: boolean;
  className?: string;
  headerClassName?: string;
  isActionColumn?: boolean;
}

interface DataTableProps<Row, ColumnId extends string> {
  columns: Array<DataTableColumn<Row, ColumnId>>;
  rows: Row[];
  getRowId: (row: Row) => string;
  sort: TableSortState<ColumnId> | null;
  onSortChange: (sort: TableSortState<ColumnId> | null) => void;
  columnWidths: Partial<Record<ColumnId, number>>;
  onColumnWidthChange: (columnId: ColumnId, width: number) => void;
  emptyMessage: string;
  onRowClick?: (row: Row) => void;
  onRowDoubleClick?: (row: Row) => void;
  rowClassName?: (row: Row) => string;
  ariaLabel: string;
  maxHeightClassName?: string;
}

const DEFAULT_MIN_COLUMN_WIDTH = 80;
const DEFAULT_MAX_COLUMN_WIDTH = 640;
const RESIZE_HANDLE_WIDTH = 12;

function clampColumnWidth(width: number, minWidth: number, maxWidth: number): number {
  return Math.min(Math.max(width, minWidth), maxWidth);
}

function nextSortState<ColumnId extends string>(
  currentSort: TableSortState<ColumnId> | null,
  columnId: ColumnId,
): TableSortState<ColumnId> | null {
  if (!currentSort || currentSort.columnId !== columnId) {
    return { columnId, direction: 'asc' };
  }

  if (currentSort.direction === 'asc') {
    return { columnId, direction: 'desc' };
  }

  return null;
}

export function DataTable<Row, ColumnId extends string>({
  columns,
  rows,
  getRowId,
  sort,
  onSortChange,
  columnWidths,
  onColumnWidthChange,
  emptyMessage,
  onRowClick,
  onRowDoubleClick,
  rowClassName,
  ariaLabel,
  maxHeightClassName = 'max-h-[460px]',
}: DataTableProps<Row, ColumnId>) {
  const resizeStateRef = useRef<{
    columnId: ColumnId;
    startX: number;
    startWidth: number;
    minWidth: number;
    maxWidth: number;
    previousUserSelect: string;
  } | null>(null);

  const visibleColumns = useMemo(
    () =>
      columns.map((column) => {
        const minWidth = column.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH;
        const maxWidth = column.maxWidth ?? DEFAULT_MAX_COLUMN_WIDTH;
        const width = clampColumnWidth(columnWidths[column.id] ?? column.width, minWidth, maxWidth);
        return { ...column, width, minWidth, maxWidth };
      }),
    [columnWidths, columns],
  );

  const sortedRows = useMemo(
    () => sortDataTableRows(rows, visibleColumns, sort),
    [rows, sort, visibleColumns],
  );

  const tableMinWidth = visibleColumns.reduce((sum, column) => sum + column.minWidth, 0);

  const stopResize = () => {
    const resizeState = resizeStateRef.current;
    if (!resizeState) {
      return;
    }

    document.body.style.userSelect = resizeState.previousUserSelect;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopResize);
    window.removeEventListener('pointercancel', stopResize);
    resizeStateRef.current = null;
  };

  const handlePointerMove = (event: PointerEvent) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState) {
      return;
    }

    const nextWidth = clampColumnWidth(
      resizeState.startWidth + event.clientX - resizeState.startX,
      resizeState.minWidth,
      resizeState.maxWidth,
    );
    onColumnWidthChange(resizeState.columnId, Math.round(nextWidth));
  };

  const startResize = (
    event: ReactPointerEvent<HTMLSpanElement>,
    column: (typeof visibleColumns)[number],
  ) => {
    event.preventDefault();
    event.stopPropagation();

    resizeStateRef.current = {
      columnId: column.id,
      startX: event.clientX,
      startWidth: column.width,
      minWidth: column.minWidth,
      maxWidth: column.maxWidth,
      previousUserSelect: document.body.style.userSelect,
    };

    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  };

  return (
    <div className={`${maxHeightClassName} overflow-auto rounded-xl border border-metro-border`}>
      <table
        aria-label={ariaLabel}
        className="w-full table-fixed text-left text-xs"
        style={{ minWidth: tableMinWidth }}
      >
        <colgroup>
          {visibleColumns.map((column) => (
            <col key={column.id} style={{ width: column.width }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-metro-panel text-[11px] uppercase tracking-wide text-metro-muted shadow-[0_1px_0_rgba(148,163,184,0.18)]">
          <tr>
            {visibleColumns.map((column) => {
              const isSorted = sort?.columnId === column.id;
              const canSort = Boolean(column.sortable && column.accessor);
              const ariaSort = isSorted
                ? sort?.direction === 'asc'
                  ? 'ascending'
                  : 'descending'
                : 'none';

              return (
                <th
                  aria-sort={canSort ? ariaSort : undefined}
                  className={`relative px-3 py-2 ${column.headerClassName ?? ''}`}
                  key={column.id}
                  scope="col"
                >
                  {canSort ? (
                    <button
                      className={`flex w-full items-center gap-1 text-left font-bold uppercase tracking-wide hover:text-metro-text ${
                        column.isActionColumn ? 'justify-end' : ''
                      }`}
                      onClick={() => onSortChange(nextSortState(sort, column.id))}
                      type="button"
                    >
                      <span className="truncate" title={column.header}>
                        {column.header}
                      </span>
                      <span aria-hidden="true" className="inline-block w-3 text-metro-red">
                        {isSorted ? (sort?.direction === 'asc' ? '↑' : '↓') : ''}
                      </span>
                      <span className="sr-only">
                        {isSorted
                          ? `Orden ${sort?.direction === 'asc' ? 'ascendente' : 'descendente'}`
                          : 'Sin ordenar'}
                      </span>
                    </button>
                  ) : (
                    <span
                      className={`block truncate font-bold ${column.isActionColumn ? 'text-right' : ''}`}
                    >
                      {column.header}
                    </span>
                  )}
                  {column.resizable !== false && !column.isActionColumn && (
                    <span
                      aria-label={`Redimensionar columna ${column.header}`}
                      className="absolute right-0 top-0 h-full cursor-col-resize touch-none"
                      onPointerDown={(event) => startResize(event, column)}
                      role="separator"
                      style={{ width: RESIZE_HANDLE_WIDTH }}
                      tabIndex={-1}
                    >
                      <span className="absolute right-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-transparent transition-colors hover:bg-metro-red/70" />
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="bg-metro-surface">
          {sortedRows.length === 0 ? (
            <tr>
              <td
                className="px-3 py-6 text-center text-sm font-semibold text-metro-muted"
                colSpan={visibleColumns.length}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedRows.map((row, rowIndex) => (
              <tr
                className={`${rowIndex % 2 === 0 ? 'bg-metro-surface' : 'bg-metro-panel/45'} transition-colors hover:bg-metro-red/10 ${onRowClick || onRowDoubleClick ? 'cursor-pointer' : ''} ${rowClassName?.(row) ?? ''}`}
                key={getRowId(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
              >
                {visibleColumns.map((column) => {
                  const cellContent = column.render
                    ? column.render(row)
                    : String(column.accessor?.(row) ?? '');

                  return (
                    <td
                      className={`truncate px-3 py-1.5 ${column.isActionColumn ? 'text-right' : ''} ${
                        column.className ?? ''
                      }`}
                      key={column.id}
                      title={typeof cellContent === 'string' ? cellContent : undefined}
                    >
                      {cellContent}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

import {
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, RotateCcw } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';
import { sortDataTableRows } from './tableSorting';
import type { TableSortState } from './useTableViewPreferences';

export type DataTableSortValue = string | number | Date | null | undefined;
export type DataTableColumnTone = 'request' | 'start' | 'end' | 'attention' | 'financial' | 'identity';
export type DataTableDensity = 'compact' | 'comfortable';

const columnToneClasses: Record<DataTableColumnTone, { header: string; cell: string }> = {
  request: { header: 'bg-sky-400/[0.12]', cell: 'bg-sky-400/[0.045]' },
  start: { header: 'bg-emerald-400/[0.12]', cell: 'bg-emerald-400/[0.045]' },
  end: { header: 'bg-amber-400/[0.14]', cell: 'bg-amber-400/[0.05]' },
  attention: { header: 'bg-amber-400/[0.14]', cell: 'bg-amber-400/[0.05]' },
  financial: { header: 'bg-emerald-400/[0.12]', cell: 'bg-emerald-400/[0.045]' },
  identity: { header: 'bg-sky-300/[0.08]', cell: 'bg-sky-300/[0.025]' },
};

const densityClasses: Record<
  DataTableDensity,
  { table: string; header: string; cell: string }
> = {
  compact: {
    table: 'text-[12px] leading-4',
    header: 'px-2.5 py-2',
    cell: 'px-2.5 py-1.5',
  },
  comfortable: {
    table: 'text-[13px] leading-5',
    header: 'px-3 py-2.5',
    cell: 'px-3 py-2.5',
  },
};

export interface DataTableColumn<Row, ColumnId extends string> {
  id: ColumnId;
  header: string;
  accessor?: (row: Row) => DataTableSortValue;
  /** Comparador opcional para reglas de ordenación específicas del dominio. */
  compare?: (first: Row, second: Row) => number;
  /** Mantiene valores vacíos al final tanto en ascendente como en descendente. */
  emptyValuesLast?: boolean;
  render?: (row: Row) => ReactNode;
  width: number;
  minWidth?: number;
  maxWidth?: number;
  sortable?: boolean;
  resizable?: boolean;
  /** false para columnas que el usuario no debe poder mover (p. ej. acciones). Por defecto true, salvo isActionColumn. */
  reorderable?: boolean;
  className?: string;
  headerClassName?: string;
  /** Tinte semántico muy suave para facilitar la lectura vertical sin convertir la tabla en un mosaico. */
  tone?: DataTableColumnTone;
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
  onResetColumnWidths?: () => void;
  /** Orden de columnas elegido por el usuario (solo ids reordenables). null = orden por defecto del array `columns`. */
  columnOrder?: ColumnId[] | null;
  onColumnOrderChange?: (columnOrder: ColumnId[]) => void;
  emptyMessage: string;
  onRowClick?: (row: Row) => void;
  onRowDoubleClick?: (row: Row) => void;
  rowClassName?: (row: Row) => string;
  /** Aumenta el contraste del cebreado para pantallas operativas densas. */
  strongZebra?: boolean;
  ariaLabel: string;
  maxHeightClassName?: string;
  /** Altura estable opcional del viewport. Útil en bandejas de workflow para evitar saltos al mover registros entre estados. */
  heightClassName?: string;
  /** Mantiene la posición vertical cuando cambian filas por una edición. Útil en tablas de trabajo largas. */
  preserveScrollOnRowsChange?: boolean;
  /** Densidad visual de cabecera y filas. "comfortable" conserva el aspecto previo. */
  density?: DataTableDensity;
  /** Mantiene la columna marcada como acción visible al hacer scroll horizontal. */
  stickyActionColumn?: boolean;
}

const DEFAULT_MIN_COLUMN_WIDTH = 80;
const DEFAULT_MAX_COLUMN_WIDTH = 640;
const RESIZE_HANDLE_WIDTH = 12;
const KEYBOARD_RESIZE_STEP = 16;
const DEFAULT_RENDER_BATCH_SIZE = 300;
const RENDER_BATCH_INCREMENT = 300;

function clampColumnWidth(width: number, minWidth: number, maxWidth: number): number {
  return Math.min(Math.max(width, minWidth), maxWidth);
}

function isColumnReorderable<Row, ColumnId extends string>(
  column: DataTableColumn<Row, ColumnId>,
): boolean {
  return column.reorderable ?? !column.isActionColumn;
}

function applyColumnOrder<Row, ColumnId extends string>(
  columns: Array<DataTableColumn<Row, ColumnId>>,
  columnOrder: ColumnId[] | null | undefined,
): Array<DataTableColumn<Row, ColumnId>> {
  if (!columnOrder || columnOrder.length === 0) {
    return columns;
  }

  const columnsById = new Map(columns.map((column) => [column.id, column]));
  const reorderableIds = new Set(
    columns.filter((column) => isColumnReorderable(column)).map((column) => column.id),
  );

  const storedReorderableIds = columnOrder.filter((id) => reorderableIds.has(id));
  if (
    storedReorderableIds.length !== reorderableIds.size ||
    new Set(storedReorderableIds).size !== storedReorderableIds.length
  ) {
    return columns;
  }

  let reorderableCursor = 0;
  return columns.map((column) => {
    if (!isColumnReorderable(column)) {
      return column;
    }
    const nextId = storedReorderableIds[reorderableCursor];
    reorderableCursor += 1;
    return columnsById.get(nextId) ?? column;
  });
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

function isInteractiveRowTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(
    'button, a, input, select, textarea, [role="button"], [role="link"], [contenteditable="true"]',
  ));
}

function OverflowTooltipText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const refreshOverflowState = () => {
    const element = ref.current;
    if (!element) return;
    const next = element.scrollWidth > element.clientWidth;
    setIsOverflowing((current) => (current === next ? current : next));
  };

  return (
    <span
      className="block truncate"
      data-tip={isOverflowing ? text : undefined}
      onFocus={refreshOverflowState}
      onMouseEnter={refreshOverflowState}
      ref={ref}
      title={isOverflowing ? text : undefined}
    >
      {text}
    </span>
  );
}

export function DataTable<Row, ColumnId extends string>({
  columns,
  rows,
  getRowId,
  sort,
  onSortChange,
  columnWidths,
  onColumnWidthChange,
  onResetColumnWidths,
  columnOrder,
  onColumnOrderChange,
  emptyMessage,
  onRowClick,
  onRowDoubleClick,
  rowClassName,
  strongZebra = true,
  ariaLabel,
  maxHeightClassName = 'max-h-[460px]',
  heightClassName,
  preserveScrollOnRowsChange = false,
  density = 'comfortable',
  stickyActionColumn = false,
}: DataTableProps<Row, ColumnId>) {
  const resizeStateRef = useRef<{
    columnId: ColumnId;
    startX: number;
    startWidth: number;
    minWidth: number;
    maxWidth: number;
    previousUserSelect: string;
  } | null>(null);

  const [draggedColumnId, setDraggedColumnId] = useState<ColumnId | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<ColumnId | null>(null);

  const orderedColumns = useMemo(
    () => applyColumnOrder(columns, columnOrder),
    [columns, columnOrder],
  );

  const visibleColumns = useMemo(
    () =>
      orderedColumns.map((column) => {
        const minWidth = column.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH;
        const maxWidth = column.maxWidth ?? DEFAULT_MAX_COLUMN_WIDTH;
        const width = clampColumnWidth(columnWidths[column.id] ?? column.width, minWidth, maxWidth);
        return { ...column, width, minWidth, maxWidth };
      }),
    [columnWidths, orderedColumns],
  );

  const [renderLimit, setRenderLimit] = useState(DEFAULT_RENDER_BATCH_SIZE);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const sortedRows = useMemo(
    () => sortDataTableRows(rows, visibleColumns, sort),
    [rows, sort, visibleColumns],
  );

  useEffect(() => {
    setRenderLimit(DEFAULT_RENDER_BATCH_SIZE);
    scrollContainerRef.current?.scrollTo(0, 0);
  }, [sort]);

  useEffect(() => {
    if (preserveScrollOnRowsChange) {
      return;
    }

    setRenderLimit(DEFAULT_RENDER_BATCH_SIZE);
    scrollContainerRef.current?.scrollTo(0, 0);
  }, [preserveScrollOnRowsChange, rows]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setRenderLimit((current) => current + RENDER_BATCH_INCREMENT);
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sortedRows]);

  const visibleRows = useMemo(() => sortedRows.slice(0, renderLimit), [renderLimit, sortedRows]);
  const hasHiddenRows = visibleRows.length < sortedRows.length;

  const tableMinWidth = visibleColumns.reduce((sum, column) => sum + column.minWidth, 0);
  const currentDensity = densityClasses[density];

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

  const handleColumnDragStart = (columnId: ColumnId) => {
    setDraggedColumnId(columnId);
  };

  const handleColumnDragOver = (
    event: ReactDragEvent<HTMLTableCellElement>,
    columnId: ColumnId,
  ) => {
    if (!draggedColumnId || draggedColumnId === columnId) {
      return;
    }
    event.preventDefault();
    setDragOverColumnId(columnId);
  };

  const handleColumnDrop = (
    event: ReactDragEvent<HTMLTableCellElement>,
    targetColumnId: ColumnId,
  ) => {
    event.preventDefault();
    setDragOverColumnId(null);

    const sourceColumnId = draggedColumnId;
    setDraggedColumnId(null);
    if (!sourceColumnId || sourceColumnId === targetColumnId || !onColumnOrderChange) {
      return;
    }

    const reorderableIds = orderedColumns
      .filter((column) => isColumnReorderable(column))
      .map((column) => column.id);
    const sourceIndex = reorderableIds.indexOf(sourceColumnId);
    const targetIndex = reorderableIds.indexOf(targetColumnId);
    if (sourceIndex === -1 || targetIndex === -1) {
      return;
    }

    const nextOrder = [...reorderableIds];
    nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, sourceColumnId);
    onColumnOrderChange(nextOrder);
  };

  const handleColumnDragEnd = () => {
    setDraggedColumnId(null);
    setDragOverColumnId(null);
  };

  const handleResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLSpanElement>,
    column: (typeof visibleColumns)[number],
  ) => {
    let nextWidth: number | null = null;

    if (event.key === 'ArrowLeft') {
      nextWidth = column.width - KEYBOARD_RESIZE_STEP;
    } else if (event.key === 'ArrowRight') {
      nextWidth = column.width + KEYBOARD_RESIZE_STEP;
    } else if (event.key === 'Home') {
      nextWidth = column.minWidth;
    } else if (event.key === 'End') {
      nextWidth = column.maxWidth;
    }

    if (nextWidth === null) return;

    event.preventDefault();
    event.stopPropagation();
    onColumnWidthChange(
      column.id,
      Math.round(clampColumnWidth(nextWidth, column.minWidth, column.maxWidth)),
    );
  };

  const handleRowClick = (event: ReactMouseEvent<HTMLTableRowElement>, row: Row) => {
    if (!onRowClick || isInteractiveRowTarget(event.target)) return;
    onRowClick(row);
  };

  const handleRowDoubleClick = (event: ReactMouseEvent<HTMLTableRowElement>, row: Row) => {
    if (!onRowDoubleClick || isInteractiveRowTarget(event.target)) return;
    onRowDoubleClick(row);
  };

  const handleRowKeyDown = (event: ReactKeyboardEvent<HTMLTableRowElement>, row: Row) => {
    // Las teclas de botones, enlaces o inputs dentro de la fila no deben activar
    // también la acción principal de la fila por propagación.
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const handler = onRowClick ?? onRowDoubleClick;
    if (!handler) return;
    event.preventDefault();
    handler(row);
  };

  return (
    <div className="space-y-2">
      <div
        className={`relative ${heightClassName ?? ''} ${maxHeightClassName} overflow-auto rounded-xl border border-metro-border/80 bg-metro-surface/70`}
        ref={scrollContainerRef}
      >
        {onResetColumnWidths && (
          <button
            aria-label="Restablecer columnas"
            className="absolute right-1 top-1 z-30 inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent bg-metro-panel/95 text-metro-muted transition-colors hover:border-metro-border hover:text-metro-text"
            data-tip="Restablecer columnas"
            onClick={onResetColumnWidths}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={14} />
          </button>
        )}
        <table
          aria-colcount={visibleColumns.length}
          aria-label={ariaLabel}
          aria-rowcount={sortedRows.length + 1}
          className={`w-full table-fixed text-left ${currentDensity.table}`}
          style={{ minWidth: tableMinWidth }}
        >
          <colgroup>
            {visibleColumns.map((column) => (
              <col key={column.id} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-20 bg-metro-topbar/95 text-[11px] font-bold uppercase tracking-[0.06em] text-metro-muted shadow-[0_1px_0_rgba(148,163,184,0.16)] backdrop-blur">
            <tr>
              {visibleColumns.map((column) => {
                const isSorted = sort?.columnId === column.id;
                const canSort = Boolean(column.sortable && (column.accessor || column.compare));
                const ariaSort = isSorted
                  ? sort?.direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none';

                const isReorderable = isColumnReorderable(column) && Boolean(onColumnOrderChange);
                const isDragging = draggedColumnId === column.id;
                const isDragOver = dragOverColumnId === column.id && draggedColumnId !== column.id;
                const stickyActionClass = stickyActionColumn && column.isActionColumn
                  ? 'sticky right-0 z-30 border-l border-metro-border/70 bg-metro-topbar/98'
                  : '';

                return (
                  <th
                    aria-sort={canSort ? ariaSort : undefined}
                    className={`relative ${currentDensity.header} ${onResetColumnWidths && column === visibleColumns[visibleColumns.length - 1] ? 'pr-10' : ''} ${column.tone ? columnToneClasses[column.tone].header : ''} ${column.headerClassName ?? ''} ${
                      isDragging ? 'opacity-40' : ''
                    } ${isDragOver ? 'bg-metro-red/10' : ''} ${stickyActionClass}`}
                    draggable={isReorderable}
                    key={column.id}
                    onDragEnd={isReorderable ? handleColumnDragEnd : undefined}
                    onDragOver={
                      isReorderable ? (event) => handleColumnDragOver(event, column.id) : undefined
                    }
                    onDragStart={isReorderable ? () => handleColumnDragStart(column.id) : undefined}
                    onDrop={
                      isReorderable ? (event) => handleColumnDrop(event, column.id) : undefined
                    }
                    scope="col"
                  >
                    {isReorderable && (
                      <span
                        aria-hidden="true"
                        className="mr-1 inline-block cursor-grab align-middle text-metro-muted/60 active:cursor-grabbing"
                        data-tip="Arrastrar para reordenar columna"
                      >
                        ⠿
                      </span>
                    )}
                    {canSort ? (
                      <button
                        className={`flex w-full items-center gap-1.5 text-left font-semibold hover:text-metro-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-metro-red ${
                          column.isActionColumn ? 'justify-end' : ''
                        }`}
                        onClick={() => onSortChange(nextSortState(sort, column.id))}
                        type="button"
                      >
                        <span className="truncate">
                          {column.header}
                        </span>
                        <span
                          aria-hidden="true"
                          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${
                            isSorted ? 'text-metro-red' : 'text-metro-muted/55'
                          }`}
                        >
                          {isSorted
                            ? sort?.direction === 'asc'
                              ? <ArrowUp size={13} strokeWidth={2.5} />
                              : <ArrowDown size={13} strokeWidth={2.5} />
                            : <ChevronsUpDown size={13} strokeWidth={2} />}
                        </span>
                        <span className="sr-only">
                          {isSorted
                            ? `Orden ${sort?.direction === 'asc' ? 'ascendente' : 'descendente'}. Pulsa para cambiar.`
                            : 'Sin ordenar. Pulsa para ordenar ascendente.'}
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
                        aria-orientation="vertical"
                        aria-valuemax={column.maxWidth}
                        aria-valuemin={column.minWidth}
                        aria-valuenow={column.width}
                        aria-valuetext={`${Math.round(column.width)} píxeles`}
                        className="group absolute right-0 top-0 h-full cursor-col-resize touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-metro-red"
                        data-tip="Redimensionar · flechas izquierda/derecha"
                        onKeyDown={(event) => handleResizeKeyDown(event, column)}
                        onPointerDown={(event) => startResize(event, column)}
                        role="separator"
                        style={{ width: RESIZE_HANDLE_WIDTH }}
                        tabIndex={0}
                      >
                        <span className="absolute right-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-transparent transition-colors group-focus-visible:bg-metro-red/70 hover:bg-metro-red/70" />
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="bg-metro-surface/75">
            {sortedRows.length === 0 ? (
              <tr>
                <td className="p-0" colSpan={visibleColumns.length}>
                  <EmptyState
                    description={emptyMessage}
                    size={density === 'compact' ? 'compact' : 'standard'}
                    title="Sin registros"
                  />
                </td>
              </tr>
            ) : (
              visibleRows.map((row, rowIndex) => {
                const isInteractive = Boolean(onRowClick || onRowDoubleClick);
                return (
                  <tr
                    className={`${rowIndex % 2 === 0 ? (strongZebra ? 'bg-[#10243b]/45' : 'bg-transparent') : (strongZebra ? 'bg-[#1a3048]/62' : 'bg-metro-panel/28')} border-b border-metro-border/55 transition-colors hover:bg-sky-400/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-metro-red/70 ${isInteractive ? 'cursor-pointer' : ''} ${rowClassName?.(row) ?? ''}`}
                    key={getRowId(row)}
                    aria-rowindex={rowIndex + 2}
                    onClick={onRowClick ? (event) => handleRowClick(event, row) : undefined}
                    onDoubleClick={onRowDoubleClick ? (event) => handleRowDoubleClick(event, row) : undefined}
                    onKeyDown={isInteractive ? (event) => handleRowKeyDown(event, row) : undefined}
                    tabIndex={isInteractive ? 0 : undefined}
                  >
                    {visibleColumns.map((column) => {
                      const cellContent = column.render
                        ? column.render(row)
                        : String(column.accessor?.(row) ?? '');
                      const stickyActionClass = stickyActionColumn && column.isActionColumn
                        ? 'sticky right-0 z-10 border-l border-metro-border/70 bg-metro-surface/95'
                        : '';

                      return (
                        <td
                          className={`truncate ${currentDensity.cell} ${column.isActionColumn ? 'text-right' : ''} ${
                            column.tone ? columnToneClasses[column.tone].cell : ''
                          } ${column.className ?? ''} ${stickyActionClass}`}
                          key={column.id}
                        >
                          {typeof cellContent === 'string'
                            ? <OverflowTooltipText text={cellContent} />
                            : cellContent}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {hasHiddenRows && <div aria-hidden="true" ref={sentinelRef} style={{ height: 1 }} />}
      </div>
      {hasHiddenRows && (
        <div className="flex items-center justify-between rounded-xl border border-metro-border/70 bg-metro-panel/55 px-3 py-2 text-xs text-metro-muted">
          <span>
            Mostrando {visibleRows.length} de {sortedRows.length} registros.
          </span>
          <button
            className="rounded-md border border-metro-border/80 px-3 py-1 font-semibold transition-colors hover:border-metro-red hover:text-metro-text"
            type="button"
            onClick={() => setRenderLimit((currentLimit) => currentLimit + RENDER_BATCH_INCREMENT)}
          >
            Mostrar más
          </button>
        </div>
      )}
    </div>
  );
}

import {
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Inbox, RotateCcw } from 'lucide-react';
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
  /** false para columnas que el usuario no debe poder mover (p. ej. acciones). Por defecto true, salvo isActionColumn. */
  reorderable?: boolean;
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
  onResetColumnWidths?: () => void;
  /** Orden de columnas elegido por el usuario (solo ids reordenables). null = orden por defecto del array `columns`. */
  columnOrder?: ColumnId[] | null;
  onColumnOrderChange?: (columnOrder: ColumnId[]) => void;
  emptyMessage: string;
  onRowClick?: (row: Row) => void;
  onRowDoubleClick?: (row: Row) => void;
  rowClassName?: (row: Row) => string;
  ariaLabel: string;
  maxHeightClassName?: string;
  /** Mantiene la posición vertical cuando cambian filas por una edición. Útil en tablas de trabajo largas. */
  preserveScrollOnRowsChange?: boolean;
}

const DEFAULT_MIN_COLUMN_WIDTH = 80;
const DEFAULT_MAX_COLUMN_WIDTH = 640;
const RESIZE_HANDLE_WIDTH = 12;
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

/**
 * Aplica el orden guardado por el usuario, respetando qué columnas son
 * reordenables. Las columnas no reordenables (típicamente "Acciones")
 * mantienen siempre su posición original dentro de la secuencia: si la
 * columna de acciones estaba al final, sigue al final aunque el usuario
 * reordene el resto.
 */
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

  // El orden guardado solo es válido si cubre exactamente las columnas
  // reordenables actuales; si no coincide (cambió el módulo), se ignora y
  // se usa el orden por defecto en vez de arriesgar un resultado raro.
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
  ariaLabel,
  maxHeightClassName = 'max-h-[460px]',
  preserveScrollOnRowsChange = false,
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

  // Con arrays pequeños ordenamos todo y luego recortamos.
  // Con arrays grandes (>DEFAULT_RENDER_BATCH_SIZE), recortamos primero y ordenamos
  // solo las filas visibles para no bloquear el render thread en módulos con muchos registros.
  const sortedRows = useMemo(() => {
    if (rows.length <= DEFAULT_RENDER_BATCH_SIZE) {
      return sortDataTableRows(rows, visibleColumns, sort);
    }

    const sliced = rows.slice(0, renderLimit + RENDER_BATCH_INCREMENT);
    return sortDataTableRows(sliced, visibleColumns, sort);
  }, [rows, sort, visibleColumns, renderLimit]);

  // Resetear renderLimit y volver al inicio cuando cambia la ordenación.
  useEffect(() => {
    setRenderLimit(DEFAULT_RENDER_BATCH_SIZE);
    scrollContainerRef.current?.scrollTo(0, 0);
  }, [sort]);

  // En tablas de edición frecuente puede interesar conservar la posición al volver del editor.
  useEffect(() => {
    if (preserveScrollOnRowsChange) {
      return;
    }

    setRenderLimit(DEFAULT_RENDER_BATCH_SIZE);
    scrollContainerRef.current?.scrollTo(0, 0);
  }, [preserveScrollOnRowsChange, rows]);

  // Cargar más filas automáticamente al hacer scroll hasta el final (IntersectionObserver)
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

  return (
    <div className="space-y-2">
      <div
        className={`relative ${maxHeightClassName} overflow-auto rounded-xl border border-metro-border`}
        ref={scrollContainerRef}
      >
        {onResetColumnWidths && (
          <button
            aria-label="Restablecer columnas"
            className="absolute right-1 top-1 z-20 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-metro-border bg-metro-panel/95 text-metro-muted shadow-sm transition-colors hover:border-metro-red hover:text-metro-text"
            data-tip="Restablecer columnas"
            onClick={onResetColumnWidths}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={14} />
          </button>
        )}
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

                // El <th> entero es "draggable" cuando la columna es reordenable, incluido
                // el botón de ordenar que pueda contener. Un click simple sigue disparando
                // onSortChange con normalidad: los navegadores solo inician un drag HTML5
                // tras un movimiento real del puntero, no con un click sin desplazamiento.
                const isReorderable = isColumnReorderable(column) && Boolean(onColumnOrderChange);
                const isDragging = draggedColumnId === column.id;
                const isDragOver = dragOverColumnId === column.id && draggedColumnId !== column.id;

                return (
                  <th
                    aria-sort={canSort ? ariaSort : undefined}
                    className={`relative px-3 py-2 ${onResetColumnWidths && column === visibleColumns[visibleColumns.length - 1] ? 'pr-10' : ''} ${column.headerClassName ?? ''} ${
                      isDragging ? 'opacity-40' : ''
                    } ${isDragOver ? 'bg-metro-red/10' : ''}`}
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
                  className="px-3 py-10 text-center text-sm font-semibold text-metro-muted"
                  colSpan={visibleColumns.length}
                >
                  <div className="flex flex-col items-center gap-2">
                    <Inbox aria-hidden="true" className="text-metro-muted/60" size={28} />
                    <span>{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              visibleRows.map((row, rowIndex) => (
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
        {hasHiddenRows && <div aria-hidden="true" ref={sentinelRef} style={{ height: 1 }} />}
      </div>
      {hasHiddenRows && (
        <div className="flex items-center justify-between rounded-xl border border-metro-border bg-metro-panel/45 px-3 py-2 text-xs text-metro-muted">
          <span>
            Mostrando {visibleRows.length} de {sortedRows.length} registros.
          </span>
          <button
            className="rounded-lg border border-metro-border px-3 py-1 font-semibold transition-colors hover:border-metro-red hover:text-metro-text"
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

import { useCallback, useEffect, useRef, useState } from 'react';
import { readStorageItem, writeStorageItem } from '../../services/persistence';

export type TableSortDirection = 'asc' | 'desc';

export interface TableSortState<ColumnId extends string = string> {
  columnId: ColumnId;
  direction: TableSortDirection;
}

export interface TableViewPreferences<ColumnId extends string = string> {
  sort: TableSortState<ColumnId> | null;
  columnWidths: Partial<Record<ColumnId, number>>;
  /**
   * Orden de columnas elegido por el usuario, solo para las columnas que
   * pueden reordenarse (las marcadas `reorderable: false`, como acciones,
   * siempre se renderizan en su posición original). Si es null, se usa el
   * orden por defecto definido en el array de columnas del módulo.
   */
  columnOrder: ColumnId[] | null;
}

interface StoredTableViewPreferences {
  version: 2;
  sort: TableSortState | null;
  columnWidths: Record<string, number>;
  columnOrder: string[] | null;
}

interface UseTableViewPreferencesOptions<ColumnId extends string> {
  storageKey: string;
  defaultPreferences: TableViewPreferences<ColumnId>;
  validColumnIds: readonly ColumnId[];
}

const TABLE_VIEW_PREFERENCES_VERSION = 2;
const MIN_STORED_COLUMN_WIDTH = 40;
const MAX_STORED_COLUMN_WIDTH = 1200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isTableSortDirection(value: unknown): value is TableSortDirection {
  return value === 'asc' || value === 'desc';
}

function readStoredPreferences(storageKey: string): StoredTableViewPreferences | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const storedValue = readStorageItem(storageKey);
  if (!storedValue) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(storedValue);
    if (!isRecord(parsed)) {
      return null;
    }

    // v1 (sin columnOrder) y v2 (actual) comparten sort/columnWidths; v1 se
    // migra interpretando columnOrder como null (usa el orden por defecto).
    if (parsed.version !== 1 && parsed.version !== TABLE_VIEW_PREFERENCES_VERSION) {
      return null;
    }

    const sort = parsed.sort;
    const parsedSort =
      isRecord(sort) && typeof sort.columnId === 'string' && isTableSortDirection(sort.direction)
        ? { columnId: sort.columnId, direction: sort.direction }
        : null;

    const parsedWidths: Record<string, number> = {};
    if (isRecord(parsed.columnWidths)) {
      for (const [columnId, width] of Object.entries(parsed.columnWidths)) {
        if (
          typeof width === 'number' &&
          Number.isFinite(width) &&
          width >= MIN_STORED_COLUMN_WIDTH &&
          width <= MAX_STORED_COLUMN_WIDTH
        ) {
          parsedWidths[columnId] = width;
        }
      }
    }

    const parsedOrder =
      Array.isArray(parsed.columnOrder) && parsed.columnOrder.every((id) => typeof id === 'string')
        ? (parsed.columnOrder as string[])
        : null;

    return {
      version: TABLE_VIEW_PREFERENCES_VERSION,
      sort: parsedSort,
      columnWidths: parsedWidths,
      columnOrder: parsedOrder,
    };
  } catch {
    return null;
  }
}

function normalizePreferences<ColumnId extends string>(
  preferences: StoredTableViewPreferences | null,
  defaultPreferences: TableViewPreferences<ColumnId>,
  validColumnIds: readonly ColumnId[],
): TableViewPreferences<ColumnId> {
  if (!preferences) {
    return defaultPreferences;
  }

  const validColumnIdSet = new Set<string>(validColumnIds);
  const sort =
    preferences.sort && validColumnIdSet.has(preferences.sort.columnId)
      ? ({
          columnId: preferences.sort.columnId as ColumnId,
          direction: preferences.sort.direction,
        } satisfies TableSortState<ColumnId>)
      : defaultPreferences.sort;

  const columnWidths: Partial<Record<ColumnId, number>> = { ...defaultPreferences.columnWidths };
  for (const [columnId, width] of Object.entries(preferences.columnWidths)) {
    if (validColumnIdSet.has(columnId)) {
      columnWidths[columnId as ColumnId] = width;
    }
  }

  // El orden guardado solo es válido si contiene exactamente el mismo
  // conjunto de columnas que existen hoy. Si el módulo cambió columnas
  // (se añadió, se quitó, se renombró un id), el orden guardado queda
  // obsoleto y se descarta entero en lugar de dejar un array a medias:
  // un orden parcial podría ocultar columnas nuevas sin que el usuario
  // se dé cuenta.
  const storedOrder = preferences.columnOrder;
  const columnOrder =
    storedOrder &&
    storedOrder.length === validColumnIds.length &&
    storedOrder.every((id) => validColumnIdSet.has(id)) &&
    new Set(storedOrder).size === storedOrder.length
      ? (storedOrder as ColumnId[])
      : defaultPreferences.columnOrder;

  return { sort, columnWidths, columnOrder };
}

function writeStoredPreferences<ColumnId extends string>(
  storageKey: string,
  preferences: TableViewPreferences<ColumnId>,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const storedPreferences: StoredTableViewPreferences = {
    version: TABLE_VIEW_PREFERENCES_VERSION,
    sort: preferences.sort,
    columnWidths: Object.fromEntries(
      Object.entries(preferences.columnWidths).filter((entry): entry is [string, number] => {
        const width = entry[1];
        return typeof width === 'number' && Number.isFinite(width);
      }),
    ),
    columnOrder: preferences.columnOrder,
  };

  writeStorageItem(storageKey, JSON.stringify(storedPreferences));
}

export function useTableViewPreferences<ColumnId extends string>({
  storageKey,
  defaultPreferences,
  validColumnIds,
}: UseTableViewPreferencesOptions<ColumnId>) {
  const skipNextWriteRef = useRef(false);
  const [preferences, setPreferences] = useState<TableViewPreferences<ColumnId>>(() =>
    normalizePreferences(readStoredPreferences(storageKey), defaultPreferences, validColumnIds),
  );

  useEffect(() => {
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }

    writeStoredPreferences(storageKey, preferences);
  }, [preferences, storageKey]);

  const setSort = useCallback((sort: TableSortState<ColumnId> | null) => {
    setPreferences((current) => ({ ...current, sort }));
  }, []);

  const setColumnWidth = useCallback((columnId: ColumnId, width: number) => {
    setPreferences((current) => ({
      ...current,
      columnWidths: {
        ...current.columnWidths,
        [columnId]: width,
      },
    }));
  }, []);

  const setColumnOrder = useCallback((columnOrder: ColumnId[]) => {
    setPreferences((current) => ({ ...current, columnOrder }));
  }, []);

  const resetColumnWidths = useCallback(() => {
    setPreferences((current) => ({
      ...current,
      columnWidths: defaultPreferences.columnWidths,
    }));
  }, [defaultPreferences.columnWidths]);

  const resetPreferences = useCallback(() => {
    writeStoredPreferences(storageKey, defaultPreferences);
    skipNextWriteRef.current = true;
    setPreferences(defaultPreferences);
  }, [defaultPreferences, storageKey]);

  return {
    preferences,
    setSort,
    setColumnWidth,
    setColumnOrder,
    resetColumnWidths,
    resetPreferences,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';

export type TableSortDirection = 'asc' | 'desc';

export interface TableSortState<ColumnId extends string = string> {
  columnId: ColumnId;
  direction: TableSortDirection;
}

export interface TableViewPreferences<ColumnId extends string = string> {
  sort: TableSortState<ColumnId> | null;
  columnWidths: Partial<Record<ColumnId, number>>;
}

interface StoredTableViewPreferences {
  version: 1;
  sort: TableSortState | null;
  columnWidths: Record<string, number>;
}

interface UseTableViewPreferencesOptions<ColumnId extends string> {
  storageKey: string;
  defaultPreferences: TableViewPreferences<ColumnId>;
  validColumnIds: readonly ColumnId[];
}

const TABLE_VIEW_PREFERENCES_VERSION = 1;
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

  const storedValue = window.localStorage.getItem(storageKey);
  if (!storedValue) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(storedValue);
    if (!isRecord(parsed) || parsed.version !== TABLE_VIEW_PREFERENCES_VERSION) {
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

    return {
      version: TABLE_VIEW_PREFERENCES_VERSION,
      sort: parsedSort,
      columnWidths: parsedWidths,
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

  return { sort, columnWidths };
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
  };

  window.localStorage.setItem(storageKey, JSON.stringify(storedPreferences));
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

  const resetPreferences = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(storageKey);
    }
    skipNextWriteRef.current = true;
    setPreferences(defaultPreferences);
  }, [defaultPreferences, storageKey]);

  return {
    preferences,
    setSort,
    setColumnWidth,
    resetPreferences,
  };
}

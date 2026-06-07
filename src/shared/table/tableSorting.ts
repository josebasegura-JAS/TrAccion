import type { DataTableColumn, DataTableSortValue } from './DataTable';
import type { TableSortState } from './useTableViewPreferences';

function compareDataTableValues(
  firstValue: DataTableSortValue,
  secondValue: DataTableSortValue,
): number {
  const firstEmpty = firstValue === null || firstValue === undefined || firstValue === '';
  const secondEmpty = secondValue === null || secondValue === undefined || secondValue === '';

  if (firstEmpty && secondEmpty) {
    return 0;
  }

  if (firstEmpty) {
    return 1;
  }

  if (secondEmpty) {
    return -1;
  }

  const normalizedFirst = firstValue instanceof Date ? firstValue.getTime() : firstValue;
  const normalizedSecond = secondValue instanceof Date ? secondValue.getTime() : secondValue;

  if (typeof normalizedFirst === 'number' && typeof normalizedSecond === 'number') {
    return normalizedFirst - normalizedSecond;
  }

  return String(normalizedFirst).localeCompare(String(normalizedSecond), 'es', {
    numeric: true,
    sensitivity: 'base',
  });
}

export function sortDataTableRows<Row, ColumnId extends string>(
  rows: Row[],
  columns: Array<DataTableColumn<Row, ColumnId>>,
  sort: TableSortState<ColumnId> | null,
): Row[] {
  if (!sort) {
    return rows;
  }

  const sortedColumn = columns.find((column) => column.id === sort.columnId);
  if (!sortedColumn?.sortable || !sortedColumn.accessor) {
    return rows;
  }

  return rows
    .map((row, index) => ({ row, index }))
    .sort((first, second) => {
      const comparison = compareDataTableValues(
        sortedColumn.accessor?.(first.row),
        sortedColumn.accessor?.(second.row),
      );
      const directedComparison = sort.direction === 'asc' ? comparison : -comparison;
      return directedComparison || first.index - second.index;
    })
    .map(({ row }) => row);
}

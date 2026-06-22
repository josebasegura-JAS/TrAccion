import type { ExportColumn } from './types';

/**
 * Reordena un array de columnas de exportación (Excel/impresión) para que
 * coincida con el orden de columnas que el usuario eligió en la tabla en
 * pantalla (DataTable + useTableViewPreferences).
 *
 * No asume correspondencia 1:1 entre `ExportColumn.key` y los ids de
 * columna de la tabla: algunos módulos exportan más columnas que las que
 * muestran en pantalla (ej. un campo solo visible en Excel), o agrupan en
 * pantalla columnas que en la exportación van separadas. Por eso solo se
 * reordenan las columnas de exportación cuyo `key` aparece en `columnOrder`;
 * las demás conservan su posición relativa original, insertadas justo
 * después de la última columna reordenada que las precedía originalmente.
 *
 * Si `columnOrder` es null/vacío (el usuario no ha personalizado el orden,
 * o el módulo aún no tiene tabla con reordenamiento), devuelve `columns`
 * sin tocar — coste cero en el caso por defecto.
 */
export function reorderExportColumns<T>(
  columns: ExportColumn<T>[],
  columnOrder: readonly string[] | null | undefined,
): ExportColumn<T>[] {
  if (!columnOrder || columnOrder.length === 0) {
    return columns;
  }

  const columnsByKey = new Map(columns.map((column) => [column.key, column]));
  const knownOrderedKeys = columnOrder.filter((id) => columnsByKey.has(id));
  if (knownOrderedKeys.length === 0) {
    return columns;
  }

  const orderedKnown = knownOrderedKeys.map((key) => columnsByKey.get(key)!);
  const knownKeySet = new Set(knownOrderedKeys);

  // Recorremos las columnas originales en su orden de partida; cada vez que
  // encontramos una columna "conocida" (con mapeo en columnOrder), la
  // sustituimos por el siguiente bloque ya reordenado de columnas conocidas
  // (una sola vez). Las columnas sin mapeo se dejan exactamente donde
  // estaban respecto a sus vecinas.
  const result: ExportColumn<T>[] = [];
  let knownBlockInserted = false;
  for (const column of columns) {
    if (knownKeySet.has(column.key)) {
      if (!knownBlockInserted) {
        result.push(...orderedKnown);
        knownBlockInserted = true;
      }
      continue;
    }
    result.push(column);
  }

  return result;
}

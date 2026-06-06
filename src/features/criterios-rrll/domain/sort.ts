import type { CriterioRrll } from './criterioRrll';

export type CriterioRrllSortKey = 'tema' | 'estado' | 'fecha' | 'responsable';
export type SortDirection = 'asc' | 'desc';

function compareDateWithEmptyLast(firstDate: string, secondDate: string): number {
  const firstHasDate = firstDate.trim().length > 0;
  const secondHasDate = secondDate.trim().length > 0;

  if (!firstHasDate && !secondHasDate) {
    return 0;
  }

  if (!firstHasDate) {
    return 1;
  }

  if (!secondHasDate) {
    return -1;
  }

  return firstDate.localeCompare(secondDate, 'es', { numeric: true, sensitivity: 'base' });
}

function stableSort(
  criterios: CriterioRrll[],
  compare: (first: CriterioRrll, second: CriterioRrll) => number,
): CriterioRrll[] {
  return criterios
    .map((criterio, index) => ({ criterio, index }))
    .sort((first, second) => compare(first.criterio, second.criterio) || first.index - second.index)
    .map(({ criterio }) => criterio);
}

export function compareCriterioRrllValues(
  first: CriterioRrll,
  second: CriterioRrll,
  key: CriterioRrllSortKey,
): number {
  if (key === 'fecha') {
    return compareDateWithEmptyLast(first.fecha, second.fecha);
  }

  return first[key].localeCompare(second[key], 'es', { numeric: true, sensitivity: 'base' });
}

export function sortCriteriosRrllByDefault(criterios: CriterioRrll[]): CriterioRrll[] {
  return stableSort(criterios, (first, second) => {
    const firstHasDate = first.fecha.trim().length > 0;
    const secondHasDate = second.fecha.trim().length > 0;

    if (firstHasDate && secondHasDate) {
      return second.fecha.localeCompare(first.fecha, 'es', { numeric: true, sensitivity: 'base' }) ||
        first.tema.localeCompare(second.tema, 'es', { numeric: true, sensitivity: 'base' });
    }

    if (firstHasDate !== secondHasDate) {
      return firstHasDate ? -1 : 1;
    }

    return first.tema.localeCompare(second.tema, 'es', { numeric: true, sensitivity: 'base' });
  });
}

export function sortCriteriosRrllByColumn(
  criterios: CriterioRrll[],
  key: CriterioRrllSortKey,
  direction: SortDirection,
): CriterioRrll[] {
  return stableSort(criterios, (first, second) => {
    const comparison = compareCriterioRrllValues(first, second, key);
    return direction === 'asc' ? comparison : -comparison;
  });
}

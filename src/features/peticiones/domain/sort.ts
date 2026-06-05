import { PETICION_PRIORITIES, type Peticion } from './peticion';

export type PeticionSortKey =
  | 'titulo'
  | 'estado'
  | 'prioridad'
  | 'fechaLimite'
  | 'solicitante'
  | 'sindicato';
export type SortDirection = 'asc' | 'desc';

const PRIORITY_ORDER = new Map(PETICION_PRIORITIES.map((priority, index) => [priority, index]));

function comparePriority(first: Peticion, second: Peticion): number {
  return (
    (PRIORITY_ORDER.get(first.prioridad) ?? PETICION_PRIORITIES.length) -
    (PRIORITY_ORDER.get(second.prioridad) ?? PETICION_PRIORITIES.length)
  );
}

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

export function comparePeticionValues(
  first: Peticion,
  second: Peticion,
  key: PeticionSortKey,
): number {
  if (key === 'prioridad') {
    return comparePriority(first, second);
  }

  if (key === 'fechaLimite') {
    return compareDateWithEmptyLast(first.fechaLimite, second.fechaLimite);
  }

  return first[key].localeCompare(second[key], 'es', { numeric: true, sensitivity: 'base' });
}

function stableSort(
  peticiones: Peticion[],
  compare: (first: Peticion, second: Peticion) => number,
): Peticion[] {
  return peticiones
    .map((peticion, index) => ({ peticion, index }))
    .sort((first, second) => compare(first.peticion, second.peticion) || first.index - second.index)
    .map(({ peticion }) => peticion);
}

export function sortPeticionesByDefault(peticiones: Peticion[]): Peticion[] {
  return stableSort(peticiones, (first, second) => {
    return (
      comparePriority(first, second) ||
      compareDateWithEmptyLast(first.fechaLimite, second.fechaLimite)
    );
  });
}

export function sortPeticionesByColumn(
  peticiones: Peticion[],
  key: PeticionSortKey,
  direction: SortDirection,
): Peticion[] {
  return stableSort(peticiones, (first, second) => {
    const comparison = comparePeticionValues(first, second, key);
    return direction === 'asc' ? comparison : -comparison;
  });
}

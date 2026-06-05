import { PETICION_PRIORITIES, type Peticion, type PeticionPriority } from './peticion';
import type { SortDirection } from './sort';

export type PeticionHistoricSortKey = 'titulo' | 'closedAt' | 'solicitante' | 'prioridad';

export interface PeticionHistoricSortState {
  key: PeticionHistoricSortKey;
  direction: SortDirection;
}

export interface PeticionHistoricYearGroup {
  year: string;
  peticiones: Peticion[];
}

const PRIORITY_ORDER = new Map<PeticionPriority, number>(
  PETICION_PRIORITIES.map((priority, index) => [priority, index]),
);

function getClosedYear(peticion: Peticion): string {
  const closedDate = peticion.closedAt ? new Date(peticion.closedAt) : null;
  return closedDate && !Number.isNaN(closedDate.getTime())
    ? String(closedDate.getFullYear())
    : 'Sin fecha';
}

function compareHistoricPeticiones(
  first: Peticion,
  second: Peticion,
  key: PeticionHistoricSortKey,
): number {
  if (key === 'closedAt') {
    return (first.closedAt ?? '').localeCompare(second.closedAt ?? '', 'es', {
      numeric: true,
      sensitivity: 'base',
    });
  }

  if (key === 'prioridad') {
    return (
      (PRIORITY_ORDER.get(first.prioridad) ?? PETICION_PRIORITIES.length) -
      (PRIORITY_ORDER.get(second.prioridad) ?? PETICION_PRIORITIES.length)
    );
  }

  return first[key].localeCompare(second[key], 'es', { numeric: true, sensitivity: 'base' });
}

export function sortHistoricPeticiones(
  peticiones: Peticion[],
  sortState: PeticionHistoricSortState,
): Peticion[] {
  return peticiones
    .map((peticion, index) => ({ peticion, index }))
    .sort((first, second) => {
      const comparison = compareHistoricPeticiones(first.peticion, second.peticion, sortState.key);
      const orderedComparison = sortState.direction === 'asc' ? comparison : -comparison;
      return orderedComparison || first.index - second.index;
    })
    .map(({ peticion }) => peticion);
}

export function groupHistoricPeticiones(
  peticiones: Peticion[],
  sortState: PeticionHistoricSortState,
): PeticionHistoricYearGroup[] {
  const groups = new Map<string, Peticion[]>();

  peticiones
    .filter((peticion) => !peticion.deletedAt && peticion.estado === 'cerrada')
    .forEach((peticion) => {
      const year = getClosedYear(peticion);
      groups.set(year, [...(groups.get(year) ?? []), peticion]);
    });

  return Array.from(groups.entries())
    .sort(([firstYear], [secondYear]) =>
      secondYear.localeCompare(firstYear, 'es', { numeric: true }),
    )
    .map(([year, groupPeticiones]) => ({
      year,
      peticiones: sortHistoricPeticiones(groupPeticiones, sortState),
    }));
}

import type { CriterioRrll, CriterioRrllEstado } from './criterioRrll';

export interface CriterioRrllFilters {
  search: string;
  estado: '' | CriterioRrllEstado;
}

export const EMPTY_CRITERIO_RRLL_FILTERS: CriterioRrllFilters = {
  search: '',
  estado: '',
};

export function filterCriteriosRrll(
  criterios: CriterioRrll[],
  filters: CriterioRrllFilters,
): CriterioRrll[] {
  const normalizedSearch = filters.search.trim().toLowerCase();

  return criterios.filter((criterio) => {
    const matchesSearch = normalizedSearch
      ? [criterio.tema, criterio.criterio, criterio.observaciones]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch)
      : true;

    return !criterio.deletedAt && matchesSearch && (!filters.estado || criterio.estado === filters.estado);
  });
}

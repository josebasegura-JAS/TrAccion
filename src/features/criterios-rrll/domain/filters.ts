import type { CriterioRrll, CriterioRrllEstado, CriterioRrllSentido } from './criterioRrll';

export interface CriterioRrllFilters {
  search: string;
  estado: '' | CriterioRrllEstado;
  sentido: '' | CriterioRrllSentido;
}

export const EMPTY_CRITERIO_RRLL_FILTERS: CriterioRrllFilters = {
  search: '',
  estado: '',
  sentido: '',
};

export function filterCriteriosRrll(
  criterios: CriterioRrll[],
  filters: CriterioRrllFilters,
): CriterioRrll[] {
  const normalizedSearch = filters.search.trim().toLowerCase();

  return criterios.filter((criterio) => {
    const matchesSearch = normalizedSearch
      ? [criterio.tema, criterio.criterio, criterio.sentido, criterio.observaciones]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch)
      : true;

    return (
      !criterio.deletedAt &&
      matchesSearch &&
      (!filters.estado || criterio.estado === filters.estado) &&
      (!filters.sentido || criterio.sentido === filters.sentido)
    );
  });
}

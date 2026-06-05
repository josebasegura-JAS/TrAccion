import type { Peticion, PeticionPriority, PeticionState } from './peticion';

export interface PeticionFilters {
  search: string;
  estado: '' | PeticionState;
  prioridad: '' | PeticionPriority;
}

export const EMPTY_PETICION_FILTERS: PeticionFilters = {
  search: '',
  estado: '',
  prioridad: '',
};

export function filterPeticiones(peticiones: Peticion[], filters: PeticionFilters): Peticion[] {
  const normalizedSearch = filters.search.trim().toLowerCase();

  return peticiones.filter((peticion) => {
    const matchesSearch = normalizedSearch
      ? [peticion.titulo, peticion.descripcion].join(' ').toLowerCase().includes(normalizedSearch)
      : true;

    return (
      !peticion.deletedAt &&
      peticion.estado !== 'cerrada' &&
      matchesSearch &&
      (!filters.estado || peticion.estado === filters.estado) &&
      (!filters.prioridad || peticion.prioridad === filters.prioridad)
    );
  });
}

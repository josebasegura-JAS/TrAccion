import type {
  TeletrabajoEstado,
  TeletrabajoSolicitud,
  TeletrabajoTipoSolicitud,
} from './solicitud';

export interface TeletrabajoFilters {
  search: string;
  estado: '' | TeletrabajoEstado;
  tipoSolicitud: '' | TeletrabajoTipoSolicitud;
  periodo: string;
}

export const EMPTY_TELETRABAJO_FILTERS: TeletrabajoFilters = {
  search: '',
  estado: '',
  tipoSolicitud: '',
  periodo: '',
};

export function filterTeletrabajoSolicitudes(
  solicitudes: TeletrabajoSolicitud[],
  filters: TeletrabajoFilters,
): TeletrabajoSolicitud[] {
  const normalizedSearch = filters.search.trim().toLowerCase();

  return solicitudes.filter((solicitud) => {
    const matchesSearch = normalizedSearch
      ? [solicitud.empleado, solicitud.nombreApellidos]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch)
      : true;

    return (
      !solicitud.deletedAt &&
      matchesSearch &&
      (!filters.estado || solicitud.estado === filters.estado) &&
      (!filters.tipoSolicitud || solicitud.tipoSolicitud === filters.tipoSolicitud) &&
      (!filters.periodo || solicitud.periodo === filters.periodo)
    );
  });
}

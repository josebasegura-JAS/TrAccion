import type { TeletrabajoSolicitud } from './solicitud';

export type TeletrabajoSortKey =
  | 'empleado'
  | 'nombreApellidos'
  | 'puestoNomina'
  | 'residencia'
  | 'tipoSolicitud'
  | 'diasTeletrabajo'
  | 'estado'
  | 'periodo';
export type SortDirection = 'asc' | 'desc';

function compareEmpleado(first: string, second: string): number {
  const firstNumber = Number(first.trim());
  const secondNumber = Number(second.trim());

  if (Number.isFinite(firstNumber) && Number.isFinite(secondNumber)) {
    return firstNumber - secondNumber;
  }

  return first.localeCompare(second, 'es', { numeric: true, sensitivity: 'base' });
}

export function compareTeletrabajoValues(
  first: TeletrabajoSolicitud,
  second: TeletrabajoSolicitud,
  key: TeletrabajoSortKey,
): number {
  if (key === 'empleado') {
    return compareEmpleado(first.empleado, second.empleado);
  }

  if (key === 'diasTeletrabajo') {
    return first.diasTeletrabajo.join(', ').localeCompare(second.diasTeletrabajo.join(', '), 'es', {
      numeric: true,
      sensitivity: 'base',
    });
  }

  return first[key].localeCompare(second[key], 'es', { numeric: true, sensitivity: 'base' });
}

function stableSort(
  solicitudes: TeletrabajoSolicitud[],
  compare: (first: TeletrabajoSolicitud, second: TeletrabajoSolicitud) => number,
): TeletrabajoSolicitud[] {
  return solicitudes
    .map((solicitud, index) => ({ solicitud, index }))
    .sort(
      (first, second) => compare(first.solicitud, second.solicitud) || first.index - second.index,
    )
    .map(({ solicitud }) => solicitud);
}

export function sortTeletrabajoByDefault(
  solicitudes: TeletrabajoSolicitud[],
): TeletrabajoSolicitud[] {
  return stableSort(solicitudes, (first, second) => {
    const periodoDesc = second.periodo.localeCompare(first.periodo, 'es', {
      numeric: true,
      sensitivity: 'base',
    });

    return periodoDesc || compareEmpleado(first.empleado, second.empleado);
  });
}

export function sortTeletrabajoByColumn(
  solicitudes: TeletrabajoSolicitud[],
  key: TeletrabajoSortKey,
  direction: SortDirection,
): TeletrabajoSolicitud[] {
  return stableSort(solicitudes, (first, second) => {
    const comparison = compareTeletrabajoValues(first, second, key);
    return direction === 'asc' ? comparison : -comparison;
  });
}

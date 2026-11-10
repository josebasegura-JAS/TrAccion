import { filterSolicitudesByTeletrabajoModalidad } from './cierreOrdinario';
import type { TeletrabajoSolicitud } from './solicitud';

export type TeletrabajoDireccionExportScope = 'vista' | 'ordinaria' | 'extraordinaria' | 'todas';

export function selectTeletrabajoDireccionExportRows(
  periodRows: readonly TeletrabajoSolicitud[],
  visibleRows: readonly TeletrabajoSolicitud[],
  scope: TeletrabajoDireccionExportScope,
): TeletrabajoSolicitud[] {
  switch (scope) {
    case 'vista':
      return [...visibleRows];
    case 'ordinaria':
      return filterSolicitudesByTeletrabajoModalidad(periodRows, 'ordinaria');
    case 'extraordinaria':
      return filterSolicitudesByTeletrabajoModalidad(periodRows, 'extraordinaria');
    case 'todas':
      return [...periodRows];
  }
}

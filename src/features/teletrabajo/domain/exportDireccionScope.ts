import { filterSolicitudesByTeletrabajoModalidad } from './cierreOrdinario';
import { getTeletrabajoModalidad } from './modalidadTramitacion';
import type { TeletrabajoSolicitud } from './solicitud';

export type TeletrabajoDireccionExportScope = 'vista' | 'ordinaria' | 'extraordinaria' | 'todas';

/** La pestaña Extraordinarias propone el informe conjunto de Dirección;
 * el usuario puede cambiar después el alcance manualmente. */
export function getDefaultTeletrabajoDireccionExportScope(
  modalidadTab: 'ordinaria' | 'extraordinaria' | 'sin_clasificar',
): TeletrabajoDireccionExportScope {
  return modalidadTab === 'extraordinaria' ? 'extraordinaria' : 'vista';
}


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

/**
 * Informe acumulado de Dirección en el trámite extraordinario.
 * Las solicitudes nuevas (pendientes o analizadas) aparecen primero; las
 * aprobadas del mismo periodo después, sean ordinarias o extraordinarias.
 * Nunca se cuentan dos veces, ni se incluyen denegadas/desistidas.
 * Se construye desde el conjunto sin filtrar por la vista de pantalla.
 */
export function buildTeletrabajoExtraordinariaDireccionReport(
  periodRows: readonly TeletrabajoSolicitud[],
): { rows: TeletrabajoSolicitud[]; nuevasCount: number; aprobadasCount: number } {
  const valid = periodRows.filter((s) => !s.deletedAt);
  const nuevas = valid.filter((s) =>
    getTeletrabajoModalidad(s) === 'extraordinaria'
    && (s.estado === 'pendiente' || s.estado === 'analizada'));
  const aprobadas = valid.filter((s) => s.estado === 'aprobada');
  return {
    rows: [...nuevas, ...aprobadas],
    nuevasCount: nuevas.length,
    aprobadasCount: aprobadas.length,
  };
}

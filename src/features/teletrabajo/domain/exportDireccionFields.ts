import { evaluateTeletrabajoAntiguedad } from './antiguedad';
import { getTeletrabajoModalidad } from './modalidadTramitacion';
import type { Employee } from '../../plantilla/domain/employee';
import type { TeletrabajoSolicitud } from './solicitud';

export function buildTeletrabajoDireccionAdministrativeFields(
  solicitud: TeletrabajoSolicitud,
  employee: Pick<Employee, 'antiguedadPuesto'> | null | undefined,
): {
  modalidad: string;
  fechaSolicitud: string;
  referenciaAntiguedad: string;
  estado: string;
  tipo: string;
} {
  const modalidad = getTeletrabajoModalidad(solicitud);
  return {
    modalidad: modalidad === 'sin_clasificar' ? 'Sin clasificar'
      : modalidad === 'ordinaria' ? 'Ordinaria' : 'Extraordinaria',
    fechaSolicitud: solicitud.fechaSolicitud || '',
    referenciaAntiguedad: evaluateTeletrabajoAntiguedad(solicitud, employee).fechaReferencia,
    estado: solicitud.estado,
    tipo: solicitud.tipoSolicitud,
  };
}

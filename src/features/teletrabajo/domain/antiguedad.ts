import type { Employee } from '../../plantilla/domain/employee';
import type { TeletrabajoSolicitud } from './solicitud';

export type TeletrabajoAntiguedadStatus = 'cumple' | 'no-cumple' | 'sin-dato';

export interface TeletrabajoAntiguedadEvaluation {
  status: TeletrabajoAntiguedadStatus;
  title: string;
  antiguedadPuesto: string;
  fechaReferencia: string;
}

function parseIsoDate(value: string): Date | null {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function addOneYear(date: Date): Date {
  const result = new Date(date.getTime());
  result.setUTCFullYear(result.getUTCFullYear() + 1);
  return result;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function evaluateTeletrabajoAntiguedad(
  solicitud: Pick<TeletrabajoSolicitud, 'empleado' | 'fechaSolicitud'>,
  employee: Pick<Employee, 'antiguedadPuesto'> | null | undefined,
): TeletrabajoAntiguedadEvaluation {
  if (!employee) {
    return {
      status: 'sin-dato',
      title: 'No se puede comprobar antigüedad: empleado no encontrado en Plantilla.',
      antiguedadPuesto: '',
      fechaReferencia: solicitud.fechaSolicitud,
    };
  }

  const antiguedadPuesto = employee.antiguedadPuesto.trim();
  const fechaAntiguedad = parseIsoDate(antiguedadPuesto);
  const fechaReferencia = parseIsoDate(solicitud.fechaSolicitud);

  if (!fechaAntiguedad) {
    return {
      status: 'sin-dato',
      title: 'No se puede comprobar antigüedad: fecha de antigüedad en el puesto no informada o no válida.',
      antiguedadPuesto,
      fechaReferencia: solicitud.fechaSolicitud,
    };
  }

  if (!fechaReferencia) {
    return {
      status: 'sin-dato',
      title: 'No se puede comprobar antigüedad: fecha de solicitud no informada o no válida.',
      antiguedadPuesto,
      fechaReferencia: solicitud.fechaSolicitud,
    };
  }

  const fechaCumplimiento = addOneYear(fechaAntiguedad);

  if (fechaReferencia < fechaCumplimiento) {
    return {
      status: 'no-cumple',
      title: `No cumple antigüedad mínima: puesto desde ${antiguedadPuesto}; cumple 1 año el ${formatIsoDate(fechaCumplimiento)}.`,
      antiguedadPuesto,
      fechaReferencia: solicitud.fechaSolicitud,
    };
  }

  return {
    status: 'cumple',
    title: `Cumple antigüedad mínima: puesto desde ${antiguedadPuesto}.`,
    antiguedadPuesto,
    fechaReferencia: solicitud.fechaSolicitud,
  };
}

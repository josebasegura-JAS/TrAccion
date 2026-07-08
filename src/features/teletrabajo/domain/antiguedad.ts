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

function resolvePeriodoStartDate(periodo: string | null | undefined): string {
  const match = /^(\d{4})\s*-\s*\d{4}$/.exec((periodo ?? '').trim());
  if (!match) {
    return '';
  }

  return `${match[1]}-09-01`;
}

export function evaluateTeletrabajoAntiguedad(
  solicitud: Pick<TeletrabajoSolicitud, 'empleado' | 'fechaSolicitud' | 'periodo'>,
  employee: Pick<Employee, 'antiguedadPuesto'> | null | undefined,
): TeletrabajoAntiguedadEvaluation {
  const fechaReferenciaValue = resolvePeriodoStartDate(solicitud.periodo);

  if (!employee) {
    return {
      status: 'sin-dato',
      title: 'Empleado no localizado en Plantilla. No se puede comprobar la antigüedad.',
      antiguedadPuesto: '',
      fechaReferencia: fechaReferenciaValue,
    };
  }

  const antiguedadPuesto = employee.antiguedadPuesto.trim();
  const fechaAntiguedad = parseIsoDate(antiguedadPuesto);
  const fechaReferencia = parseIsoDate(fechaReferenciaValue);

  if (!fechaAntiguedad) {
    return {
      status: 'sin-dato',
      title: 'Falta informar la antigüedad en el puesto en Plantilla.',
      antiguedadPuesto,
      fechaReferencia: fechaReferenciaValue,
    };
  }

  if (!fechaReferencia) {
    return {
      status: 'sin-dato',
      title: 'Falta informar un periodo válido para comprobar la antigüedad contra el 1 de septiembre.',
      antiguedadPuesto,
      fechaReferencia: fechaReferenciaValue,
    };
  }

  const fechaCumplimiento = addOneYear(fechaAntiguedad);

  if (fechaReferencia < fechaCumplimiento) {
    return {
      status: 'no-cumple',
      title: `Antigüedad insuficiente: la persona está en el puesto desde ${antiguedadPuesto} y cumple 1 año el ${formatIsoDate(fechaCumplimiento)}. Referencia: ${fechaReferenciaValue}.`,
      antiguedadPuesto,
      fechaReferencia: fechaReferenciaValue,
    };
  }

  return {
    status: 'cumple',
    title: `Antigüedad correcta: la persona está en el puesto desde ${antiguedadPuesto}. Referencia: ${fechaReferenciaValue}.`,
    antiguedadPuesto,
    fechaReferencia: fechaReferenciaValue,
  };
}

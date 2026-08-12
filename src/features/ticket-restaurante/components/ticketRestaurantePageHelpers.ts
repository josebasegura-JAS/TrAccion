import type {
  TicketCalendar,
  TicketCalendarDraft,
  TicketPerson,
  TicketPersonCalculation,
  TicketPersonDraft,
  TicketRestaurantAbsence,
} from '../domain/ticketRestaurante';
import type { TicketRestaurantAbsencePreviewRow, TicketRestaurantAbsenceSaveResult } from '../domain/importAbsences';
import type { TicketManutencion } from '../domain/importManutenciones';
import { MONTH_OPTIONS } from './ticketRestaurantePageConfig';

export function toPersonDraft(person: TicketPerson): TicketPersonDraft {
  return {
    empleado: person.empleado,
    nombre: person.nombre,
    apellido1: person.apellido1,
    apellido2: person.apellido2,
    dni: person.dni,
    nombreApellidos: person.nombreApellidos,
    puesto: person.puesto,
    calendarId: person.calendarId,
    activo: person.activo,
  };
}

export function toCalendarDraft(calendar: TicketCalendar): TicketCalendarDraft {
  return {
    nombre: calendar.nombre,
    activo: calendar.activo,
    diasSinTicket: calendar.diasSinTicket,
    ticketIsoWeekdays: calendar.ticketIsoWeekdays,
  };
}

export function sortByName(calendars: TicketCalendar[]): TicketCalendar[] {
  return [...calendars].sort((first, second) =>
    first.nombre.localeCompare(second.nombre, 'es', { numeric: true, sensitivity: 'base' }),
  );
}

export function sortMonthlyCalculationRows(
  rows: readonly TicketPersonCalculation[],
): TicketPersonCalculation[] {
  return [...rows].sort((first, second) => {
    const calendarComparison = first.calendario.localeCompare(second.calendario, 'es', {
      numeric: true,
      sensitivity: 'base',
    });
    if (calendarComparison !== 0) return calendarComparison;

    if (first.manualEntry && second.manualEntry) {
      if (first.manualIncludeContribution !== second.manualIncludeContribution) {
        return first.manualIncludeContribution ? -1 : 1;
      }
      return first.empleado.localeCompare(second.empleado, 'es', {
        numeric: true,
        sensitivity: 'base',
      });
    }

    return first.empleado.localeCompare(second.empleado, 'es', {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

export function sortContributionCalculationRows(
  rows: readonly TicketPersonCalculation[],
): TicketPersonCalculation[] {
  return [...rows].sort((first, second) => {
    const calendarComparison = first.calendario.localeCompare(second.calendario, 'es', {
      numeric: true,
      sensitivity: 'base',
    });
    if (calendarComparison !== 0) return calendarComparison;
    return first.empleado.localeCompare(second.empleado, 'es', {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

export function toAbsencePreviewRow(absence: TicketRestaurantAbsence): TicketRestaurantAbsencePreviewRow {
  return {
    id: `preview-edit-${absence.id}`,
    empleado: absence.empleado,
    nombreApellidos: absence.nombreApellidos,
    desde: absence.desde,
    hasta: absence.hasta,
    motivo: absence.motivo,
    totalDias: String(absence.totalDias),
    afectaTicket: absence.afectaTicket,
    errors: [],
  };
}

export function formatSaveSummary(result: TicketRestaurantAbsenceSaveResult): string {
  const { nuevas, sustituidas, duplicadas, invalidas } = result.summary;
  const parts = [
    `${nuevas} nuevas`,
    `${sustituidas} sustituidas`,
    `${duplicadas} duplicadas omitidas`,
  ];

  if (invalidas > 0) {
    parts.push(`${invalidas} inválidas`);
  }

  return `Ausencias guardadas: ${parts.join(', ')}.`;
}

export function formatManutencionDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

export function formatManutencionMonth(year: number, month: number): string {
  return `${MONTH_OPTIONS.find((option) => option.value === month)?.label ?? month} ${year}`;
}

export function toManutencionDetailAbsences(
  manutenciones: readonly TicketManutencion[],
): TicketRestaurantAbsence[] {
  return manutenciones
    .filter((row) => !row.deletedAt)
    .map((row) => ({
      id: row.id,
      empleado: row.empleado,
      nombreApellidos: row.nombreApellidos,
      desde: row.fechaGasto,
      hasta: row.fechaGasto,
      motivo: 'Nota de gasto',
      totalDias: 1,
      afectaTicket: row.afectaTicket,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    }));
}

export function normalizeTicketEmployeeSearch(value: string): string {
  return value
    .trim()
    .replace(/^0+(?=\d)/, '')
    .replace(/\.0$/, '');
}


import type { ExportColumn } from '../../../shared/export/types';
import { normalizeTicketEmployeeNumber, splitTicketPersonFullName, getEffectiveTicketPrice, type TicketCalendar, type TicketPerson, type TicketPersonCalculation, type TicketRestaurantAbsence, type TicketRestaurantConfig } from '../domain/ticketRestaurante';
import type { TicketAbsenceDisplayRow } from './TicketRestauranteAbsencesTable';

export const PEOPLE_EXPORT_HEADERS = [
  'Nº empleado',
  'Nombre',
  'Apellido1',
  'Apellido2',
  'DNI',
  'Puesto',
  'Calendario',
];
export const MANUTENCIONES_MODEL_HEADERS = [
  'Nº empleado',
  'Nombre y apellidos',
  'Fecha gasto',
  'Origen',
  'Afecta a ticket',
];

export const ABSENCE_MODEL_HEADERS = [
  'Nº empleado',
  'Nombre y apellidos',
  'Desde',
  'Hasta',
  'Motivo',
  'Total días',
];
export function exportCsv(
  filename: string,
  headers: readonly string[],
  rows: readonly (readonly (string | number)[])[],
): void {
  const csv = [headers, ...rows].map((row) => row.map(formatCsvValue).join(';')).join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatCsvValue(value: string | number): string {
  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const ticketPersonExportColumns = (
  calendars: readonly TicketCalendar[],
): ExportColumn<TicketPerson>[] => [
  { key: 'empleado', header: 'Nº empleado', value: (person) => person.empleado },
  { key: 'nombre', header: 'Nombre', value: (person) => person.nombre },
  { key: 'apellido1', header: 'Apellido1', value: (person) => person.apellido1 },
  { key: 'apellido2', header: 'Apellido2', value: (person) => person.apellido2 },
  { key: 'dni', header: 'DNI', value: (person) => person.dni },
  { key: 'puesto', header: 'Puesto', value: (person) => person.puesto },
  {
    key: 'calendario',
    header: 'Calendario',
    value: (person) =>
      calendars.find((calendar) => calendar.id === person.calendarId)?.nombre ?? null,
  },
  { key: 'activo', header: 'Estado', value: (person) => (person.activo ? 'Activo' : 'Inactivo') },
];

const formatTicketExcelDate = (year: number, month: number, day = 1): string =>
  `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;

const formatAppliedAbsencesForExport = (
  row: TicketPersonCalculation,
  absences: readonly TicketRestaurantAbsence[],
): string => {
  const absenceById = new Map(absences.map((absence) => [absence.id, absence]));
  return row.ausenciaIds
    .map((id) => absenceById.get(id))
    .filter((absence): absence is TicketRestaurantAbsence => Boolean(absence))
    .map(
      (absence) =>
        `${absence.motivo} ${formatIsoDateForExport(absence.desde)}-${formatIsoDateForExport(absence.hasta)} (${row.ausenciaDiasDescontados[absence.id] ?? 0} días ticket)`,
    )
    .join('; ');
};

const formatIsoDateForExport = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
};

const formatManualDebtForExport = (row: TicketPersonCalculation): string => {
  const applied = row.deudaAplicadaDetalle.filter((detail) =>
    detail.motivo.startsWith('Deuda manual:'),
  );
  const pending = row.deudaPendienteDetalle.filter((detail) =>
    detail.motivo.startsWith('Deuda manual:'),
  );

  const groups = new Map<
    string,
    { motivo: string; mesOrigen: string; applied: number; pending: number }
  >();

  const addDetails = (
    details: readonly typeof row.deudaAplicadaDetalle[number][],
    field: 'applied' | 'pending',
  ) => {
    details.forEach((detail) => {
      const key = `${detail.motivo}\u0000${detail.mesOrigen}`;
      const current = groups.get(key) ?? {
        motivo: detail.motivo.replace(/^Deuda manual:\s*/, '').trim(),
        mesOrigen: detail.mesOrigen,
        applied: 0,
        pending: 0,
      };
      current[field] += 1;
      groups.set(key, current);
    });
  };

  addDetails(applied, 'applied');
  addDetails(pending, 'pending');

  return Array.from(groups.values())
    .map((group) => {
      const origin = /^\d{4}-\d{2}$/.test(group.mesOrigen)
        ? `${group.mesOrigen.slice(5, 7)}/${group.mesOrigen.slice(0, 4)}`
        : group.mesOrigen;
      const counts = [
        group.applied > 0 ? `${group.applied} aplicado${group.applied === 1 ? '' : 's'}` : '',
        group.pending > 0 ? `${group.pending} pendiente${group.pending === 1 ? '' : 's'}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return `${group.motivo} · origen ${origin} · ${counts}`;
    })
    .join('; ');
};

export const monthlyCalculationExportColumns = (
  config: TicketRestaurantConfig,
  year: number,
  month: number,
  absences: readonly TicketRestaurantAbsence[],
): ExportColumn<TicketPersonCalculation>[] => {
  const regularizationByEmployee = new Map(
    (config.debtRegularizations ?? [])
      .filter((item) => item.year === year && item.month === month)
      .sort((first, second) => first.updatedAt.localeCompare(second.updatedAt))
      .map((item) => [normalizeTicketEmployeeNumber(item.empleado), item] as const),
  );

  return [
    {
      key: 'nombre',
      header: 'Nombre',
      value: (row) => splitTicketPersonFullName(row.nombreApellidos).nombre,
    },
    {
      key: 'apellido1',
      header: 'Apellido 1',
      value: (row) => splitTicketPersonFullName(row.nombreApellidos).apellido1,
    },
    {
      key: 'apellido2',
      header: 'Apellido 2',
      value: (row) => splitTicketPersonFullName(row.nombreApellidos).apellido2,
    },
    { key: 'dni', header: 'Número de documento*', value: (row) => row.dni },
    { key: 'pedido', header: 'Nº pedido', value: () => config.pedidoMensual },
    { key: 'empleado', header: 'CECO', value: (row) => row.empleado },
    { key: 'numeroTickets', header: 'Numero Tickets', value: (row) => row.ticketsFinales },
    {
      key: 'importe',
      header: 'Importe1',
      value: () => getEffectiveTicketPrice(config, year, month),
    },
    { key: 'total', header: 'Importe total*', value: (row) => row.importe },
    {
      key: 'fecInicio',
      header: 'Fecha inicio carga (dd/mm/yyyy)*',
      value: () => formatTicketExcelDate(year, month),
    },
    {
      key: 'fecCad',
      header: 'Fecha caducidad carga (dd/mm/yyyy)*',
      value: () => '01/01/2100',
    },
    { key: 'hojaGastos', header: 'Hoja Gastos', value: (row) => row.hojasGastoMes },
    {
      key: 'ausencias',
      header: 'Ausencias',
      value: (row) => formatAppliedAbsencesForExport(row, absences),
    },
    {
      key: 'deudaManual',
      header: 'Deuda manual',
      value: (row) => formatManualDebtForExport(row),
    },
    {
      key: 'regularizacionDeuda',
      header: 'Regularización deuda',
      value: (row) => {
        const regularization = regularizationByEmployee.get(normalizeTicketEmployeeNumber(row.empleado));
        if (!regularization) return '';
        const adjustment = regularization.targetTickets - regularization.calculatedTickets;
        const adjustmentLabel = adjustment > 0 ? `+${adjustment}` : String(adjustment);
        const observations = regularization.observations.trim()
          ? ` · ${regularization.observations.trim()}`
          : '';
        return `${regularization.calculatedTickets} → ${regularization.targetTickets} (${adjustmentLabel}) · ${regularization.reason}${observations}`;
      },
    },
  ];
};

export const contributionCalculationExportColumns = (
  importeTicket: number,
): ExportColumn<TicketPersonCalculation>[] => [
  { key: 'codigo', header: 'Codigo', value: (row) => row.empleado },
  { key: 'apellidos', header: 'Apellidos', value: (row) => row.nombreApellidos },
  { key: 'activo', header: 'Activo', value: () => '' },
  { key: 'ticketsInicioMes', header: 'Tickets inicio mes', value: () => '' },
  { key: 'valorFacial', header: 'Valor Facial 1', value: () => importeTicket },
  {
    key: 'ticketsCotizacion',
    header: 'Tickets BC y Retrib.',
    value: (row) => row.ticketsFinales,
  },
];

export const absenceExportColumns: ExportColumn<TicketAbsenceDisplayRow>[] = [
  { key: 'empleado', header: 'Nº empleado', value: (absence) => absence.empleado },
  {
    key: 'nombreApellidos',
    header: 'Nombre y apellidos',
    value: (absence) => absence.nombreApellidos,
  },
  { key: 'desde', header: 'Desde', value: (absence) => absence.desde },
  { key: 'hasta', header: 'Hasta', value: (absence) => absence.hasta },
  { key: 'motivo', header: 'Motivo', value: (absence) => absence.motivo },
  { key: 'calendario', header: 'Calendario', value: (absence) => absence.calendario },
  { key: 'totalDias', header: 'Días naturales', value: (absence) => absence.totalDias },
  { key: 'diasTicketMes', header: 'Días ticket mes', value: (absence) => absence.diasTicketMes },
  {
    key: 'afectaTicket',
    header: 'Afecta ticket',
    value: (absence) => (absence.afectaTicket ? 'Sí' : 'No'),
  },
];


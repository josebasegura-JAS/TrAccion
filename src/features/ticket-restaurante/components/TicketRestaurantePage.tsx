import { CalendarDays, Euro, Settings, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTicketRestauranteWriteActions } from '../store/useTicketRestauranteWriteActions';
import {
  buildTicketDebtRegularization,
  buildTicketManualDebt,
  buildYearCalendar,
  calculateMonthlyTicketOrder,
  calculateTicketAbsenceMonthImpact,
  calculateTicketAbsenceTicketImpact,
  calculateTicketContribution,
  EMPTY_TICKET_CALENDAR_DRAFT,
  EMPTY_TICKET_PERSON_DRAFT,
  filterTicketRestaurantAbsencesByMonth,
  getEffectiveTicketPrice,
  visibleTicketCalendars,
  type TicketCalendar,
  type TicketDebtRegularizationDraft,
  type TicketManualDebtDraft,
  type TicketCalendarDraft,
  type TicketPerson,
  type TicketPersonCalculation,
  type TicketPersonDraft,
  type TicketRestaurantAbsence,
  type TicketRestaurantConfig,
  normalizeTicketEmployeeNumber,
  splitTicketPersonFullName,
} from '../domain/ticketRestaurante';
import {
  importTicketRestaurantAbsencesFromFile,
  saveTicketRestaurantAbsencePreviewRows,
  validateTicketRestaurantAbsencePreviewRows,
  type TicketRestaurantAbsencePreviewRow,
  type TicketRestaurantAbsenceSaveResult,
} from '../domain/importAbsences';
import {
  importTicketManutencionesFromFile,
  validateTicketManutencionPreviewRows,
  type TicketManutencion,
  type TicketManutencionDraft,
  type TicketManutencionPreviewRow,
} from '../domain/importManutenciones';
import { importTicketPeopleFromFile } from '../domain/importPeople';
import { useTicketRestauranteStore } from '../store/useTicketRestauranteStore';
import { type ModuleHelpSection } from '../../../components/ModuleHelp';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ActionButton } from '../../../components/ui/ActionButton';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { CompactTable, CompactTableBody, CompactTableHead } from '../../../shared/table/CompactTable';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
import { buildFilterLabel } from '../../../shared/export/filterLabel';
import type { ExportColumn } from '../../../shared/export/types';
import {
  CalendarToolbar,
  EmptyCalendar,
  Legend,
  MonthCalendar,
  MonthNavigator,
  SubviewButton,
} from './TicketRestauranteCalendarPanels';
import { PeoplePanel } from './TicketRestaurantePeoplePanel';
import { TicketPriceModal, TicketRulesModal } from './TicketRestauranteConfigModals';
import { CalculationPanel } from './TicketRestauranteCalculationPanel';
import { TicketRestauranteWorkflow } from './TicketRestauranteWorkflow';
import { TicketRestauranteManualDebtPanel } from './TicketRestauranteManualDebtPanel';
import { TicketRestauranteManualPeoplePanel } from './TicketRestauranteManualPeoplePanel';
import {
  AbsencePreviewModal,
  AbsencesTable,
  type TicketAbsenceDisplayRow,
} from './TicketRestauranteAbsencesTable';

const TICKET_RESTAURANTE_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: '¿Qué hace este módulo?',
    body: 'Calcula cuántos Tickets Restaurante genera cada persona cada mes, a partir de su calendario, sus ausencias y sus notas de gasto (manutenciones), y permite cuadrar el pedido mensual con la cotización real.',
  },
  {
    title: 'Flujo recomendado',
    ordered: true,
    items: [
      'Configurar calendarios: qué días de la semana generan ticket y qué fechas concretas quedan excluidas (festivos, cierres...).',
      'Dar de alta a las personas con derecho a ticket y asignar a cada una su calendario. Las excepciones sin calendario se gestionan como Personas manuales desde el Cómputo mensual.',
      'Cada mes: importar o revisar ausencias y notas de gasto (manutenciones) del periodo.',
      'Revisar Deudas y regularizaciones: ahí se ve la deuda arrastrada y se puede fijar un saldo real justificado si el cálculo automático no coincide con la situación real.',
      'Revisar "Cómputo mensual" para hacer el pedido del mes.',
      'Revisar "Cómputo cotización" para comprobar lo que realmente corresponde facturar ese mes.',
      'Exportar o imprimir los resultados que necesite RRLL.',
    ],
  },
  {
    title: 'Calendarios: qué días generan ticket',
    items: [
      'Cada calendario define qué días de la semana (p. ej. lunes a viernes) generan ticket en general.',
      'Además admite marcar fechas concretas como "sin ticket" (festivos, cierres puntuales, etc.), que se restan aunque caigan en un día que normalmente sí genera ticket.',
      'Cada persona con derecho a ticket tiene asignado un único calendario; el cálculo mensual usa siempre el calendario de la persona.',
    ],
  },
  {
    title: 'Diferencia entre Cómputo mensual y Cómputo cotización',
    items: [
      'Cómputo mensual (el pedido del mes): parte de los días de calendario del mes y resta la deuda de ausencias arrastrada desde meses anteriores más las notas de gasto marcadas como "afecta ticket" e imputadas a ese mes. No resta directamente las ausencias del propio mes: esas pasan a formar parte de la deuda que se descontará en un mes posterior con días de calendario disponibles.',
      'Cómputo cotización (lo que realmente corresponde ese mes): días de calendario del mes menos las ausencias que caen dentro de ese mismo mes y descuentan ticket. No arrastra deuda de otros meses y no resta las notas de gasto (solo las muestra como referencia).',
      'Por eso el mismo mes puede mostrar cifras distintas en cada vista: el "Cómputo mensual" refleja lo que se pide a proveedor, y la "Cómputo cotización" lo que realmente se ha consumido ese mes en concreto.',
    ],
  },
  {
    title: 'Reglas de cálculo',
    items: [
      'Solo se calculan personas activas con derecho a ticket y con calendario asignado.',
      'Las ausencias con fecha "Desde" anterior al 01/03/2026 nunca se tienen en cuenta (límite fijo de la aplicación).',
      'La "Fecha inicio cómputo deuda" (configurable en Reglas de cálculo) marca desde cuándo empiezan a arrastrarse ausencias como deuda en el Cómputo mensual; por defecto es esa misma fecha, pero puede adelantarse o retrasarse.',
      'En "Motivos que no descuentan por calendario" se puede indicar, calendario por calendario, qué motivos de ausencia no restan ticket (p. ej. una liberación sindical).',
      'El precio del ticket admite un histórico de importes con fecha de vigencia: cada mes se calcula con el precio vigente en ese momento, sin afectar a meses anteriores.',
    ],
  },
  {
    title: 'Importación de ausencias',
    items: [
      'Para obtener el fichero en Zerkos: Supervisión → Justif. Ausencias de día → seleccionar las fechas del último mes → exportar a Excel.',
      'Se admiten dos formatos de fichero, detectados automáticamente: uno "limpio" con cabeceras propias, y el formato de exportación habitual de Zerkos.',
      'Solo se cargan ausencias que tengan impacto real en Ticket Restaurante: deben pertenecer a una persona activa con derecho a ticket y coincidir al menos con un día que genere ticket según su calendario. El resto se ignora.',
      'Las filas exactamente iguales a una ausencia ya guardada se cuentan como duplicadas y se ignoran.',
      'Si una ausencia importada se solapa en fechas con otra ya existente del mismo empleado y mismo motivo, la sustituye en lugar de duplicarla.',
      'Si el fichero no indica si la ausencia afecta al ticket, se asume que sí siempre que la fecha "Desde" sea igual o posterior al 01/03/2026.',
      'El botón "Modelo" genera un fichero de ejemplo con las columnas que reconoce el importador.',
    ],
  },
  {
    title: 'Notas de gasto (Manutenciones)',
    items: [
      'Se pueden importar desde un fichero de gastos (identifica quién paga y con quién se reparte la comida) o añadir manualmente indicando empleado y fecha.',
      'Antes de importar o añadir, hay que elegir el mes/año de imputación: todas las filas se guardan bajo ese mes, aunque la fecha del gasto sea otro día.',
      'Solo se importan personas que ya están dadas de alta como personas con derecho a ticket; el resto se ignoran.',
      'Una nota de gasto marcada como "afecta ticket" solo descuenta un ticket en el Cómputo mensual del mes de imputación, y únicamente si ese día generaría ticket según el calendario de la persona. No afecta al Cómputo cotización.',
    ],
  },
  {
    title: 'Deudas y regularizaciones',
    items: [
      'Muestra la deuda automática que llega a cada mes antes de aplicar el pedido.',
      'Si el saldo real no coincide con el calculado, puede regularizarse a cualquier valor (incluido 0) indicando obligatoriamente un motivo.',
      'La regularización no borra ni modifica las ausencias originales: queda registrada como corrección trazable y afecta al pedido mensual desde ese mes.',
      'La deuda manual sirve además para corregir tickets entregados de más sin crear ausencias ficticias.',
      'Se indica la persona, el total de tickets, el mes de origen, el primer mes de descuento y en cuántos meses repartir la deuda.',
      'Si una cuota no puede descontarse completa por falta de tickets disponibles, el pendiente se arrastra automáticamente.',
      'La deuda manual solo afecta al Cómputo mensual/pedido. No modifica el Cómputo cotización.',
      'Una deuda puede anularse con motivo; las cuotas ya aplicadas en meses anteriores no se alteran.',
    ],
  },
  {
    title: 'Cotización y exportación',
    items: [
      'La vista de cotización muestra, para el mes y calendario de cada persona, los tickets realmente generados y su importe. Las Personas manuales solo aparecen aquí si tienen marcada la opción Incluir en cotización, usando el mismo número de tickets introducido para ese mes.',
      'Permite revisar caso a caso antes de dar por bueno el mes.',
      'Los resultados pueden exportarse/imprimirse para su uso fuera de la aplicación.',
    ],
  },
];

const MONTH_OPTIONS = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];

function currentYear(): number {
  return new Date().getFullYear();
}

function currentMonth(): number {
  return new Date().getMonth() + 1;
}

function addYearMonth(
  year: number,
  month: number,
  offset: number,
): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

type TicketRestauranteSubview =
  | 'calendarios'
  | 'personas'
  | 'computoMensual'
  | 'computoCotizacion'
  | 'ausencias'
  | 'manutenciones'
  | 'deudaManual';

function toPersonDraft(person: TicketPerson): TicketPersonDraft {
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

function toCalendarDraft(calendar: TicketCalendar): TicketCalendarDraft {
  return {
    nombre: calendar.nombre,
    activo: calendar.activo,
    diasSinTicket: calendar.diasSinTicket,
    ticketIsoWeekdays: calendar.ticketIsoWeekdays,
  };
}

function sortByName(calendars: TicketCalendar[]): TicketCalendar[] {
  return [...calendars].sort((first, second) =>
    first.nombre.localeCompare(second.nombre, 'es', { numeric: true, sensitivity: 'base' }),
  );
}

function sortMonthlyCalculationRows(
  rows: readonly TicketPersonCalculation[],
): TicketPersonCalculation[] {
  return [...rows].sort((first, second) => {
    const calendarComparison = first.calendario.localeCompare(second.calendario, 'es', {
      numeric: true,
      sensitivity: 'base',
    });
    if (calendarComparison !== 0) return calendarComparison;
    return first.nombreApellidos.localeCompare(second.nombreApellidos, 'es', {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

function sortContributionCalculationRows(
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

const PEOPLE_EXPORT_HEADERS = [
  'Nº empleado',
  'Nombre',
  'Apellido1',
  'Apellido2',
  'DNI',
  'Puesto',
  'Calendario',
];
const MANUTENCIONES_MODEL_HEADERS = [
  'Nº empleado',
  'Nombre y apellidos',
  'Fecha gasto',
  'Origen',
  'Afecta a ticket',
];

const ABSENCE_MODEL_HEADERS = [
  'Nº empleado',
  'Nombre y apellidos',
  'Desde',
  'Hasta',
  'Motivo',
  'Total días',
];
function exportCsv(
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

const ticketPersonExportColumns = (
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

const monthlyCalculationExportColumns = (
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

const contributionCalculationExportColumns = (
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

const absenceExportColumns: ExportColumn<TicketAbsenceDisplayRow>[] = [
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

function toAbsencePreviewRow(absence: TicketRestaurantAbsence): TicketRestaurantAbsencePreviewRow {
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

function formatSaveSummary(result: TicketRestaurantAbsenceSaveResult): string {
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

function formatManutencionDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

function formatManutencionMonth(year: number, month: number): string {
  return `${MONTH_OPTIONS.find((option) => option.value === month)?.label ?? month} ${year}`;
}

function toManutencionDetailAbsences(
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

function normalizeTicketEmployeeSearch(value: string): string {
  return value
    .trim()
    .replace(/^0+(?=\d)/, '')
    .replace(/\.0$/, '');
}

function ManutencionesPanel({
  importMessage,
  manualEmployee,
  manualDate,
  manutenciones,
  month,
  onAddManual,
  onExportModel,
  onImport,
  onMonthChange,
  onNextMonth,
  onPreviousMonth,
  onManualDateChange,
  onManualEmployeeChange,
  onPreviewChange,
  onRemove,
  onSavePreview,
  onYearChange,
  previewRows,
  ticketPeople,
  year,
}: {
  importMessage: string;
  manualEmployee: string;
  manualDate: string;
  manutenciones: TicketManutencion[];
  month: number;
  onAddManual: () => void;
  onExportModel: () => void;
  onImport: () => void;
  onMonthChange: (value: string) => void;
  onNextMonth: () => void;
  onPreviousMonth: () => void;
  onManualDateChange: (value: string) => void;
  onManualEmployeeChange: (value: string) => void;
  onPreviewChange: (rows: TicketManutencionPreviewRow[]) => void;
  onRemove: (id: string) => void;
  onSavePreview: () => void;
  onYearChange: (value: string) => void;
  previewRows: TicketManutencionPreviewRow[];
  ticketPeople: TicketPerson[];
  year: number;
}) {
  const manualPerson = ticketPeople.find(
    (person) =>
      normalizeTicketEmployeeSearch(person.empleado) ===
      normalizeTicketEmployeeSearch(manualEmployee),
  );
  const rowsToImport = previewRows.filter((row) => row.importar).length;

  const updatePreviewRow = (
    rowId: string,
    patch: Partial<Pick<TicketManutencionPreviewRow, 'importar' | 'afectaTicket'>>,
  ) => {
    onPreviewChange(previewRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  };

  return (
    <div className="rounded-xl border border-metro-border bg-metro-panel p-2.5">
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-base font-bold text-metro-text">Manutenciones</h3>
          <p className="text-xs text-metro-muted">
            Importa notas de gasto y deja preparada la revisión. Las notas marcadas como afectantes
            descontarán tickets en el mes imputado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
            onClick={onExportModel}
            type="button"
          >
            Modelo
          </button>
          <ActionButton iconOnly={false} onClick={onImport} size="sm" variant="import">
            Importar desde Excel
          </ActionButton>
        </div>
      </div>

      {importMessage ? (
        <p className="mb-2 text-xs font-semibold text-metro-muted">{importMessage}</p>
      ) : null}

      <div className="mb-3 rounded-lg border border-metro-border bg-metro-surface p-2">
        <p className="mb-2 text-xs font-bold text-metro-muted">
          Alta manual
        </p>
        <div className="grid gap-2 lg:grid-cols-[140px_190px_1fr_auto] lg:items-center">
          <input
            className="h-8 rounded-lg border border-metro-border bg-metro-surface px-2 text-sm text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => onManualEmployeeChange(event.target.value)}
            placeholder="Nº empleado"
            value={manualEmployee}
          />
          <input
            className="h-8 rounded-lg border border-metro-border bg-metro-surface px-2 text-sm text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => onManualDateChange(event.target.value)}
            type="date"
            value={manualDate}
          />
          <div className="text-xs font-semibold text-metro-muted">
            {manualPerson
              ? manualPerson.nombreApellidos
              : 'Introduce una persona con derecho a ticket'}
          </div>
          <ActionButton
            disabled={!manualPerson || !manualDate}
            iconOnly={false}
            onClick={onAddManual}
            size="sm"
            variant="add"
          >
            Añadir
          </ActionButton>
        </div>
      </div>

      {previewRows.length > 0 ? (
        <div className="mb-3 rounded-lg border border-metro-border bg-metro-surface p-2">
          <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold text-metro-muted">Preview</p>
              <p className="text-xs text-metro-muted">
                {rowsToImport} registros marcados para importar.
              </p>
            </div>
            <button
              className="rounded-lg bg-metro-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={rowsToImport === 0 || previewRows.some((row) => row.errors.length > 0)}
              onClick={onSavePreview}
              type="button"
            >
              Guardar importación
            </button>
          </div>
          <div className="overflow-x-auto">
            <CompactTable>
              <CompactTableHead>
                <tr>
                  <th className="px-2 py-1">Importar</th>
                  <th className="px-2 py-1">Afecta a ticket</th>
                  <th className="px-2 py-1">Nº empleado</th>
                  <th className="px-2 py-1">Nombre</th>
                  <th className="px-2 py-1">Fecha gasto</th>
                  <th className="px-2 py-1">Origen</th>
                  <th className="px-2 py-1">Errores</th>
                </tr>
              </CompactTableHead>
              <CompactTableBody>
                {previewRows.map((row) => (
                  <tr className="border-t border-metro-border" key={row.id}>
                    <td className="px-2 py-1">
                      <input
                        checked={row.importar}
                        className="h-4 w-4 accent-metro-red"
                        onChange={(event) =>
                          updatePreviewRow(row.id, { importar: event.target.checked })
                        }
                        type="checkbox"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        checked={row.afectaTicket}
                        className="h-4 w-4 accent-metro-red"
                        onChange={(event) =>
                          updatePreviewRow(row.id, { afectaTicket: event.target.checked })
                        }
                        type="checkbox"
                      />
                    </td>
                    <td className="px-2 py-1 font-semibold text-metro-text">{row.empleado}</td>
                    <td className="px-2 py-1 text-metro-text">{row.nombreApellidos}</td>
                    <td className="px-2 py-1 text-metro-text">
                      {formatManutencionDate(row.fechaGasto)}
                    </td>
                    <td className="px-2 py-1 text-metro-muted">{row.origen}</td>
                    <td className="px-2 py-1 text-metro-red">{row.errors.join(' ')}</td>
                  </tr>
                ))}
              </CompactTableBody>
            </CompactTable>
          </div>
        </div>
      ) : null}

      <div className="mb-2 flex flex-col gap-2 rounded-lg border border-metro-border bg-metro-surface p-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs font-semibold text-metro-muted">
          Manutenciones del mes seleccionado: <span className="text-metro-red">{manutenciones.length}</span>
        </div>
        <MonthNavigator
          ariaLabel="Selector mes manutenciones"
          month={month}
          onMonthChange={onMonthChange}
          onNextMonth={onNextMonth}
          onPreviousMonth={onPreviousMonth}
          onYearChange={onYearChange}
          year={year}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-metro-border bg-metro-surface">
        <CompactTable>
          <CompactTableHead>
            <tr>
              <th className="px-2 py-2">Nº empleado</th>
              <th className="px-2 py-2">Nombre</th>
              <th className="px-2 py-2">Fecha gasto</th>
              <th className="px-2 py-2">Mes imputado</th>
              <th className="px-2 py-2">Origen</th>
              <th className="px-2 py-2">Afecta a ticket</th>
              <th className="px-2 py-2">Acciones</th>
            </tr>
          </CompactTableHead>
          <CompactTableBody>
            {manutenciones.length === 0 ? (
              <tr>
                <td className="px-2 py-6 text-center text-sm text-metro-muted" colSpan={7}>
                  No hay manutenciones cargadas.
                </td>
              </tr>
            ) : (
              manutenciones.map((row) => (
                <tr className="border-t border-metro-border" key={row.id}>
                  <td className="px-2 py-1 font-semibold text-metro-text">{row.empleado}</td>
                  <td className="px-2 py-1 text-metro-text">{row.nombreApellidos}</td>
                  <td className="px-2 py-1 text-metro-text">
                    {formatManutencionDate(row.fechaGasto)}
                  </td>
                  <td className="px-2 py-1 text-metro-muted">
                    {formatManutencionMonth(row.imputacionYear, row.imputacionMonth)}
                  </td>
                  <td className="px-2 py-1 text-metro-muted">{row.origen}</td>
                  <td className="px-2 py-1 text-metro-text">{row.afectaTicket ? 'Sí' : 'No'}</td>
                  <td className="px-2 py-1">
                    <button
                      className="inline-flex items-center gap-1 rounded-lg border border-metro-border px-2 py-1 text-xs font-semibold text-metro-text hover:border-metro-red"
                      onClick={() => onRemove(row.id)}
                      type="button"
                    >
                      <Trash2 className="h-3 w-3" />
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </CompactTableBody>
        </CompactTable>
      </div>
    </div>
  );
}

export function TicketRestaurantePage({
  initialAbsenceId = null,
  navigationNonce,
}: {
  initialAbsenceId?: string | null;
  navigationNonce?: number;
}) {
  const calendars = useTicketRestauranteStore((state) => state.calendars);
  const absences = useTicketRestauranteStore((state) => state.absences);
  const people = useTicketRestauranteStore((state) => state.people);
  const config = useTicketRestauranteStore((state) => state.config);
  const manutenciones = useTicketRestauranteStore((state) => state.manutenciones);
  const loadTickets = useTicketRestauranteStore((state) => state.load);
  const {
    createCalendar,
    updateCalendar,
    toggleCalendarActive,
    removeCalendar,
    toggleDay,
    saveAbsences,
    removeAbsence,
    upsertPerson,
    removePerson,
    updateConfig,
    saveManutenciones,
    removeManutencion,
    importPeople,
  } = useTicketRestauranteWriteActions();
  const employees = useEmployeeStore((state) => state.employees);
  const loadEmployees = useEmployeeStore((state) => state.load);
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const { alert, confirm, dialogNode } = useAppDialog();
  const [activeSubview, setActiveSubview] = useState<TicketRestauranteSubview | null>(null);
  const [year, setYear] = useState(currentYear());
  const [absenceYear, setAbsenceYear] = useState(currentYear());
  const [calculationYear, setCalculationYear] = useState(currentYear());
  const [calculationMonth, setCalculationMonth] = useState(currentMonth());
  const [absenceMonth, setAbsenceMonth] = useState(currentMonth());
  const [manutencionYear, setManutencionYear] = useState(currentYear());
  const [manutencionMonth, setManutencionMonth] = useState(currentMonth());
  const [calendarDraft, setCalendarDraft] = useState<TicketCalendarDraft>(
    EMPTY_TICKET_CALENDAR_DRAFT,
  );
  const [personDraft, setPersonDraft] = useState<TicketPersonDraft>(EMPTY_TICKET_PERSON_DRAFT);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editingCalendarId, setEditingCalendarId] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<TicketRestaurantAbsencePreviewRow[]>([]);
  const [importMessage, setImportMessage] = useState('');
  const [peopleImportMessage, setPeopleImportMessage] = useState('');
  const [manutencionImportMessage, setManutencionImportMessage] = useState('');
  const [manutencionPreviewRows, setManutencionPreviewRows] = useState<
    TicketManutencionPreviewRow[]
  >([]);
  const [manualManutencionEmployee, setManualManutencionEmployee] = useState('');
  const [manualManutencionDate, setManualManutencionDate] = useState('');
  const [isManutencionMonthModalOpen, setIsManutencionMonthModalOpen] = useState(false);
  const [manutencionImputationYear, setManutencionImputationYear] = useState(currentYear());
  const [manutencionImputationMonth, setManutencionImputationMonth] = useState(currentMonth());
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isAbsenceImportHelpOpen, setIsAbsenceImportHelpOpen] = useState(false);
  const [editingAbsenceId, setEditingAbsenceId] = useState<string | null>(null);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const peopleFileInputRef = useRef<HTMLInputElement | null>(null);
  const manutencionesFileInputRef = useRef<HTMLInputElement | null>(null);
  const processedNavigationNonceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    loadTickets();
    loadEmployees();
  }, [loadEmployees, loadTickets]);

  const visibleCalendars = useMemo(
    () => sortByName(visibleTicketCalendars(calendars)),
    [calendars],
  );
  const selectedCalendar = useMemo(
    () => visibleCalendars.find((calendar) => calendar.id === selectedCalendarId) ?? null,
    [selectedCalendarId, visibleCalendars],
  );
  const yearCalendar = useMemo(
    () => (selectedCalendar ? buildYearCalendar(selectedCalendar, year) : []),
    [selectedCalendar, year],
  );
  const visiblePeople = useMemo(
    () =>
      [...people]
        .filter((person) => !person.deletedAt)
        .sort((first, second) =>
          first.nombreApellidos.localeCompare(second.nombreApellidos, 'es', {
            numeric: true,
            sensitivity: 'base',
          }),
        ),
    [people],
  );
  const visibleManutenciones = useMemo(
    () =>
      [...manutenciones]
        .filter(
          (row) =>
            !row.deletedAt &&
            row.imputacionYear === manutencionYear &&
            row.imputacionMonth === manutencionMonth,
        )
        .sort((first, second) =>
          first.fechaGasto === second.fechaGasto
            ? first.nombreApellidos.localeCompare(second.nombreApellidos, 'es', {
                numeric: true,
                sensitivity: 'base',
              })
            : second.fechaGasto.localeCompare(first.fechaGasto),
        ),
    [manutencionMonth, manutencionYear, manutenciones],
  );

  const activeTicketEmployeeNumbers = useMemo(
    () =>
      new Set(
        people
          .filter((person) => person.activo && !person.deletedAt)
          .map((person) => normalizeTicketEmployeeNumber(person.empleado)),
      ),
    [people],
  );

  const applyCalendarTicketImpactToPreviewRows = useCallback(
    (rows: readonly TicketRestaurantAbsencePreviewRow[]): TicketRestaurantAbsencePreviewRow[] =>
      rows.map((row) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.desde) || !/^\d{4}-\d{2}-\d{2}$/.test(row.hasta)) {
          return row;
        }

        const person = people.find(
          (item) =>
            !item.deletedAt &&
            item.activo &&
            normalizeTicketEmployeeNumber(item.empleado) ===
              normalizeTicketEmployeeNumber(row.empleado),
        );
        const calendar = person
          ? calendars.find(
              (item) => !item.deletedAt && item.activo && item.id === person.calendarId,
            )
          : undefined;

        if (!person || !calendar) {
          return row;
        }

        const impact = calculateTicketAbsenceTicketImpact(
          {
            empleado: person.empleado,
            desde: row.desde,
            hasta: row.hasta,
            motivo: row.motivo,
          },
          people,
          calendars,
          config,
        );

        return {
          ...row,
          afectaTicket: impact.afectaTicket,
        };
      }),
    [calendars, config, people],
  );
  const calculationAbsences = useMemo(
    () => [...absences, ...toManutencionDetailAbsences(manutenciones)],
    [absences, manutenciones],
  );

  const monthCalculation = useMemo(
    () =>
      calculateMonthlyTicketOrder(
        people,
        calendars,
        absences,
        config,
        calculationYear,
        calculationMonth,
        manutenciones,
      ),
    [absences, calendars, calculationMonth, calculationYear, config, manutenciones, people],
  );
  const contributionCalculation = useMemo(
    () =>
      calculateTicketContribution(
        people,
        calendars,
        absences,
        config,
        calculationYear,
        calculationMonth,
        manutenciones,
      ),
    [absences, calendars, calculationMonth, calculationYear, config, manutenciones, people],
  );

  const visibleAbsences = useMemo<TicketAbsenceDisplayRow[]>(
    () =>
      filterTicketRestaurantAbsencesByMonth(absences, absenceYear, absenceMonth)
        .map((absence) => ({
          ...absence,
          ...calculateTicketAbsenceMonthImpact(
            absence,
            people,
            visibleCalendars,
            config,
            absenceYear,
            absenceMonth,
          ),
        }))
        .filter((absence) => absence.diasTicketMes > 0),
    [absenceMonth, absenceYear, absences, config, people, visibleCalendars],
  );


  const workflowAbsenceCount = useMemo(
    () =>
      filterTicketRestaurantAbsencesByMonth(absences, calculationYear, calculationMonth).filter(
        (absence) =>
          calculateTicketAbsenceMonthImpact(
            absence,
            people,
            visibleCalendars,
            config,
            calculationYear,
            calculationMonth,
          ).diasTicketMes > 0,
      ).length,
    [absences, calculationMonth, calculationYear, config, people, visibleCalendars],
  );
  const workflowManutencionCount = useMemo(
    () =>
      manutenciones.filter(
        (row) =>
          !row.deletedAt &&
          row.imputacionYear === calculationYear &&
          row.imputacionMonth === calculationMonth,
      ).length,
    [calculationMonth, calculationYear, manutenciones],
  );
  const workflowActivePeople = useMemo(
    () => visiblePeople.filter((person) => person.activo).length,
    [visiblePeople],
  );
  const workflowInactivePeople = visiblePeople.length - workflowActivePeople;

  useEffect(() => {
    if (
      selectedCalendarId &&
      visibleCalendars.some((calendar) => calendar.id === selectedCalendarId)
    ) {
      return;
    }

    setSelectedCalendarId(visibleCalendars[0]?.id ?? '');
  }, [selectedCalendarId, visibleCalendars]);

  const resetForm = () => {
    setCalendarDraft(EMPTY_TICKET_CALENDAR_DRAFT);
    setEditingCalendarId(null);
  };

  const saveCalendar = async () => {
    if (!calendarDraft.nombre.trim()) {
      return;
    }

    if (editingCalendarId) {
      const result = await updateCalendar(editingCalendarId, calendarDraft);
      if (!result.ok) {
        await alert(result.message ?? 'No se ha podido guardar el calendario.');
        return;
      }
      setSelectedCalendarId(editingCalendarId);
    } else {
      const result = await createCalendar(calendarDraft);
      if (!result.ok) {
        await alert(result.message);
        return;
      }
      setSelectedCalendarId(result.id);
    }
    resetForm();
  };

  const editCalendar = (calendar: TicketCalendar) => {
    setCalendarDraft(toCalendarDraft(calendar));
    setEditingCalendarId(calendar.id);
    setSelectedCalendarId(calendar.id);
  };

  const handleToggleCalendarActive = (calendarId: string) => {
    void (async () => {
      const result = await toggleCalendarActive(calendarId);
      if (!result.ok) {
        await alert(result.message ?? 'No se ha podido actualizar el calendario.');
      }
    })();
  };

  const resetPersonForm = () => {
    setPersonDraft(EMPTY_TICKET_PERSON_DRAFT);
    setEditingPersonId(null);
  };

  const savePerson = async () => {
    if (!personDraft.empleado.trim() || !personDraft.nombre.trim() || !personDraft.calendarId) {
      return;
    }

    const result = await upsertPerson(personDraft);
    if (!result.ok) {
      await alert(result.message ?? 'No se ha podido guardar la persona.');
      return;
    }
    resetPersonForm();
  };

  const editPerson = (person: TicketPerson) => {
    setPersonDraft(toPersonDraft(person));
    setEditingPersonId(person.empleado);
  };

  const handleRemovePerson = (empleado: string) => {
    void (async () => {
      const result = await removePerson(empleado);
      if (!result.ok) {
        await alert(result.message ?? 'No se ha podido eliminar la persona.');
      }
    })();
  };

  const removeCalendarAndPeople = async (calendarId: string) => {
    const associatedPeople = visiblePeople.filter((person) => person.calendarId === calendarId);
    const calendarName =
      calendars.find((calendar) => calendar.id === calendarId)?.nombre ?? 'este calendario';

    if (associatedPeople.length > 0) {
      const confirmed = await confirm(
        `El calendario "${calendarName}" tiene ${associatedPeople.length} persona(s) adscrita(s). ` +
          'Si continúas, se eliminarán también esas personas de Ticket Restaurante. ¿Continuar?',
        { confirmLabel: 'Eliminar', danger: true, title: 'Eliminar calendario' },
      );

      if (!confirmed) {
        return;
      }
    } else if (
      !(await confirm(`¿Eliminar el calendario "${calendarName}"?`, {
        confirmLabel: 'Eliminar',
        danger: true,
        title: 'Eliminar calendario',
      }))
    ) {
      return;
    }

    const result = await removeCalendar(calendarId);
    if (!result.ok) {
      await alert(result.message ?? 'No se ha podido eliminar el calendario.');
    }
  };

  const handleYearChange = (value: string) => {
    const parsedYear = Number(value);
    if (Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2200) {
      setYear(parsedYear);
    }
  };

  const handleToggleDay = (calendarId: string, fecha: string) => {
    void (async () => {
      const result = await toggleDay(calendarId, fecha);
      if (!result.ok) {
        await alert(result.message ?? 'No se ha podido actualizar el día del calendario.');
      }
    })();
  };

  const handleAbsenceYearChange = (value: string) => {
    const parsedYear = Number(value);
    if (Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2200) {
      setAbsenceYear(parsedYear);
    }
  };

  const handleCalculationYearChange = (value: string) => {
    const parsedYear = Number(value);
    if (Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2200) {
      setCalculationYear(parsedYear);
    }
  };

  const handleCalculationMonthChange = (value: string) => {
    const parsedMonth = Number(value);
    if (Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12) {
      setCalculationMonth(parsedMonth);
    }
  };

  const handleAbsenceMonthChange = (value: string) => {
    const parsedMonth = Number(value);
    if (Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12) {
      setAbsenceMonth(parsedMonth);
    }
  };

  const moveCalculationMonth = (offset: number) => {
    const next = addYearMonth(calculationYear, calculationMonth, offset);
    setCalculationYear(next.year);
    setCalculationMonth(next.month);
  };

  const moveAbsenceMonth = (offset: number) => {
    const next = addYearMonth(absenceYear, absenceMonth, offset);
    setAbsenceYear(next.year);
    setAbsenceMonth(next.month);
  };

  const handleManutencionYearChange = (value: string) => {
    const parsedYear = Number(value);
    if (Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2200) {
      setManutencionYear(parsedYear);
    }
  };

  const handleManutencionMonthChange = (value: string) => {
    const parsedMonth = Number(value);
    if (Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12) {
      setManutencionMonth(parsedMonth);
    }
  };

  const moveManutencionListMonth = (offset: number) => {
    const next = addYearMonth(manutencionYear, manutencionMonth, offset);
    setManutencionYear(next.year);
    setManutencionMonth(next.month);
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    setImportMessage(`Procesando ${file.name}...`);

    try {
      const rows = await importTicketRestaurantAbsencesFromFile(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (rows.length === 0) {
        setPreviewRows([]);
        setEditingAbsenceId(null);
        setIsPreviewOpen(false);
        setImportMessage(
          'No se han detectado ausencias importables. El fichero debe tener formato limpio o ZERKOS.',
        );
        return;
      }

      const activePersonRows = rows.filter((row) =>
        activeTicketEmployeeNumbers.has(normalizeTicketEmployeeNumber(row.empleado)),
      );
      const rowsWithCalendarImpact = applyCalendarTicketImpactToPreviewRows(activePersonRows);
      const rowsWithTicketRight = rowsWithCalendarImpact.filter(
        (row) => row.errors.length > 0 || row.afectaTicket,
      );
      const ignoredWithoutActiveRight = rows.length - activePersonRows.length;
      const ignoredWithoutTicketDay = rowsWithCalendarImpact.length - rowsWithTicketRight.length;
      const rowsWithErrors = rowsWithTicketRight.filter((row) => row.errors.length > 0).length;

      if (rowsWithTicketRight.length === 0) {
        setPreviewRows([]);
        setEditingAbsenceId(null);
        setIsPreviewOpen(false);
        setImportMessage(
          [
            'No se ha importado ninguna ausencia.',
            ignoredWithoutActiveRight > 0
              ? `${ignoredWithoutActiveRight} fila(s) pertenecen a personas sin derecho activo a Ticket Restaurante.`
              : '',
            ignoredWithoutTicketDay > 0
              ? `${ignoredWithoutTicketDay} fila(s) no coinciden con ningún día que genere ticket según el calendario asignado.`
              : '',
          ]
            .filter(Boolean)
            .join(' '),
        );
        return;
      }

      setEditingAbsenceId(null);
      setPreviewRows(rowsWithTicketRight);
      setImportMessage(
        [
          `Ausencias detectadas: ${rows.length}.`,
          `A revisar: ${rowsWithTicketRight.length}.`,
          ignoredWithoutActiveRight > 0
            ? `Ignoradas por persona sin derecho activo: ${ignoredWithoutActiveRight}.`
            : '',
          ignoredWithoutTicketDay > 0
            ? `Ignoradas sin día con derecho a ticket: ${ignoredWithoutTicketDay}.`
            : '',
          rowsWithErrors > 0 ? `Con errores pendientes de corregir: ${rowsWithErrors}.` : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
      setIsPreviewOpen(true);
    } catch (error) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setPreviewRows([]);
      setEditingAbsenceId(null);
      setIsPreviewOpen(false);
      setImportMessage(
        error instanceof Error
          ? `No se ha podido importar el fichero: ${error.message}`
          : 'No se ha podido importar el fichero por un error no identificado.',
      );
    }
  };

  const handlePeopleImportFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    const result = await importTicketPeopleFromFile(file, employees, calendars);
    if (peopleFileInputRef.current) {
      peopleFileInputRef.current.value = '';
    }

    if (result.drafts.length === 0) {
      setPeopleImportMessage(
        'No se ha importado ninguna persona. Revisa Nº empleado y Calendario.',
      );
      return;
    }

    const saveResult = await importPeople(result.drafts);
    if (!saveResult.ok) {
      setPeopleImportMessage(
        saveResult.message ??
          'No se han podido importar las personas. Recarga e inténtalo de nuevo.',
      );
      return;
    }

    const missingText =
      result.missingEmployees.length > 0
        ? ` · No encontrados en Plantilla: ${result.missingEmployees.join(', ')}`
        : '';
    const ignoredText = result.ignored > 0 ? ` · Filas ignoradas: ${result.ignored}` : '';
    const duplicateText =
      result.duplicateRows > 0 ? ` · Duplicados en Excel: ${result.duplicateRows}` : '';

    setPeopleImportMessage(
      `Personas importadas/actualizadas: ${saveResult.imported} · Calendarios creados: ${saveResult.createdCalendars}${ignoredText}${duplicateText}${missingText}`,
    );
  };

  const updatePreviewRow = (
    rowId: string,
    field: keyof Omit<TicketRestaurantAbsencePreviewRow, 'id' | 'errors'>,
    value: string | boolean,
  ) => {
    setPreviewRows((rows) =>
      rows.map((row) => (row.id === rowId ? { ...row, [field]: value, errors: [] } : row)),
    );
  };

  const addPreviewRow = () => {
    setPreviewRows((rows) => [
      ...rows,
      {
        id: `preview-manual-${Date.now()}`,
        empleado: '',
        nombreApellidos: '',
        desde: '',
        hasta: '',
        motivo: '',
        totalDias: '',
        afectaTicket: true,
        errors: [],
      },
    ]);
  };

  const removePreviewRow = (rowId: string) => {
    setPreviewRows((rows) => rows.filter((row) => row.id !== rowId));
  };

  const savePreviewRows = async () => {
    const currentAbsences = editingAbsenceId
      ? absences.filter((absence) => absence.id !== editingAbsenceId)
      : absences;
    const rowsWithCalendarImpact = applyCalendarTicketImpactToPreviewRows(previewRows);
    const result = saveTicketRestaurantAbsencePreviewRows(currentAbsences, rowsWithCalendarImpact);
    if (result.errors.length > 0) {
      setPreviewRows(validateTicketRestaurantAbsencePreviewRows(rowsWithCalendarImpact));
      setImportMessage(result.errors.join(' '));
      return;
    }

    const saveResult = await saveAbsences(result.absences);
    if (!saveResult.ok) {
      setImportMessage(
        saveResult.message ??
          'No se han podido guardar las ausencias. Recarga e inténtalo de nuevo.',
      );
      return;
    }
    setImportMessage(formatSaveSummary(result));
    setPreviewRows([]);
    setEditingAbsenceId(null);
    setIsPreviewOpen(false);
  };

  const editAbsence = useCallback((absence: TicketRestaurantAbsence) => {
    setEditingAbsenceId(absence.id);
    setPreviewRows([toAbsencePreviewRow(absence)]);
    setImportMessage('Edita la ausencia y confirma para guardar los cambios.');
    setIsPreviewOpen(true);
  }, []);

  const handleRemoveAbsence = (absenceId: string) => {
    void (async () => {
      const result = await removeAbsence(absenceId);
      if (!result.ok) {
        await alert(result.message ?? 'No se ha podido eliminar la ausencia.');
      }
    })();
  };

  const handleManutencionesImportFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    setManutencionImportMessage(`Procesando ${file.name}...`);

    try {
      const rows = await importTicketManutencionesFromFile(file, visiblePeople);
      const validatedRows = validateTicketManutencionPreviewRows(rows);
      setManutencionPreviewRows(validatedRows);
      setManutencionImportMessage(
        validatedRows.length > 0
          ? `Detectadas ${validatedRows.length} manutenciones con derecho a ticket.`
          : 'No se han detectado manutenciones de personas con derecho a ticket.',
      );
    } catch (error) {
      setManutencionImportMessage(
        error instanceof Error ? error.message : 'No se pudo importar el fichero de manutenciones.',
      );
    } finally {
      if (manutencionesFileInputRef.current) {
        manutencionesFileInputRef.current.value = '';
      }
    }
  };

  const addManualManutencionPreviewRow = () => {
    const person = visiblePeople.find(
      (candidate) =>
        normalizeTicketEmployeeSearch(candidate.empleado) ===
        normalizeTicketEmployeeSearch(manualManutencionEmployee),
    );

    if (!person || !manualManutencionDate) {
      return;
    }

    setManutencionPreviewRows((currentRows) =>
      validateTicketManutencionPreviewRows([
        ...currentRows,
        {
          id: `manutencion-manual-${person.empleado}-${manualManutencionDate}-${Date.now()}`,
          empleado: person.empleado,
          nombreApellidos: person.nombreApellidos,
          fechaGasto: manualManutencionDate,
          origen: 'Manual',
          importar: true,
          afectaTicket: true,
          errors: [],
        },
      ]),
    );
    setManualManutencionEmployee('');
    setManualManutencionDate('');
  };

  const saveManutencionPreview = () => {
    const validatedRows = validateTicketManutencionPreviewRows(manutencionPreviewRows);
    setManutencionPreviewRows(validatedRows);

    if (validatedRows.some((row) => row.errors.length > 0)) {
      setManutencionImportMessage('Hay filas con errores. Corrígelas antes de guardar.');
      return;
    }

    if (!validatedRows.some((row) => row.importar)) {
      setManutencionImportMessage('No hay filas marcadas para importar.');
      return;
    }

    setIsManutencionMonthModalOpen(true);
  };

  const confirmSaveManutencionPreview = () => {
    const drafts: TicketManutencionDraft[] = manutencionPreviewRows
      .filter((row) => row.importar && row.errors.length === 0)
      .map((row) => ({
        empleado: row.empleado,
        nombreApellidos: row.nombreApellidos,
        fechaGasto: row.fechaGasto,
        origen: row.origen,
        afectaTicket: row.afectaTicket,
        imputacionYear: manutencionImputationYear,
        imputacionMonth: manutencionImputationMonth,
      }));

    const existingKeys = new Set(
      manutenciones
        .filter((row) => !row.deletedAt)
        .map(
          (row) =>
            `${normalizeTicketEmployeeNumber(row.empleado)}|${row.fechaGasto}|${row.imputacionYear}|${row.imputacionMonth}`,
        ),
    );
    let duplicates = 0;
    let saved = 0;
    drafts.forEach((draft) => {
      const key = `${normalizeTicketEmployeeNumber(draft.empleado)}|${draft.fechaGasto}|${draft.imputacionYear}|${draft.imputacionMonth}`;
      if (existingKeys.has(key)) {
        duplicates += 1;
        return;
      }
      existingKeys.add(key);
      saved += 1;
    });

    void (async () => {
      const result = await saveManutenciones(drafts);
      if (!result.ok) {
        setManutencionImportMessage(
          result.message ??
            'No se han podido guardar las manutenciones. Recarga e inténtalo de nuevo.',
        );
        return;
      }
      setManutencionPreviewRows([]);
      setIsManutencionMonthModalOpen(false);
      setManutencionYear(manutencionImputationYear);
      setManutencionMonth(manutencionImputationMonth);
      const duplicateText = duplicates > 0 ? ` Duplicadas omitidas: ${duplicates}.` : '';
      setManutencionImportMessage(
        `Manutenciones guardadas: ${saved}.${duplicateText} Imputación: ${formatManutencionMonth(
          manutencionImputationYear,
          manutencionImputationMonth,
        )}.`,
      );
    })();
  };

  const handleRemoveManutencion = (manutencionId: string) => {
    void (async () => {
      const result = await removeManutencion(manutencionId);
      if (!result.ok) {
        setManutencionImportMessage(result.message ?? 'No se ha podido eliminar la manutención.');
      }
    })();
  };

  const moveManutencionImputationMonth = (offset: number) => {
    const next = addYearMonth(manutencionImputationYear, manutencionImputationMonth, offset);
    setManutencionImputationYear(next.year);
    setManutencionImputationMonth(next.month);
  };

  useEffect(() => {
    if (!initialAbsenceId || navigationNonce === undefined) {
      return;
    }

    if (processedNavigationNonceRef.current === navigationNonce) {
      return;
    }

    const targetAbsence = absences.find((absence) => absence.id === initialAbsenceId);
    if (!targetAbsence) {
      return;
    }

    const parsedDate = new Date(`${targetAbsence.desde}T00:00:00`);
    if (!Number.isNaN(parsedDate.getTime())) {
      setAbsenceYear(parsedDate.getFullYear());
      setAbsenceMonth(parsedDate.getMonth() + 1);
    }

    setActiveSubview('ausencias');
    editAbsence(targetAbsence);
    processedNavigationNonceRef.current = navigationNonce;
  }, [absences, editAbsence, initialAbsenceId, navigationNonce]);

  const createManualDebt = async (draft: TicketManualDebtDraft) => {
    const now = new Date().toISOString();
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `ticket-manual-debt-${Date.now()}`;
    const debt = buildTicketManualDebt(draft, now, id);
    return updateConfig({
      ...config,
      manualDebts: [...(config.manualDebts ?? []), debt],
    });
  };

  const updateManualDebt = async (id: string, draft: TicketManualDebtDraft) => {
    const existing = (config.manualDebts ?? []).find((debt) => debt.id === id);
    if (!existing) {
      return { ok: false, message: 'No se ha encontrado la deuda manual que quieres modificar.' };
    }
    const now = new Date().toISOString();
    const updated = buildTicketManualDebt(draft, now, existing.id);
    return updateConfig({
      ...config,
      manualDebts: (config.manualDebts ?? []).map((debt) =>
        debt.id === id
          ? {
              ...updated,
              createdAt: existing.createdAt,
              cancelledAt: existing.cancelledAt,
              cancellationReason: existing.cancellationReason,
            }
          : debt,
      ),
    });
  };

  const cancelManualDebt = async (id: string, reason: string) => {
    const now = new Date().toISOString();
    return updateConfig({
      ...config,
      manualDebts: (config.manualDebts ?? []).map((debt) =>
        debt.id === id
          ? { ...debt, cancelledAt: now, cancellationReason: reason.trim(), updatedAt: now }
          : debt,
      ),
    });
  };

  const saveDebtRegularization = async (draft: TicketDebtRegularizationDraft) => {
    const now = new Date().toISOString();
    const existing = (config.debtRegularizations ?? []).find(
      (item) =>
        normalizeTicketEmployeeNumber(item.empleado) === normalizeTicketEmployeeNumber(draft.empleado) &&
        item.year === draft.year &&
        item.month === draft.month,
    );
    const id = existing?.id ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `ticket-debt-regularization-${Date.now()}`);
    const regularization = buildTicketDebtRegularization(draft, now, id);
    return updateConfig({
      ...config,
      debtRegularizations: existing
        ? (config.debtRegularizations ?? []).map((item) =>
            item.id === existing.id
              ? { ...regularization, createdAt: existing.createdAt }
              : item,
          )
        : [...(config.debtRegularizations ?? []), regularization],
    });
  };

  return (
    <section
      className="space-y-2"
      id="ticket-restaurante"
    >
      <PageHeader
        helpSections={TICKET_RESTAURANTE_HELP_SECTIONS}
        helpSubtitle="Guía rápida de uso, reglas principales e importaciones del módulo."
        title="Ticket Restaurante"
      />

      <input
        accept=".xlsx,.csv,.tsv"
        className="hidden"
        onChange={(event) => void handleImportFile(event.target.files?.[0] ?? null)}
        ref={fileInputRef}
        type="file"
      />
      <input
        accept=".xlsx,.csv,.tsv"
        className="hidden"
        onChange={(event) => void handlePeopleImportFile(event.target.files?.[0] ?? null)}
        ref={peopleFileInputRef}
        type="file"
      />
      <input
        accept=".xlsx,.csv,.tsv"
        className="hidden"
        onChange={(event) => void handleManutencionesImportFile(event.target.files?.[0] ?? null)}
        ref={manutencionesFileInputRef}
        type="file"
      />

      {activeSubview ? (
      <div className="mb-3 flex flex-col gap-2 rounded-xl border border-metro-border bg-metro-panel p-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <SubviewButton
            active={false}
            label="← Inicio"
            onClick={() => setActiveSubview(null)}
          />
          <SubviewButton
            active={activeSubview === 'calendarios'}
            label="Calendarios"
            onClick={() => setActiveSubview('calendarios')}
          />
          <SubviewButton
            active={activeSubview === 'personas'}
            label="Personas"
            onClick={() => setActiveSubview('personas')}
          />
          <SubviewButton
            active={activeSubview === 'computoMensual'}
            label="Cómputo mensual"
            onClick={() => setActiveSubview('computoMensual')}
          />
          <SubviewButton
            active={activeSubview === 'computoCotizacion'}
            label="Cómputo cotización"
            onClick={() => setActiveSubview('computoCotizacion')}
          />
          <SubviewButton
            active={activeSubview === 'ausencias'}
            label="Ausencias"
            onClick={() => setActiveSubview('ausencias')}
          />
          <SubviewButton
            active={activeSubview === 'manutenciones'}
            label="Manutenciones"
            onClick={() => setActiveSubview('manutenciones')}
          />
          <SubviewButton
            active={activeSubview === 'deudaManual'}
            label="Deudas"
            onClick={() => setActiveSubview('deudaManual')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <ActionButton icon={Euro} iconOnly={false} onClick={() => setIsPriceModalOpen(true)} size="sm" variant="secondary">
            Precio ticket
          </ActionButton>
          <ActionButton icon={Settings} iconOnly={false} onClick={() => setIsRulesModalOpen(true)} size="sm" variant="secondary">
            Reglas de cálculo
          </ActionButton>
        </div>
      </div>
      ) : null}

      {activeSubview === null ? (
        <TicketRestauranteWorkflow
          activeCalendars={visibleCalendars.filter((calendar) => calendar.activo).length}
          activePeople={workflowActivePeople}
          absenceCount={workflowAbsenceCount}
          calculation={monthCalculation}
          effectiveTicketPrice={getEffectiveTicketPrice(config, calculationYear, calculationMonth)}
          inactivePeople={workflowInactivePeople}
          manutencionCount={workflowManutencionCount}
          manualDebtCount={(config.manualDebts ?? []).filter((debt) => !debt.cancelledAt).length}
          month={calculationMonth}
          onImportAbsences={() => {
            setActiveSubview('ausencias');
            fileInputRef.current?.click();
          }}
          onImportManutenciones={() => {
            setActiveSubview('manutenciones');
            manutencionesFileInputRef.current?.click();
          }}
          onImportPeople={() => {
            setActiveSubview('personas');
            peopleFileInputRef.current?.click();
          }}
          onMonthChange={(nextMonth) => {
            setCalculationMonth(nextMonth);
            setAbsenceMonth(nextMonth);
            setManutencionImputationMonth(nextMonth);
            setManutencionMonth(nextMonth);
          }}
          onOpenAbsences={() => setActiveSubview('ausencias')}
          onOpenCalendars={() => setActiveSubview('calendarios')}
          onOpenContribution={() => setActiveSubview('computoCotizacion')}
          onOpenManutenciones={() => setActiveSubview('manutenciones')}
          onOpenManualDebt={() => setActiveSubview('deudaManual')}
          onOpenMonthlyCalculation={() => setActiveSubview('computoMensual')}
          onOpenPeople={() => setActiveSubview('personas')}
          onOpenPrice={() => setIsPriceModalOpen(true)}
          onOpenRules={() => setIsRulesModalOpen(true)}
          onYearChange={(nextYear) => {
            setCalculationYear(nextYear);
            setAbsenceYear(nextYear);
            setManutencionImputationYear(nextYear);
            setManutencionYear(nextYear);
          }}
          year={calculationYear}
        />
      ) : activeSubview === 'calendarios' ? (
        <>
          <CalendarToolbar
            calendars={visibleCalendars}
            draft={calendarDraft}
            editingCalendarId={editingCalendarId}
            onCancel={resetForm}
            onChange={setCalendarDraft}
            onEdit={editCalendar}
            onRemove={removeCalendarAndPeople}
            onSave={saveCalendar}
            onToggleActive={handleToggleCalendarActive}
            onYearChange={handleYearChange}
            selectedCalendar={selectedCalendar ?? undefined}
            selectedCalendarId={selectedCalendarId}
            setSelectedCalendarId={setSelectedCalendarId}
            setYear={setYear}
            year={year}
          />

          <div className="rounded-xl border border-metro-border bg-metro-panel p-2.5">
            <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-base font-bold text-metro-text">
                  <CalendarDays className="h-4 w-4 text-metro-red" />
                  Vista anual {year}
                </h3>
                <p className="text-xs text-metro-muted">
                  Pulsa un día para marcarlo o desmarcarlo como sin ticket.
                </p>
              </div>
              <Legend />
            </div>

            {selectedCalendar ? (
              <div className="grid gap-2 lg:grid-cols-3">
                {yearCalendar.map((month) => (
                  <MonthCalendar
                    key={month.mes}
                    monthName={month.nombre}
                    leadingBlanks={month.blancosIniciales}
                    days={month.dias}
                    onToggleDay={(fecha) => handleToggleDay(selectedCalendar.id, fecha)}
                  />
                ))}
              </div>
            ) : (
              <EmptyCalendar />
            )}
          </div>
        </>
      ) : activeSubview === 'personas' ? (
        <PeoplePanel
          calendars={visibleCalendars}
          draft={personDraft}
          editingPersonId={editingPersonId}
          onCancel={resetPersonForm}
          onChange={setPersonDraft}
          onEdit={editPerson}
          importMessage={peopleImportMessage}
          exportPayload={{
            title: 'Personas Ticket Restaurante',
            filename: 'ticket-restaurante-personas',
            columns: ticketPersonExportColumns(visibleCalendars),
            rows: visiblePeople,
          }}
          onExportModel={() =>
            exportCsv('modelo-personas-ticket-restaurante.csv', PEOPLE_EXPORT_HEADERS, [])
          }
          onImport={() => peopleFileInputRef.current?.click()}
          onRemove={handleRemovePerson}
          onSave={savePerson}
          people={visiblePeople}
        />
      ) : activeSubview === 'computoMensual' ? (
        <>
          <TicketRestauranteManualPeoplePanel
            config={config}
            employees={employees}
            month={calculationMonth}
            onUpdateConfig={updateConfig}
            regularPeople={visiblePeople}
            year={calculationYear}
          />
          <CalculationPanel
          absences={calculationAbsences}
          calendars={visibleCalendars}
          calculation={monthCalculation}
          config={config}
          mode="monthly"
          month={calculationMonth}
          exportPayload={{
            title: 'Cómputo mensual Ticket Restaurante',
            filename: `Computo_${MONTH_OPTIONS[calculationMonth - 1]?.label ?? calculationMonth}_${calculationYear}`,
            columns: monthlyCalculationExportColumns(
              config,
              calculationYear,
              calculationMonth,
              calculationAbsences,
            ),
            rows: sortMonthlyCalculationRows(monthCalculation.rows),
            rowGroupValue: (row) => row.calendario,
            filterLabel: buildFilterLabel([
              ['Mes', calculationMonth],
              ['Año', calculationYear],
            ]),
            formatPreset: 'ticket-restaurante-monthly',
          }}
          onMonthChange={handleCalculationMonthChange}
          onNextMonth={() => moveCalculationMonth(1)}
          onPreviousMonth={() => moveCalculationMonth(-1)}
          onYearChange={handleCalculationYearChange}
          year={calculationYear}
          />
        </>
      ) : activeSubview === 'computoCotizacion' ? (
        <CalculationPanel
          absences={calculationAbsences}
          calendars={visibleCalendars}
          calculation={contributionCalculation}
          config={config}
          mode="contribution"
          month={calculationMonth}
          exportPayload={{
            title: 'Cómputo cotización Ticket Restaurante',
            filename: `Computo_${MONTH_OPTIONS[calculationMonth - 1]?.label ?? calculationMonth}_Base_Cotizacion_y_Retribucion_${calculationYear}`,
            columns: contributionCalculationExportColumns(
              getEffectiveTicketPrice(config, calculationYear, calculationMonth),
            ),
            rows: sortContributionCalculationRows(contributionCalculation.rows),
            rowGroupValue: (row) => row.calendario,
            filterLabel: buildFilterLabel([
              ['Mes', calculationMonth],
              ['Año', calculationYear],
            ]),
            formatPreset: 'ticket-restaurante-contribution',
          }}
          onMonthChange={handleCalculationMonthChange}
          onNextMonth={() => moveCalculationMonth(1)}
          onPreviousMonth={() => moveCalculationMonth(-1)}
          onYearChange={handleCalculationYearChange}
          year={calculationYear}
        />
      ) : activeSubview === 'ausencias' ? (
        <AbsencesTable
          absences={visibleAbsences}
          exportPayload={{
            title: 'Ausencias Ticket Restaurante',
            filename: `ticket-restaurante-ausencias-${absenceYear}-${String(absenceMonth).padStart(2, '0')}`,
            columns: absenceExportColumns,
            rows: visibleAbsences,
            filterLabel: buildFilterLabel([
              ['Mes', absenceMonth],
              ['Año', absenceYear],
            ]),
          }}
          importMessage={importMessage}
          month={absenceMonth}
          onEdit={editAbsence}
          onExportModel={() =>
            exportCsv('modelo-ausencias-ticket-restaurante.csv', ABSENCE_MODEL_HEADERS, [])
          }
          onImport={() => setIsAbsenceImportHelpOpen(true)}
          onMonthChange={handleAbsenceMonthChange}
          onNextMonth={() => moveAbsenceMonth(1)}
          onPreviousMonth={() => moveAbsenceMonth(-1)}
          onRemove={handleRemoveAbsence}
          onYearChange={handleAbsenceYearChange}
          year={absenceYear}
        />
      ) : activeSubview === 'manutenciones' ? (
        <ManutencionesPanel
          importMessage={manutencionImportMessage}
          manualDate={manualManutencionDate}
          manualEmployee={manualManutencionEmployee}
          manutenciones={visibleManutenciones}
          month={manutencionMonth}
          onAddManual={addManualManutencionPreviewRow}
          onExportModel={() =>
            exportCsv(
              'modelo-manutenciones-ticket-restaurante.csv',
              MANUTENCIONES_MODEL_HEADERS,
              [],
            )
          }
          onImport={() => manutencionesFileInputRef.current?.click()}
          onMonthChange={handleManutencionMonthChange}
          onNextMonth={() => moveManutencionListMonth(1)}
          onPreviousMonth={() => moveManutencionListMonth(-1)}
          onManualDateChange={setManualManutencionDate}
          onManualEmployeeChange={setManualManutencionEmployee}
          onPreviewChange={(rows) =>
            setManutencionPreviewRows(validateTicketManutencionPreviewRows(rows))
          }
          onRemove={handleRemoveManutencion}
          onSavePreview={saveManutencionPreview}
          onYearChange={handleManutencionYearChange}
          previewRows={manutencionPreviewRows}
          ticketPeople={visiblePeople}
          year={manutencionYear}
        />
      ) : activeSubview === 'deudaManual' ? (
        <TicketRestauranteManualDebtPanel
          calculation={monthCalculation}
          debts={config.manualDebts ?? []}
          regularizations={config.debtRegularizations ?? []}
          month={calculationMonth}
          onCancel={cancelManualDebt}
          onCreate={createManualDebt}
          onUpdate={updateManualDebt}
          onSaveRegularization={saveDebtRegularization}
          onMonthChange={handleCalculationMonthChange}
          onYearChange={handleCalculationYearChange}
          onPreviousMonth={() => moveCalculationMonth(-1)}
          onNextMonth={() => moveCalculationMonth(1)}
          people={visiblePeople}
          year={calculationYear}
        />
      ) : null}

      {isAbsenceImportHelpOpen ? (
        <ModalShell
          labelledBy="absence-import-help-title"
          maxWidthClassName="max-w-lg"
          onClose={() => setIsAbsenceImportHelpOpen(false)}
        >
          <ModalHeader>
            <ModalTitle
              id="absence-import-help-title"
              subtitle="Obtén primero el Excel de ausencias y después selecciónalo para importarlo."
            >
              Importar ausencias
            </ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-3 text-sm text-metro-text">
              <div className="rounded-lg border border-metro-border bg-metro-surface p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Cómo obtener el Excel en Zerkos
                </p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Entrar en <strong>Supervisión</strong>.</li>
                  <li>Abrir <strong>Justif. Ausencias de día</strong>.</li>
                  <li>Seleccionar las fechas del <strong>último mes</strong>.</li>
                  <li>Exportar el resultado a <strong>Excel</strong>.</li>
                </ol>
              </div>
              <p className="text-xs leading-relaxed text-metro-muted">
                Al importar, solo se cargarán ausencias de personas activas con derecho a Ticket
                Restaurante que coincidan al menos con un día que genere ticket según su calendario.
                Fines de semana, festivos y otros días sin derecho a ticket se ignorarán.
              </p>
            </div>
          </ModalBody>
          <ModalFooter>
            <ActionButton
              iconOnly={false}
              onClick={() => setIsAbsenceImportHelpOpen(false)}
              variant="secondary"
            >
              Cancelar
            </ActionButton>
            <ActionButton
              iconOnly={false}
              onClick={() => {
                setIsAbsenceImportHelpOpen(false);
                fileInputRef.current?.click();
              }}
              variant="import"
            >
              Seleccionar Excel
            </ActionButton>
          </ModalFooter>
        </ModalShell>
      ) : null}

      {isManutencionMonthModalOpen ? (
        <ModalShell
          labelledBy="manutencion-month-title"
          maxWidthClassName="max-w-md"
          onClose={() => setIsManutencionMonthModalOpen(false)}
        >
          <ModalHeader>
            <ModalTitle
              id="manutencion-month-title"
              subtitle="Las notas de gasto marcadas como afectantes descontarán tickets en este mes."
            >
              ¿A qué mes lo imputamos?
            </ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="flex items-center justify-center gap-3 py-2">
              <ActionButton iconOnly onClick={() => moveManutencionImputationMonth(-1)} variant="secondary">←</ActionButton>
              <div className="min-w-44 rounded-xl bg-metro-panel px-4 py-3 text-center text-base font-bold text-metro-text">
                {formatManutencionMonth(manutencionImputationYear, manutencionImputationMonth)}
              </div>
              <ActionButton iconOnly onClick={() => moveManutencionImputationMonth(1)} variant="secondary">→</ActionButton>
            </div>
          </ModalBody>
          <ModalFooter>
            <ActionButton iconOnly={false} onClick={() => setIsManutencionMonthModalOpen(false)} variant="secondary">Cancelar</ActionButton>
            <ActionButton iconOnly={false} onClick={confirmSaveManutencionPreview} variant="save">Guardar</ActionButton>
          </ModalFooter>
        </ModalShell>
      ) : null}

      {isPriceModalOpen ? (
        <TicketPriceModal
          config={config}
          onClose={() => setIsPriceModalOpen(false)}
          onSave={async (nextConfig) => {
            const result = await updateConfig(nextConfig);
            if (!result.ok) {
              await alert(result.message ?? 'No se ha podido guardar el precio del ticket.');
              return;
            }
            setIsPriceModalOpen(false);
          }}
        />
      ) : null}

      {isRulesModalOpen ? (
        <TicketRulesModal
          config={config}
          onClose={() => setIsRulesModalOpen(false)}
          onSave={async (nextConfig) => {
            const result = await updateConfig(nextConfig);
            if (!result.ok) {
              await alert(result.message ?? 'No se han podido guardar las reglas de cálculo.');
              return;
            }
            setIsRulesModalOpen(false);
          }}
        />
      ) : null}

      {isPreviewOpen ? (
        <AbsencePreviewModal
          onAdd={addPreviewRow}
          onCancel={() => {
            setIsPreviewOpen(false);
            setEditingAbsenceId(null);
            setPreviewRows([]);
          }}
          onChange={updatePreviewRow}
          onRemove={removePreviewRow}
          onSave={savePreviewRows}
          rows={previewRows}
        />
      ) : null}
      {dialogNode}
    </section>
  );
}

import { CalendarDays, Euro, Settings, Trash2, Utensils } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { withSharedModuleLocks } from '../../../services/sharedModuleLock';
import {
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
  type TicketCalendarDraft,
  type TicketPerson,
  type TicketPersonCalculation,
  type TicketPersonDraft,
  type TicketRestaurantAbsence,
  type TicketRestaurantConfig,
  normalizeTicketEmployeeNumber,
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
import { InlineSaveFeedback } from '../../../components/InlineSaveFeedback';
import { type ModuleHelpSection } from '../../../components/ModuleHelp';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ActionButton } from '../../../components/ui/ActionButton';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
import { buildFilterLabel } from '../../../shared/export/filterLabel';
import type { ExportColumn } from '../../../shared/export/types';
import {
  CalendarToolbar,
  EmptyCalendar,
  Legend,
  MonthCalendar,
  SubviewButton,
} from './TicketRestauranteCalendarPanels';
import { PeoplePanel } from './TicketRestaurantePeoplePanel';
import { TicketPriceModal, TicketRulesModal } from './TicketRestauranteConfigModals';
import { CalculationPanel } from './TicketRestauranteCalculationPanel';
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
      'Dar de alta a las personas con derecho a ticket y asignar a cada una su calendario.',
      'Cada mes: importar o revisar ausencias y notas de gasto (manutenciones) del periodo.',
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
      'Se admiten dos formatos de fichero, detectados automáticamente: uno "limpio" con cabeceras propias, y el formato de exportación habitual de Zerkos.',
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
    title: 'Cotización y exportación',
    items: [
      'La vista de cotización muestra, para el mes y calendario de cada persona, los tickets realmente generados y su importe.',
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
  | 'manutenciones';

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

const formatTicketExcelNumber = (value: number): string =>
  value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

const monthlyCalculationExportColumns = (
  config: TicketRestaurantConfig,
  year: number,
  month: number,
  absences: readonly TicketRestaurantAbsence[],
): ExportColumn<TicketPersonCalculation>[] => [
  { key: 'nombre', header: 'Nombre', value: (row) => row.nombre },
  { key: 'apellido1', header: 'Apellido1', value: (row) => row.apellido1 },
  { key: 'apellido2', header: 'Apellido2', value: (row) => row.apellido2 },
  { key: 'dni', header: 'DNI', value: (row) => row.dni },
  { key: 'pedido', header: 'Pedido', value: () => config.pedidoMensual },
  { key: 'empleado', header: 'Nº Emp', value: (row) => row.empleado },
  { key: 'numeroTickets', header: 'Numero Tickets', value: (row) => row.ticketsFinales },
  {
    key: 'importe',
    header: 'Importe',
    value: () => formatTicketExcelNumber(getEffectiveTicketPrice(config, year, month)),
  },
  { key: 'total', header: 'Total', value: (row) => formatTicketExcelNumber(row.importe) },
  { key: 'fecInicio', header: 'Fec Inicio', value: () => formatTicketExcelDate(year, month) },
  { key: 'fecCad', header: 'Fec Cad', value: () => '01/01/2010' },
  { key: 'hojaGastos', header: 'Hoja Gastos', value: (row) => row.hojasGastoMes },
  {
    key: 'ausencias',
    header: 'Ausencias',
    value: (row) => formatAppliedAbsencesForExport(row, absences),
  },
];

const contributionCalculationExportColumns = (
  importeTicket: number,
): ExportColumn<TicketPersonCalculation>[] => [
  { key: 'empleado', header: 'Nº empleado', value: (row) => row.empleado },
  { key: 'nombreApellidos', header: 'Nombre y apellidos', value: (row) => row.nombreApellidos },
  { key: 'calendario', header: 'Calendario', value: (row) => row.calendario },
  { key: 'diasTeoricos', header: 'Días teóricos', value: (row) => row.diasTeoricos },
  {
    key: 'ausenciasAplicadas',
    header: 'Ausencias aplicadas',
    value: (row) => row.ausenciasAplicadas,
  },
  { key: 'ticketsFinales', header: 'Tickets finales', value: (row) => row.ticketsFinales },
  { key: 'importeTicket', header: 'Importe ticket', value: () => importeTicket.toFixed(2) },
  { key: 'total', header: 'Total', value: (row) => row.importe.toFixed(2) },
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
  onAddManual,
  onExportModel,
  onImport,
  onManualDateChange,
  onManualEmployeeChange,
  onPreviewChange,
  onRemove,
  onSavePreview,
  previewRows,
  ticketPeople,
}: {
  importMessage: string;
  manualEmployee: string;
  manualDate: string;
  manutenciones: TicketManutencion[];
  onAddManual: () => void;
  onExportModel: () => void;
  onImport: () => void;
  onManualDateChange: (value: string) => void;
  onManualEmployeeChange: (value: string) => void;
  onPreviewChange: (rows: TicketManutencionPreviewRow[]) => void;
  onRemove: (id: string) => void;
  onSavePreview: () => void;
  previewRows: TicketManutencionPreviewRow[];
  ticketPeople: TicketPerson[];
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
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-metro-muted">
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
              <p className="text-xs font-bold uppercase tracking-wide text-metro-muted">Preview</p>
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
            <table className="min-w-full text-left text-xs">
              <thead className="text-metro-muted">
                <tr>
                  <th className="px-2 py-1">Importar</th>
                  <th className="px-2 py-1">Afecta a ticket</th>
                  <th className="px-2 py-1">Nº empleado</th>
                  <th className="px-2 py-1">Nombre</th>
                  <th className="px-2 py-1">Fecha gasto</th>
                  <th className="px-2 py-1">Origen</th>
                  <th className="px-2 py-1">Errores</th>
                </tr>
              </thead>
              <tbody>
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
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-metro-border bg-metro-surface">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-metro-panel text-metro-muted">
            <tr>
              <th className="px-2 py-2">Nº empleado</th>
              <th className="px-2 py-2">Nombre</th>
              <th className="px-2 py-2">Fecha gasto</th>
              <th className="px-2 py-2">Mes imputado</th>
              <th className="px-2 py-2">Origen</th>
              <th className="px-2 py-2">Afecta a ticket</th>
              <th className="px-2 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
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
                      className="inline-flex items-center gap-1 rounded-lg border border-metro-border px-2 py-1 text-[11px] font-semibold text-metro-text hover:border-metro-red"
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
          </tbody>
        </table>
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
  const createCalendar = useTicketRestauranteStore((state) => state.createCalendar);
  const updateCalendar = useTicketRestauranteStore((state) => state.updateCalendar);
  const toggleCalendarActive = useTicketRestauranteStore((state) => state.toggleCalendarActive);
  const removeCalendar = useTicketRestauranteStore((state) => state.removeCalendar);
  const toggleDay = useTicketRestauranteStore((state) => state.toggleDay);
  const saveAbsences = useTicketRestauranteStore((state) => state.saveAbsences);
  const removeAbsence = useTicketRestauranteStore((state) => state.removeAbsence);
  const upsertPerson = useTicketRestauranteStore((state) => state.upsertPerson);
  const removePerson = useTicketRestauranteStore((state) => state.removePerson);
  const updateConfig = useTicketRestauranteStore((state) => state.updateConfig);
  const saveManutenciones = useTicketRestauranteStore((state) => state.saveManutenciones);
  const removeManutencion = useTicketRestauranteStore((state) => state.removeManutencion);
  const importPeople = useTicketRestauranteStore((state) => state.importPeople);
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
        .filter((row) => !row.deletedAt)
        .sort((first, second) =>
          first.fechaGasto === second.fechaGasto
            ? first.nombreApellidos.localeCompare(second.nombreApellidos, 'es', {
                numeric: true,
                sensitivity: 'base',
              })
            : second.fechaGasto.localeCompare(first.fechaGasto),
        ),
    [manutenciones],
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
      filterTicketRestaurantAbsencesByMonth(absences, absenceYear, absenceMonth).map((absence) => ({
        ...absence,
        ...calculateTicketAbsenceMonthImpact(
          absence,
          people,
          visibleCalendars,
          config,
          absenceYear,
          absenceMonth,
        ),
      })),
    [absenceMonth, absenceYear, absences, config, people, visibleCalendars],
  );

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

    try {
      if (editingCalendarId) {
        const result = await withSharedModuleLocks(
          [{ module: 'ticket-restaurante', label: 'Ticket Restaurante' }],
          () => updateCalendar(editingCalendarId, calendarDraft),
        );
        if (!result.ok) {
          await alert(result.message ?? 'No se ha podido guardar el calendario.');
          return;
        }
        setSelectedCalendarId(editingCalendarId);
      } else {
        const id = await withSharedModuleLocks(
          [{ module: 'ticket-restaurante', label: 'Ticket Restaurante' }],
          () => createCalendar(calendarDraft),
        );
        setSelectedCalendarId(id);
      }
      resetForm();
    } catch (error) {
      await alert(
        error instanceof Error ? error.message : 'No se ha podido guardar el calendario.',
      );
    }
  };

  const editCalendar = (calendar: TicketCalendar) => {
    setCalendarDraft(toCalendarDraft(calendar));
    setEditingCalendarId(calendar.id);
    setSelectedCalendarId(calendar.id);
  };

  const handleToggleCalendarActive = (calendarId: string) => {
    void (async () => {
      try {
        const result = await withSharedModuleLocks(
          [{ module: 'ticket-restaurante', label: 'Ticket Restaurante' }],
          () => toggleCalendarActive(calendarId),
        );
        if (!result.ok) {
          await alert(result.message ?? 'No se ha podido actualizar el calendario.');
        }
      } catch (error) {
        await alert(
          error instanceof Error ? error.message : 'No se ha podido actualizar el calendario.',
        );
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

    try {
      const result = await withSharedModuleLocks(
        [{ module: 'ticket-restaurante', label: 'Ticket Restaurante' }],
        () => upsertPerson(personDraft),
      );
      if (!result.ok) {
        await alert(result.message ?? 'No se ha podido guardar la persona.');
        return;
      }
      resetPersonForm();
    } catch (error) {
      await alert(error instanceof Error ? error.message : 'No se ha podido guardar la persona.');
    }
  };

  const editPerson = (person: TicketPerson) => {
    setPersonDraft(toPersonDraft(person));
    setEditingPersonId(person.empleado);
  };

  const handleRemovePerson = (empleado: string) => {
    void (async () => {
      try {
        const result = await withSharedModuleLocks(
          [{ module: 'ticket-restaurante', label: 'Ticket Restaurante' }],
          () => removePerson(empleado),
        );
        if (!result.ok) {
          await alert(result.message ?? 'No se ha podido eliminar la persona.');
        }
      } catch (error) {
        await alert(
          error instanceof Error ? error.message : 'No se ha podido eliminar la persona.',
        );
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

    try {
      const result = await withSharedModuleLocks(
        [{ module: 'ticket-restaurante', label: 'Ticket Restaurante' }],
        () => removeCalendar(calendarId),
      );
      if (!result.ok) {
        await alert(result.message ?? 'No se ha podido eliminar el calendario.');
      }
    } catch (error) {
      await alert(
        error instanceof Error ? error.message : 'No se ha podido eliminar el calendario.',
      );
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
      try {
        const result = await withSharedModuleLocks(
          [{ module: 'ticket-restaurante', label: 'Ticket Restaurante' }],
          () => toggleDay(calendarId, fecha),
        );
        if (!result.ok) {
          await alert(result.message ?? 'No se ha podido actualizar el día del calendario.');
        }
      } catch (error) {
        await alert(
          error instanceof Error
            ? error.message
            : 'No se ha podido actualizar el día del calendario.',
        );
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

      const rowsWithTicketRight = applyCalendarTicketImpactToPreviewRows(
        rows.filter((row) =>
          activeTicketEmployeeNumbers.has(normalizeTicketEmployeeNumber(row.empleado)),
        ),
      );
      const ignoredWithoutTicketRight = rows.length - rowsWithTicketRight.length;
      const rowsWithErrors = rowsWithTicketRight.filter((row) => row.errors.length > 0).length;

      if (rowsWithTicketRight.length === 0) {
        setPreviewRows([]);
        setEditingAbsenceId(null);
        setIsPreviewOpen(false);
        setImportMessage(
          ignoredWithoutTicketRight > 0
            ? `No se ha importado ninguna ausencia. ${ignoredWithoutTicketRight} fila(s) pertenecen a personas sin derecho activo a Ticket Restaurante.`
            : 'No se han detectado ausencias importables.',
        );
        return;
      }

      setEditingAbsenceId(null);
      setPreviewRows(rowsWithTicketRight);
      setImportMessage(
        [
          `Ausencias detectadas: ${rows.length}.`,
          `A revisar: ${rowsWithTicketRight.length}.`,
          ignoredWithoutTicketRight > 0
            ? `Ignoradas por persona sin derecho activo: ${ignoredWithoutTicketRight}.`
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

    let saveResult: Awaited<ReturnType<typeof importPeople>>;
    try {
      saveResult = await withSharedModuleLocks(
        [{ module: 'ticket-restaurante', label: 'Ticket Restaurante' }],
        () => importPeople(result.drafts),
      );
    } catch (error) {
      setPeopleImportMessage(
        error instanceof Error
          ? error.message
          : 'No se han podido importar las personas. Recarga e inténtalo de nuevo.',
      );
      return;
    }
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

    let saveResult: Awaited<ReturnType<typeof saveAbsences>>;
    try {
      saveResult = await withSharedModuleLocks(
        [{ module: 'ticket-restaurante', label: 'Ticket Restaurante' }],
        () => saveAbsences(result.absences),
      );
    } catch (error) {
      setImportMessage(
        error instanceof Error
          ? error.message
          : 'No se han podido guardar las ausencias. Recarga e inténtalo de nuevo.',
      );
      return;
    }
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
      try {
        const result = await withSharedModuleLocks(
          [{ module: 'ticket-restaurante', label: 'Ticket Restaurante' }],
          () => removeAbsence(absenceId),
        );
        if (!result.ok) {
          await alert(result.message ?? 'No se ha podido eliminar la ausencia.');
        }
      } catch (error) {
        await alert(
          error instanceof Error ? error.message : 'No se ha podido eliminar la ausencia.',
        );
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

    void (async () => {
      try {
        await withSharedModuleLocks(
          [{ module: 'ticket-restaurante', label: 'Ticket Restaurante' }],
          async () => saveManutenciones(drafts),
        );
      } catch (error) {
        setManutencionImportMessage(
          error instanceof Error
            ? error.message
            : 'No se han podido guardar las manutenciones. Recarga e inténtalo de nuevo.',
        );
        return;
      }
      setManutencionPreviewRows([]);
      setIsManutencionMonthModalOpen(false);
      setManutencionImportMessage(
        `Manutenciones guardadas: ${drafts.length}. Imputación: ${formatManutencionMonth(
          manutencionImputationYear,
          manutencionImputationMonth,
        )}.`,
      );
    })();
  };

  const handleRemoveManutencion = (manutencionId: string) => {
    void (async () => {
      try {
        await withSharedModuleLocks(
          [{ module: 'ticket-restaurante', label: 'Ticket Restaurante' }],
          async () => removeManutencion(manutencionId),
        );
      } catch (error) {
        setManutencionImportMessage(
          error instanceof Error ? error.message : 'No se ha podido eliminar la manutención.',
        );
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

  return (
    <section
      className="rounded-2xl border border-metro-border bg-metro-surface p-3 shadow-card"
      id="ticket-restaurante"
    >
      <PageHeader
        eyebrow="Ticket Restaurante"
        icon={Utensils}
        helpSections={TICKET_RESTAURANTE_HELP_SECTIONS}
        helpSubtitle="Guía rápida de uso, reglas principales e importaciones del módulo."
        subtitle={
          <>
            Gestión anual de calendarios y ausencias de Ticket Restaurante.
            <div className="mt-2">
              <InlineSaveFeedback />
            </div>
          </>
        }
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

      <div className="mb-3 flex flex-col gap-2 rounded-xl border border-metro-border bg-metro-panel p-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
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
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
            onClick={() => setIsPriceModalOpen(true)}
            type="button"
          >
            <Euro className="h-3.5 w-3.5 text-metro-red" />
            Precio ticket
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
            onClick={() => setIsRulesModalOpen(true)}
            type="button"
          >
            <Settings className="h-3.5 w-3.5 text-metro-red" />
            Reglas de cálculo
          </button>
        </div>
      </div>

      {activeSubview === 'calendarios' ? (
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
            rows: monthCalculation.rows,
            filterLabel: buildFilterLabel([
              ['Mes', calculationMonth],
              ['Año', calculationYear],
            ]),
          }}
          onMonthChange={handleCalculationMonthChange}
          onNextMonth={() => moveCalculationMonth(1)}
          onPreviousMonth={() => moveCalculationMonth(-1)}
          onYearChange={handleCalculationYearChange}
          year={calculationYear}
        />
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
            filename: `ticket-restaurante-computo-cotizacion-${calculationYear}-${String(calculationMonth).padStart(2, '0')}`,
            columns: contributionCalculationExportColumns(
              getEffectiveTicketPrice(config, calculationYear, calculationMonth),
            ),
            rows: contributionCalculation.rows,
            filterLabel: buildFilterLabel([
              ['Mes', calculationMonth],
              ['Año', calculationYear],
            ]),
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
          onImport={() => fileInputRef.current?.click()}
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
          onAddManual={addManualManutencionPreviewRow}
          onExportModel={() =>
            exportCsv(
              'modelo-manutenciones-ticket-restaurante.csv',
              MANUTENCIONES_MODEL_HEADERS,
              [],
            )
          }
          onImport={() => manutencionesFileInputRef.current?.click()}
          onManualDateChange={setManualManutencionDate}
          onManualEmployeeChange={setManualManutencionEmployee}
          onPreviewChange={(rows) =>
            setManutencionPreviewRows(validateTicketManutencionPreviewRows(rows))
          }
          onRemove={handleRemoveManutencion}
          onSavePreview={saveManutencionPreview}
          previewRows={manutencionPreviewRows}
          ticketPeople={visiblePeople}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-metro-border bg-metro-panel p-8 text-center">
          <p className="text-base font-bold text-metro-text">Selecciona una sección</p>
          <p className="mt-1 text-sm text-metro-muted">
            El contenido de Ticket Restaurante se carga al pulsar en Calendarios, Personas,
            Cómputos, Ausencias o Manutenciones.
          </p>
        </div>
      )}

      {isManutencionMonthModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-metro-border bg-metro-surface shadow-card">
            <div className="border-b border-metro-border p-4">
              <h3 className="text-lg font-bold text-metro-text">¿A qué mes lo imputamos?</h3>
              <p className="text-xs text-metro-muted">
                Las notas de gasto marcadas como afectantes descontarán tickets en este mes.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 p-5">
              <button
                className="rounded-lg border border-metro-border px-3 py-2 text-sm font-bold text-metro-text hover:border-metro-red"
                onClick={() => moveManutencionImputationMonth(-1)}
                type="button"
              >
                ←
              </button>
              <div className="min-w-44 rounded-xl border border-metro-border bg-metro-panel px-4 py-3 text-center text-base font-bold text-metro-text">
                {formatManutencionMonth(manutencionImputationYear, manutencionImputationMonth)}
              </div>
              <button
                className="rounded-lg border border-metro-border px-3 py-2 text-sm font-bold text-metro-text hover:border-metro-red"
                onClick={() => moveManutencionImputationMonth(1)}
                type="button"
              >
                →
              </button>
            </div>
            <div className="flex justify-end gap-2 border-t border-metro-border p-4">
              <button
                className="rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
                onClick={() => setIsManutencionMonthModalOpen(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-lg bg-metro-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark"
                onClick={confirmSaveManutencionPreview}
                type="button"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPriceModalOpen ? (
        <TicketPriceModal
          config={config}
          onClose={() => setIsPriceModalOpen(false)}
          onSave={async (nextConfig) => {
            let result: Awaited<ReturnType<typeof updateConfig>>;
            try {
              result = await withSharedModuleLocks(
                [{ module: 'ticket-restaurante', label: 'Ticket Restaurante' }],
                () => updateConfig(nextConfig),
              );
            } catch (error) {
              await alert(
                error instanceof Error
                  ? error.message
                  : 'No se ha podido guardar el precio del ticket.',
              );
              return;
            }
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
            let result: Awaited<ReturnType<typeof updateConfig>>;
            try {
              result = await withSharedModuleLocks(
                [{ module: 'ticket-restaurante', label: 'Ticket Restaurante' }],
                () => updateConfig(nextConfig),
              );
            } catch (error) {
              await alert(
                error instanceof Error
                  ? error.message
                  : 'No se han podido guardar las reglas de cálculo.',
              );
              return;
            }
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

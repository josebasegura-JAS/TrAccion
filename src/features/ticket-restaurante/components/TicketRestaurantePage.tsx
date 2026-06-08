import {
  CalendarDays,
  Calculator,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Euro,
  FileUp,
  Pencil,
  Settings,
  Save,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildYearCalendar,
  calculateMonthlyTicketOrder,
  calculateTicketAbsenceMonthImpact,
  calculateTicketContribution,
  EMPTY_TICKET_CALENDAR_DRAFT,
  EMPTY_TICKET_PERSON_DRAFT,
  filterTicketRestaurantAbsencesByMonth,
  getEffectiveTicketPrice,
  normalizeTicketCalendarName,
  normalizeTicketRestaurantConfig,
  nextCalendarYear,
  previousCalendarYear,
  visibleTicketCalendars,
  type CalendarDay,
  type TicketCalendar,
  type TicketCalendarDraft,
  type TicketPerson,
  type TicketPersonCalculation,
  type TicketPersonDraft,
  type TicketRestaurantAbsence,
  type TicketRestaurantConfig,
} from '../domain/ticketRestaurante';
import {
  importTicketRestaurantAbsencesFromFile,
  saveTicketRestaurantAbsencePreviewRows,
  validateTicketRestaurantAbsencePreviewRows,
  type TicketRestaurantAbsencePreviewRow,
  type TicketRestaurantAbsenceSaveResult,
} from '../domain/importAbsences';
import { importTicketPeopleFromFile } from '../domain/importPeople';
import { useTicketRestauranteStore } from '../store/useTicketRestauranteStore';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
import { buildFilterLabel } from '../../../shared/export/filterLabel';
import type { ExportColumn, ExportTablePayload } from '../../../shared/export/types';
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';
import { DataTable, type DataTableColumn } from '../../../shared/table/DataTable';
import {
  type TableViewPreferences,
  useTableViewPreferences,
} from '../../../shared/table/useTableViewPreferences';

type TicketPeopleTableColumnId =
  | 'empleado'
  | 'nombre'
  | 'apellido1'
  | 'apellido2'
  | 'dni'
  | 'puesto'
  | 'calendario'
  | 'estado'
  | 'actions';

type TicketAbsencesTableColumnId =
  | 'empleado'
  | 'nombreApellidos'
  | 'desde'
  | 'hasta'
  | 'motivo'
  | 'calendario'
  | 'totalDias'
  | 'diasTicketMes'
  | 'afectaTicket'
  | 'actions';

type TicketCalculationTableColumnId =
  | 'empleado'
  | 'nombreApellidos'
  | 'calendario'
  | 'diasTeoricos'
  | 'ausencias'
  | 'deudaEntrante'
  | 'deudaPendiente'
  | 'ticketsFinales'
  | 'importeTicket'
  | 'total';

const TICKET_PEOPLE_TABLE_STORAGE_KEY = 'traccion.tableView.ticketRestaurante.people';
const TICKET_ABSENCES_TABLE_STORAGE_KEY = 'traccion.tableView.ticketRestaurante.absences';
const TICKET_MONTHLY_TABLE_STORAGE_KEY = 'traccion.tableView.ticketRestaurante.monthlyCalculation';
const TICKET_CONTRIBUTION_TABLE_STORAGE_KEY =
  'traccion.tableView.ticketRestaurante.contributionCalculation';

const defaultTicketPeopleTablePreferences: TableViewPreferences<TicketPeopleTableColumnId> = {
  sort: { columnId: 'empleado', direction: 'asc' },
  columnWidths: {
    empleado: 110,
    nombre: 150,
    apellido1: 150,
    apellido2: 150,
    dni: 110,
    puesto: 190,
    calendario: 160,
    estado: 90,
    actions: 104,
  },
};

const ticketPeopleTableColumnIds: TicketPeopleTableColumnId[] = [
  'empleado',
  'nombre',
  'apellido1',
  'apellido2',
  'dni',
  'puesto',
  'calendario',
  'estado',
  'actions',
];

const defaultTicketAbsencesTablePreferences: TableViewPreferences<TicketAbsencesTableColumnId> = {
  sort: { columnId: 'desde', direction: 'asc' },
  columnWidths: {
    empleado: 110,
    nombreApellidos: 230,
    desde: 115,
    hasta: 115,
    motivo: 170,
    calendario: 145,
    totalDias: 95,
    diasTicketMes: 110,
    afectaTicket: 105,
    actions: 82,
  },
};

const ticketAbsencesTableColumnIds: TicketAbsencesTableColumnId[] = [
  'empleado',
  'nombreApellidos',
  'desde',
  'hasta',
  'motivo',
  'calendario',
  'totalDias',
  'diasTicketMes',
  'afectaTicket',
  'actions',
];

type TicketAbsenceDisplayRow = TicketRestaurantAbsence & {
  calendario: string;
  diasTicketMes: number;
  descuentaTicket: boolean;
};

const defaultTicketCalculationTablePreferences: TableViewPreferences<TicketCalculationTableColumnId> =
  {
    sort: { columnId: 'nombreApellidos', direction: 'asc' },
    columnWidths: {
      empleado: 110,
      nombreApellidos: 230,
      calendario: 160,
      diasTeoricos: 110,
      ausencias: 130,
      deudaEntrante: 120,
      deudaPendiente: 125,
      ticketsFinales: 125,
      importeTicket: 115,
      total: 110,
    },
  };

const monthlyCalculationTableColumnIds: TicketCalculationTableColumnId[] = [
  'empleado',
  'nombreApellidos',
  'calendario',
  'diasTeoricos',
  'ausencias',
  'ticketsFinales',
  'importeTicket',
  'total',
];

const contributionCalculationTableColumnIds: TicketCalculationTableColumnId[] = [
  'empleado',
  'nombreApellidos',
  'calendario',
  'diasTeoricos',
  'ausencias',
  'deudaEntrante',
  'deudaPendiente',
  'ticketsFinales',
  'importeTicket',
  'total',
];

const WEEK_DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
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
  | 'ausencias';

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
        `${absence.motivo} ${formatIsoDateForExport(absence.desde)}-${formatIsoDateForExport(absence.hasta)}`,
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
  { key: 'hojaGastos', header: 'Hoja Gastos', value: () => '' },
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

function formatCurrency(value: number): string {
  return `${value.toFixed(2)} €`;
}

function normalizePlainText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function isoWeekday(fecha: string): number {
  const day = new Date(`${fecha}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function addDays(fecha: string, days: number): string {
  const date = new Date(`${fecha}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeTicketEmployeeNumberForMatch(value: string): string {
  return value
    .trim()
    .replace(/^0+(?=\d)/, '')
    .replace(/\.0$/, '');
}

function absenceDiscountsTicket(
  absence: TicketRestaurantAbsence,
  calendar: TicketCalendar | null,
  config: TicketRestaurantConfig,
): boolean {
  if (!calendar || !absence.afectaTicket) {
    return false;
  }

  const nonDiscountable = Object.entries(config.rules.nonDiscountableMotivesByCalendar).some(
    ([calendarName, motives]) =>
      normalizeTicketCalendarName(calendar.nombre) === normalizeTicketCalendarName(calendarName) &&
      motives.some((motivo) => normalizePlainText(absence.motivo) === normalizePlainText(motivo)),
  );

  if (nonDiscountable) {
    return false;
  }

  const noTicket = new Set(calendar.diasSinTicket);
  const ticketIsoWeekdays = new Set(calendar.ticketIsoWeekdays);
  let cursor = absence.desde;
  while (cursor <= absence.hasta) {
    if (ticketIsoWeekdays.has(isoWeekday(cursor)) && !noTicket.has(cursor)) {
      return true;
    }
    cursor = addDays(cursor, 1);
  }

  return false;
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
  const importPeople = useTicketRestauranteStore((state) => state.importPeople);
  const employees = useEmployeeStore((state) => state.employees);
  const loadEmployees = useEmployeeStore((state) => state.load);
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [activeSubview, setActiveSubview] = useState<TicketRestauranteSubview>('calendarios');
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
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [editingAbsenceId, setEditingAbsenceId] = useState<string | null>(null);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const peopleFileInputRef = useRef<HTMLInputElement | null>(null);
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
  const activeTicketEmployeeNumbers = useMemo(
    () =>
      new Set(
        people
          .filter((person) => person.activo && !person.deletedAt)
          .map((person) => normalizeTicketEmployeeNumberForMatch(person.empleado)),
      ),
    [people],
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
      ),
    [absences, calendars, calculationMonth, calculationYear, config, people],
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
      ),
    [absences, calendars, calculationMonth, calculationYear, config, people],
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

  const saveCalendar = () => {
    if (!calendarDraft.nombre.trim()) {
      return;
    }

    if (editingCalendarId) {
      updateCalendar(editingCalendarId, calendarDraft);
      setSelectedCalendarId(editingCalendarId);
    } else {
      const id = createCalendar(calendarDraft);
      setSelectedCalendarId(id);
    }
    resetForm();
  };

  const editCalendar = (calendar: TicketCalendar) => {
    setCalendarDraft(toCalendarDraft(calendar));
    setEditingCalendarId(calendar.id);
    setSelectedCalendarId(calendar.id);
  };

  const resetPersonForm = () => {
    setPersonDraft(EMPTY_TICKET_PERSON_DRAFT);
    setEditingPersonId(null);
  };

  const savePerson = () => {
    if (!personDraft.empleado.trim() || !personDraft.nombre.trim() || !personDraft.calendarId) {
      return;
    }

    upsertPerson(personDraft);
    resetPersonForm();
  };

  const editPerson = (person: TicketPerson) => {
    setPersonDraft(toPersonDraft(person));
    setEditingPersonId(person.empleado);
  };

  const removeCalendarAndPeople = (calendarId: string) => {
    const associatedPeople = visiblePeople.filter((person) => person.calendarId === calendarId);
    const calendarName =
      calendars.find((calendar) => calendar.id === calendarId)?.nombre ?? 'este calendario';

    if (associatedPeople.length > 0) {
      const confirmed = window.confirm(
        `El calendario "${calendarName}" tiene ${associatedPeople.length} persona(s) adscrita(s). ` +
          'Si continúas, se eliminarán también esas personas de Ticket Restaurante. ¿Continuar?',
      );

      if (!confirmed) {
        return;
      }
    } else if (!window.confirm(`¿Eliminar el calendario "${calendarName}"?`)) {
      return;
    }

    removeCalendar(calendarId);
  };

  const handleYearChange = (value: string) => {
    const parsedYear = Number(value);
    if (Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2200) {
      setYear(parsedYear);
    }
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

      const rowsWithTicketRight = rows.filter((row) =>
        activeTicketEmployeeNumbers.has(normalizeTicketEmployeeNumberForMatch(row.empleado)),
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

    const saveResult = importPeople(result.drafts);
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

  const savePreviewRows = () => {
    const currentAbsences = editingAbsenceId
      ? absences.filter((absence) => absence.id !== editingAbsenceId)
      : absences;
    const result = saveTicketRestaurantAbsencePreviewRows(currentAbsences, previewRows);
    if (result.errors.length > 0) {
      setPreviewRows(validateTicketRestaurantAbsencePreviewRows(previewRows));
      setImportMessage(result.errors.join(' '));
      return;
    }

    saveAbsences(result.absences);
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
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-metro-red">
            Ticket Restaurante
          </p>
          <h2 className="text-xl font-bold text-metro-text">Ticket Restaurante</h2>
          <p className="mt-0.5 text-sm text-metro-muted">
            Gestión anual de calendarios y ausencias de Ticket Restaurante.
          </p>
        </div>
      </div>

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
            onToggleActive={toggleCalendarActive}
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
                    onToggleDay={(fecha) => toggleDay(selectedCalendar.id, fecha)}
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
          onRemove={removePerson}
          onSave={savePerson}
          people={visiblePeople}
        />
      ) : activeSubview === 'computoMensual' ? (
        <CalculationPanel
          absences={absences}
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
              absences,
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
          absences={absences}
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
      ) : (
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
          onRemove={removeAbsence}
          onYearChange={handleAbsenceYearChange}
          year={absenceYear}
        />
      )}

      {isPriceModalOpen ? (
        <TicketPriceModal
          config={config}
          onClose={() => setIsPriceModalOpen(false)}
          onSave={(nextConfig) => {
            updateConfig(nextConfig);
            setIsPriceModalOpen(false);
          }}
        />
      ) : null}

      {isRulesModalOpen ? (
        <TicketRulesModal
          config={config}
          onClose={() => setIsRulesModalOpen(false)}
          onSave={(nextConfig) => {
            updateConfig(nextConfig);
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
    </section>
  );
}

function SubviewButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
        active
          ? 'bg-metro-red text-white'
          : 'border border-metro-border bg-metro-surface text-metro-text hover:border-metro-red'
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function CalendarToolbar({
  calendars,
  draft,
  editingCalendarId,
  onCancel,
  onChange,
  onEdit,
  onRemove,
  onSave,
  onToggleActive,
  onYearChange,
  selectedCalendar,
  selectedCalendarId,
  setSelectedCalendarId,
  setYear,
  year,
}: {
  calendars: TicketCalendar[];
  draft: TicketCalendarDraft;
  editingCalendarId: string | null;
  onCancel: () => void;
  onChange: (draft: TicketCalendarDraft) => void;
  onEdit: (calendar: TicketCalendar) => void;
  onRemove: (id: string) => void;
  onSave: () => void;
  onToggleActive: (id: string) => void;
  onYearChange: (value: string) => void;
  selectedCalendar: TicketCalendar | undefined;
  selectedCalendarId: string;
  setSelectedCalendarId: (id: string) => void;
  setYear: (year: number) => void;
  year: number;
}) {
  const selectedDays = draft.ticketIsoWeekdays ?? [1, 2, 3, 4, 5];

  return (
    <div className="mb-3 rounded-xl border border-metro-border bg-metro-panel p-2">
      <div className="grid gap-2 xl:grid-cols-[minmax(260px,0.85fr)_minmax(300px,0.9fr)_minmax(420px,1.25fr)]">
        <div className="rounded-lg border border-metro-border bg-metro-surface p-2">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-metro-muted">
            Selector calendario
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label="Selector calendario"
              className="h-8 min-w-[190px] flex-1 rounded-lg border border-metro-border bg-metro-surface px-2 text-sm font-semibold text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => setSelectedCalendarId(event.target.value)}
              value={selectedCalendarId}
            >
              {calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.nombre}
                  {calendar.activo ? '' : ' (inactivo)'}
                </option>
              ))}
            </select>
            <button
              aria-label="Año anterior"
              className="h-8 rounded-lg border border-metro-border p-1.5 text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedCalendar}
              onClick={() => setYear(previousCalendarYear(year))}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              aria-label="Selector año"
              className="h-8 w-20 rounded-lg border border-metro-border bg-metro-surface px-2 text-center text-sm font-semibold text-metro-text outline-none focus:border-metro-red"
              max="2200"
              min="1900"
              onChange={(event) => onYearChange(event.target.value)}
              type="number"
              value={year}
            />
            <button
              aria-label="Año posterior"
              className="h-8 rounded-lg border border-metro-border p-1.5 text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedCalendar}
              onClick={() => setYear(nextCalendarYear(year))}
              type="button"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-metro-border bg-metro-surface p-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-metro-muted">
              Acciones calendario
            </p>
            {selectedCalendar ? (
              <span className="rounded-full bg-metro-red/10 px-2 py-0.5 text-[11px] font-semibold text-metro-red">
                {selectedCalendar.activo ? 'Activo' : 'Inactivo'} ·{' '}
                {selectedCalendar.diasSinTicket.length} días
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-metro-red px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedCalendar}
              onClick={() => selectedCalendar && onEdit(selectedCalendar)}
              type="button"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </button>
            <button
              className="rounded-lg border border-metro-border px-2.5 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedCalendar}
              onClick={() => selectedCalendar && onToggleActive(selectedCalendar.id)}
              type="button"
            >
              {selectedCalendar?.activo ? 'Desactivar' : 'Activar'}
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-metro-border px-2.5 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedCalendar}
              onClick={() => selectedCalendar && onRemove(selectedCalendar.id)}
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-metro-border bg-metro-surface p-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-metro-muted">
              {editingCalendarId ? 'Editar calendario' : 'Crear calendario'}
            </p>
            {editingCalendarId ? (
              <button
                className="text-[11px] font-semibold text-metro-muted hover:text-metro-red"
                onClick={onCancel}
                type="button"
              >
                Cancelar edición
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              aria-label="Nombre calendario"
              className="h-8 min-w-[160px] flex-1 rounded-lg border border-metro-border bg-metro-surface px-2 text-sm text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => onChange({ ...draft, nombre: event.target.value })}
              placeholder="Nombre calendario"
              value={draft.nombre}
            />
            <label className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-metro-border px-2 text-xs font-semibold text-metro-text">
              <input
                checked={draft.activo}
                className="h-3.5 w-3.5 accent-metro-red"
                onChange={(event) => onChange({ ...draft, activo: event.target.checked })}
                type="checkbox"
              />
              Activo
            </label>
            <div className="flex h-8 items-center gap-1 rounded-lg border border-metro-border px-1.5">
              {WEEK_DAYS.map((label, index) => {
                const isoDay = index + 1;
                const checked = selectedDays.includes(isoDay);

                return (
                  <label
                    className={
                      checked
                        ? 'rounded-md bg-metro-red px-1.5 py-1 text-[11px] font-bold text-white'
                        : 'rounded-md px-1.5 py-1 text-[11px] font-bold text-metro-muted'
                    }
                    key={label}
                  >
                    <input
                      checked={checked}
                      className="sr-only"
                      onChange={(event) => {
                        const currentDays = new Set(selectedDays);
                        if (event.target.checked) currentDays.add(isoDay);
                        else currentDays.delete(isoDay);
                        onChange({
                          ...draft,
                          ticketIsoWeekdays: Array.from(currentDays).sort(
                            (first, second) => first - second,
                          ),
                        });
                      }}
                      type="checkbox"
                    />
                    {label}
                  </label>
                );
              })}
            </div>
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-metro-red px-3 text-xs font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!draft.nombre.trim()}
              onClick={onSave}
              type="button"
            >
              <Save className="h-3.5 w-3.5" />
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthCalendar({
  days,
  leadingBlanks,
  monthName,
  onToggleDay,
}: {
  days: CalendarDay[];
  leadingBlanks: number;
  monthName: string;
  onToggleDay: (fecha: string) => void;
}) {
  return (
    <div className="rounded-lg border border-metro-border bg-metro-surface p-2">
      <h4 className="mb-1.5 text-center text-xs font-bold uppercase tracking-wide text-metro-text">
        {monthName}
      </h4>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-bold text-metro-muted">
        {WEEK_DAYS.map((weekDay) => (
          <div key={weekDay}>{weekDay}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-0.5">
        {Array.from({ length: leadingBlanks }, (_, index) => (
          <div aria-hidden="true" key={`blank-${index}`} />
        ))}
        {days.map((day) => (
          <button
            aria-label={`${day.fecha}${day.sinTicket ? ' sin ticket' : ''}`}
            className={dayButtonClass(day)}
            key={day.fecha}
            onClick={() => onToggleDay(day.fecha)}
            title={day.fecha}
            type="button"
          >
            {day.diaMes}
          </button>
        ))}
      </div>
    </div>
  );
}

function dayButtonClass(day: CalendarDay): string {
  const base =
    'aspect-square rounded border text-[11px] font-semibold transition hover:border-metro-red focus:outline-none focus:ring-2 focus:ring-metro-red/50';

  if (day.sinTicket) {
    return `${base} border-metro-red bg-metro-red text-white`;
  }

  if (day.esFinDeSemana) {
    return `${base} border-metro-border bg-metro-panel text-metro-muted`;
  }

  return `${base} border-metro-border bg-metro-surface text-metro-text`;
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-metro-muted">
      <LegendItem className="border-metro-border bg-metro-surface" label="Día normal" />
      <LegendItem className="border-metro-border bg-metro-panel" label="Fin de semana" />
      <LegendItem className="border-metro-red bg-metro-red" label="Sin ticket" />
    </div>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2.5 w-2.5 rounded border ${className}`} />
      {label}
    </span>
  );
}

function EmptyCalendar() {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-metro-border bg-metro-surface p-6 text-center">
      <div>
        <CalendarDays className="mx-auto h-10 w-10 text-metro-muted" />
        <p className="mt-3 font-semibold text-metro-text">Sin calendario seleccionado</p>
        <p className="mt-1 text-sm text-metro-muted">Crea o selecciona un calendario.</p>
      </div>
    </div>
  );
}

function PeoplePanel({
  calendars,
  draft,
  editingPersonId,
  importMessage,
  onCancel,
  onChange,
  onEdit,
  exportPayload,
  onExportModel,
  onImport,
  onRemove,
  onSave,
  people,
}: {
  calendars: TicketCalendar[];
  draft: TicketPersonDraft;
  editingPersonId: string | null;
  importMessage: string;
  onCancel: () => void;
  onChange: (draft: TicketPersonDraft) => void;
  onEdit: (person: TicketPerson) => void;
  exportPayload: ExportTablePayload<TicketPerson>;
  onExportModel: () => void;
  onImport: () => void;
  onRemove: (empleado: string) => void;
  onSave: () => void;
  people: TicketPerson[];
}) {
  const canSave = draft.empleado.trim() && draft.nombre.trim() && draft.calendarId;
  const [isPersonFormOpen, setIsPersonFormOpen] = useState(Boolean(editingPersonId));

  useEffect(() => {
    if (editingPersonId) {
      setIsPersonFormOpen(true);
    }
  }, [editingPersonId]);

  const handleSavePerson = () => {
    onSave();
    setIsPersonFormOpen(false);
  };

  const handleCancelPerson = () => {
    onCancel();
    setIsPersonFormOpen(false);
  };

  const { preferences, setSort, setColumnWidth } =
    useTableViewPreferences<TicketPeopleTableColumnId>({
      storageKey: TICKET_PEOPLE_TABLE_STORAGE_KEY,
      defaultPreferences: defaultTicketPeopleTablePreferences,
      validColumnIds: ticketPeopleTableColumnIds,
    });
  const peopleColumns = useMemo<Array<DataTableColumn<TicketPerson, TicketPeopleTableColumnId>>>(
    () => [
      {
        id: 'empleado',
        header: 'Nº empleado',
        accessor: (person) => {
          const employeeNumber = Number(person.empleado.trim());
          return Number.isFinite(employeeNumber) ? employeeNumber : person.empleado;
        },
        render: (person) => person.empleado,
        width: 110,
        minWidth: 95,
        maxWidth: 170,
        sortable: true,
        className: 'font-semibold text-metro-text',
      },
      {
        id: 'nombre',
        header: 'Nombre',
        accessor: (person) => person.nombre,
        render: (person) => person.nombre,
        width: 150,
        minWidth: 120,
        maxWidth: 260,
        sortable: true,
        className: 'text-metro-text',
      },
      {
        id: 'apellido1',
        header: 'Apellido1',
        accessor: (person) => person.apellido1,
        render: (person) => person.apellido1,
        width: 150,
        minWidth: 120,
        maxWidth: 260,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'apellido2',
        header: 'Apellido2',
        accessor: (person) => person.apellido2,
        render: (person) => person.apellido2,
        width: 150,
        minWidth: 120,
        maxWidth: 260,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'dni',
        header: 'DNI',
        accessor: (person) => person.dni,
        render: (person) => person.dni,
        width: 110,
        minWidth: 90,
        maxWidth: 160,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'puesto',
        header: 'Puesto',
        accessor: (person) => person.puesto,
        render: (person) => person.puesto,
        width: 190,
        minWidth: 140,
        maxWidth: 360,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'calendario',
        header: 'Calendario',
        accessor: (person) =>
          calendars.find((calendar) => calendar.id === person.calendarId)?.nombre ?? '',
        render: (person) =>
          calendars.find((calendar) => calendar.id === person.calendarId)?.nombre ??
          'Sin calendario',
        width: 160,
        minWidth: 130,
        maxWidth: 280,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'estado',
        header: 'Estado',
        accessor: (person) => (person.activo ? 'Activo' : 'Inactivo'),
        render: (person) => (person.activo ? 'Activo' : 'Inactivo'),
        width: 90,
        minWidth: 80,
        maxWidth: 130,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'actions',
        header: 'Acciones',
        render: (person) => (
          <div className="flex justify-end gap-1.5">
            <button
              className="rounded-md border border-metro-border px-2 py-1 text-[11px] font-semibold text-metro-text hover:border-metro-red"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(person);
              }}
              type="button"
            >
              Editar
            </button>
            <button
              className="rounded-md border border-metro-border p-1 text-metro-text hover:border-metro-red"
              onClick={(event) => {
                event.stopPropagation();
                if (window.confirm(`¿Eliminar la persona con Nº empleado ${person.empleado}?`)) {
                  onRemove(person.empleado);
                }
              }}
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
        width: 104,
        minWidth: 96,
        maxWidth: 140,
        resizable: false,
        isActionColumn: true,
      },
    ],
    [calendars, onEdit, onRemove],
  );

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-metro-border bg-metro-panel p-2.5">
        <button
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-left text-sm font-bold text-metro-text hover:border-metro-red"
          onClick={() => setIsPersonFormOpen((isOpen) => !isOpen)}
          type="button"
        >
          <span>{editingPersonId ? 'Editar persona Ticket' : 'Añadir persona Ticket'}</span>
          <span className="text-xs font-semibold text-metro-muted">
            {isPersonFormOpen ? 'Ocultar' : 'Abrir'}
          </span>
        </button>
        {isPersonFormOpen ? (
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <label className="block text-xs font-semibold text-metro-text">
              Nº empleado
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => onChange({ ...draft, empleado: event.target.value })}
                value={draft.empleado}
              />
            </label>
            <label className="block text-xs font-semibold text-metro-text">
              Nombre
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => onChange({ ...draft, nombre: event.target.value })}
                value={draft.nombre}
              />
            </label>
            <label className="block text-xs font-semibold text-metro-text">
              Apellido 1
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => onChange({ ...draft, apellido1: event.target.value })}
                value={draft.apellido1}
              />
            </label>
            <label className="block text-xs font-semibold text-metro-text">
              Apellido 2
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => onChange({ ...draft, apellido2: event.target.value })}
                value={draft.apellido2}
              />
            </label>
            <label className="block text-xs font-semibold text-metro-text">
              DNI
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => onChange({ ...draft, dni: event.target.value })}
                value={draft.dni}
              />
            </label>
            <label className="block text-xs font-semibold text-metro-text">
              Puesto
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => onChange({ ...draft, puesto: event.target.value })}
                value={draft.puesto}
              />
            </label>
            <label className="block text-xs font-semibold text-metro-text">
              Calendario
              <select
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => onChange({ ...draft, calendarId: event.target.value })}
                value={draft.calendarId}
              >
                <option value="">Seleccionar calendario</option>
                {calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-metro-text">
              <input
                checked={draft.activo}
                className="h-3.5 w-3.5 accent-metro-red"
                onChange={(event) => onChange({ ...draft, activo: event.target.checked })}
                type="checkbox"
              />
              Activo
            </label>
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-lg bg-metro-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canSave}
                onClick={handleSavePerson}
                type="button"
              >
                Guardar
              </button>
              {editingPersonId ? (
                <button
                  className="rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
                  onClick={handleCancelPerson}
                  type="button"
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <div className="rounded-xl border border-metro-border bg-metro-panel p-2.5">
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-metro-text">Personas con derecho a ticket</h3>
            {importMessage ? (
              <p className="mt-1 max-w-2xl text-xs text-metro-muted">{importMessage}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExportPrintButtons payload={exportPayload} />
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
              onClick={onExportModel}
              type="button"
            >
              <FileDown className="h-3.5 w-3.5" />
              Modelo personas
            </button>

            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-metro-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark"
              onClick={onImport}
              type="button"
            >
              <FileUp className="h-3.5 w-3.5" />
              Importar personas
            </button>
            <span className="rounded-full bg-metro-red/10 px-2 py-0.5 text-xs font-semibold text-metro-red">
              {people.length}
            </span>
          </div>
        </div>
        <DataTable
          ariaLabel="Personas con derecho a ticket"
          columnWidths={preferences.columnWidths}
          columns={peopleColumns}
          emptyMessage="Añade personas manualmente para poder calcular tickets."
          getRowId={(person) => person.empleado}
          maxHeightClassName="max-h-[420px]"
          onColumnWidthChange={setColumnWidth}
          onRowClick={onEdit}
          onSortChange={setSort}
          rows={people}
          sort={preferences.sort}
        />
      </div>
    </div>
  );
}

function MonthNavigator({
  ariaLabel,
  month,
  onMonthChange,
  onNextMonth,
  onPreviousMonth,
  onYearChange,
  year,
}: {
  ariaLabel: string;
  month: number;
  onMonthChange: (value: string) => void;
  onNextMonth: () => void;
  onPreviousMonth: () => void;
  onYearChange: (value: string) => void;
  year: number;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-metro-border bg-metro-surface p-1">
      <button
        aria-label="Mes anterior"
        className="rounded-md border border-metro-border p-1 text-metro-text hover:border-metro-red"
        onClick={onPreviousMonth}
        type="button"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <select
        aria-label={ariaLabel}
        className="h-8 rounded-md border border-metro-border bg-metro-surface px-2 text-sm font-semibold text-metro-text outline-none focus:border-metro-red"
        onChange={(event) => onMonthChange(event.target.value)}
        value={month}
      >
        {MONTH_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        aria-label={`${ariaLabel} año`}
        className="h-8 w-20 rounded-md border border-metro-border bg-metro-surface px-2 text-center text-sm font-semibold text-metro-text outline-none focus:border-metro-red"
        max="2200"
        min="1900"
        onChange={(event) => onYearChange(event.target.value)}
        type="number"
        value={year}
      />
      <button
        aria-label="Mes posterior"
        className="rounded-md border border-metro-border p-1 text-metro-text hover:border-metro-red"
        onClick={onNextMonth}
        type="button"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function TicketPriceModal({
  config,
  onClose,
  onSave,
}: {
  config: TicketRestaurantConfig;
  onClose: () => void;
  onSave: (config: TicketRestaurantConfig) => void;
}) {
  const normalizedConfig = normalizeTicketRestaurantConfig(config);
  const latestPrice = normalizedConfig.priceHistory.at(-1) ?? normalizedConfig.priceHistory[0];
  const [amount, setAmount] = useState(
    String(latestPrice?.amount ?? normalizedConfig.importeTicket),
  );
  const [effectiveFrom, setEffectiveFrom] = useState(latestPrice?.effectiveFrom ?? '2026-03-01');
  const parsedAmount = Number(amount.replace(',', '.'));
  const canSave =
    Number.isFinite(parsedAmount) && parsedAmount >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom);

  const savePrice = () => {
    if (!canSave) return;
    const nextHistory = [
      ...normalizedConfig.priceHistory.filter((entry) => entry.effectiveFrom !== effectiveFrom),
      { amount: parsedAmount, effectiveFrom },
    ].sort((first, second) => first.effectiveFrom.localeCompare(second.effectiveFrom));

    onSave(
      normalizeTicketRestaurantConfig({
        ...normalizedConfig,
        importeTicket: nextHistory.at(-1)?.amount ?? parsedAmount,
        priceHistory: nextHistory,
      }),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-metro-border bg-metro-surface shadow-card">
        <div className="border-b border-metro-border p-3">
          <h3 className="text-lg font-bold text-metro-text">Precio ticket</h3>
          <p className="text-xs text-metro-muted">
            El cálculo usa el último precio cuya fecha de inicio sea anterior o igual al mes
            calculado.
          </p>
        </div>
        <div className="space-y-3 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-metro-text">
              Importe ticket
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                min="0"
                onChange={(event) => setAmount(event.target.value)}
                step="0.01"
                type="number"
                value={amount}
              />
            </label>
            <label className="block text-xs font-semibold text-metro-text">
              Vigente desde
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => setEffectiveFrom(event.target.value)}
                type="date"
                value={effectiveFrom}
              />
            </label>
          </div>
          <div className="rounded-xl border border-metro-border bg-metro-panel p-2">
            <p className="mb-1 text-xs font-bold text-metro-text">Histórico de precios</p>
            <div className="max-h-32 overflow-auto text-xs text-metro-muted">
              {normalizedConfig.priceHistory.map((entry) => (
                <p key={entry.effectiveFrom}>
                  {entry.effectiveFrom}:{' '}
                  <span className="font-semibold text-metro-text">
                    {formatCurrency(entry.amount)}
                  </span>
                </p>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-metro-border p-3">
          <button
            className="rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="rounded-lg bg-metro-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSave}
            onClick={savePrice}
            type="button"
          >
            Guardar precio
          </button>
        </div>
      </div>
    </div>
  );
}

function TicketRulesModal({
  config,
  onClose,
  onSave,
}: {
  config: TicketRestaurantConfig;
  onClose: () => void;
  onSave: (config: TicketRestaurantConfig) => void;
}) {
  const normalizedConfig = normalizeTicketRestaurantConfig(config);
  const [debtStartDate, setDebtStartDate] = useState(normalizedConfig.rules.debtStartDate);
  const [nonDiscountableRulesText, setNonDiscountableRulesText] = useState(
    Object.entries(normalizedConfig.rules.nonDiscountableMotivesByCalendar)
      .map(([calendar, motives]) => `${calendar}: ${motives.join(', ')}`)
      .join('\n'),
  );

  const parseNonDiscountableRules = (): Record<string, string[]> =>
    Object.fromEntries(
      nonDiscountableRulesText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line): [string, string[]] => {
          const [calendar = '', motives = ''] = line.split(':');
          return [
            calendar.trim(),
            motives
              .split(',')
              .map((motivo) => motivo.trim())
              .filter(Boolean),
          ];
        })
        .filter(([calendar]) => Boolean(calendar)),
    );

  const saveRules = () => {
    onSave(
      normalizeTicketRestaurantConfig({
        ...normalizedConfig,
        rules: {
          debtStartDate,
          noOrderMonths: [],
          nonDiscountableMotivesByCalendar: parseNonDiscountableRules(),
          applyDebtAtClosedMonth: true,
        },
      }),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-metro-border bg-metro-surface shadow-card">
        <div className="border-b border-metro-border p-3">
          <h3 className="text-lg font-bold text-metro-text">Reglas de cálculo</h3>
          <p className="text-xs text-metro-muted">
            Parámetros mínimos del módulo. Los días sin pedido se gestionan marcando días sin ticket
            en cada calendario.
          </p>
        </div>
        <div className="max-h-[70vh] space-y-3 overflow-auto p-3">
          <label className="block text-xs font-semibold text-metro-text">
            Fecha inicio cómputo deuda
            <input
              className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => setDebtStartDate(event.target.value)}
              type="date"
              value={debtStartDate}
            />
          </label>

          <label className="block text-xs font-semibold text-metro-text">
            Motivos que no descuentan por calendario
            <textarea
              className="mt-1 h-20 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => setNonDiscountableRulesText(event.target.value)}
              value={nonDiscountableRulesText}
            />
            <span className="mt-1 block text-[11px] text-metro-muted">
              Formato: Calendario: motivo1, motivo2. Ejemplo: Liberados: SIN
            </span>
          </label>

          <div className="rounded-xl border border-metro-border bg-metro-panel p-3 text-xs text-metro-muted">
            <p className="mb-1 font-bold text-metro-text">Cómo calcula el cómputo mensual</p>
            <p>
              Cómputo mensual = lógica antigua: aplica a mes vencido la deuda de ausencias
              anteriores desde la fecha de inicio. No descuenta ausencias del propio mes; las deja
              para el siguiente mes con días de calendario disponibles.
            </p>
            <p className="mb-1 mt-3 font-bold text-metro-text">
              Cómo calcula el cómputo de cotización
            </p>
            <p>
              Cómputo cotización = días con derecho del calendario del mes seleccionado menos
              ausencias del propio mes que descuentan ticket. No arrastra deuda pendiente.
            </p>
            <p className="mt-3 font-semibold text-metro-text">
              Aplicar deuda a mes vencido: Sí, fijo.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-metro-border p-3">
          <button
            className="rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="rounded-lg bg-metro-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark"
            onClick={saveRules}
            type="button"
          >
            Guardar reglas
          </button>
        </div>
      </div>
    </div>
  );
}

function CalculationPanel({
  absences,
  calendars,
  calculation,
  config,
  mode,
  month,
  exportPayload,
  onMonthChange,
  onNextMonth,
  onPreviousMonth,
  onYearChange,
  year,
}: {
  absences: TicketRestaurantAbsence[];
  calendars: TicketCalendar[];
  calculation: ReturnType<typeof calculateMonthlyTicketOrder>;
  config: TicketRestaurantConfig;
  mode: 'monthly' | 'contribution';
  month: number;
  exportPayload: ExportTablePayload<TicketPersonCalculation>;
  onMonthChange: (value: string) => void;
  onNextMonth: () => void;
  onPreviousMonth: () => void;
  onYearChange: (value: string) => void;
  year: number;
}) {
  const [selectedDetailRow, setSelectedDetailRow] = useState<TicketPersonCalculation | null>(null);
  const validColumnIds =
    mode === 'monthly' ? monthlyCalculationTableColumnIds : contributionCalculationTableColumnIds;
  const { preferences, setSort, setColumnWidth } =
    useTableViewPreferences<TicketCalculationTableColumnId>({
      storageKey:
        mode === 'monthly'
          ? TICKET_MONTHLY_TABLE_STORAGE_KEY
          : TICKET_CONTRIBUTION_TABLE_STORAGE_KEY,
      defaultPreferences: defaultTicketCalculationTablePreferences,
      validColumnIds,
    });

  const effectiveTicketPrice = getEffectiveTicketPrice(config, year, month);
  const calculationColumns = useMemo<
    Array<DataTableColumn<TicketPersonCalculation, TicketCalculationTableColumnId>>
  >(() => {
    const baseColumns: Array<
      DataTableColumn<TicketPersonCalculation, TicketCalculationTableColumnId>
    > = [
      {
        id: 'empleado',
        header: 'Nº empleado',
        accessor: (row) => {
          const employeeNumber = Number(row.empleado.trim());
          return Number.isFinite(employeeNumber) ? employeeNumber : row.empleado;
        },
        render: (row) => row.empleado,
        width: 110,
        minWidth: 95,
        maxWidth: 170,
        sortable: true,
        className: 'font-semibold text-metro-text',
      },
      {
        id: 'nombreApellidos',
        header: 'Nombre y apellidos',
        accessor: (row) => row.nombreApellidos,
        render: (row) => row.nombreApellidos,
        width: 230,
        minWidth: 170,
        maxWidth: 420,
        sortable: true,
        className: 'font-semibold text-metro-text',
      },
      {
        id: 'calendario',
        header: 'Calendario',
        accessor: (row) => row.calendario,
        render: (row) => row.calendario,
        width: 160,
        minWidth: 125,
        maxWidth: 280,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'diasTeoricos',
        header: 'Días teóricos',
        accessor: (row) => row.diasTeoricos,
        render: (row) => row.diasTeoricos,
        width: 110,
        minWidth: 95,
        maxWidth: 155,
        sortable: true,
        className: 'text-right text-metro-muted',
        headerClassName: 'text-right',
      },
      {
        id: 'ausencias',
        header: mode === 'monthly' ? 'Ausencias aplicadas' : 'Ausencias mes',
        accessor: (row) => (mode === 'monthly' ? row.ausenciasAplicadas : row.ausenciasMes),
        render: (row) => (mode === 'monthly' ? row.ausenciasAplicadas : row.ausenciasMes),
        width: 130,
        minWidth: 105,
        maxWidth: 190,
        sortable: true,
        className: 'text-right text-metro-muted',
        headerClassName: 'text-right',
      },
    ];

    if (mode === 'monthly') {
      baseColumns.push(
        {
          id: 'deudaEntrante',
          header: 'Deuda entrante',
          accessor: (row) => row.deudaEntrante,
          render: (row) => row.deudaEntrante,
          width: 120,
          minWidth: 105,
          maxWidth: 175,
          sortable: true,
          className: 'text-right text-metro-muted',
          headerClassName: 'text-right',
        },
        {
          id: 'deudaPendiente',
          header: 'Deuda pendiente',
          accessor: (row) => row.deudaPendiente,
          render: (row) => row.deudaPendiente,
          width: 125,
          minWidth: 110,
          maxWidth: 180,
          sortable: true,
          className: 'text-right text-metro-muted',
          headerClassName: 'text-right',
        },
      );
    }

    baseColumns.push(
      {
        id: 'ticketsFinales',
        header: mode === 'monthly' ? 'Tickets a pedir' : 'Tickets cotización',
        accessor: (row) => row.ticketsFinales,
        render: (row) => row.ticketsFinales,
        width: 125,
        minWidth: 110,
        maxWidth: 180,
        sortable: true,
        className: 'text-right font-semibold text-metro-text',
        headerClassName: 'text-right',
      },
      {
        id: 'importeTicket',
        header: 'Importe ticket',
        accessor: () => effectiveTicketPrice,
        render: () => formatCurrency(effectiveTicketPrice),
        width: 115,
        minWidth: 100,
        maxWidth: 165,
        sortable: true,
        className: 'text-right text-metro-muted',
        headerClassName: 'text-right',
      },
      {
        id: 'total',
        header: 'Total',
        accessor: (row) => row.importe,
        render: (row) => formatCurrency(row.importe),
        width: 110,
        minWidth: 95,
        maxWidth: 160,
        sortable: true,
        className: 'text-right font-semibold text-metro-text',
        headerClassName: 'text-right',
      },
    );

    return baseColumns;
  }, [effectiveTicketPrice, mode]);

  return (
    <div className="rounded-xl border border-metro-border bg-metro-panel p-2.5">
      <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-metro-text">
            <Calculator className="h-4 w-4 text-metro-red" />
            {mode === 'monthly' ? 'Cómputo mensual' : 'Cómputo cotización'}
          </h3>
          <p className="text-xs text-metro-muted">
            {mode === 'monthly'
              ? 'Calcula los tickets a pedir con lógica antigua: deuda de ausencias anteriores aplicada a mes vencido.'
              : 'Calcula días con derecho del mes menos ausencias del propio mes, sin arrastre de deuda.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthNavigator
            ariaLabel="Selector mes cálculo"
            month={month}
            onMonthChange={onMonthChange}
            onNextMonth={onNextMonth}
            onPreviousMonth={onPreviousMonth}
            onYearChange={onYearChange}
            year={year}
          />
          <ExportPrintButtons payload={exportPayload} />
        </div>
      </div>
      <DataTable
        ariaLabel={
          mode === 'monthly'
            ? 'Cómputo mensual Ticket Restaurante'
            : 'Cómputo cotización Ticket Restaurante'
        }
        columnWidths={preferences.columnWidths}
        columns={calculationColumns}
        emptyMessage="No hay personas activas para calcular."
        getRowId={(row) => row.empleado}
        maxHeightClassName="max-h-[460px]"
        onColumnWidthChange={setColumnWidth}
        onRowClick={(row) => setSelectedDetailRow(row)}
        onSortChange={setSort}
        rows={calculation.rows}
        sort={preferences.sort}
      />
      {selectedDetailRow ? (
        <CalculationAbsenceDetailModal
          absences={absences}
          calendars={calendars}
          config={config}
          mode={mode}
          onClose={() => setSelectedDetailRow(null)}
          row={selectedDetailRow}
        />
      ) : null}
    </div>
  );
}

function CalculationAbsenceDetailModal({
  absences,
  calendars,
  config,
  mode,
  onClose,
  row,
}: {
  absences: TicketRestaurantAbsence[];
  calendars: TicketCalendar[];
  config: TicketRestaurantConfig;
  mode: 'monthly' | 'contribution';
  onClose: () => void;
  row: TicketPersonCalculation;
}) {
  const calendar = calendars.find((item) => item.nombre === row.calendario) ?? null;
  const detailAbsences = row.ausenciaIds
    .map((absenceId) => absences.find((absence) => absence.id === absenceId))
    .filter((absence): absence is TicketRestaurantAbsence => Boolean(absence));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-metro-border bg-metro-surface shadow-card">
        <div className="flex items-center justify-between border-b border-metro-border p-3">
          <div>
            <h3 className="text-lg font-bold text-metro-text">Detalle de ausencias</h3>
            <p className="text-xs text-metro-muted">
              {row.empleado} · {row.nombreApellidos} ·{' '}
              {mode === 'monthly' ? 'Cómputo mensual' : 'Cómputo cotización'}
            </p>
          </div>
          <button
            className="rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
            onClick={onClose}
            type="button"
          >
            Cerrar
          </button>
        </div>
        <div className="max-h-[68vh] overflow-auto p-3">
          {detailAbsences.length > 0 ? (
            <table className="min-w-full text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wide text-metro-muted">
                <tr>
                  <th className="px-2 py-1">Desde</th>
                  <th className="px-2 py-1">Hasta</th>
                  <th className="px-2 py-1">Motivo</th>
                  <th className="px-2 py-1 text-right">Total días</th>
                  <th className="px-2 py-1">Afecta ticket</th>
                  <th className="px-2 py-1">Descuenta ticket</th>
                </tr>
              </thead>
              <tbody className="text-metro-text [&>tr:nth-child(even)]:bg-metro-panel/45">
                {detailAbsences.map((absence) => (
                  <tr key={absence.id}>
                    <td className="px-2 py-1">{absence.desde}</td>
                    <td className="px-2 py-1">{absence.hasta}</td>
                    <td className="px-2 py-1">{absence.motivo}</td>
                    <td className="px-2 py-1 text-right">{absence.totalDias}</td>
                    <td className="px-2 py-1">{absence.afectaTicket ? 'Sí' : 'No'}</td>
                    <td className="px-2 py-1 font-semibold">
                      {absenceDiscountsTicket(absence, calendar, config) ? 'Sí' : 'No'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="rounded-xl border border-dashed border-metro-border bg-metro-panel p-6 text-center text-sm font-semibold text-metro-muted">
              No hay ausencias vinculadas a esta persona en el cómputo seleccionado.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AbsencesTable({
  absences,
  exportPayload,
  importMessage,
  month,
  onEdit,
  onExportModel,
  onImport,
  onMonthChange,
  onNextMonth,
  onPreviousMonth,
  onRemove,
  onYearChange,
  year,
}: {
  absences: TicketAbsenceDisplayRow[];
  exportPayload: ExportTablePayload<TicketAbsenceDisplayRow>;
  importMessage: string;
  month: number;
  onEdit: (absence: TicketRestaurantAbsence) => void;
  onExportModel: () => void;
  onImport: () => void;
  onMonthChange: (value: string) => void;
  onNextMonth: () => void;
  onPreviousMonth: () => void;
  onRemove: (id: string) => void;
  onYearChange: (value: string) => void;
  year: number;
}) {
  const { preferences, setSort, setColumnWidth } =
    useTableViewPreferences<TicketAbsencesTableColumnId>({
      storageKey: TICKET_ABSENCES_TABLE_STORAGE_KEY,
      defaultPreferences: defaultTicketAbsencesTablePreferences,
      validColumnIds: ticketAbsencesTableColumnIds,
    });
  const absenceColumns = useMemo<
    Array<DataTableColumn<TicketAbsenceDisplayRow, TicketAbsencesTableColumnId>>
  >(
    () => [
      {
        id: 'empleado',
        header: 'Nº empleado',
        accessor: (absence) => {
          const employeeNumber = Number(absence.empleado.trim());
          return Number.isFinite(employeeNumber) ? employeeNumber : absence.empleado;
        },
        render: (absence) => absence.empleado,
        width: 110,
        minWidth: 95,
        maxWidth: 170,
        sortable: true,
        className: 'font-semibold text-metro-text',
      },
      {
        id: 'nombreApellidos',
        header: 'Nombre y apellidos',
        accessor: (absence) => absence.nombreApellidos,
        render: (absence) => absence.nombreApellidos,
        width: 230,
        minWidth: 170,
        maxWidth: 420,
        sortable: true,
        className: 'text-metro-text',
      },
      {
        id: 'desde',
        header: 'Desde',
        accessor: (absence) => absence.desde,
        render: (absence) => absence.desde,
        width: 115,
        minWidth: 95,
        maxWidth: 170,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'hasta',
        header: 'Hasta',
        accessor: (absence) => absence.hasta,
        render: (absence) => absence.hasta,
        width: 115,
        minWidth: 95,
        maxWidth: 170,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'motivo',
        header: 'Motivo',
        accessor: (absence) => absence.motivo,
        render: (absence) => absence.motivo,
        width: 170,
        minWidth: 130,
        maxWidth: 320,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'calendario',
        header: 'Calendario',
        accessor: (absence) => absence.calendario,
        render: (absence) => absence.calendario,
        width: 145,
        minWidth: 120,
        maxWidth: 240,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'totalDias',
        header: 'Días naturales',
        accessor: (absence) => absence.totalDias,
        render: (absence) => absence.totalDias,
        width: 95,
        minWidth: 85,
        maxWidth: 135,
        sortable: true,
        className: 'text-right text-metro-muted',
      },
      {
        id: 'diasTicketMes',
        header: 'Días ticket mes',
        accessor: (absence) => absence.diasTicketMes,
        render: (absence) => absence.diasTicketMes,
        width: 110,
        minWidth: 95,
        maxWidth: 150,
        sortable: true,
        className: 'text-right font-semibold text-metro-text',
      },
      {
        id: 'afectaTicket',
        header: 'Afecta ticket',
        accessor: (absence) => (absence.afectaTicket ? 'Sí' : 'No'),
        render: (absence) => (absence.afectaTicket ? 'Sí' : 'No'),
        width: 105,
        minWidth: 95,
        maxWidth: 150,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'actions',
        header: 'Acciones',
        render: (absence) => (
          <button
            className="rounded-md border border-metro-border p-1 text-metro-text hover:border-metro-red"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(absence.id);
            }}
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ),
        width: 82,
        minWidth: 74,
        maxWidth: 110,
        resizable: false,
        isActionColumn: true,
      },
    ],
    [onRemove],
  );

  return (
    <div className="rounded-xl border border-metro-border bg-metro-panel p-2.5">
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-base font-bold text-metro-text">Ausencias</h3>
          <p className="text-xs text-metro-muted">
            Importa, revisa y filtra ausencias por mes. Días ticket mes ya descuenta calendario,
            fines de semana y días sin ticket.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1.5 lg:items-end">
          <div className="flex flex-wrap gap-2">
            <ExportPrintButtons payload={exportPayload} />
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
              onClick={onExportModel}
              type="button"
            >
              <FileDown className="h-3.5 w-3.5" />
              Modelo ausencias
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-metro-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark"
              onClick={onImport}
              type="button"
            >
              <FileUp className="h-3.5 w-3.5" />
              Importar ausencias
            </button>
          </div>
          {importMessage ? (
            <p className="max-w-sm text-xs text-metro-muted">{importMessage}</p>
          ) : null}
        </div>
      </div>
      <div className="mb-2 flex flex-col gap-2 rounded-lg border border-metro-border bg-metro-surface p-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs font-semibold text-metro-muted">
          Ausencias del mes seleccionado: <span className="text-metro-red">{absences.length}</span>
        </div>
        <MonthNavigator
          ariaLabel="Selector mes ausencias"
          month={month}
          onMonthChange={onMonthChange}
          onNextMonth={onNextMonth}
          onPreviousMonth={onPreviousMonth}
          onYearChange={onYearChange}
          year={year}
        />
      </div>
      <DataTable
        ariaLabel="Ausencias Ticket Restaurante"
        columnWidths={preferences.columnWidths}
        columns={absenceColumns}
        emptyMessage="No hay ausencias guardadas."
        getRowId={(absence) => absence.id}
        maxHeightClassName="max-h-[420px]"
        onColumnWidthChange={setColumnWidth}
        onRowClick={onEdit}
        onSortChange={setSort}
        rows={absences}
        sort={preferences.sort}
      />
    </div>
  );
}

function AbsencePreviewModal({
  onAdd,
  onCancel,
  onChange,
  onRemove,
  onSave,
  rows,
}: {
  onAdd: () => void;
  onCancel: () => void;
  onChange: (
    rowId: string,
    field: keyof Omit<TicketRestaurantAbsencePreviewRow, 'id' | 'errors'>,
    value: string | boolean,
  ) => void;
  onRemove: (rowId: string) => void;
  onSave: () => void;
  rows: TicketRestaurantAbsencePreviewRow[];
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-metro-border bg-metro-surface shadow-card">
        <div className="flex items-center justify-between border-b border-metro-border p-3">
          <div>
            <h3 className="text-lg font-bold text-metro-text">Revisar ausencias importadas</h3>
            <p className="text-xs text-metro-muted">
              Edita, añade o elimina filas antes de guardar.
            </p>
          </div>
          <button
            className="rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
            onClick={onAdd}
            type="button"
          >
            Añadir ausencia manual
          </button>
        </div>
        <div className="max-h-[65vh] overflow-auto p-3">
          <table className="min-w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wide text-metro-muted">
              <tr>
                <th className="px-1 py-1">Nº empleado</th>
                <th className="px-1 py-1">Nombre y apellidos</th>
                <th className="px-1 py-1">Desde</th>
                <th className="px-1 py-1">Hasta</th>
                <th className="px-1 py-1">Motivo</th>
                <th className="px-1 py-1">Total días</th>
                <th className="px-1 py-1">Afecta ticket</th>
                <th className="px-1 py-1">Acciones</th>
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(even)]:bg-metro-panel/45 [&>tr:hover]:bg-metro-red/10">
              {rows.map((row) => (
                <tr className={row.errors.length > 0 ? 'bg-metro-red/10' : ''} key={row.id}>
                  <PreviewInput field="empleado" onChange={onChange} row={row} />
                  <PreviewInput field="nombreApellidos" onChange={onChange} row={row} />
                  <PreviewInput field="desde" onChange={onChange} row={row} type="date" />
                  <PreviewInput field="hasta" onChange={onChange} row={row} type="date" />
                  <PreviewInput field="motivo" onChange={onChange} row={row} />
                  <PreviewInput field="totalDias" onChange={onChange} row={row} type="number" />
                  <td className="px-1 py-1 align-top text-center">
                    <input
                      checked={row.afectaTicket}
                      className="h-4 w-4 accent-metro-red"
                      onChange={(event) => onChange(row.id, 'afectaTicket', event.target.checked)}
                      type="checkbox"
                    />
                  </td>
                  <td className="px-1 py-1 align-top">
                    <button
                      className="rounded-md border border-metro-border p-1 text-metro-text hover:border-metro-red"
                      onClick={() => onRemove(row.id)}
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    {row.errors.length > 0 ? (
                      <p className="mt-1 max-w-48 text-[11px] text-metro-red">
                        {row.errors.join(' ')}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 border-t border-metro-border p-3">
          <button
            className="rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
            onClick={onCancel}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="rounded-lg bg-metro-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark"
            onClick={onSave}
            type="button"
          >
            Guardar ausencias
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewInput({
  field,
  onChange,
  row,
  type = 'text',
}: {
  field: keyof Omit<TicketRestaurantAbsencePreviewRow, 'id' | 'errors' | 'afectaTicket'>;
  onChange: (
    rowId: string,
    field: keyof Omit<TicketRestaurantAbsencePreviewRow, 'id' | 'errors'>,
    value: string | boolean,
  ) => void;
  row: TicketRestaurantAbsencePreviewRow;
  type?: string;
}) {
  return (
    <td className="px-1 py-1 align-top">
      <input
        className="w-full min-w-28 rounded-lg border border-metro-border bg-metro-surface px-2 py-1 text-xs text-metro-text outline-none focus:border-metro-red"
        onChange={(event) => onChange(row.id, field, event.target.value)}
        type={type}
        value={String(row[field])}
      />
    </td>
  );
}

function formatSaveSummary(result: TicketRestaurantAbsenceSaveResult): string {
  return `Ausencias guardadas: ${result.summary.nuevas} nuevas, ${result.summary.sustituidas} sustituidas, ${result.summary.duplicadas} duplicadas ignoradas, ${result.summary.invalidas} inválidas.`;
}

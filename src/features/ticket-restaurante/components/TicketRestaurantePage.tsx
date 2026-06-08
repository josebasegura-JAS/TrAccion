import { CalendarDays, Euro, Settings } from 'lucide-react';
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
  
  
  
  visibleTicketCalendars,
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
import type { ExportColumn } from '../../../shared/export/types';
import {
  AbsencePreviewModal,
  AbsencesTable,
  CalendarToolbar,
  CalculationPanel,
  EmptyCalendar,
  Legend,
  MonthCalendar,
  PeoplePanel,
  SubviewButton,
  TicketPriceModal,
  TicketRulesModal,
} from './TicketRestaurantePanels';

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

type TicketAbsenceDisplayRow = TicketRestaurantAbsence & {
  calendario: string;
  diasTicketMes: number;
  descuentaTicket: boolean;
};

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


function formatSaveSummary(result: TicketRestaurantAbsenceSaveResult): string {
  const parts = [
    `${result.inserted} nuevas`,
    `${result.updated} actualizadas`,
    `${result.skippedDuplicates} duplicadas omitidas`,
  ];
  if (result.skippedBeforeCutoff > 0) {
    parts.push(`${result.skippedBeforeCutoff} anteriores a marzo 2026 omitidas`);
  }
  return `Ausencias guardadas: ${parts.join(', ')}.`;
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


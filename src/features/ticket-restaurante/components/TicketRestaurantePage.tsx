import {
  CalendarDays,
  Calculator,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileUp,
  Pencil,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  buildYearCalendar,
  calculateMonthlyTicketOrder,
  calculateTicketContribution,
  EMPTY_TICKET_CALENDAR_DRAFT,
  EMPTY_TICKET_PERSON_DRAFT,
  filterTicketRestaurantAbsencesByMonth,
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

const monthlyCalculationExportColumns = (
  importeTicket: number,
): ExportColumn<TicketPersonCalculation>[] => [
  { key: 'empleado', header: 'Nº empleado', value: (row) => row.empleado },
  { key: 'nombreApellidos', header: 'Nombre y apellidos', value: (row) => row.nombreApellidos },
  { key: 'calendario', header: 'Calendario', value: (row) => row.calendario },
  { key: 'diasTeoricos', header: 'Días teóricos', value: (row) => row.diasTeoricos },
  { key: 'ausenciasMes', header: 'Ausencias mes', value: (row) => row.ausenciasMes },
  { key: 'ticketsFinales', header: 'Tickets a pedir', value: (row) => row.ticketsFinales },
  { key: 'importeTicket', header: 'Importe ticket', value: () => importeTicket.toFixed(2) },
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
];

const absenceExportColumns: ExportColumn<TicketRestaurantAbsence>[] = [
  { key: 'empleado', header: 'Nº empleado', value: (absence) => absence.empleado },
  {
    key: 'nombreApellidos',
    header: 'Nombre y apellidos',
    value: (absence) => absence.nombreApellidos,
  },
  { key: 'desde', header: 'Desde', value: (absence) => absence.desde },
  { key: 'hasta', header: 'Hasta', value: (absence) => absence.hasta },
  { key: 'motivo', header: 'Motivo', value: (absence) => absence.motivo },
  { key: 'totalDias', header: 'Total días', value: (absence) => absence.totalDias },
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

export function TicketRestaurantePage() {
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const peopleFileInputRef = useRef<HTMLInputElement | null>(null);

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

  const visibleAbsences = useMemo(
    () => filterTicketRestaurantAbsencesByMonth(absences, absenceYear, absenceMonth),
    [absenceMonth, absenceYear, absences],
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

  const handleImportFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    const rows = await importTicketRestaurantAbsencesFromFile(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (rows.length === 0) {
      setImportMessage('No se han detectado ausencias con formato limpio o ZERKOS.');
      return;
    }

    setEditingAbsenceId(null);
    setPreviewRows(rows);
    setImportMessage('');
    setIsPreviewOpen(true);
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

  const editAbsence = (absence: TicketRestaurantAbsence) => {
    setEditingAbsenceId(absence.id);
    setPreviewRows([toAbsencePreviewRow(absence)]);
    setImportMessage('Edita la ausencia y confirma para guardar los cambios.');
    setIsPreviewOpen(true);
  };

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

      <div className="mb-3 flex flex-wrap gap-2 rounded-xl border border-metro-border bg-metro-panel p-2">
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

      {activeSubview === 'calendarios' ? (
        <>
          <div className="mb-3 grid gap-3 rounded-xl border border-metro-border bg-metro-panel p-3 xl:grid-cols-[minmax(280px,0.9fr)_minmax(250px,0.75fr)_minmax(320px,1fr)]">
            <CalendarEditor
              draft={calendarDraft}
              editingCalendarId={editingCalendarId}
              onCancel={resetForm}
              onChange={setCalendarDraft}
              onSave={saveCalendar}
            />

            <div className="rounded-xl border border-metro-border bg-metro-surface p-2.5">
              <h3 className="mb-2 text-sm font-bold text-metro-text">Selector calendario</h3>
              <div className="space-y-2">
                <SelectBox
                  label="Selector calendario"
                  onChange={setSelectedCalendarId}
                  value={selectedCalendarId}
                >
                  {visibleCalendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.nombre}
                      {calendar.activo ? '' : ' (inactivo)'}
                    </option>
                  ))}
                </SelectBox>
                <div className="flex items-center gap-1.5">
                  <button
                    className="rounded-lg border border-metro-border p-1.5 text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!selectedCalendar}
                    onClick={() => setYear(previousCalendarYear(year))}
                    type="button"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <input
                    aria-label="Selector año"
                    className="w-20 rounded-lg border border-metro-border bg-metro-surface px-2 py-1.5 text-center text-sm font-semibold text-metro-text outline-none focus:border-metro-red"
                    max="2200"
                    min="1900"
                    onChange={(event) => handleYearChange(event.target.value)}
                    type="number"
                    value={year}
                  />
                  <button
                    className="rounded-lg border border-metro-border p-1.5 text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!selectedCalendar}
                    onClick={() => setYear(nextCalendarYear(year))}
                    type="button"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <CalendarList
              calendars={visibleCalendars}
              onEdit={editCalendar}
              onRemove={removeCalendarAndPeople}
              onToggleActive={toggleCalendarActive}
              selectedCalendarId={selectedCalendarId}
            />
          </div>

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
          calculation={monthCalculation}
          config={config}
          mode="monthly"
          month={calculationMonth}
          onConfigChange={updateConfig}
          exportPayload={{
            title: 'Cómputo mensual Ticket Restaurante',
            filename: `ticket-restaurante-computo-mensual-${calculationYear}-${String(calculationMonth).padStart(2, '0')}`,
            columns: monthlyCalculationExportColumns(config.importeTicket),
            rows: monthCalculation.rows,
            filterLabel: buildFilterLabel([
              ['Mes', calculationMonth],
              ['Año', calculationYear],
            ]),
          }}
          onMonthChange={handleCalculationMonthChange}
          onYearChange={handleCalculationYearChange}
          year={calculationYear}
        />
      ) : activeSubview === 'computoCotizacion' ? (
        <CalculationPanel
          calculation={contributionCalculation}
          config={config}
          mode="contribution"
          month={calculationMonth}
          onConfigChange={updateConfig}
          exportPayload={{
            title: 'Cómputo cotización Ticket Restaurante',
            filename: `ticket-restaurante-computo-cotizacion-${calculationYear}-${String(calculationMonth).padStart(2, '0')}`,
            columns: contributionCalculationExportColumns(config.importeTicket),
            rows: contributionCalculation.rows,
            filterLabel: buildFilterLabel([
              ['Mes', calculationMonth],
              ['Año', calculationYear],
            ]),
          }}
          onMonthChange={handleCalculationMonthChange}
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
          onRemove={removeAbsence}
          onYearChange={handleAbsenceYearChange}
          year={absenceYear}
        />
      )}

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

function CalendarEditor({
  draft,
  editingCalendarId,
  onCancel,
  onChange,
  onSave,
}: {
  draft: TicketCalendarDraft;
  editingCalendarId: string | null;
  onCancel: () => void;
  onChange: (draft: TicketCalendarDraft) => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-xl border border-metro-border bg-metro-surface p-2.5">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-metro-text">
        {editingCalendarId ? (
          <Pencil className="h-4 w-4 text-metro-red" />
        ) : (
          <Plus className="h-4 w-4 text-metro-red" />
        )}
        {editingCalendarId ? 'Editar calendario' : 'Crear calendario'}
      </h3>
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-metro-text">
          Nombre
          <input
            className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => onChange({ ...draft, nombre: event.target.value })}
            value={draft.nombre}
          />
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
        <div>
          <p className="mb-1 text-xs font-semibold text-metro-text">Días con derecho a ticket</p>
          <div className="grid grid-cols-7 gap-1">
            {WEEK_DAYS.map((label, index) => {
              const isoDay = index + 1;
              const selectedDays = draft.ticketIsoWeekdays ?? [1, 2, 3, 4, 5];
              const checked = selectedDays.includes(isoDay);

              return (
                <label
                  className={
                    checked
                      ? 'rounded-lg border border-metro-red bg-metro-red/10 px-1 py-1 text-center text-xs font-bold text-metro-text'
                      : 'rounded-lg border border-metro-border px-1 py-1 text-center text-xs font-bold text-metro-muted'
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
        </div>
        <div className="flex gap-2">
          <button
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-metro-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!draft.nombre.trim()}
            onClick={onSave}
            type="button"
          >
            <Save className="h-3.5 w-3.5" />
            Guardar
          </button>
          {editingCalendarId ? (
            <button
              className="rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
              onClick={onCancel}
              type="button"
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CalendarList({
  calendars,
  onEdit,
  onRemove,
  onToggleActive,
  selectedCalendarId,
}: {
  calendars: TicketCalendar[];
  onEdit: (calendar: TicketCalendar) => void;
  onRemove: (id: string) => void;
  onToggleActive: (id: string) => void;
  selectedCalendarId: string;
}) {
  return (
    <div className="rounded-xl border border-metro-border bg-metro-surface p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-metro-text">Acciones calendario</h3>
        <span className="rounded-full bg-metro-red/10 px-2 py-0.5 text-xs font-semibold text-metro-red">
          {calendars.length}
        </span>
      </div>
      <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
        {calendars.map((calendar) => (
          <div
            className={
              selectedCalendarId === calendar.id
                ? 'rounded-lg border border-metro-red bg-metro-red/10 p-1.5'
                : 'rounded-lg border border-metro-border bg-metro-panel p-1.5'
            }
            key={calendar.id}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold leading-tight text-metro-text">
                  {calendar.nombre}
                </p>
                <p className="text-xs text-metro-muted">
                  {calendar.activo ? 'Activo' : 'Inactivo'} · días{' '}
                  {calendar.ticketIsoWeekdays.join('-')} · {calendar.diasSinTicket.length} días sin
                  ticket
                </p>
              </div>
              <button
                className="rounded-md border border-metro-border p-1 text-metro-text hover:border-metro-red"
                onClick={() => onRemove(calendar.id)}
                type="button"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <button
                className="flex-1 rounded-lg bg-metro-red px-2 py-1 text-[11px] font-semibold text-white hover:bg-metro-dark"
                onClick={() => onEdit(calendar)}
                type="button"
              >
                Editar
              </button>
              <button
                className="flex-1 rounded-lg border border-metro-border px-2 py-1 text-[11px] font-semibold text-metro-text hover:border-metro-red"
                onClick={() => onToggleActive(calendar.id)}
                type="button"
              >
                {calendar.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
        {calendars.length === 0 ? (
          <p className="rounded-lg border border-dashed border-metro-border p-2 text-xs text-metro-muted">
            Crea un calendario para definir los días sin ticket.
          </p>
        ) : null}
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

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(320px,0.7fr)_minmax(520px,1.3fr)]">
      <div className="rounded-xl border border-metro-border bg-metro-panel p-2.5">
        <h3 className="mb-2 text-base font-bold text-metro-text">
          {editingPersonId ? 'Editar persona Ticket' : 'Añadir persona Ticket'}
        </h3>
        <div className="space-y-2">
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
              onClick={onSave}
              type="button"
            >
              Guardar
            </button>
            {editingPersonId ? (
              <button
                className="rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
                onClick={onCancel}
                type="button"
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </div>
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
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wide text-metro-muted">
              <tr>
                <th className="px-2 py-1">Nº empleado</th>
                <th className="px-2 py-1">Nombre</th>
                <th className="px-2 py-1">Apellido1</th>
                <th className="px-2 py-1">Apellido2</th>
                <th className="px-2 py-1">DNI</th>
                <th className="px-2 py-1">Puesto</th>
                <th className="px-2 py-1">Calendario</th>
                <th className="px-2 py-1">estado</th>
                <th className="px-2 py-1">acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-metro-border text-metro-text">
              {people.map((person) => (
                <tr
                  className="hover:bg-metro-surface"
                  key={person.empleado}
                  onDoubleClick={() => onEdit(person)}
                >
                  <td className="px-2 py-1 font-semibold">{person.empleado}</td>
                  <td className="px-2 py-1">{person.nombre}</td>
                  <td className="px-2 py-1">{person.apellido1}</td>
                  <td className="px-2 py-1">{person.apellido2}</td>
                  <td className="px-2 py-1">{person.dni}</td>
                  <td className="px-2 py-1">{person.puesto}</td>
                  <td className="px-2 py-1">
                    {calendars.find((calendar) => calendar.id === person.calendarId)?.nombre ??
                      'Sin calendario'}
                  </td>
                  <td className="px-2 py-1">{person.activo ? 'Activo' : 'Inactivo'}</td>
                  <td className="px-2 py-1">
                    <div className="flex gap-1.5">
                      <button
                        className="rounded-md border border-metro-border px-2 py-1 text-[11px] font-semibold text-metro-text hover:border-metro-red"
                        onClick={() => onEdit(person)}
                        type="button"
                      >
                        Editar
                      </button>
                      <button
                        className="rounded-md border border-metro-border p-1 text-metro-text hover:border-metro-red"
                        onClick={() => {
                          if (
                            window.confirm(
                              `¿Eliminar la persona con Nº empleado ${person.empleado}?`,
                            )
                          ) {
                            onRemove(person.empleado);
                          }
                        }}
                        type="button"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {people.length === 0 ? (
                <tr>
                  <td className="px-2 py-4 text-center text-metro-muted" colSpan={9}>
                    Añade personas manualmente para poder calcular tickets.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CalculationPanel({
  calculation,
  config,
  mode,
  month,
  onConfigChange,
  exportPayload,
  onMonthChange,
  onYearChange,
  year,
}: {
  calculation: ReturnType<typeof calculateMonthlyTicketOrder>;
  config: { importeTicket: number; pedidoMensual: number };
  mode: 'monthly' | 'contribution';
  month: number;
  onConfigChange: (config: { importeTicket: number; pedidoMensual: number }) => void;
  exportPayload: ExportTablePayload<TicketPersonCalculation>;
  onMonthChange: (value: string) => void;
  onYearChange: (value: string) => void;
  year: number;
}) {
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
              ? 'Calcula los tickets a pedir: días ticket del calendario menos ausencias del propio mes.'
              : 'Calcula la cotización con ausencias a mes vencido y deuda pendiente anterior.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportPrintButtons payload={exportPayload} />
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <select
            aria-label="Selector mes cálculo"
            className="rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
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
            aria-label="Selector año cálculo"
            className="rounded-lg border border-metro-border bg-metro-surface px-2 py-1.5 text-center text-sm font-semibold text-metro-text outline-none focus:border-metro-red"
            max="2200"
            min="1900"
            onChange={(event) => onYearChange(event.target.value)}
            type="number"
            value={year}
          />
          <label className="relative block">
            <span className="absolute -top-2 left-2 bg-metro-surface px-1 text-[10px] font-semibold text-metro-muted">
              €/ticket
            </span>
            <input
              className="w-full rounded-lg border border-metro-border bg-metro-surface px-2 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
              min="0"
              onChange={(event) =>
                onConfigChange({ ...config, importeTicket: Number(event.target.value) || 0 })
              }
              step="0.01"
              type="number"
              value={config.importeTicket}
            />
          </label>
          <label className="relative block">
            <span className="absolute -top-2 left-2 bg-metro-surface px-1 text-[10px] font-semibold text-metro-muted">
              Pedido
            </span>
            <input
              className="w-full rounded-lg border border-metro-border bg-metro-surface px-2 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
              min="0"
              onChange={(event) =>
                onConfigChange({ ...config, pedidoMensual: Number(event.target.value) || 0 })
              }
              type="number"
              value={config.pedidoMensual}
            />
          </label>
        </div>
      </div>
      <div className="mb-2 grid gap-2 md:grid-cols-4 xl:grid-cols-7">
        <CalculationKpi label="Personas" value={calculation.totals.personas} />
        <CalculationKpi label="Días teóricos" value={calculation.totals.diasTeoricos} />
        <CalculationKpi label="Ausencias mes" value={calculation.totals.ausenciasMes} />
        <CalculationKpi label="Deuda entrante" value={calculation.totals.deudaEntrante} />
        <CalculationKpi label="Descontado" value={calculation.totals.ausenciasAplicadas} />
        <CalculationKpi label="Deuda pendiente" value={calculation.totals.deudaPendiente} />
        <CalculationKpi label="Tickets finales" value={calculation.totals.ticketsFinales} />
        <CalculationKpi label="Importe" value={`${calculation.totals.importe.toFixed(2)} €`} />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="text-[11px] uppercase tracking-wide text-metro-muted">
            <tr>
              <th className="px-2 py-1">empleado</th>
              <th className="px-2 py-1">nombre</th>
              <th className="px-2 py-1">calendario</th>
              <th className="px-2 py-1 text-right">teóricos</th>
              {mode === 'monthly' ? (
                <>
                  <th className="px-2 py-1 text-right">ausencias</th>
                  <th className="px-2 py-1 text-right">tickets a pedir</th>
                  <th className="px-2 py-1 text-right">importe ticket</th>
                </>
              ) : (
                <>
                  <th className="px-2 py-1 text-right">ausencias aplicadas</th>
                  <th className="px-2 py-1 text-right">tickets finales</th>
                  <th className="px-2 py-1 text-right">importe ticket</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-metro-border text-metro-text">
            {calculation.rows.map((row: TicketPersonCalculation) => (
              <tr key={row.empleado}>
                <td className="px-2 py-1 font-semibold">{row.empleado}</td>
                <td className="px-2 py-1">{row.nombreApellidos}</td>
                <td className="px-2 py-1">{row.calendario}</td>
                <td className="px-2 py-1 text-right">{row.diasTeoricos}</td>
                {mode === 'monthly' ? (
                  <>
                    <td className="px-2 py-1 text-right">{row.ausenciasMes}</td>
                    <td className="px-2 py-1 text-right font-semibold">{row.ticketsFinales}</td>
                    <td className="px-2 py-1 text-right">{config.importeTicket.toFixed(2)} €</td>
                  </>
                ) : (
                  <>
                    <td className="px-2 py-1 text-right">{row.ausenciasAplicadas}</td>
                    <td className="px-2 py-1 text-right font-semibold">{row.ticketsFinales}</td>
                    <td className="px-2 py-1 text-right">{config.importeTicket.toFixed(2)} €</td>
                  </>
                )}
              </tr>
            ))}
            {calculation.rows.length === 0 ? (
              <tr>
                <td className="px-2 py-4 text-center text-metro-muted" colSpan={6}>
                  No hay personas activas para calcular.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CalculationKpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-metro-border bg-metro-surface p-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-metro-muted">{label}</p>
      <p className="mt-1 text-lg font-bold text-metro-text">{value}</p>
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
  onRemove,
  onYearChange,
  year,
}: {
  absences: TicketRestaurantAbsence[];
  exportPayload: ExportTablePayload<TicketRestaurantAbsence>;
  importMessage: string;
  month: number;
  onEdit: (absence: TicketRestaurantAbsence) => void;
  onExportModel: () => void;
  onImport: () => void;
  onMonthChange: (value: string) => void;
  onRemove: (id: string) => void;
  onYearChange: (value: string) => void;
  year: number;
}) {
  return (
    <div className="rounded-xl border border-metro-border bg-metro-panel p-2.5">
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-base font-bold text-metro-text">Ausencias</h3>
          <p className="text-xs text-metro-muted">
            Importa, revisa y filtra ausencias por mes antes de aplicarlas al Ticket Restaurante.
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
        <div className="flex gap-2">
          <select
            aria-label="Selector mes ausencias"
            className="rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
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
            aria-label="Selector año ausencias"
            className="w-24 rounded-lg border border-metro-border bg-metro-surface px-2 py-1.5 text-center text-sm font-semibold text-metro-text outline-none focus:border-metro-red"
            max="2200"
            min="1900"
            onChange={(event) => onYearChange(event.target.value)}
            type="number"
            value={year}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="text-[11px] uppercase tracking-wide text-metro-muted">
            <tr>
              <th className="px-2 py-1">Nº empleado</th>
              <th className="px-2 py-1">Nombre y apellidos</th>
              <th className="px-2 py-1">Desde</th>
              <th className="px-2 py-1">Hasta</th>
              <th className="px-2 py-1">Motivo</th>
              <th className="px-2 py-1">Total días</th>
              <th className="px-2 py-1">Afecta ticket</th>
              <th className="px-2 py-1">acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-metro-border text-metro-text">
            {absences.map((absence) => (
              <tr key={absence.id} onDoubleClick={() => onEdit(absence)}>
                <td className="px-2 py-1 font-semibold">{absence.empleado}</td>
                <td className="px-2 py-1">{absence.nombreApellidos}</td>
                <td className="px-2 py-1">{absence.desde}</td>
                <td className="px-2 py-1">{absence.hasta}</td>
                <td className="px-2 py-1">{absence.motivo}</td>
                <td className="px-2 py-1">{absence.totalDias}</td>
                <td className="px-2 py-1">{absence.afectaTicket ? 'Sí' : 'No'}</td>
                <td className="px-2 py-1">
                  <button
                    className="rounded-md border border-metro-border p-1 text-metro-text hover:border-metro-red"
                    onClick={() => onRemove(absence.id)}
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {absences.length === 0 ? (
              <tr>
                <td className="px-2 py-4 text-center text-metro-muted" colSpan={6}>
                  No hay ausencias guardadas.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
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
            <tbody className="divide-y divide-metro-border">
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

function SelectBox({
  children,
  label,
  onChange,
  value,
}: {
  children: ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <select
      aria-label={label}
      className="w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      <option value="">{label}</option>
      {children}
    </select>
  );
}

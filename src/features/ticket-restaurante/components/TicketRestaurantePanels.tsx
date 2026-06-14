import {
  CalendarDays,
  Calculator,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Pencil,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { useAppDialog } from '../../../hooks/useAppDialog';
import {
  calculateMonthlyTicketOrder,
  getEffectiveTicketPrice,
  nextCalendarYear,
  normalizeTicketRestaurantConfig,
  previousCalendarYear,
  type CalendarDay,
  type TicketCalendar,
  type TicketCalendarDraft,
  type TicketPerson,
  type TicketPersonCalculation,
  type TicketPersonDraft,
  type TicketRestaurantAbsence,
  type TicketRestaurantConfig,
} from '../domain/ticketRestaurante';
import type { TicketRestaurantAbsencePreviewRow } from '../domain/importAbsences';
import type { ExportTablePayload } from '../../../shared/export/types';
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
  | 'hojaGastos'
  | 'ausencias'
  | 'deudaEntrante'
  | 'deudaPendiente'
  | 'ticketsFinales'
  | 'importeTicket'
  | 'total';

const TICKET_PEOPLE_TABLE_STORAGE_KEY = 'traccion.tableView.ticketRestaurante.people';
const TICKET_ABSENCES_TABLE_STORAGE_KEY = 'traccion.tableView.ticketRestaurante.absences';
const TICKET_MONTHLY_TABLE_STORAGE_KEY = 'traccion.tableView.ticketRestaurante.monthlyCalculation.v2';
const TICKET_CONTRIBUTION_TABLE_STORAGE_KEY =
  'traccion.tableView.ticketRestaurante.contributionCalculation.v2';

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
    sort: { columnId: 'empleado', direction: 'asc' },
    columnWidths: {
      empleado: 110,
      nombreApellidos: 230,
      calendario: 160,
      diasTeoricos: 110,
      hojaGastos: 115,
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
  'hojaGastos',
  'ausencias',
  'deudaEntrante',
  'deudaPendiente',
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

function formatCurrency(value: number): string {
  return `${value.toFixed(2)} €`;
}

export function SubviewButton({
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

export function CalendarToolbar({
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

export function MonthCalendar({
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

export function Legend() {
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

export function EmptyCalendar() {
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

export function PeoplePanel({
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
  const { confirm, dialogNode } = useAppDialog();
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

  const { preferences, setSort, setColumnWidth, resetColumnWidths } =
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
                void (async () => {
                  if (await confirm(`¿Eliminar la persona con Nº empleado ${person.empleado}?`, {
                    confirmLabel: 'Eliminar',
                    danger: true,
                    title: 'Eliminar persona',
                  })) {
                    onRemove(person.empleado);
                  }
                })();
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
    [calendars, confirm, onEdit, onRemove],
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

            <ActionButton onClick={onImport} size="sm" variant="import">
              Importar personas
            </ActionButton>
            <span className="rounded-full bg-metro-red/10 px-2 py-0.5 text-xs font-semibold text-metro-red">
              {people.length}
            </span>
          </div>
        </div>
        <DataTable
          ariaLabel="Personas con derecho a ticket"
          columnWidths={preferences.columnWidths}
          onResetColumnWidths={resetColumnWidths}
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
      {dialogNode}
    </div>
  );
}

export function MonthNavigator({
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

export function TicketPriceModal({
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

export function TicketRulesModal({
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

export function CalculationPanel({
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
  const { preferences, setSort, setColumnWidth, resetColumnWidths } =
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
        id: 'hojaGastos',
        header: 'Hoja gastos',
        accessor: (row) => row.hojasGastoMes,
        render: (row) => row.hojasGastoMes,
        width: 115,
        minWidth: 100,
        maxWidth: 170,
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
        render: (row) => (
          <div className="flex items-center justify-end gap-2">
            <span
              className={
                mode === 'monthly' ? 'font-bold text-emerald-600' : 'font-bold text-metro-text'
              }
            >
              {row.ticketsFinales}
            </span>
            <button
              aria-label={`Ver cálculo de ${row.nombreApellidos}`}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-100"
              onClick={(event) => {
                event.stopPropagation();
                setSelectedDetailRow(row);
              }}
              title="Ver cálculo"
              type="button"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
        width: 135,
        minWidth: 120,
        maxWidth: 190,
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
        onResetColumnWidths={resetColumnWidths}
        columns={calculationColumns}
        emptyMessage="No hay personas activas para calcular."
        getRowId={(row) => row.empleado}
        maxHeightClassName="max-h-[460px]"
        onColumnWidthChange={setColumnWidth}
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
          month={month}
          onClose={() => setSelectedDetailRow(null)}
          row={selectedDetailRow}
          year={year}
        />
      ) : null}
    </div>
  );
}

export function CalculationAbsenceDetailModal({
  mode,
  month,
  onClose,
  row,
  year,
}: {
  absences: TicketRestaurantAbsence[];
  calendars: TicketCalendar[];
  config: TicketRestaurantConfig;
  mode: 'monthly' | 'contribution';
  month: number;
  onClose: () => void;
  row: TicketPersonCalculation;
  year: number;
}) {
  const appliedDebtRows = row.deudaAplicadaDetalle ?? [];
  const pendingDebtRows = row.deudaPendienteDetalle ?? [];
  const hojaGastoRows = row.hojaGastoDetalle ?? [];
  const appliedDiscounts = Math.max(0, row.diasTeoricos - row.ticketsFinales);
  const monthlyDebtDiscounts = Math.max(0, appliedDiscounts - row.hojasGastoMes);
  const hasDetail =
    appliedDebtRows.length > 0 || pendingDebtRows.length > 0 || hojaGastoRows.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="max-h-[86vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-metro-border bg-metro-surface shadow-card">
        <div className="flex items-center justify-between border-b border-metro-border p-3">
          <div>
            <h3 className="text-lg font-bold text-metro-text">Detalle del cómputo</h3>
            <p className="text-xs text-metro-muted">
              {row.empleado} · {row.nombreApellidos} ·{' '}
              {mode === 'monthly' ? 'Cómputo mensual' : 'Cómputo cotización'} · {year}-
              {String(month).padStart(2, '0')}
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
        <div className="max-h-[68vh] space-y-3 overflow-auto p-3">
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            <DetailStat label="Calendario" value={row.calendario} />
            <DetailStat label="Días teóricos" value={row.diasTeoricos} />
            <DetailStat label="Hoja gastos" value={row.hojasGastoMes} />
            <DetailStat label="Deuda entrante" value={row.deudaEntrante} />
            <DetailStat
              label={mode === 'monthly' ? 'Descuento total' : 'Ausencias mes'}
              value={appliedDiscounts}
            />
            <DetailStat label="Deuda pendiente" value={row.deudaPendiente} />
          </div>

          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
            <h4 className="mb-2 text-sm font-bold">Cálculo aplicado</h4>
            {mode === 'monthly' ? (
              <div className="grid gap-2 md:grid-cols-4">
                <DetailFormulaItem label="Días calendario" value={row.diasTeoricos} />
                <DetailFormulaItem label="Hojas de gasto" value={`-${row.hojasGastoMes}`} />
                <DetailFormulaItem label="Deuda aplicada" value={`-${monthlyDebtDiscounts}`} />
                <DetailFormulaItem label="Tickets a pedir" value={row.ticketsFinales} strong />
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-3">
                <DetailFormulaItem label="Días calendario" value={row.diasTeoricos} />
                <DetailFormulaItem label="Ausencias del mes" value={`-${appliedDiscounts}`} />
                <DetailFormulaItem label="Tickets cotización" value={row.ticketsFinales} strong />
              </div>
            )}
          </section>

          {hasDetail ? (
            <>
              <DetailSection
                emptyMessage="No hay días de ausencia/deuda aplicados en este mes."
                rows={appliedDebtRows}
                title={mode === 'monthly' ? 'Deuda aplicada este mes' : 'Ausencias del mes'}
              />
              <DetailSection
                emptyMessage="No queda deuda pendiente tras este mes."
                rows={pendingDebtRows}
                title="Deuda pendiente"
              />
              <HojaGastoDetailSection rows={hojaGastoRows} />
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-metro-border bg-metro-panel p-6 text-center text-sm font-semibold text-metro-muted">
              No hay ausencias, deuda ni hojas de gasto vinculadas a esta persona en el cómputo
              seleccionado.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function DetailFormulaItem({
  label,
  strong = false,
  value,
}: {
  label: string;
  strong?: boolean;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-white/70 p-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">{label}</p>
      <p
        className={`mt-1 text-base font-bold ${
          strong ? 'text-emerald-700' : 'text-emerald-950'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-metro-border bg-metro-panel p-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-metro-muted">{label}</p>
      <p className="mt-1 text-sm font-bold text-metro-text">{value}</p>
    </div>
  );
}

function DetailSection({
  emptyMessage,
  rows,
  title,
}: {
  emptyMessage: string;
  rows: TicketPersonCalculation['deudaAplicadaDetalle'];
  title: string;
}) {
  return (
    <section className="rounded-xl border border-metro-border bg-metro-panel p-3">
      <h4 className="mb-2 text-sm font-bold text-metro-text">{title}</h4>
      {rows.length > 0 ? (
        <table className="min-w-full text-left text-xs">
          <thead className="text-[11px] uppercase tracking-wide text-metro-muted">
            <tr>
              <th className="px-2 py-1">Fecha</th>
              <th className="px-2 py-1">Origen</th>
              <th className="px-2 py-1">Motivo</th>
              <th className="px-2 py-1 text-right">Días ticket</th>
            </tr>
          </thead>
          <tbody className="text-metro-text [&>tr:nth-child(even)]:bg-metro-surface/60">
            {rows.map((detail) => (
              <tr key={`${detail.id}-${detail.fecha}-${title}`}>
                <td className="px-2 py-1 font-semibold">{formatDisplayDate(detail.fecha)}</td>
                <td className="px-2 py-1">{formatMonthOrigin(detail.mesOrigen)}</td>
                <td className="px-2 py-1">{detail.motivo}</td>
                <td className="px-2 py-1 text-right font-semibold">1</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="rounded-lg border border-dashed border-metro-border bg-metro-surface p-3 text-xs font-semibold text-metro-muted">
          {emptyMessage}
        </p>
      )}
    </section>
  );
}

function HojaGastoDetailSection({ rows }: { rows: TicketPersonCalculation['hojaGastoDetalle'] }) {
  return (
    <section className="rounded-xl border border-metro-border bg-metro-panel p-3">
      <h4 className="mb-2 text-sm font-bold text-metro-text">Hojas de gasto</h4>
      {rows.length > 0 ? (
        <table className="min-w-full text-left text-xs">
          <thead className="text-[11px] uppercase tracking-wide text-metro-muted">
            <tr>
              <th className="px-2 py-1">Fecha</th>
              <th className="px-2 py-1 text-right">Días ticket</th>
            </tr>
          </thead>
          <tbody className="text-metro-text [&>tr:nth-child(even)]:bg-metro-surface/60">
            {rows.map((detail) => (
              <tr key={detail.id}>
                <td className="px-2 py-1 font-semibold">{formatDisplayDate(detail.fecha)}</td>
                <td className="px-2 py-1 text-right font-semibold">1</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="rounded-lg border border-dashed border-metro-border bg-metro-surface p-3 text-xs font-semibold text-metro-muted">
          No hay hojas de gasto aplicadas en este mes.
        </p>
      )}
    </section>
  );
}

function formatDisplayDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

function formatMonthOrigin(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) return value;
  return `${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

export function AbsencesTable({
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
  const { preferences, setSort, setColumnWidth, resetColumnWidths } =
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
            <ActionButton onClick={onImport} size="sm" variant="import">
              Importar ausencias
            </ActionButton>
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
          onResetColumnWidths={resetColumnWidths}
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

export function AbsencePreviewModal({
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

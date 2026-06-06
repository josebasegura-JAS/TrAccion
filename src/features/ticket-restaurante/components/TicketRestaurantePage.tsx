import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  buildYearCalendar,
  EMPTY_TICKET_CALENDAR_DRAFT,
  nextCalendarYear,
  previousCalendarYear,
  visibleTicketCalendars,
  type CalendarDay,
  type TicketCalendar,
  type TicketCalendarDraft,
} from '../domain/ticketRestaurante';
import { useTicketRestauranteStore } from '../store/useTicketRestauranteStore';

const WEEK_DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function currentYear(): number {
  return new Date().getFullYear();
}

function toCalendarDraft(calendar: TicketCalendar): TicketCalendarDraft {
  return {
    nombre: calendar.nombre,
    activo: calendar.activo,
    diasSinTicket: calendar.diasSinTicket,
  };
}

function sortByName(calendars: TicketCalendar[]): TicketCalendar[] {
  return [...calendars].sort((first, second) =>
    first.nombre.localeCompare(second.nombre, 'es', { numeric: true, sensitivity: 'base' }),
  );
}

export function TicketRestaurantePage() {
  const calendars = useTicketRestauranteStore((state) => state.calendars);
  const loadTickets = useTicketRestauranteStore((state) => state.load);
  const createCalendar = useTicketRestauranteStore((state) => state.createCalendar);
  const updateCalendar = useTicketRestauranteStore((state) => state.updateCalendar);
  const toggleCalendarActive = useTicketRestauranteStore((state) => state.toggleCalendarActive);
  const removeCalendar = useTicketRestauranteStore((state) => state.removeCalendar);
  const toggleDay = useTicketRestauranteStore((state) => state.toggleDay);
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [year, setYear] = useState(currentYear());
  const [calendarDraft, setCalendarDraft] = useState<TicketCalendarDraft>(
    EMPTY_TICKET_CALENDAR_DRAFT,
  );
  const [editingCalendarId, setEditingCalendarId] = useState<string | null>(null);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

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

  const handleYearChange = (value: string) => {
    const parsedYear = Number(value);
    if (Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2200) {
      setYear(parsedYear);
    }
  };

  return (
    <section
      className="rounded-2xl border border-metro-border bg-metro-surface p-3 shadow-card"
      id="ticket-restaurante"
    >
      <div className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-metro-red">
          Ticket Restaurante
        </p>
        <h2 className="text-xl font-bold text-metro-text">Definir Calendarios</h2>
        <p className="mt-0.5 text-sm text-metro-muted">
          Gestión anual de días sin ticket por calendario.
        </p>
      </div>

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
          onRemove={removeCalendar}
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
    </section>
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
                  {calendar.activo ? 'Activo' : 'Inactivo'} · {calendar.diasSinTicket.length} días
                  sin ticket
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

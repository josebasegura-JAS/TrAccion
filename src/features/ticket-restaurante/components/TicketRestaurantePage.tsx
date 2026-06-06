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
    if (selectedCalendarId && visibleCalendars.some((calendar) => calendar.id === selectedCalendarId)) {
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
      className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card"
      id="ticket-restaurante"
    >
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
            Ticket Restaurante
          </p>
          <h2 className="text-2xl font-bold text-metro-text">Definir Calendarios</h2>
          <p className="mt-0.5 text-base text-metro-muted">
            Gestión anual de días sin ticket por calendario.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SelectBox
            label="Selector calendario"
            onChange={setSelectedCalendarId}
            value={selectedCalendarId}
          >
            {visibleCalendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.nombre}{calendar.activo ? '' : ' (inactivo)'}
              </option>
            ))}
          </SelectBox>
          <button
            className="rounded-lg border border-metro-border p-2 text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedCalendar}
            onClick={() => setYear(previousCalendarYear(year))}
            type="button"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            aria-label="Selector año"
            className="w-24 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text outline-none focus:border-metro-red"
            max="2200"
            min="1900"
            onChange={(event) => handleYearChange(event.target.value)}
            type="number"
            value={year}
          />
          <button
            className="rounded-lg border border-metro-border p-2 text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedCalendar}
            onClick={() => setYear(nextCalendarYear(year))}
            type="button"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <CalendarEditor
            draft={calendarDraft}
            editingCalendarId={editingCalendarId}
            onCancel={resetForm}
            onChange={setCalendarDraft}
            onSave={saveCalendar}
          />
          <CalendarList
            calendars={visibleCalendars}
            onEdit={editCalendar}
            onRemove={removeCalendar}
            onToggleActive={toggleCalendarActive}
            selectedCalendarId={selectedCalendarId}
          />
        </aside>

        <div className="rounded-xl border border-metro-border bg-metro-panel p-3">
          <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-bold text-metro-text">
                <CalendarDays className="h-5 w-5 text-metro-red" />
                Vista anual {year}
              </h3>
              <p className="text-sm text-metro-muted">
                Pulsa un día para marcarlo o desmarcarlo como sin ticket.
              </p>
            </div>
            <Legend />
          </div>

          {selectedCalendar ? (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
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
    <div className="rounded-xl border border-metro-border bg-metro-panel p-3">
      <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-metro-text">
        {editingCalendarId ? <Pencil className="h-5 w-5 text-metro-red" /> : <Plus className="h-5 w-5 text-metro-red" />}
        {editingCalendarId ? 'Editar calendario' : 'Crear calendario'}
      </h3>
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-metro-text">
          Nombre
          <input
            className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => onChange({ ...draft, nombre: event.target.value })}
            value={draft.nombre}
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-metro-text">
          <input
            checked={draft.activo}
            className="h-4 w-4 accent-metro-red"
            onChange={(event) => onChange({ ...draft, activo: event.target.checked })}
            type="checkbox"
          />
          Activo
        </label>
        <div className="flex gap-2">
          <button
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!draft.nombre.trim()}
            onClick={onSave}
            type="button"
          >
            <Save className="h-4 w-4" />
            Guardar
          </button>
          {editingCalendarId ? (
            <button
              className="rounded-lg border border-metro-border px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
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
    <div className="rounded-xl border border-metro-border bg-metro-panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-lg font-bold text-metro-text">Calendarios</h3>
        <span className="rounded-full bg-metro-red/10 px-2 py-0.5 text-xs font-semibold text-metro-red">
          {calendars.length}
        </span>
      </div>
      <div className="space-y-2">
        {calendars.map((calendar) => (
          <div
            className={
              selectedCalendarId === calendar.id
                ? 'rounded-lg border border-metro-red bg-metro-red/10 p-2'
                : 'rounded-lg border border-metro-border bg-metro-surface p-2'
            }
            key={calendar.id}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-metro-text">{calendar.nombre}</p>
                <p className="text-xs text-metro-muted">
                  {calendar.activo ? 'Activo' : 'Inactivo'} · {calendar.diasSinTicket.length} días sin ticket
                </p>
              </div>
              <button
                className="rounded-md border border-metro-border p-1.5 text-metro-text hover:border-metro-red"
                onClick={() => onRemove(calendar.id)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                className="flex-1 rounded-lg bg-metro-red px-2.5 py-1 text-xs font-semibold text-white hover:bg-metro-dark"
                onClick={() => onEdit(calendar)}
                type="button"
              >
                Editar
              </button>
              <button
                className="flex-1 rounded-lg border border-metro-border px-2.5 py-1 text-xs font-semibold text-metro-text hover:border-metro-red"
                onClick={() => onToggleActive(calendar.id)}
                type="button"
              >
                {calendar.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
        {calendars.length === 0 ? (
          <p className="rounded-lg border border-dashed border-metro-border p-3 text-sm text-metro-muted">
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
    <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
      <h4 className="mb-2 text-center text-sm font-bold uppercase tracking-wide text-metro-text">
        {monthName}
      </h4>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-metro-muted">
        {WEEK_DAYS.map((weekDay) => (
          <div key={weekDay}>{weekDay}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
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
    'aspect-square rounded-md border text-xs font-semibold transition hover:border-metro-red focus:outline-none focus:ring-2 focus:ring-metro-red/50';

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
    <div className="flex flex-wrap gap-2 text-xs font-semibold text-metro-muted">
      <LegendItem className="border-metro-border bg-metro-surface" label="Día normal" />
      <LegendItem className="border-metro-border bg-metro-panel" label="Fin de semana" />
      <LegendItem className="border-metro-red bg-metro-red" label="Sin ticket" />
    </div>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded border ${className}`} />
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
      className="min-w-56 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      <option value="">{label}</option>
      {children}
    </select>
  );
}

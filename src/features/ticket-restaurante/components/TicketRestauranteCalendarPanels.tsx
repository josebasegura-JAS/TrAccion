import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Save, Trash2 } from 'lucide-react';
import { CountBadge } from '../../../components/ui/CountBadge';
import {
  nextCalendarYear,
  previousCalendarYear,
  type CalendarDay,
  type TicketCalendar,
  type TicketCalendarDraft,
} from '../domain/ticketRestaurante';

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
              data-tip="Año anterior"
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
              data-tip="Año posterior"
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
              <CountBadge size="xs">
                {selectedCalendar.activo ? 'Activo' : 'Inactivo'} ·{' '}
                {selectedCalendar.diasSinTicket.length} días
              </CountBadge>
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
            data-tip={`${day.fecha}${day.sinTicket ? ' · sin ticket' : ''}`}
            onClick={() => onToggleDay(day.fecha)}
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
        data-tip="Mes anterior"
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
        data-tip="Mes posterior"
        className="rounded-md border border-metro-border p-1 text-metro-text hover:border-metro-red"
        onClick={onNextMonth}
        type="button"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  X,
  Laptop,
  ListChecks,
  Utensils,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { isTaskClosed, type Task, type TaskState } from '../features/tareas/domain/task';
import { useTaskStore } from '../features/tareas/store/useTaskStore';
import { useCommitteeSessionStore } from '../features/comite/store/useCommitteeSessionStore';
import { useParitariaSessionStore } from '../features/paritaria/store/useParitariaSessionStore';
import { useTeletrabajoStore } from '../features/teletrabajo/store/useTeletrabajoStore';
import { useTicketRestauranteStore } from '../features/ticket-restaurante/store/useTicketRestauranteStore';
import type { AppView } from './Sidebar';

type CalendarEventType = 'task' | 'committee' | 'paritaria' | 'telework' | 'tickets' | 'actas';

type CalendarEvent = {
  id: string;
  date: string;
  type: CalendarEventType;
  title: string;
  detail: string;
  view: AppView;
  recordId?: string;
};

type DashboardNavigationTarget = {
  view: AppView;
  recordId?: string;
};

type KpiCard = {
  title: string;
  value: number;
  subtitle: string;
  helper: string;
  icon: LucideIcon;
  tone: string;
  segments: { label: string; value: number; className: string }[];
};

const eventTone: Record<CalendarEventType, string> = {
  task: 'bg-red-500',
  committee: 'bg-orange-500',
  paritaria: 'bg-violet-500',
  telework: 'bg-blue-500',
  tickets: 'bg-emerald-500',
  actas: 'bg-amber-400',
};

const taskStateLabels: Record<TaskState, string> = {
  pendiente: 'Abiertas',
  'en curso': 'En curso',
  bloqueada: 'Bloqueadas',
  resuelta: 'Resueltas',
  cerrada: 'Cerradas',
};

const taskStateBars: Record<TaskState, string> = {
  pendiente: 'bg-red-500',
  'en curso': 'bg-orange-500',
  bloqueada: 'bg-violet-500',
  resuelta: 'bg-emerald-500',
  cerrada: 'bg-slate-400',
};

const monthFormatter = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const fullDateFormatter = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const shortDateFormatter = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit' });

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDisplayDate(value: string): string {
  const date = parseIsoDate(value);
  return date ? shortDateFormatter.format(date) : 'Sin fecha';
}

function getMonthMatrix(monthDate: Date): (Date | null)[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }

  while (cells.length % 7 !== 0 || cells.length < 35) {
    cells.push(null);
  }

  return cells;
}

function groupByState(tasks: readonly Task[]): Record<TaskState, number> {
  return tasks.reduce<Record<TaskState, number>>(
    (accumulator, task) => {
      accumulator[task.estado] += 1;
      return accumulator;
    },
    { pendiente: 0, 'en curso': 0, bloqueada: 0, resuelta: 0, cerrada: 0 },
  );
}

function stateSegmentsFromTasks(tasks: readonly Task[]) {
  const byState = groupByState(tasks);
  return Object.entries(byState).map(([state, value]) => ({
    label: taskStateLabels[state as TaskState],
    value,
    className: taskStateBars[state as TaskState],
  }));
}

function miniDonutStyle(segments: { value: number; className: string }[]) {
  const colors: Record<string, string> = {
    'bg-red-500': '#ef4444',
    'bg-orange-500': '#f97316',
    'bg-violet-500': '#8b5cf6',
    'bg-emerald-500': '#10b981',
    'bg-blue-500': '#3b82f6',
    'bg-slate-400': '#94a3b8',
    'bg-amber-400': '#fbbf24',
  };
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total <= 0) {
    return { background: 'conic-gradient(#e2e8f0 0deg 360deg)' };
  }

  let cursor = 0;
  const stops = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const start = cursor;
      const end = cursor + (segment.value / total) * 360;
      cursor = end;
      return `${colors[segment.className] ?? '#64748b'} ${start}deg ${end}deg`;
    })
    .join(', ');

  return { background: `conic-gradient(${stops})` };
}

export function DashboardCards({
  onOpenRecord,
}: {
  onOpenRecord?: (target: DashboardNavigationTarget) => void;
}) {
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = useMemo(() => new Date(), []);
  const todayIso = toIsoDate(today);

  const tasks = useTaskStore((state) => state.tasks);
  const loadTasks = useTaskStore((state) => state.load);
  const sessions = useCommitteeSessionStore((state) => state.sessions);
  const loadSessions = useCommitteeSessionStore((state) => state.load);
  const paritariaSessions = useParitariaSessionStore((state) => state.sessions);
  const loadParitariaSessions = useParitariaSessionStore((state) => state.load);
  const solicitudes = useTeletrabajoStore((state) => state.solicitudes);
  const loadSolicitudes = useTeletrabajoStore((state) => state.load);
  const ticketPeople = useTicketRestauranteStore((state) => state.people);
  const ticketAbsences = useTicketRestauranteStore((state) => state.absences);
  const loadTickets = useTicketRestauranteStore((state) => state.load);

  useEffect(() => {
    loadTasks();
    loadSessions();
    loadSolicitudes();
    loadTickets();
    loadParitariaSessions();
  }, [loadParitariaSessions, loadSessions, loadSolicitudes, loadTasks, loadTickets]);

  const openRecord = (target: DashboardNavigationTarget) => {
    onOpenRecord?.(target);
  };

  const activeTasks = useMemo(
    () => tasks.filter((task) => !task.deletedAt && !isTaskClosed(task)),
    [tasks],
  );
  const criticalTasks = useMemo(
    () => activeTasks.filter((task) => task.prioridad === 'critica'),
    [activeTasks],
  );
  const openCommitteeSessions = useMemo(
    () => sessions.filter((session) => session.status === 'open'),
    [sessions],
  );
  const openParitariaSessions = useMemo(
    () => paritariaSessions.filter((session) => session.status === 'open'),
    [paritariaSessions],
  );
  const activeTelework = useMemo(
    () => solicitudes.filter((solicitud) => !solicitud.deletedAt),
    [solicitudes],
  );
  const pendingTelework = useMemo(
    () => activeTelework.filter((solicitud) => solicitud.estado === 'pendiente'),
    [activeTelework],
  );
  const activeTicketPeople = useMemo(
    () => ticketPeople.filter((person) => person.activo && !person.deletedAt),
    [ticketPeople],
  );
  const activeTicketAbsences = useMemo(
    () => ticketAbsences.filter((absence) => !absence.deletedAt && absence.afectaTicket),
    [ticketAbsences],
  );
  const actaTasks = useMemo(
    () =>
      activeTasks.filter((task) =>
        [task.fase, task.titulo, task.descripcion].some((value) =>
          value.toLowerCase().includes('acta'),
        ),
      ),
    [activeTasks],
  );

  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    const taskEvents = activeTasks
      .filter((task) => task.fechaLimite)
      .map((task) => ({
        id: `task-${task.id}`,
        date: task.fechaLimite,
        type: 'task' as const,
        title: task.titulo,
        detail: `${taskStateLabels[task.estado]} · prioridad ${task.prioridad}`,
        view: 'tareas' as const,
        recordId: task.id,
      }));

    const committeeEvents = openCommitteeSessions.map((session) => ({
      id: `committee-${session.id}`,
      date: session.date,
      type: 'committee' as const,
      title: session.title,
      detail: `${session.items.length} punto${session.items.length === 1 ? '' : 's'} en orden del día`,
      view: 'comite' as const,
      recordId: session.id,
    }));

    const paritariaEvents = openParitariaSessions.map((session) => ({
      id: `paritaria-${session.id}`,
      date: session.date,
      type: 'paritaria' as const,
      title: session.title,
      detail: `${session.items.length} punto${session.items.length === 1 ? '' : 's'} en Comisión Paritaria`,
      view: 'paritaria' as const,
      recordId: session.id,
    }));

    const teleworkEvents = pendingTelework
      .filter((solicitud) => solicitud.fechaSolicitud)
      .map((solicitud) => ({
        id: `telework-${solicitud.id}`,
        date: solicitud.fechaSolicitud,
        type: 'telework' as const,
        title: solicitud.nombreApellidos,
        detail: 'Solicitud de teletrabajo pendiente',
        view: 'teletrabajo' as const,
        recordId: solicitud.id,
      }));

    const ticketEvents = activeTicketAbsences.slice(0, 30).map((absence) => ({
      id: `ticket-${absence.id}`,
      date: absence.desde,
      type: 'tickets' as const,
      title: absence.nombreApellidos,
      detail: `${absence.motivo} · afecta ticket`,
      view: 'ticket-restaurante' as const,
      recordId: absence.id,
    }));

    const actaEvents = actaTasks
      .filter((task) => task.fechaLimite)
      .map((task) => ({
        id: `acta-${task.id}`,
        date: task.fechaLimite,
        type: 'actas' as const,
        title: task.titulo,
        detail: 'Seguimiento de acta',
        view: 'tareas' as const,
        recordId: task.id,
      }));

    return [...taskEvents, ...committeeEvents, ...paritariaEvents, ...teleworkEvents, ...ticketEvents, ...actaEvents];
  }, [activeTasks, actaTasks, activeTicketAbsences, openCommitteeSessions, openParitariaSessions, pendingTelework]);

  const eventsByDay = useMemo(
    () =>
      calendarEvents.reduce<Record<string, CalendarEvent[]>>((accumulator, event) => {
        accumulator[event.date] = [...(accumulator[event.date] ?? []), event];
        return accumulator;
      }, {}),
    [calendarEvents],
  );

  const selectedDateEvents = selectedDate ? (eventsByDay[selectedDate] ?? []) : [];
  const selectedDateLabel = selectedDate
    ? parseIsoDate(selectedDate)
      ? fullDateFormatter.format(parseIsoDate(selectedDate) as Date)
      : selectedDate
    : '';

  const upcomingEvents = useMemo(
    () =>
      calendarEvents
        .filter((event) => event.date >= todayIso)
        .sort((first, second) => first.date.localeCompare(second.date))
        .slice(0, 5),
    [calendarEvents, todayIso],
  );

  const monthCells = useMemo(() => getMonthMatrix(visibleMonth), [visibleMonth]);
  const monthLabel = useMemo(() => {
    const formatted = monthFormatter.format(visibleMonth);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }, [visibleMonth]);

  const kpis = useMemo<KpiCard[]>(() => {
    const committeeTasks = activeTasks.filter(
      (task) => task.fase.trim().toLowerCase() === 'comite',
    );
    const teleworkSegments = [
      { label: 'Por validar', value: pendingTelework.length, className: 'bg-blue-500' },
      {
        label: 'Aprobadas',
        value: activeTelework.filter((solicitud) => solicitud.estado === 'aprobada').length,
        className: 'bg-emerald-500',
      },
      {
        label: 'Denegadas',
        value: activeTelework.filter((solicitud) => solicitud.estado === 'denegada').length,
        className: 'bg-slate-400',
      },
    ];
    const ticketSegments = [
      { label: 'Personas activas', value: activeTicketPeople.length, className: 'bg-emerald-500' },
      {
        label: 'Ausencias con descuento',
        value: activeTicketAbsences.length,
        className: 'bg-orange-500',
      },
    ];

    return [
      {
        title: 'Tareas',
        value: activeTasks.length,
        subtitle: 'abiertas',
        helper: `${criticalTasks.length} críticas`,
        icon: ClipboardList,
        tone: 'text-red-400 bg-red-500/10 ring-1 ring-red-500/20',
        segments: stateSegmentsFromTasks(tasks.filter((task) => !task.deletedAt)),
      },
      {
        title: 'Comité',
        value: openCommitteeSessions.length,
        subtitle: 'sesiones pendientes',
        helper: `${committeeTasks.length} puntos por tratar`,
        icon: UsersRound,
        tone: 'text-orange-400 bg-orange-500/10 ring-1 ring-orange-500/20',
        segments: [
          {
            label: 'Sesiones abiertas',
            value: openCommitteeSessions.length,
            className: 'bg-red-500',
          },
          { label: 'Puntos abiertos', value: committeeTasks.length, className: 'bg-orange-500' },
          {
            label: 'Sesiones cerradas',
            value: sessions.filter((session) => session.status === 'closed').length,
            className: 'bg-emerald-500',
          },
        ],
      },
      {
        title: 'Teletrabajo',
        value: activeTelework.length,
        subtitle: 'solicitudes',
        helper: `${pendingTelework.length} por validar`,
        icon: Laptop,
        tone: 'text-blue-400 bg-blue-500/10 ring-1 ring-blue-500/20',
        segments: teleworkSegments,
      },
      {
        title: 'Tickets',
        value: activeTicketPeople.length,
        subtitle: 'personas activas',
        helper: `${activeTicketAbsences.length} ausencias con descuento`,
        icon: Utensils,
        tone: 'text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/20',
        segments: ticketSegments,
      },
    ];
  }, [
    activeTasks,
    activeTelework,
    activeTicketAbsences,
    activeTicketPeople,
    criticalTasks.length,
    openCommitteeSessions.length,
    pendingTelework.length,
    sessions,
    tasks,
  ]);

  const totalTasks = tasks.filter((task) => !task.deletedAt).length;
  const taskSegments = stateSegmentsFromTasks(tasks.filter((task) => !task.deletedAt));
  const maxTaskSegment = Math.max(...taskSegments.map((segment) => segment.value), 1);

  return (
    <div className="space-y-4">
      <section className="rounded-[2rem] border border-metro-border bg-metro-surface/90 p-5 text-metro-text shadow-glow">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-metro-text">
              Buenos días, Joseba
            </h2>
            <p className="mt-1 text-sm font-medium text-metro-muted capitalize">
              {fullDateFormatter.format(today)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <DashboardHeaderPill label="Tareas abiertas" value={activeTasks.length} />
            <DashboardHeaderPill
              label="Críticas"
              value={criticalTasks.length}
              tone="text-red-400"
            />
            <DashboardHeaderPill label="Comité" value={openCommitteeSessions.length} />
            <DashboardHeaderPill label="Teletrabajo" value={pendingTelework.length} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(18rem,0.95fr)_minmax(24rem,1.25fr)_minmax(16rem,0.75fr)]">
        <article className="rounded-[1.75rem] border border-metro-border bg-metro-surface/90 p-4 text-metro-text shadow-glow">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-black">Calendario</h3>
            <div className="flex items-center gap-3">
              <button
                className="rounded-full p-2 text-metro-secondary transition hover:bg-metro-panel hover:text-metro-text"
                onClick={() =>
                  setVisibleMonth(
                    (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
                  )
                }
                type="button"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="min-w-32 text-center text-sm font-black">{monthLabel}</span>
              <button
                className="rounded-full p-2 text-metro-secondary transition hover:bg-metro-panel hover:text-metro-text"
                onClick={() =>
                  setVisibleMonth(
                    (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
                  )
                }
                type="button"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-black uppercase text-metro-muted">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {monthCells.map((date, index) => {
              const isoDate = date ? toIsoDate(date) : '';
              const events = isoDate ? (eventsByDay[isoDate] ?? []) : [];
              const isToday = isoDate === todayIso;

              return (
                <button
                  className={`min-h-11 rounded-2xl px-1.5 py-1 text-center text-sm font-bold transition ${
                    date
                      ? events.length > 0
                        ? 'cursor-pointer text-metro-secondary hover:bg-metro-panel/70 hover:text-metro-text'
                        : 'text-metro-secondary hover:bg-metro-panel/40'
                      : 'cursor-default text-transparent'
                  } ${isToday ? 'bg-metro-red text-white shadow-lg shadow-red-950/25 hover:bg-metro-dark' : ''}`}
                  disabled={!date}
                  key={`${isoDate}-${index}`}
                  onClick={() => {
                    if (date) {
                      setSelectedDate(isoDate);
                    }
                  }}
                  type="button"
                >
                  <span>{date?.getDate() ?? '·'}</span>
                  <div className="mt-1 flex min-h-2 justify-center gap-0.5">
                    {events.slice(0, 4).map((event) => (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${eventTone[event.type]}`}
                        key={event.id}
                        title={event.title}
                      />
                    ))}
                    {events.length > 4 && (
                      <span className="text-[9px] leading-none text-metro-muted">
                        +{events.length - 4}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold text-metro-secondary">
            <CalendarLegend className="bg-red-500" label="Tareas" />
            <CalendarLegend className="bg-orange-500" label="Comité" />
            <CalendarLegend className="bg-violet-500" label="Paritaria" />
            <CalendarLegend className="bg-blue-500" label="Teletrabajo" />
            <CalendarLegend className="bg-emerald-500" label="Tickets" />
            <CalendarLegend className="bg-amber-400" label="Actas" />
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-metro-border bg-metro-surface/90 p-4 text-metro-text shadow-glow">
          <div className="mb-4 flex items-center justify-between border-b border-metro-border pb-3">
            <h3 className="text-base font-black">Resumen operativo</h3>
            <span className="rounded-full bg-metro-panel px-3 py-1 text-xs font-black text-metro-secondary">
              Este mes
            </span>
          </div>
          <div className="grid gap-5 md:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
              <SummaryLine icon={ListChecks} label="Tareas abiertas" value={activeTasks.length} />
              <SummaryLine
                icon={ClipboardList}
                label="Tareas críticas"
                value={criticalTasks.length}
              />
              <SummaryLine
                icon={UsersRound}
                label="Sesiones CE/Paritaria"
                value={openCommitteeSessions.length + openParitariaSessions.length}
              />
              <SummaryLine
                icon={Laptop}
                label="Solicitudes teletrabajo"
                value={pendingTelework.length}
              />
              <SummaryLine
                icon={CheckCircle2}
                label="Actas en seguimiento"
                value={actaTasks.length}
              />
            </div>
            <div className="min-w-0 overflow-hidden border-t border-metro-border pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
              <p className="mb-3 text-[11px] font-black uppercase tracking-wide text-metro-muted">
                Tareas por estado
              </p>
              <div className="space-y-2">
                {taskSegments.map((segment) => (
                  <div
                    className="grid min-w-0 grid-cols-[4.7rem_minmax(0,1fr)_1.5rem] items-center gap-2"
                    key={segment.label}
                  >
                    <span className="truncate text-[11px] font-bold text-metro-secondary">
                      {segment.label}
                    </span>
                    <div className="h-2.5 min-w-0 overflow-hidden rounded-full bg-metro-panel">
                      <div
                        className={`h-full rounded-full ${segment.className}`}
                        style={{ width: `${Math.max(6, (segment.value / maxTaskSegment) * 100)}%` }}
                      />
                    </div>
                    <span className="text-right text-[11px] font-black text-metro-text">
                      {segment.value}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-metro-border pt-3 text-xs font-black">
                <span>Total tareas</span>
                <span>{totalTasks}</span>
              </div>
            </div>
          </div>
        </article>

        <aside className="rounded-[1.75rem] border border-metro-border bg-metro-surface/90 p-4 text-metro-text shadow-glow">
          <h3 className="text-base font-black">Hoy</h3>
          <p className="mt-1 text-sm font-medium capitalize text-metro-muted">
            {fullDateFormatter.format(today)}
          </p>
          <div className="mt-4 space-y-3">
            <TodayAlert
              className="border-red-500"
              title={`${criticalTasks.length} tareas críticas`}
            />
            <TodayAlert
              className="border-orange-500"
              title={
                upcomingEvents.find((event) => event.type === 'committee' || event.type === 'paritaria')?.title ??
                'Sin comité/paritaria próximo'
              }
              subtitle={
                upcomingEvents.find((event) => event.type === 'committee' || event.type === 'paritaria')
                  ? `Próximo ${formatDisplayDate(
                      upcomingEvents.find((event) => event.type === 'committee' || event.type === 'paritaria')?.date ?? '',
                    )}`
                  : 'No hay sesión abierta con fecha'
              }
            />
            <TodayAlert
              className="border-blue-500"
              title={`${pendingTelework.length} teletrabajos`}
              subtitle="Pendientes de validar"
            />
            <TodayAlert
              className="border-emerald-500"
              title="Cálculo tickets"
              subtitle={`${activeTicketPeople.length} personas activas`}
            />
            <TodayAlert
              className="border-amber-400"
              title={`${actaTasks.length} actas en seguimiento`}
              subtitle="Requieren revisión si vencen"
            />
          </div>
        </aside>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <article
            className="rounded-[1.5rem] border border-metro-border bg-metro-surface/90 p-4 text-metro-text shadow-glow"
            key={kpi.title}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`rounded-2xl p-2 ${kpi.tone}`}>
                  <kpi.icon size={21} />
                </span>
                <h3 className="text-sm font-black">{kpi.title}</h3>
              </div>
              <ChevronRight className="text-metro-muted" size={18} />
            </div>
            <div className="grid grid-cols-[1fr_5.2rem] items-center gap-3">
              <div>
                <p className="text-4xl font-black tracking-tight">{kpi.value}</p>
                <p className="text-sm font-medium text-metro-muted">{kpi.subtitle}</p>
                <p className="mt-2 text-xs font-black text-red-400">{kpi.helper}</p>
              </div>
              <div
                className="relative h-20 w-20 rounded-full p-2"
                style={miniDonutStyle(kpi.segments)}
              >
                <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-metro-surface text-center shadow-inner">
                  <span className="text-sm font-black">
                    {kpi.segments.reduce((sum, segment) => sum + segment.value, 0)}
                  </span>
                  <span className="text-[10px] font-bold text-metro-muted">Total</span>
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-xs font-semibold text-metro-secondary">
              {kpi.segments.map((segment) => (
                <div className="flex items-center justify-between gap-3" key={segment.label}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${segment.className}`} />
                    <span className="truncate">{segment.label}</span>
                  </span>
                  <span className="font-black text-metro-text">{segment.value}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_0.85fr_1fr]">
        <DashboardList title="Mis tareas críticas" action="Ver todas mis tareas" onActionClick={() => openRecord({ view: 'tareas' })}>
          {criticalTasks.slice(0, 5).map((task) => (
            <DashboardListRow
              badge={task.prioridad === 'critica' ? 'Crítica' : 'Alta'}
              date={formatDisplayDate(task.fechaLimite)}
              key={task.id}
              label={task.titulo}
              meta={task.fase || 'Tareas'}
              tone="bg-red-500"
              onClick={() => openRecord({ view: 'tareas', recordId: task.id })}
            />
          ))}
          {criticalTasks.length === 0 && (
            <EmptyDashboardRow text="No hay tareas críticas abiertas." />
          )}
        </DashboardList>

        <DashboardList title="Próximos hitos" action="Ver calendario completo" onActionClick={() => setSelectedDate(todayIso)}>
          {upcomingEvents.slice(0, 5).map((event) => (
            <DashboardListRow
              badge={formatDisplayDate(event.date)}
              date=""
              key={event.id}
              label={event.title}
              meta={event.detail}
              tone={eventTone[event.type]}
              onClick={() => openRecord({ view: event.view, recordId: event.recordId })}
            />
          ))}
          {upcomingEvents.length === 0 && (
            <EmptyDashboardRow text="No hay hitos próximos con fecha." />
          )}
        </DashboardList>

        <DashboardList title="Actividad reciente" action="Ver toda la actividad" onActionClick={() => openRecord({ view: 'tareas' })}>
          {tasks
            .filter((task) => !task.deletedAt)
            .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
            .slice(0, 5)
            .map((task) => (
              <DashboardListRow
                badge={formatDisplayDate(task.updatedAt.slice(0, 10))}
                date=""
                key={task.id}
                label={`Tarea actualizada: ${task.titulo}`}
                meta={taskStateLabels[task.estado]}
                tone="bg-slate-400"
                onClick={() => openRecord({ view: 'tareas', recordId: task.id })}
              />
            ))}
          {tasks.filter((task) => !task.deletedAt).length === 0 && (
            <EmptyDashboardRow text="Aún no hay actividad registrada." />
          )}
        </DashboardList>
      </section>

      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-[1.5rem] border border-metro-border bg-metro-surface text-metro-text shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-metro-border px-5 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-metro-red">
                  Calendario
                </p>
                <h3 className="mt-1 text-lg font-black capitalize">{selectedDateLabel}</h3>
                <p className="mt-1 text-sm font-medium text-metro-muted">
                  {selectedDateEvents.length === 0
                    ? 'No hay registros asociados a esta fecha.'
                    : `${selectedDateEvents.length} registro${selectedDateEvents.length === 1 ? '' : 's'} asociado${selectedDateEvents.length === 1 ? '' : 's'}.`}
                </p>
              </div>
              <button
                className="rounded-full p-2 text-metro-muted transition hover:bg-metro-panel hover:text-metro-text"
                onClick={() => setSelectedDate(null)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-auto p-4">
              {selectedDateEvents.length > 0 ? (
                <div className="space-y-3">
                  {selectedDateEvents.map((event) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded-2xl bg-metro-panel/70 p-3 ring-1 ring-metro-border"
                      key={event.id}
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-black text-metro-text">
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${eventTone[event.type]}`}
                          />
                          <span className="truncate">{event.title}</span>
                        </p>
                        <p className="mt-1 truncate text-xs font-medium text-metro-muted">
                          {event.detail}
                        </p>
                      </div>
                      <button
                        className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-xs font-black text-metro-secondary transition hover:border-metro-red hover:text-metro-text"
                        onClick={() => {
                          openRecord({ view: event.view, recordId: event.recordId });
                          setSelectedDate(null);
                        }}
                        type="button"
                      >
                        Abrir <ExternalLink size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl bg-metro-panel/70 px-4 py-3 text-sm font-semibold text-metro-muted">
                  Selecciona otro día con puntos de color para ver tareas, sesiones o registros.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardHeaderPill({
  label,
  value,
  tone = 'text-metro-text',
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl bg-metro-panel/70 px-4 py-3 ring-1 ring-metro-border">
      <p className={`text-xl font-black ${tone}`}>{value}</p>
      <p className="text-xs font-bold text-metro-muted">{label}</p>
    </div>
  );
}

function CalendarLegend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} /> {label}
    </span>
  );
}

function SummaryLine({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-metro-panel/70 px-3 py-2 ring-1 ring-metro-border">
      <div className="flex min-w-0 items-center gap-3">
        <span className="rounded-xl bg-metro-raised p-2 text-blue-400 shadow-sm">
          <Icon size={17} />
        </span>
        <span className="truncate text-sm font-bold text-metro-secondary">{label}</span>
      </div>
      <span className="text-lg font-black text-metro-text">{value}</span>
    </div>
  );
}

function TodayAlert({
  className,
  title,
  subtitle = 'Requiere atención',
}: {
  className: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      className={`rounded-2xl border-l-4 bg-metro-panel/70 px-4 py-3 ring-1 ring-metro-border ${className}`}
    >
      <p className="text-sm font-black text-metro-text">{title}</p>
      <p className="mt-0.5 text-xs font-medium text-metro-muted">{subtitle}</p>
    </div>
  );
}

function DashboardList({
  title,
  action,
  children,
  onActionClick,
}: {
  title: string;
  action: string;
  children: ReactNode;
  onActionClick?: () => void;
}) {
  return (
    <article className="rounded-[1.5rem] border border-metro-border bg-metro-surface/90 p-4 text-metro-text shadow-glow">
      <h3 className="mb-4 text-base font-black">{title}</h3>
      <div className="space-y-3">{children}</div>
      <button
        className="mt-5 text-xs font-black text-metro-red hover:text-red-400"
        onClick={onActionClick}
        type="button"
      >
        {action} <ChevronRight className="inline" size={14} />
      </button>
    </article>
  );
}

function DashboardListRow({
  badge,
  date,
  label,
  meta,
  tone,
  onClick,
}: {
  badge: string;
  date: string;
  label: string;
  meta: string;
  tone: string;
  onClick?: () => void;
}) {
  const rowClassName = `grid w-full grid-cols-[0.75rem_1fr_auto] items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm transition ${
    onClick ? 'cursor-pointer hover:bg-white/5 focus:bg-white/5 focus:outline-none' : ''
  }`;
  const content = (
    <>
      <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
      <div className="min-w-0">
        <p className="truncate font-black text-metro-text">{label}</p>
        <p className="truncate text-xs font-medium text-metro-muted">{meta}</p>
      </div>
      <div className="flex items-center gap-2 text-right text-xs font-black">
        <span className="rounded-full bg-metro-panel px-2 py-1 text-metro-secondary">{badge}</span>
        {date && <span className="text-metro-muted">{date}</span>}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button className={rowClassName} onClick={onClick} type="button">
        {content}
      </button>
    );
  }

  return <div className={rowClassName}>{content}</div>;
}

function EmptyDashboardRow({ text }: { text: string }) {
  return (
    <p className="rounded-2xl bg-metro-panel/70 px-4 py-3 text-sm font-semibold text-metro-muted">
      {text}
    </p>
  );
}

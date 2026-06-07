import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Laptop,
  ListChecks,
  Utensils,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { isTaskClosed, type Task, type TaskState } from '../features/tareas/domain/task';
import { useTaskStore } from '../features/tareas/store/useTaskStore';
import { useCommitteeSessionStore } from '../features/comite/store/useCommitteeSessionStore';
import { useTeletrabajoStore } from '../features/teletrabajo/store/useTeletrabajoStore';
import { useTicketRestauranteStore } from '../features/ticket-restaurante/store/useTicketRestauranteStore';

type CalendarEventType = 'task' | 'committee' | 'telework' | 'tickets' | 'actas';

type CalendarEvent = {
  id: string;
  date: string;
  type: CalendarEventType;
  title: string;
  detail: string;
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

export function DashboardCards() {
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const today = useMemo(() => new Date(), []);
  const todayIso = toIsoDate(today);

  const tasks = useTaskStore((state) => state.tasks);
  const loadTasks = useTaskStore((state) => state.load);
  const sessions = useCommitteeSessionStore((state) => state.sessions);
  const loadSessions = useCommitteeSessionStore((state) => state.load);
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
  }, [loadSessions, loadSolicitudes, loadTasks, loadTickets]);

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
      }));

    const committeeEvents = openCommitteeSessions.map((session) => ({
      id: `committee-${session.id}`,
      date: session.date,
      type: 'committee' as const,
      title: session.title,
      detail: `${session.items.length} punto${session.items.length === 1 ? '' : 's'} en orden del día`,
    }));

    const teleworkEvents = pendingTelework
      .filter((solicitud) => solicitud.fechaSolicitud)
      .map((solicitud) => ({
        id: `telework-${solicitud.id}`,
        date: solicitud.fechaSolicitud,
        type: 'telework' as const,
        title: solicitud.nombreApellidos,
        detail: 'Solicitud de teletrabajo pendiente',
      }));

    const ticketEvents = activeTicketAbsences.slice(0, 30).map((absence) => ({
      id: `ticket-${absence.id}`,
      date: absence.desde,
      type: 'tickets' as const,
      title: absence.nombreApellidos,
      detail: `${absence.motivo} · afecta ticket`,
    }));

    const actaEvents = actaTasks
      .filter((task) => task.fechaLimite)
      .map((task) => ({
        id: `acta-${task.id}`,
        date: task.fechaLimite,
        type: 'actas' as const,
        title: task.titulo,
        detail: 'Seguimiento de acta',
      }));

    return [...taskEvents, ...committeeEvents, ...teleworkEvents, ...ticketEvents, ...actaEvents];
  }, [activeTasks, actaTasks, activeTicketAbsences, openCommitteeSessions, pendingTelework]);

  const eventsByDay = useMemo(
    () =>
      calendarEvents.reduce<Record<string, CalendarEvent[]>>((accumulator, event) => {
        accumulator[event.date] = [...(accumulator[event.date] ?? []), event];
        return accumulator;
      }, {}),
    [calendarEvents],
  );

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
    const committeeTasks = activeTasks.filter((task) => task.fase.trim().toLowerCase() === 'comite');
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
      { label: 'Ausencias con descuento', value: activeTicketAbsences.length, className: 'bg-orange-500' },
    ];

    return [
      {
        title: 'Tareas',
        value: activeTasks.length,
        subtitle: 'abiertas',
        helper: `${criticalTasks.length} críticas`,
        icon: ClipboardList,
        tone: 'text-red-500 bg-red-50',
        segments: stateSegmentsFromTasks(tasks.filter((task) => !task.deletedAt)),
      },
      {
        title: 'Comité',
        value: openCommitteeSessions.length,
        subtitle: 'sesiones pendientes',
        helper: `${committeeTasks.length} puntos por tratar`,
        icon: UsersRound,
        tone: 'text-orange-500 bg-orange-50',
        segments: [
          { label: 'Sesiones abiertas', value: openCommitteeSessions.length, className: 'bg-red-500' },
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
        tone: 'text-blue-500 bg-blue-50',
        segments: teleworkSegments,
      },
      {
        title: 'Tickets',
        value: activeTicketPeople.length,
        subtitle: 'personas activas',
        helper: `${activeTicketAbsences.length} ausencias con descuento`,
        icon: Utensils,
        tone: 'text-emerald-600 bg-emerald-50',
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
      <section className="rounded-[2rem] border border-white/70 bg-white p-5 text-slate-950 shadow-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">Buenos días, Joseba</h2>
            <p className="mt-1 text-sm font-medium text-slate-500 capitalize">
              {fullDateFormatter.format(today)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <DashboardHeaderPill label="Tareas abiertas" value={activeTasks.length} />
            <DashboardHeaderPill label="Críticas" value={criticalTasks.length} tone="text-red-600" />
            <DashboardHeaderPill label="Comité" value={openCommitteeSessions.length} />
            <DashboardHeaderPill label="Teletrabajo" value={pendingTelework.length} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_1.35fr_0.72fr]">
        <article className="rounded-[1.75rem] border border-white/70 bg-white p-4 text-slate-950 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-black">Calendario</h3>
            <div className="flex items-center gap-3">
              <button
                className="rounded-full p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
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
                className="rounded-full p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
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

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-black uppercase text-slate-500">
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
                <div
                  className={`min-h-11 rounded-2xl px-1.5 py-1 text-center text-sm font-bold transition ${
                    date ? 'text-slate-950 hover:bg-slate-50' : 'text-transparent'
                  } ${isToday ? 'bg-slate-950 text-white shadow-lg shadow-slate-900/20 hover:bg-slate-900' : ''}`}
                  key={`${isoDate}-${index}`}
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
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold text-slate-600">
            <CalendarLegend className="bg-red-500" label="Tareas" />
            <CalendarLegend className="bg-orange-500" label="Comité" />
            <CalendarLegend className="bg-blue-500" label="Teletrabajo" />
            <CalendarLegend className="bg-emerald-500" label="Tickets" />
            <CalendarLegend className="bg-amber-400" label="Actas" />
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-white/70 bg-white p-4 text-slate-950 shadow-card">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-black">Resumen operativo</h3>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
              Este mes
            </span>
          </div>
          <div className="grid gap-5 md:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
              <SummaryLine icon={ListChecks} label="Tareas abiertas" value={activeTasks.length} />
              <SummaryLine icon={ClipboardList} label="Tareas críticas" value={criticalTasks.length} />
              <SummaryLine
                icon={UsersRound}
                label="Sesiones comité pendientes"
                value={openCommitteeSessions.length}
              />
              <SummaryLine icon={Laptop} label="Solicitudes teletrabajo" value={pendingTelework.length} />
              <SummaryLine icon={CheckCircle2} label="Actas en seguimiento" value={actaTasks.length} />
            </div>
            <div className="border-t border-slate-100 pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
              <p className="mb-4 text-xs font-black uppercase tracking-wide text-slate-500">
                Tareas por estado
              </p>
              <div className="space-y-3">
                {taskSegments.map((segment) => (
                  <div className="grid grid-cols-[5.8rem_1fr_2rem] items-center gap-3" key={segment.label}>
                    <span className="text-xs font-bold text-slate-600">{segment.label}</span>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${segment.className}`}
                        style={{ width: `${Math.max(6, (segment.value / maxTaskSegment) * 100)}%` }}
                      />
                    </div>
                    <span className="text-right text-xs font-black text-slate-950">{segment.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm font-black">
                <span>Total tareas</span>
                <span>{totalTasks}</span>
              </div>
            </div>
          </div>
        </article>

        <aside className="rounded-[1.75rem] border border-white/70 bg-white p-4 text-slate-950 shadow-card">
          <h3 className="text-base font-black">Hoy</h3>
          <p className="mt-1 text-sm font-medium capitalize text-slate-500">
            {fullDateFormatter.format(today)}
          </p>
          <div className="mt-4 space-y-3">
            <TodayAlert className="border-red-500" title={`${criticalTasks.length} tareas críticas`} />
            <TodayAlert
              className="border-orange-500"
              title={
                upcomingEvents.find((event) => event.type === 'committee')?.title ??
                'Sin comité próximo'
              }
              subtitle={
                upcomingEvents.find((event) => event.type === 'committee')
                  ? `Próximo ${formatDisplayDate(
                      upcomingEvents.find((event) => event.type === 'committee')?.date ?? '',
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

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <article
            className="rounded-[1.5rem] border border-white/70 bg-white p-4 text-slate-950 shadow-card"
            key={kpi.title}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`rounded-2xl p-2 ${kpi.tone}`}>
                  <kpi.icon size={21} />
                </span>
                <h3 className="text-sm font-black">{kpi.title}</h3>
              </div>
              <ChevronRight className="text-slate-400" size={18} />
            </div>
            <div className="grid grid-cols-[1fr_5.2rem] items-center gap-3">
              <div>
                <p className="text-4xl font-black tracking-tight">{kpi.value}</p>
                <p className="text-sm font-medium text-slate-500">{kpi.subtitle}</p>
                <p className="mt-2 text-xs font-black text-red-500">{kpi.helper}</p>
              </div>
              <div className="relative h-20 w-20 rounded-full p-2" style={miniDonutStyle(kpi.segments)}>
                <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white text-center shadow-inner">
                  <span className="text-sm font-black">
                    {kpi.segments.reduce((sum, segment) => sum + segment.value, 0)}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">Total</span>
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-xs font-semibold text-slate-600">
              {kpi.segments.map((segment) => (
                <div className="flex items-center justify-between gap-3" key={segment.label}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${segment.className}`} />
                    <span className="truncate">{segment.label}</span>
                  </span>
                  <span className="font-black text-slate-950">{segment.value}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.85fr_1fr]">
        <DashboardList title="Mis tareas críticas" action="Ver todas mis tareas">
          {criticalTasks.slice(0, 5).map((task) => (
            <DashboardListRow
              badge={task.prioridad === 'critica' ? 'Crítica' : 'Alta'}
              date={formatDisplayDate(task.fechaLimite)}
              key={task.id}
              label={task.titulo}
              meta={task.fase || 'Tareas'}
              tone="bg-red-500"
            />
          ))}
          {criticalTasks.length === 0 && <EmptyDashboardRow text="No hay tareas críticas abiertas." />}
        </DashboardList>

        <DashboardList title="Próximos hitos" action="Ver calendario completo">
          {upcomingEvents.slice(0, 5).map((event) => (
            <DashboardListRow
              badge={formatDisplayDate(event.date)}
              date=""
              key={event.id}
              label={event.title}
              meta={event.detail}
              tone={eventTone[event.type]}
            />
          ))}
          {upcomingEvents.length === 0 && <EmptyDashboardRow text="No hay hitos próximos con fecha." />}
        </DashboardList>

        <DashboardList title="Actividad reciente" action="Ver toda la actividad">
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
              />
            ))}
          {tasks.filter((task) => !task.deletedAt).length === 0 && (
            <EmptyDashboardRow text="Aún no hay actividad registrada." />
          )}
        </DashboardList>
      </section>
    </div>
  );
}

function DashboardHeaderPill({
  label,
  value,
  tone = 'text-slate-950',
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
      <p className={`text-xl font-black ${tone}`}>{value}</p>
      <p className="text-xs font-bold text-slate-500">{label}</p>
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

function SummaryLine({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
      <div className="flex min-w-0 items-center gap-3">
        <span className="rounded-xl bg-white p-2 text-blue-500 shadow-sm">
          <Icon size={17} />
        </span>
        <span className="truncate text-sm font-bold text-slate-700">{label}</span>
      </div>
      <span className="text-lg font-black text-slate-950">{value}</span>
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
    <div className={`rounded-2xl border-l-4 bg-slate-50 px-4 py-3 ring-1 ring-slate-100 ${className}`}>
      <p className="text-sm font-black text-slate-950">{title}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-500">{subtitle}</p>
    </div>
  );
}

function DashboardList({
  title,
  action,
  children,
}: {
  title: string;
  action: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-[1.5rem] border border-white/70 bg-white p-4 text-slate-950 shadow-card">
      <h3 className="mb-4 text-base font-black">{title}</h3>
      <div className="space-y-3">{children}</div>
      <button className="mt-5 text-xs font-black text-red-500 hover:text-red-600" type="button">
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
}: {
  badge: string;
  date: string;
  label: string;
  meta: string;
  tone: string;
}) {
  return (
    <div className="grid grid-cols-[0.75rem_1fr_auto] items-center gap-3 text-sm">
      <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
      <div className="min-w-0">
        <p className="truncate font-black text-slate-950">{label}</p>
        <p className="truncate text-xs font-medium text-slate-500">{meta}</p>
      </div>
      <div className="flex items-center gap-2 text-right text-xs font-black">
        <span className="rounded-full bg-slate-50 px-2 py-1 text-slate-600">{badge}</span>
        {date && <span className="text-slate-500">{date}</span>}
      </div>
    </div>
  );
}

function EmptyDashboardRow({ text }: { text: string }) {
  return <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">{text}</p>;
}

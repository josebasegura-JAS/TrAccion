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
import type { AppView } from '../navigation/navigation';
import { readStorageItem } from '../services/persistence';

type CalendarEventType = 'task' | 'committee' | 'paritaria' | 'telework' | 'tickets' | 'actas';

type DashboardPopupItem = {
  id: string;
  date?: string;
  type: CalendarEventType;
  title: string;
  detail: string;
  view: AppView;
  recordId?: string;
};

type CalendarEvent = DashboardPopupItem & {
  date: string;
};

type DashboardPopup = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  emptyText: string;
  items: DashboardPopupItem[];
};

type DashboardNavigationTarget = {
  view: AppView;
  recordId?: string;
};


function getStoredDashboardUserName(): string {
  if (typeof window === 'undefined') {
    return 'Usuario local';
  }

  return readStorageItem('traccion.header.username')?.trim() || 'Usuario local';
}

function getGreetingUserName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'Usuario local') {
    return 'usuario';
  }

  return trimmed;
}

type KpiCard = {
  title: string;
  value: number | string;
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
  const [dashboardPopup, setDashboardPopup] = useState<DashboardPopup | null>(null);
  const [dashboardUserName, setDashboardUserName] = useState(getStoredDashboardUserName);
  const today = useMemo(() => new Date(), []);
  const todayIso = toIsoDate(today);
  const todayLabel = fullDateFormatter.format(today);

  const tasks = useTaskStore((state) => state.tasks);
  const loadTasks = useTaskStore((state) => state.load);
  const sessions = useCommitteeSessionStore((state) => state.sessions);
  const loadSessions = useCommitteeSessionStore((state) => state.load);
  const paritariaSessions = useParitariaSessionStore((state) => state.sessions);
  const loadParitariaSessions = useParitariaSessionStore((state) => state.load);
  const solicitudes = useTeletrabajoStore((state) => state.solicitudes);
  const loadSolicitudes = useTeletrabajoStore((state) => state.load);
  const [ticketSummary, setTicketSummary] = useState({ loaded: false, people: 0, absences: 0 });

  useEffect(() => {
    loadTasks();
    loadSessions();
    loadSolicitudes();
    loadParitariaSessions();
    setDashboardUserName(getStoredDashboardUserName());
  }, [loadParitariaSessions, loadSessions, loadSolicitudes, loadTasks]);

  useEffect(() => {
    let isMounted = true;

    window.traccion
      ?.getWindowsUser?.()
      .then((userName) => {
        if (isMounted) {
          setDashboardUserName(userName?.trim() || getStoredDashboardUserName());
        }
      })
      .catch(() => {
        if (isMounted) {
          setDashboardUserName(getStoredDashboardUserName());
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const openRecord = (target: DashboardNavigationTarget) => {
    onOpenRecord?.(target);
  };


  const openPopup = (popup: DashboardPopup) => {
    setDashboardPopup(popup);
  };

  const openPopupRecord = (item: DashboardPopupItem) => {
    openRecord({ view: item.view, recordId: item.recordId });
    setSelectedDate(null);
    setDashboardPopup(null);
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
  const getActiveTicketData = () => {
    const ticketStore = useTicketRestauranteStore.getState();
    ticketStore.load();

    const currentTicketStore = useTicketRestauranteStore.getState();
    const people = currentTicketStore.people.filter((person) => person.activo && !person.deletedAt);
    const absences = currentTicketStore.absences.filter(
      (absence) => !absence.deletedAt && absence.afectaTicket,
    );

    setTicketSummary({ loaded: true, people: people.length, absences: absences.length });

    return { people, absences };
  };
  const actaTasks = useMemo(
    () =>
      activeTasks.filter((task) =>
        [task.fase, task.titulo, task.descripcion].some((value) =>
          value.toLowerCase().includes('acta'),
        ),
      ),
    [activeTasks],
  );


  const allVisibleTasks = useMemo(() => tasks.filter((task) => !task.deletedAt), [tasks]);
  const committeeTasks = useMemo(
    () => activeTasks.filter((task) => task.fase.trim().toLowerCase() === 'comite'),
    [activeTasks],
  );


  const taskPopupItems = (items: readonly Task[], type: CalendarEventType = 'task'): DashboardPopupItem[] =>
    items.map((task) => ({
      id: `${type}-${task.id}`,
      date: task.fechaLimite || task.updatedAt.slice(0, 10),
      type,
      title: task.titulo,
      detail: `${task.fase || 'Tareas'} · ${taskStateLabels[task.estado]} · prioridad ${task.prioridad}`,
      view: 'tareas' as const,
      recordId: task.id,
    }));

  const committeePopupItems = (): DashboardPopupItem[] => [
    ...openCommitteeSessions.map((session) => ({
      id: `committee-${session.id}`,
      date: session.date,
      type: 'committee' as const,
      title: session.title,
      detail: `${session.items.length} punto${session.items.length === 1 ? '' : 's'} · ${session.code || 'sin código'}`,
      view: 'comite' as const,
      recordId: session.id,
    })),
    ...openParitariaSessions.map((session) => ({
      id: `paritaria-${session.id}`,
      date: session.date,
      type: 'paritaria' as const,
      title: session.title,
      detail: `${session.items.length} punto${session.items.length === 1 ? '' : 's'} · ${session.code || 'sin código'}`,
      view: 'paritaria' as const,
      recordId: session.id,
    })),
  ];

  const teleworkPopupItems = (items = pendingTelework): DashboardPopupItem[] =>
    items.map((solicitud) => ({
      id: `telework-${solicitud.id}`,
      date: solicitud.fechaSolicitud,
      type: 'telework' as const,
      title: solicitud.nombreApellidos || solicitud.empleado,
      detail: `${solicitud.estado} · ${solicitud.tipoSolicitud} · ${solicitud.diasTeletrabajo.join(', ') || 'sin días'}`,
      view: 'teletrabajo' as const,
      recordId: solicitud.id,
    }));

  const buildTicketAbsencePopupItems = (absences: ReturnType<typeof getActiveTicketData>['absences']): DashboardPopupItem[] =>
    absences.map((absence) => ({
      id: `ticket-${absence.id}`,
      date: absence.desde,
      type: 'tickets' as const,
      title: absence.nombreApellidos || absence.empleado,
      detail: `${absence.motivo} · ${formatDisplayDate(absence.desde)}-${formatDisplayDate(absence.hasta)} · ${absence.totalDias} día${absence.totalDias === 1 ? '' : 's'}`,
      view: 'ticket-restaurante' as const,
      recordId: absence.id,
    }));

  const buildTicketPeoplePopupItems = (people: ReturnType<typeof getActiveTicketData>['people']): DashboardPopupItem[] =>
    people.map((person) => ({
      id: `ticket-person-${person.empleado}`,
      type: 'tickets' as const,
      title: person.nombreApellidos || person.empleado,
      detail: `${person.empleado} · ${person.puesto || 'sin puesto'}`,
      view: 'ticket-restaurante' as const,
    }));

  const showTicketPopup = (mode: 'all' | 'people' = 'all') => {
    const { people, absences } = getActiveTicketData();
    const items =
      mode === 'people'
        ? buildTicketPeoplePopupItems(people)
        : [...buildTicketAbsencePopupItems(absences), ...buildTicketPeoplePopupItems(people)];

    openPopup({
      eyebrow: 'Dashboard',
      title: mode === 'people' ? 'Personas activas en Ticket Restaurante' : 'Ticket Restaurante',
      subtitle: `${people.length} persona${people.length === 1 ? '' : 's'} · ${absences.length} ausencia${absences.length === 1 ? '' : 's'} con descuento`,
      emptyText: 'No hay registros de Ticket Restaurante.',
      items,
    });
  };

  const showTaskPopup = (title: string, items: readonly Task[], emptyText = 'No hay tareas que mostrar.') => {
    openPopup({
      eyebrow: 'Dashboard',
      title,
      subtitle: `${items.length} registro${items.length === 1 ? '' : 's'}`,
      emptyText,
      items: taskPopupItems(items),
    });
  };

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

    return [
      ...taskEvents,
      ...committeeEvents,
      ...paritariaEvents,
      ...teleworkEvents,
      ...actaEvents,
    ];
  }, [
    activeTasks,
    actaTasks,
    openCommitteeSessions,
    openParitariaSessions,
    pendingTelework,
  ]);

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
      { label: 'Personas activas', value: ticketSummary.loaded ? ticketSummary.people : 0, className: 'bg-emerald-500' },
      {
        label: 'Ausencias con descuento',
        value: ticketSummary.loaded ? ticketSummary.absences : 0,
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
        segments: stateSegmentsFromTasks(allVisibleTasks),
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
        value: ticketSummary.loaded ? ticketSummary.people : '—',
        subtitle: ticketSummary.loaded ? 'personas activas' : 'carga bajo demanda',
        helper: ticketSummary.loaded ? `${ticketSummary.absences} ausencias con descuento` : 'clic para consultar',
        icon: Utensils,
        tone: 'text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/20',
        segments: ticketSegments,
      },
    ];
  }, [
    activeTasks.length,
    activeTelework,
    committeeTasks.length,
    criticalTasks.length,
    openCommitteeSessions.length,
    pendingTelework.length,
    sessions,
    allVisibleTasks,
    ticketSummary,
  ]);

  const totalTasks = allVisibleTasks.length;
  const taskSegments = stateSegmentsFromTasks(allVisibleTasks);
  const maxTaskSegment = Math.max(...taskSegments.map((segment) => segment.value), 1);

  return (
    <div className="space-y-4">
      <section className="rounded-[1.5rem] border border-metro-border bg-metro-surface/90 p-3 text-metro-text shadow-glow">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-black tracking-tight text-metro-text">
              Buenos días, {getGreetingUserName(dashboardUserName)}
            </h2>
            <p className="mt-0.5 text-xs font-semibold text-metro-muted">
              Vista ejecutiva de Relaciones Laborales
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <DashboardHeaderPill label="Tareas abiertas" value={activeTasks.length} onClick={() => showTaskPopup('Tareas abiertas', activeTasks)} />
            <DashboardHeaderPill
              label="Críticas"
              value={criticalTasks.length}
              tone="text-red-400"
              onClick={() => showTaskPopup('Tareas críticas', criticalTasks)}
            />
            <DashboardHeaderPill label="Comité" value={openCommitteeSessions.length} onClick={() => openPopup({ eyebrow: 'Dashboard', title: 'Sesiones de Comité', subtitle: `${openCommitteeSessions.length} sesión${openCommitteeSessions.length === 1 ? '' : 'es'} abierta${openCommitteeSessions.length === 1 ? '' : 's'}`, emptyText: 'No hay sesiones de Comité abiertas.', items: committeePopupItems().filter((item) => item.type === 'committee') })} />
            <DashboardHeaderPill label="Teletrabajo" value={pendingTelework.length} onClick={() => openPopup({ eyebrow: 'Dashboard', title: 'Teletrabajo pendiente', subtitle: `${pendingTelework.length} solicitud${pendingTelework.length === 1 ? '' : 'es'}`, emptyText: 'No hay solicitudes pendientes.', items: teleworkPopupItems() })} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <button
            className="rounded-[1.25rem] border border-metro-border bg-metro-surface/90 p-3 text-left text-metro-text shadow-glow transition hover:border-metro-red hover:bg-metro-panel/60 focus:outline-none focus:ring-2 focus:ring-metro-red/40"
            key={kpi.title}
            onClick={() => {
              if (kpi.title === 'Tareas') {
                showTaskPopup('Tareas abiertas', activeTasks);
              } else if (kpi.title === 'Comité') {
                openPopup({ eyebrow: 'Dashboard', title: 'Comité y puntos abiertos', subtitle: `${openCommitteeSessions.length} sesiones · ${committeeTasks.length} puntos`, emptyText: 'No hay sesiones ni puntos abiertos.', items: [...committeePopupItems().filter((item) => item.type === 'committee'), ...taskPopupItems(committeeTasks)] });
              } else if (kpi.title === 'Teletrabajo') {
                openPopup({ eyebrow: 'Dashboard', title: 'Solicitudes de teletrabajo', subtitle: `${activeTelework.length} solicitud${activeTelework.length === 1 ? '' : 'es'}`, emptyText: 'No hay solicitudes de teletrabajo.', items: teleworkPopupItems(activeTelework) });
              } else if (kpi.title === 'Tickets') {
                showTicketPopup();
              }
            }}
            type="button"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`rounded-xl p-1.5 ${kpi.tone}`}>
                  <kpi.icon size={18} />
                </span>
                <h3 className="text-sm font-black">{kpi.title}</h3>
              </div>
              <ChevronRight className="text-metro-muted" size={18} />
            </div>
            <div className="grid grid-cols-[1fr_4.3rem] items-center gap-2">
              <div>
                <p className="text-3xl font-black tracking-tight">{kpi.value}</p>
                <p className="text-sm font-medium text-metro-muted">{kpi.subtitle}</p>
                <p className="mt-2 text-xs font-black text-red-400">{kpi.helper}</p>
              </div>
              <div
                className="relative h-16 w-16 rounded-full p-1.5"
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
            <div className="mt-3 space-y-1.5 text-xs font-semibold text-metro-secondary">
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
          </button>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[0.72fr_1.05fr_0.9fr]">
        <aside className="rounded-[1.75rem] border border-metro-border bg-metro-surface/90 p-3 text-metro-text shadow-glow">
          <h3 className="text-base font-black">Hoy</h3>
          <p className="mt-0.5 text-xs font-semibold capitalize text-metro-muted">{todayLabel}</p>
          <div className="mt-2 space-y-2">
            <TodayAlert
              className="border-red-500"
              title={`${criticalTasks.length} tareas críticas`}
              onClick={() => showTaskPopup('Tareas críticas', criticalTasks)}
            />
            <TodayAlert
              className="border-orange-500"
              onClick={() => openPopup({ eyebrow: 'Dashboard', title: 'Próximo Comité/Paritaria', subtitle: 'Sesiones abiertas con fecha', emptyText: 'No hay sesiones abiertas con fecha.', items: committeePopupItems() })}
              title={
                upcomingEvents.find(
                  (event) => event.type === 'committee' || event.type === 'paritaria',
                )?.title ?? 'Sin comité/paritaria próximo'
              }
              subtitle={
                upcomingEvents.find(
                  (event) => event.type === 'committee' || event.type === 'paritaria',
                )
                  ? `Próximo ${formatDisplayDate(
                      upcomingEvents.find(
                        (event) => event.type === 'committee' || event.type === 'paritaria',
                      )?.date ?? '',
                    )}`
                  : 'No hay sesión abierta con fecha'
              }
            />
            <TodayAlert
              className="border-blue-500"
              title={`${pendingTelework.length} teletrabajos`}
              subtitle="Pendientes de validar"
              onClick={() => openPopup({ eyebrow: 'Dashboard', title: 'Teletrabajo pendiente', subtitle: `${pendingTelework.length} solicitud${pendingTelework.length === 1 ? '' : 'es'}`, emptyText: 'No hay solicitudes pendientes.', items: teleworkPopupItems() })}
            />
            <TodayAlert
              className="border-emerald-500"
              title="Cálculo tickets"
              subtitle={ticketSummary.loaded ? `${ticketSummary.people} personas activas` : 'Pulsa para cargar'}
              onClick={() => showTicketPopup('people')}
            />
            <TodayAlert
              className="border-amber-400"
              title={`${actaTasks.length} actas en seguimiento`}
              subtitle="Requieren revisión si vencen"
              onClick={() => showTaskPopup('Actas en seguimiento', actaTasks, 'No hay actas en seguimiento.')}
            />
          </div>
        </aside>

        <article className="rounded-[1.75rem] border border-metro-border bg-metro-surface/90 p-3 text-metro-text shadow-glow">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-black">Calendario</h3>
            <div className="flex items-center gap-3">
              <button
                className="rounded-full p-1.5 text-metro-secondary transition hover:bg-metro-panel hover:text-metro-text"
                onClick={() =>
                  setVisibleMonth(
                    (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
                  )
                }
                type="button"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="min-w-32 text-center text-sm font-black">{monthLabel}</span>
              <button
                className="rounded-full p-1.5 text-metro-secondary transition hover:bg-metro-panel hover:text-metro-text"
                onClick={() =>
                  setVisibleMonth(
                    (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
                  )
                }
                type="button"
              >
                <ChevronRight size={16} />
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
                  className={`min-h-9 rounded-xl px-1 py-0.5 text-center text-xs font-bold transition ${
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

          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-metro-secondary">
            <CalendarLegend className="bg-red-500" label="Tareas" />
            <CalendarLegend className="bg-orange-500" label="Comité" />
            <CalendarLegend className="bg-violet-500" label="Paritaria" />
            <CalendarLegend className="bg-blue-500" label="Teletrabajo" />
            <CalendarLegend className="bg-amber-400" label="Actas" />
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-metro-border bg-metro-surface/90 p-3 text-metro-text shadow-glow">
          <div className="mb-3 flex items-center justify-between border-b border-metro-border pb-2">
            <h3 className="text-base font-black">Resumen operativo</h3>
            <span className="rounded-full bg-metro-panel px-3 py-1 text-xs font-black text-metro-secondary">
              Este mes
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-2">
              <SummaryLine icon={ListChecks} label="Tareas abiertas" value={activeTasks.length} onClick={() => showTaskPopup('Tareas abiertas', activeTasks)} />
              <SummaryLine
                icon={ClipboardList}
                label="Tareas críticas"
                value={criticalTasks.length}
                onClick={() => showTaskPopup('Tareas críticas', criticalTasks)}
              />
              <SummaryLine
                icon={UsersRound}
                label="Sesiones CE/Paritaria"
                value={openCommitteeSessions.length + openParitariaSessions.length}
                onClick={() => openPopup({ eyebrow: 'Dashboard', title: 'Sesiones CE/Paritaria', subtitle: `${openCommitteeSessions.length + openParitariaSessions.length} sesión${openCommitteeSessions.length + openParitariaSessions.length === 1 ? '' : 'es'}`, emptyText: 'No hay sesiones abiertas.', items: committeePopupItems() })}
              />
              <SummaryLine
                icon={Laptop}
                label="Solicitudes teletrabajo"
                value={pendingTelework.length}
                onClick={() => openPopup({ eyebrow: 'Dashboard', title: 'Solicitudes teletrabajo pendientes', subtitle: `${pendingTelework.length} solicitud${pendingTelework.length === 1 ? '' : 'es'}`, emptyText: 'No hay solicitudes pendientes.', items: teleworkPopupItems() })}
              />
              <SummaryLine
                icon={CheckCircle2}
                label="Actas en seguimiento"
                value={actaTasks.length}
                onClick={() => showTaskPopup('Actas en seguimiento', actaTasks, 'No hay actas en seguimiento.')}
              />
            </div>
            <div className="min-w-0 overflow-hidden border-t border-metro-border pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
              <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-metro-muted">
                Tareas por estado
              </p>
              <div className="space-y-2">
                {taskSegments.map((segment) => (
                  <button
                    className="grid min-w-0 grid-cols-[4.7rem_minmax(0,1fr)_1.5rem] items-center gap-2 rounded-lg text-left transition hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-metro-red/30"
                    key={segment.label}
                    onClick={() => showTaskPopup(`Tareas ${segment.label.toLowerCase()}`, allVisibleTasks.filter((task) => taskStateLabels[task.estado] === segment.label))}
                    type="button"
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
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-metro-border pt-2 text-xs font-black">
                <span>Total tareas</span>
                <span>{totalTasks}</span>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_0.85fr_1fr]">
        <DashboardList
          title="Mis tareas críticas"
          action="Ver todas mis tareas"
          onActionClick={() => openRecord({ view: 'tareas' })}
        >
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

        <DashboardList
          title="Próximos hitos"
          action="Ver calendario completo"
          onActionClick={() => setSelectedDate(todayIso)}
        >
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

        <DashboardList
          title="Actividad reciente"
          action="Ver toda la actividad"
          onActionClick={() => openRecord({ view: 'tareas' })}
        >
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
        <DashboardRecordsModal
          emptyText="Selecciona otro día con puntos de color para ver tareas, sesiones o registros."
          eyebrow="Calendario"
          items={selectedDateEvents}
          onClose={() => setSelectedDate(null)}
          onOpenItem={openPopupRecord}
          subtitle={
            selectedDateEvents.length === 0
              ? 'No hay registros asociados a esta fecha.'
              : `${selectedDateEvents.length} registro${selectedDateEvents.length === 1 ? '' : 's'} asociado${selectedDateEvents.length === 1 ? '' : 's'}.`
          }
          title={selectedDateLabel}
        />
      )}

      {dashboardPopup && (
        <DashboardRecordsModal
          emptyText={dashboardPopup.emptyText}
          eyebrow={dashboardPopup.eyebrow}
          items={dashboardPopup.items}
          onClose={() => setDashboardPopup(null)}
          onOpenItem={openPopupRecord}
          subtitle={dashboardPopup.subtitle}
          title={dashboardPopup.title}
        />
      )}
    </div>
  );
}


function DashboardRecordsModal({
  emptyText,
  eyebrow,
  items,
  onClose,
  onOpenItem,
  subtitle,
  title,
}: {
  emptyText: string;
  eyebrow: string;
  items: DashboardPopupItem[];
  onClose: () => void;
  onOpenItem: (item: DashboardPopupItem) => void;
  subtitle?: string;
  title: string;
}) {
  const visibleItems = items.slice(0, 250);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-[1.5rem] border border-metro-border bg-metro-surface text-metro-text shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-metro-border px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-metro-red">
              {eyebrow}
            </p>
            <h3 className="mt-1 text-lg font-black capitalize">{title}</h3>
            {subtitle && <p className="mt-1 text-sm font-medium text-metro-muted">{subtitle}</p>}
          </div>
          <button
            className="rounded-full p-2 text-metro-muted transition hover:bg-metro-panel hover:text-metro-text"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-auto p-4">
          {visibleItems.length > 0 ? (
            <div className="space-y-3">
              {visibleItems.map((item) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-2xl bg-metro-panel/70 p-3 ring-1 ring-metro-border"
                  key={item.id}
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-black text-metro-text">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${eventTone[item.type]}`}
                      />
                      <span className="truncate">{item.title}</span>
                    </p>
                    <p className="mt-1 truncate text-xs font-medium text-metro-muted">
                      {item.date ? `${formatDisplayDate(item.date)} · ${item.detail}` : item.detail}
                    </p>
                  </div>
                  <button
                    className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-xs font-black text-metro-secondary transition hover:border-metro-red hover:text-metro-text"
                    onClick={() => onOpenItem(item)}
                    type="button"
                  >
                    Abrir <ExternalLink size={13} />
                  </button>
                </div>
              ))}
              {hiddenCount > 0 && (
                <p className="rounded-2xl bg-metro-panel/70 px-4 py-3 text-sm font-semibold text-metro-muted">
                  Se muestran los primeros 250 registros. Afina desde el módulo para ver los {hiddenCount} restantes.
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-2xl bg-metro-panel/70 px-4 py-3 text-sm font-semibold text-metro-muted">
              {emptyText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DashboardHeaderPill({
  label,
  value,
  tone = 'text-metro-text',
  onClick,
}: {
  label: string;
  value: number;
  tone?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <p className={`text-lg font-black ${tone}`}>{value}</p>
      <p className="text-[11px] font-bold text-metro-muted">{label}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        className="rounded-xl bg-metro-panel/70 px-3 py-2 text-left ring-1 ring-metro-border transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-metro-red/40"
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  return <div className="rounded-xl bg-metro-panel/70 px-3 py-2 ring-1 ring-metro-border">{content}</div>;
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
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  onClick?: () => void;
}) {
  return (
    <button
      className="flex w-full items-center justify-between gap-3 rounded-xl bg-metro-panel/70 px-3 py-1.5 text-left ring-1 ring-metro-border transition hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-metro-red/40"
      onClick={onClick}
      type="button"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="rounded-lg bg-metro-raised p-1.5 text-blue-400 shadow-sm">
          <Icon size={15} />
        </span>
        <span className="truncate text-sm font-bold text-metro-secondary">{label}</span>
      </div>
      <span className="text-base font-black text-metro-text">{value}</span>
    </button>
  );
}

function TodayAlert({
  className,
  title,
  subtitle = 'Requiere atención',
  onClick,
}: {
  className: string;
  title: string;
  subtitle?: string;
  onClick?: () => void;
}) {
  return (
    <button
      className={`w-full rounded-xl border-l-4 bg-metro-panel/70 px-3 py-2 text-left ring-1 ring-metro-border transition hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-metro-red/40 ${className}`}
      onClick={onClick}
      type="button"
    >
      <p className="text-sm font-black text-metro-text">{title}</p>
      <p className="mt-0.5 text-xs font-medium text-metro-muted">{subtitle}</p>
    </button>
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
    <article className="rounded-[1.25rem] border border-metro-border bg-metro-surface/90 p-3 text-metro-text shadow-glow">
      <h3 className="mb-3 text-base font-black">{title}</h3>
      <div className="space-y-2">{children}</div>
      <button
        className="mt-3 text-xs font-black text-metro-red hover:text-red-400"
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
  const rowClassName = `grid w-full grid-cols-[0.75rem_1fr_auto] items-center gap-2 rounded-xl px-2 py-1 text-left text-sm transition ${
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

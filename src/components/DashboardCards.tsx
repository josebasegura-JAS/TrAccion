import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  FileText,
  Target,
  UsersRound,
} from 'lucide-react';
import { isTaskClosed, type Task, type TaskPriority } from '../features/tareas/domain/task';
import { useTaskStore } from '../features/tareas/store/useTaskStore';
import { useCommitteeSessionStore } from '../features/comite/store/useCommitteeSessionStore';
import { useParitariaSessionStore } from '../features/paritaria/store/useParitariaSessionStore';
import { useActasStore } from '../features/actas/store/useActasStore';
import { DashboardRecordsModal } from './dashboard/DashboardUi';
import type {
  CalendarEvent,
  CalendarEventType,
  DashboardNavigationTarget,
  DashboardPopup,
  DashboardPopupItem,
} from './dashboard/dashboardTypes';
import {
  eventTone,
  formatDisplayDate,
  fullDateFormatter,
  getMonthMatrix,
  miniDonutStyle,
  monthFormatter,
  parseIsoDate,
  stateSegmentsFromTasks,
  taskStateLabels,
  toIsoDate,
} from './dashboard/dashboardUtils';

const priorityWeight: Record<TaskPriority, number> = {
  critica: 0,
  alta: 1,
  media: 2,
  baja: 3,
};

const priorityLabels: Record<TaskPriority, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

const priorityTone: Record<TaskPriority, string> = {
  critica: 'text-red-400',
  alta: 'text-orange-400',
  media: 'text-amber-300',
  baja: 'text-blue-400',
};

function DashboardPanel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-h-0 overflow-hidden rounded-[1.35rem] border border-metro-border bg-metro-surface/90 shadow-glow ${className}`}
    >
      {children}
    </section>
  );
}

function PanelTitle({
  icon: Icon,
  title,
  action,
}: {
  icon: typeof ClipboardList;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-metro-red/10 text-red-400 ring-1 ring-metro-red/20">
          <Icon size={17} />
        </span>
        <h2 className="truncate text-[15px] font-black text-metro-text">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function CompactRow({
  title,
  subtitle,
  accent,
  icon: Icon,
  trailing,
  onClick,
}: {
  title: string;
  subtitle: string;
  accent: string;
  icon: typeof ClipboardList;
  trailing?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`grid w-full grid-cols-[2.15rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border border-metro-border bg-metro-panel/55 px-2.5 py-1.5 text-left transition hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-metro-red/40 ${accent}`}
      onClick={onClick}
      type="button"
    >
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-metro-raised text-metro-secondary">
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-black text-metro-text">{title}</span>
        <span className="block truncate text-[10px] font-semibold text-metro-muted">{subtitle}</span>
      </span>
      {trailing ?? <ChevronRight className="text-metro-muted" size={15} />}
    </button>
  );
}

export function DashboardCards({
  onOpenRecord,
}: {
  onOpenRecord?: (target: DashboardNavigationTarget) => void;
}) {
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dashboardPopup, setDashboardPopup] = useState<DashboardPopup | null>(null);

  const today = useMemo(() => new Date(), []);
  const todayIso = toIsoDate(today);

  const tasks = useTaskStore((state) => state.tasks);
  const loadTasks = useTaskStore((state) => state.load);
  const sessions = useCommitteeSessionStore((state) => state.sessions);
  const loadSessions = useCommitteeSessionStore((state) => state.load);
  const paritariaSessions = useParitariaSessionStore((state) => state.sessions);
  const loadParitariaSessions = useParitariaSessionStore((state) => state.load);
  const actas = useActasStore((state) => state.actas);
  const loadActas = useActasStore((state) => state.load);

  useEffect(() => {
    loadTasks();
    loadSessions();
    loadParitariaSessions();
    loadActas();
  }, [loadActas, loadParitariaSessions, loadSessions, loadTasks]);

  const openRecord = useCallback(
    (target: DashboardNavigationTarget) => {
      onOpenRecord?.(target);
    },
    [onOpenRecord],
  );

  const openPopupRecord = useCallback(
    (item: DashboardPopupItem) => {
      openRecord({ view: item.view, recordId: item.recordId });
      setSelectedDate(null);
      setDashboardPopup(null);
    },
    [openRecord],
  );

  const nonDeletedTasks = useMemo(() => tasks.filter((task) => !task.deletedAt), [tasks]);
  const activeTasks = useMemo(
    () => nonDeletedTasks.filter((task) => !isTaskClosed(task)),
    [nonDeletedTasks],
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
  const allOpenSessions = useMemo(
    () =>
      [
        ...openCommitteeSessions.map((session) => ({ ...session, module: 'comite' as const })),
        ...openParitariaSessions.map((session) => ({ ...session, module: 'paritaria' as const })),
      ].sort((first, second) => first.date.localeCompare(second.date)),
    [openCommitteeSessions, openParitariaSessions],
  );
  const pendingSessionPoints = useMemo(
    () =>
      allOpenSessions.reduce(
        (sum, session) => sum + (session.untreatedTaskIds?.length ?? session.items.length),
        0,
      ),
    [allOpenSessions],
  );
  const openActas = useMemo(
    () => actas.filter((acta) => acta.estado !== 'Cerrada'),
    [actas],
  );

  const taskPopupItems = useCallback(
    (items: readonly Task[], type: CalendarEventType = 'task'): DashboardPopupItem[] =>
      items.map((task) => ({
        id: `${type}-${task.id}`,
        date: task.fechaLimite || task.updatedAt.slice(0, 10),
        type,
        title: task.titulo,
        detail: `${task.fase || 'Tareas'} · ${taskStateLabels[task.estado]} · prioridad ${task.prioridad}`,
        view: 'tareas' as const,
        recordId: task.id,
      })),
    [],
  );

  const showTaskPopup = useCallback(
    (
      title: string,
      items: readonly Task[],
      emptyText = 'No hay tareas que mostrar.',
    ) => {
      setDashboardPopup({
        eyebrow: 'Dashboard',
        title,
        subtitle: `${items.length} registro${items.length === 1 ? '' : 's'}`,
        emptyText,
        items: taskPopupItems(items),
      });
    },
    [taskPopupItems],
  );

  const actaPopupItems = useMemo<DashboardPopupItem[]>(
    () =>
      openActas.map((acta) => ({
        id: `acta-${acta.id}`,
        date: acta.fechaLimite || acta.fechaSesion,
        type: 'actas' as const,
        title: acta.titulo,
        detail: `${acta.estado}${acta.tipo ? ` · ${acta.tipo}` : ''}`,
        view: 'actas' as const,
      })),
    [openActas],
  );

  const showActaPopup = useCallback(() => {
    setDashboardPopup({
      eyebrow: 'Dashboard',
      title: 'Actas en seguimiento',
      subtitle: `${openActas.length} registro${openActas.length === 1 ? '' : 's'}`,
      emptyText: 'No hay actas en seguimiento.',
      items: actaPopupItems,
    });
  }, [actaPopupItems, openActas.length]);

  const committeePopupItems = useMemo<DashboardPopupItem[]>(
    () =>
      allOpenSessions.map((session) => ({
        id: `${session.module}-${session.id}`,
        date: session.date,
        type: session.module === 'comite' ? ('committee' as const) : ('paritaria' as const),
        title: session.title,
        detail: `${session.untreatedTaskIds?.length ?? session.items.length} punto${(session.untreatedTaskIds?.length ?? session.items.length) === 1 ? '' : 's'} pendiente${(session.untreatedTaskIds?.length ?? session.items.length) === 1 ? '' : 's'} · ${session.code || 'sin código'}`,
        view: session.module,
        recordId: session.id,
      })),
    [allOpenSessions],
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
      detail: `${session.untreatedTaskIds?.length ?? session.items.length} punto${(session.untreatedTaskIds?.length ?? session.items.length) === 1 ? '' : 's'} pendiente${(session.untreatedTaskIds?.length ?? session.items.length) === 1 ? '' : 's'}`,
      view: 'comite' as const,
      recordId: session.id,
    }));

    const paritariaEvents = openParitariaSessions.map((session) => ({
      id: `paritaria-${session.id}`,
      date: session.date,
      type: 'paritaria' as const,
      title: session.title,
      detail: `${session.untreatedTaskIds?.length ?? session.items.length} punto${(session.untreatedTaskIds?.length ?? session.items.length) === 1 ? '' : 's'} pendiente${(session.untreatedTaskIds?.length ?? session.items.length) === 1 ? '' : 's'}`,
      view: 'paritaria' as const,
      recordId: session.id,
    }));

    const actaEvents = openActas
      .filter((acta) => acta.fechaLimite)
      .map((acta) => ({
        id: `acta-${acta.id}`,
        date: acta.fechaLimite,
        type: 'actas' as const,
        title: acta.titulo,
        detail: acta.estado,
        view: 'actas' as const,
      }));

    return [...taskEvents, ...committeeEvents, ...paritariaEvents, ...actaEvents];
  }, [activeTasks, openActas, openCommitteeSessions, openParitariaSessions]);

  const eventsByDay = useMemo(
    () =>
      calendarEvents.reduce<Record<string, CalendarEvent[]>>((accumulator, event) => {
        const dayEvents = accumulator[event.date] ?? [];
        dayEvents.push(event);
        accumulator[event.date] = dayEvents;
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
        .sort((first, second) => first.date.localeCompare(second.date)),
    [calendarEvents, todayIso],
  );

  const nextSession = useMemo(
    () => allOpenSessions.find((session) => !session.date || session.date >= todayIso) ?? allOpenSessions[0] ?? null,
    [allOpenSessions, todayIso],
  );

  const upcomingTasks = useMemo(() => {
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 7);
    const cutoffIso = toIsoDate(cutoff);
    return activeTasks
      .filter((task) => task.fechaLimite && task.fechaLimite >= todayIso && task.fechaLimite <= cutoffIso)
      .sort((first, second) => first.fechaLimite.localeCompare(second.fechaLimite));
  }, [activeTasks, today, todayIso]);

  const priorityTasks = useMemo(
    () =>
      [...activeTasks]
        .sort((first, second) => {
          const priorityDifference = priorityWeight[first.prioridad] - priorityWeight[second.prioridad];
          if (priorityDifference !== 0) return priorityDifference;
          if (first.fechaLimite && second.fechaLimite) return first.fechaLimite.localeCompare(second.fechaLimite);
          if (first.fechaLimite) return -1;
          if (second.fechaLimite) return 1;
          return second.updatedAt.localeCompare(first.updatedAt);
        })
        .slice(0, 4),
    [activeTasks],
  );

  const taskSegments = useMemo(() => stateSegmentsFromTasks(nonDeletedTasks), [nonDeletedTasks]);
  const donutStyle = useMemo(() => miniDonutStyle(taskSegments), [taskSegments]);

  const monthCells = useMemo(() => getMonthMatrix(visibleMonth), [visibleMonth]);
  const monthLabel = useMemo(() => {
    const formatted = monthFormatter.format(visibleMonth);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }, [visibleMonth]);

  const attentionItems = useMemo(() => {
    const items: Array<{
      key: string;
      title: string;
      subtitle: string;
      accent: string;
      icon: typeof ClipboardList;
      onClick: () => void;
    }> = [];

    if (criticalTasks.length > 0) {
      items.push({
        key: 'critical',
        title: `${criticalTasks.length} tarea${criticalTasks.length === 1 ? '' : 's'} crítica${criticalTasks.length === 1 ? '' : 's'}`,
        subtitle: 'Requiere atención prioritaria',
        accent: 'border-l-red-500',
        icon: ClipboardList,
        onClick: () => showTaskPopup('Tareas críticas', criticalTasks),
      });
    }

    if (nextSession) {
      const pending = nextSession.untreatedTaskIds?.length ?? nextSession.items.length;
      items.push({
        key: 'session',
        title: `${nextSession.module === 'comite' ? 'Comité' : 'Paritaria'} ${formatDisplayDate(nextSession.date)}`,
        subtitle: `${pending} punto${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'}`,
        accent: 'border-l-orange-500',
        icon: UsersRound,
        onClick: () => openRecord({ view: nextSession.module, recordId: nextSession.id }),
      });
    }

    if (openActas.length > 0) {
      items.push({
        key: 'actas',
        title: `${openActas.length} acta${openActas.length === 1 ? '' : 's'} en seguimiento`,
        subtitle: 'Requieren revisión o actuación pendiente',
        accent: 'border-l-amber-400',
        icon: FileText,
        onClick: showActaPopup,
      });
    }

    if (upcomingTasks.length > 0) {
      items.push({
        key: 'due',
        title: `${upcomingTasks.length} tarea${upcomingTasks.length === 1 ? '' : 's'} próxima${upcomingTasks.length === 1 ? '' : 's'} a vencer`,
        subtitle: 'Vencimiento dentro de los próximos 7 días',
        accent: 'border-l-red-400',
        icon: Target,
        onClick: () => showTaskPopup('Tareas próximas a vencer', upcomingTasks),
      });
    }

    return items.slice(0, 4);
  }, [criticalTasks, nextSession, openActas.length, openRecord, showActaPopup, showTaskPopup, upcomingTasks]);

  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,0.9fr)_minmax(0,1.18fr)_minmax(0,1fr)_auto] gap-2 overflow-hidden">
      <div className="grid min-h-0 grid-cols-1 gap-2.5 lg:grid-cols-2">
        <DashboardPanel className="p-3.5">
          <div className="grid h-full min-h-0 grid-cols-[1fr_auto] gap-4">
            <div className="flex min-h-0 flex-col">
              <PanelTitle icon={ClipboardList} title="Tareas" />
              <div className="mt-2 flex items-end gap-8">
                <div>
                  <p className="text-2xl font-black leading-none text-metro-text">{activeTasks.length}</p>
                  <p className="mt-1 text-[11px] font-bold text-metro-muted">abiertas</p>
                </div>
                <div>
                  <p className="text-2xl font-black leading-none text-red-400">{criticalTasks.length}</p>
                  <p className="mt-1 text-[11px] font-bold text-metro-muted">críticas</p>
                </div>
              </div>
              <div className="mt-auto grid grid-cols-5 gap-2 border-t border-metro-border pt-2">
                {taskSegments.map((segment) => (
                  <button
                    className="min-w-0 text-left"
                    key={segment.label}
                    onClick={() =>
                      showTaskPopup(
                        `Tareas ${segment.label.toLowerCase()}`,
                        nonDeletedTasks.filter((task) => taskStateLabels[task.estado] === segment.label),
                      )
                    }
                    type="button"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${segment.className}`} />
                      <span className="truncate text-[9px] font-bold text-metro-muted">{segment.label}</span>
                    </div>
                    <p className="mt-0.5 pl-3.5 text-[11px] font-black text-metro-secondary">{segment.value}</p>
                  </button>
                ))}
              </div>
            </div>
            <button
              className="relative grid h-20 w-20 shrink-0 place-items-center self-center rounded-full p-2 focus:outline-none focus:ring-2 focus:ring-metro-red/40"
              onClick={() => showTaskPopup('Tareas abiertas', activeTasks)}
              style={donutStyle}
              type="button"
            >
              <span className="grid h-full w-full place-items-center rounded-full bg-metro-surface text-center shadow-inner">
                <span>
                  <span className="block text-lg font-black leading-none text-metro-text">{nonDeletedTasks.length}</span>
                  <span className="text-[10px] font-bold text-metro-muted">Total</span>
                </span>
              </span>
            </button>
          </div>
        </DashboardPanel>

        <DashboardPanel className="p-3.5">
          <div className="flex h-full min-h-0 flex-col">
            <PanelTitle icon={UsersRound} title="Comité / Paritaria" />
            <div className="mt-2 grid grid-cols-2 gap-8">
              <div>
                <p className="text-2xl font-black leading-none text-metro-text">{allOpenSessions.length}</p>
                <p className="mt-1 text-[11px] font-bold text-metro-muted">
                  sesión{allOpenSessions.length === 1 ? '' : 'es'} abierta{allOpenSessions.length === 1 ? '' : 's'}
                </p>
              </div>
              <div>
                <p className="text-2xl font-black leading-none text-orange-400">{pendingSessionPoints}</p>
                <p className="mt-1 text-[11px] font-bold text-metro-muted">puntos pendientes</p>
              </div>
            </div>
            <button
              className="mt-auto flex items-center justify-between gap-3 border-t border-metro-border pt-2 text-left text-[11px] font-semibold text-metro-secondary hover:text-metro-text"
              onClick={() => {
                if (nextSession) {
                  openRecord({ view: nextSession.module, recordId: nextSession.id });
                } else {
                  setDashboardPopup({
                    eyebrow: 'Dashboard',
                    title: 'Sesiones CE/Paritaria',
                    subtitle: 'No hay sesiones abiertas.',
                    emptyText: 'No hay sesiones abiertas.',
                    items: committeePopupItems,
                  });
                }
              }}
              type="button"
            >
              <span className="flex min-w-0 items-center gap-2">
                <CalendarDays className="shrink-0 text-orange-400" size={15} />
                <span className="truncate">
                  {nextSession ? `Próxima sesión: ${formatDisplayDate(nextSession.date)} · ${nextSession.title}` : 'Sin próxima sesión abierta'}
                </span>
              </span>
              <ChevronRight className="shrink-0 text-metro-muted" size={15} />
            </button>
          </div>
        </DashboardPanel>
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-2.5 lg:grid-cols-[0.72fr_1.28fr]">
        <DashboardPanel className="p-3.5">
          <div className="flex h-full min-h-0 flex-col">
            <PanelTitle icon={Eye} title="Pendiente de atención" />
            <div className="mt-2 grid min-h-0 flex-1 content-start gap-1.5 overflow-hidden">
              {attentionItems.length > 0 ? (
                attentionItems.map((item) => (
                  <CompactRow
                    accent={item.accent}
                    icon={item.icon}
                    key={item.key}
                    onClick={item.onClick}
                    subtitle={item.subtitle}
                    title={item.title}
                  />
                ))
              ) : (
                <div className="grid h-full place-items-center rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-4 text-center">
                  <div>
                    <p className="text-sm font-black text-emerald-300">Sin incidencias prioritarias</p>
                    <p className="mt-1 text-[11px] font-semibold text-metro-muted">No hay elementos que requieran atención inmediata.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DashboardPanel>

        <DashboardPanel className="p-3.5">
          <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_9rem] gap-4">
            <div className="flex min-h-0 flex-col">
              <div className="flex items-center justify-between gap-3">
                <PanelTitle icon={CalendarDays} title="Calendario" />
                <div className="flex items-center gap-2">
                  <button
                    aria-label="Mes anterior"
                    className="rounded-lg p-1 text-metro-muted hover:bg-metro-panel hover:text-metro-text"
                    onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                    type="button"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="min-w-28 text-center text-[12px] font-black text-metro-secondary">{monthLabel}</span>
                  <button
                    aria-label="Mes siguiente"
                    className="rounded-lg p-1 text-metro-muted hover:bg-metro-panel hover:text-metro-text"
                    onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                    type="button"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              <div className="mt-1.5 grid grid-cols-7 gap-0.5 text-center text-[9px] font-black uppercase tracking-wide text-metro-muted">
                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className="mt-0.5 grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-0.5">
                {monthCells.slice(0, 42).map((date, index) => {
                  const isoDate = date ? toIsoDate(date) : `empty-${index}`;
                  const events = date ? (eventsByDay[isoDate] ?? []) : [];
                  const isToday = isoDate === todayIso;
                  return (
                    <button
                      className={`min-h-0 rounded-lg px-0.5 text-center text-[10px] font-bold transition ${
                        date
                          ? 'text-metro-secondary hover:bg-metro-panel/60 hover:text-metro-text'
                          : 'cursor-default text-transparent'
                      } ${isToday ? 'bg-metro-red text-white shadow-md shadow-red-950/25 hover:bg-metro-dark' : ''}`}
                      disabled={!date}
                      key={isoDate}
                      onClick={() => date && setSelectedDate(isoDate)}
                      type="button"
                    >
                      <span>{date?.getDate() ?? '·'}</span>
                      <span className="mt-0.5 flex min-h-1.5 justify-center gap-0.5">
                        {events.slice(0, 4).map((event) => (
                          <span className={`h-1 w-1 rounded-full ${eventTone[event.type]}`} key={event.id} />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col justify-center gap-2 border-l border-metro-border pl-4 text-[10px] font-bold text-metro-secondary">
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-500" />Tareas</span>
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-orange-500" />Comité</span>
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-violet-500" />Paritaria</span>
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-400" />Actas</span>
            </div>
          </div>
        </DashboardPanel>
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-2.5 lg:grid-cols-2">
        <DashboardPanel className="p-3.5">
          <div className="flex h-full min-h-0 flex-col">
            <PanelTitle
              icon={ClipboardList}
              title="Mis tareas prioritarias"
              action={
                <button className="text-[10px] font-bold text-metro-muted hover:text-metro-text" onClick={() => openRecord({ view: 'tareas' })} type="button">
                  Ver todas
                </button>
              }
            />
            <div className="mt-1.5 grid min-h-0 flex-1 content-start gap-1">
              {priorityTasks.length > 0 ? priorityTasks.map((task) => (
                <button
                  className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_auto] items-center gap-2 rounded-lg border border-metro-border bg-metro-panel/45 px-2.5 py-1 text-left hover:bg-white/5"
                  key={task.id}
                  onClick={() => openRecord({ view: 'tareas', recordId: task.id })}
                  type="button"
                >
                  <span className="truncate text-[11px] font-black text-metro-text">{task.titulo}</span>
                  <span className={`truncate text-[9px] font-black ${priorityTone[task.prioridad]}`}>{priorityLabels[task.prioridad]}</span>
                  <span className="text-right text-[9px] font-bold text-metro-secondary">{formatDisplayDate(task.fechaLimite)}</span>
                  <ChevronRight className="text-metro-muted" size={13} />
                </button>
              )) : (
                <p className="rounded-xl bg-metro-panel/45 px-3 py-2 text-[11px] font-semibold text-metro-muted">No hay tareas abiertas.</p>
              )}
            </div>
          </div>
        </DashboardPanel>

        <DashboardPanel className="p-3.5">
          <div className="flex h-full min-h-0 flex-col">
            <PanelTitle icon={Target} title="Próximos hitos" />
            <div className="mt-1.5 grid min-h-0 flex-1 content-start gap-1">
              {upcomingEvents.slice(0, 4).map((event) => (
                <button
                  className="grid grid-cols-[0.65rem_minmax(0,1fr)_5.5rem_auto] items-center gap-2 rounded-lg border border-metro-border bg-metro-panel/45 px-2.5 py-1 text-left hover:bg-white/5"
                  key={event.id}
                  onClick={() => openRecord({ view: event.view, recordId: event.recordId })}
                  type="button"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${eventTone[event.type]}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-black text-metro-text">{event.title}</span>
                    <span className="block truncate text-[9px] font-semibold text-metro-muted">{event.detail}</span>
                  </span>
                  <span className="text-right text-[9px] font-black text-metro-secondary">{formatDisplayDate(event.date)}</span>
                  <ChevronRight className="text-metro-muted" size={13} />
                </button>
              ))}
              {upcomingEvents.length === 0 && (
                <p className="rounded-xl bg-metro-panel/45 px-3 py-2 text-[11px] font-semibold text-metro-muted">No hay hitos próximos con fecha.</p>
              )}
            </div>
          </div>
        </DashboardPanel>
      </div>

      <button
        className="flex min-h-8 items-center justify-between rounded-[1rem] border border-metro-border bg-metro-surface/90 px-3 py-1.5 text-left shadow-glow transition hover:bg-white/5"
        onClick={() => openRecord({ view: 'actas' })}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20"><FileText size={15} /></span>
          <span className="min-w-0">
            <span className="block text-[12px] font-black text-metro-text">Actas en seguimiento</span>
            <span className="block truncate text-[9px] font-semibold text-metro-muted">{openActas.length} acta{openActas.length === 1 ? '' : 's'} con acciones pendientes</span>
          </span>
        </span>
        <span className="flex items-center gap-1 text-[9px] font-bold text-metro-muted">Ver todas <ChevronRight size={13} /></span>
      </button>

      {selectedDate && (
        <DashboardRecordsModal
          emptyText="Selecciona otro día con puntos de color para ver tareas, sesiones o actas."
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

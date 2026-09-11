import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BellRing,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  FileText,
  Laptop,
  Landmark,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  UsersRound,
  Utensils,
} from 'lucide-react';
import { isTaskClosed, type Task, type TaskPriority } from '../features/tareas/domain/task';
import { useTaskStore } from '../features/tareas/store/useTaskStore';
import { useCommitteeSessionStore } from '../features/comite/store/useCommitteeSessionStore';
import { useParitariaSessionStore } from '../features/paritaria/store/useParitariaSessionStore';
import { useActasStore } from '../features/actas/store/useActasStore';
import { useTeletrabajoStore } from '../features/teletrabajo/store/useTeletrabajoStore';
import { useLicenciasSinSueldoStore } from '../features/licencias-sin-sueldo/store/useLicenciasSinSueldoStore';
import { useLoteriaStore } from '../features/loteria/store/useLoteriaStore';
import { buildDashboardAttentionItems, type DashboardAttentionKind, type DashboardAttentionLevel } from './dashboard/dashboardAttention';
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

const priorityPill: Record<TaskPriority, string> = {
  critica: 'border-red-500/25 bg-red-500/15 text-red-200',
  alta: 'border-red-500/25 bg-red-500/15 text-red-200',
  media: 'border-amber-400/25 bg-amber-400/15 text-amber-200',
  baja: 'border-sky-400/25 bg-sky-400/15 text-sky-200',
};

const attentionLevelTone: Record<DashboardAttentionLevel, string> = {
  critical: 'border-l-red-500 bg-red-500/5 text-red-300',
  high: 'border-l-orange-400 bg-orange-400/5 text-orange-300',
  medium: 'border-l-amber-300 bg-amber-300/[0.035] text-amber-200',
  info: 'border-l-sky-400 bg-sky-400/[0.035] text-sky-200',
};

const attentionLevelLabel: Record<DashboardAttentionLevel, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Medio',
  info: 'Info',
};

const attentionKindIcon: Record<DashboardAttentionKind, typeof ClipboardList> = {
  task: ClipboardList,
  session: CalendarDays,
  acta: FileText,
  license: UserRound,
  telework: Laptop,
  lottery: Sparkles,
};

function DashboardPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`min-h-0 overflow-hidden rounded-xl border border-sky-300/10 bg-[#0e2239]/90 shadow-[0_10px_30px_rgba(0,0,0,0.16)] ${className}`}
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
    <div className="flex min-w-0 items-center justify-between gap-2 border-b border-sky-200/10 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="shrink-0 text-sky-200" size={16} />
        <h2 className="truncate text-[12px] font-extrabold text-slate-50">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  iconTone,
  valueTone = 'text-white',
  onClick,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: number;
  detail: string;
  iconTone: string;
  valueTone?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${iconTone}`}>
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[10px] font-semibold text-slate-300">{label}</span>
        <span className={`mt-0.5 block text-[22px] font-black leading-none ${valueTone}`}>{value}</span>
        <span className="mt-1 block truncate text-[9px] font-medium text-slate-400">{detail}</span>
      </span>
    </>
  );

  const className =
    'flex min-w-0 items-center gap-2.5 rounded-xl border border-sky-300/10 bg-[#102842]/90 px-3 py-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]';

  return onClick ? (
    <button className={`${className} transition hover:border-sky-300/20 hover:bg-[#13304e]`} onClick={onClick} type="button">
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function DashboardCards({ onOpenRecord }: { onOpenRecord?: (target: DashboardNavigationTarget) => void }) {
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
  const teletrabajo = useTeletrabajoStore((state) => state.solicitudes);
  const loadTeletrabajo = useTeletrabajoStore((state) => state.load);
  const licencias = useLicenciasSinSueldoStore((state) => state.records);
  const loadLicencias = useLicenciasSinSueldoStore((state) => state.load);
  const loteriaCampaign = useLoteriaStore((state) => state.campaign);
  const loadLoteria = useLoteriaStore((state) => state.load);

  useEffect(() => {
    loadTasks();
    loadSessions();
    loadParitariaSessions();
    loadActas();
    loadTeletrabajo();
    void loadLicencias();
    loadLoteria();
  }, [loadActas, loadLicencias, loadLoteria, loadParitariaSessions, loadSessions, loadTasks, loadTeletrabajo]);

  const openRecord = useCallback((target: DashboardNavigationTarget) => onOpenRecord?.(target), [onOpenRecord]);

  const nonDeletedTasks = useMemo(() => tasks.filter((task) => !task.deletedAt), [tasks]);
  const activeTasks = useMemo(() => nonDeletedTasks.filter((task) => !isTaskClosed(task)), [nonDeletedTasks]);
  const criticalTasks = useMemo(() => activeTasks.filter((task) => task.prioridad === 'critica'), [activeTasks]);
  const openCommitteeSessions = useMemo(() => sessions.filter((session) => session.status === 'open'), [sessions]);
  const openParitariaSessions = useMemo(() => paritariaSessions.filter((session) => session.status === 'open'), [paritariaSessions]);
  const allOpenSessions = useMemo(
    () => [
      ...openCommitteeSessions.map((session) => ({ ...session, module: 'comite' as const })),
      ...openParitariaSessions.map((session) => ({ ...session, module: 'paritaria' as const })),
    ].sort((a, b) => a.date.localeCompare(b.date)),
    [openCommitteeSessions, openParitariaSessions],
  );
  const openActas = useMemo(() => actas.filter((acta) => acta.estado !== 'Cerrada'), [actas]);
  const pendingTelework = useMemo(
    () => teletrabajo.filter((item) => !item.deletedAt && (item.estado === 'pendiente' || item.estado === 'analizada')),
    [teletrabajo],
  );
  const pendingLicenses = useMemo(
    () => licencias.filter((item) => !item.deletedAt && (item.estado === 'pendiente_aprobacion' || item.estado === 'pendiente_firma')),
    [licencias],
  );
  const pendingSignatureLicenses = useMemo(
    () => licencias.filter((item) => !item.deletedAt && item.estado === 'pendiente_firma'),
    [licencias],
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

  const showTaskPopup = useCallback((title: string, items: readonly Task[]) => {
    setDashboardPopup({
      eyebrow: 'Dashboard',
      title,
      subtitle: `${items.length} registro${items.length === 1 ? '' : 's'}`,
      emptyText: 'No hay tareas que mostrar.',
      items: taskPopupItems(items),
    });
  }, [taskPopupItems]);

  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    const taskEvents = activeTasks.filter((task) => task.fechaLimite).map((task) => ({
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
      detail: `${session.untreatedTaskIds?.length ?? session.items.length} puntos pendientes`,
      view: 'comite' as const,
      recordId: session.id,
    }));
    const paritariaEvents = openParitariaSessions.map((session) => ({
      id: `paritaria-${session.id}`,
      date: session.date,
      type: 'paritaria' as const,
      title: session.title,
      detail: `${session.untreatedTaskIds?.length ?? session.items.length} puntos pendientes`,
      view: 'paritaria' as const,
      recordId: session.id,
    }));
    const actaEvents = openActas.filter((acta) => acta.fechaLimite).map((acta) => ({
      id: `acta-${acta.id}`,
      date: acta.fechaLimite,
      type: 'actas' as const,
      title: acta.titulo,
      detail: acta.estado,
      view: 'actas' as const,
    }));
    return [...taskEvents, ...committeeEvents, ...paritariaEvents, ...actaEvents];
  }, [activeTasks, openActas, openCommitteeSessions, openParitariaSessions]);

  const eventsByDay = useMemo(() => calendarEvents.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
    (acc[event.date] ??= []).push(event);
    return acc;
  }, {}), [calendarEvents]);

  const selectedDateEvents = selectedDate ? (eventsByDay[selectedDate] ?? []) : [];
  const selectedDateLabel = selectedDate
    ? (parseIsoDate(selectedDate) ? fullDateFormatter.format(parseIsoDate(selectedDate) as Date) : selectedDate)
    : '';

  const upcomingEvents = useMemo(
    () => calendarEvents.filter((event) => event.date >= todayIso).sort((a, b) => a.date.localeCompare(b.date)),
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
    return activeTasks.filter((task) => task.fechaLimite && task.fechaLimite >= todayIso && task.fechaLimite <= cutoffIso)
      .sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite));
  }, [activeTasks, today, todayIso]);
  const priorityTasks = useMemo(() => [...activeTasks].sort((a, b) => {
    const priorityDiff = priorityWeight[a.prioridad] - priorityWeight[b.prioridad];
    if (priorityDiff !== 0) return priorityDiff;
    if (a.fechaLimite && b.fechaLimite) return a.fechaLimite.localeCompare(b.fechaLimite);
    if (a.fechaLimite) return -1;
    if (b.fechaLimite) return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  }).slice(0, 6), [activeTasks]);

  const taskSegments = useMemo(() => stateSegmentsFromTasks(nonDeletedTasks), [nonDeletedTasks]);
  const donutStyle = useMemo(() => miniDonutStyle(taskSegments), [taskSegments]);
  const monthCells = useMemo(() => getMonthMatrix(visibleMonth), [visibleMonth]);
  const monthLabel = useMemo(() => {
    const formatted = monthFormatter.format(visibleMonth);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }, [visibleMonth]);

  const attentionItems = useMemo(
    () => buildDashboardAttentionItems({
      todayIso,
      tasks: nonDeletedTasks,
      sessions: allOpenSessions,
      actas: openActas,
      licenses: licencias,
      telework: teletrabajo,
      lotteryCampaign: loteriaCampaign,
    }),
    [allOpenSessions, licencias, loteriaCampaign, nonDeletedTasks, openActas, teletrabajo, todayIso],
  );

  const attentionCriticalCount = useMemo(
    () => attentionItems.filter((item) => item.level === 'critical' || item.level === 'high').length,
    [attentionItems],
  );

  const overdueTasks = useMemo(
    () => activeTasks.filter((task) => task.fechaLimite && task.fechaLimite < todayIso),
    [activeTasks, todayIso],
  );


  const taskStateDisplay = useMemo(() => taskSegments.filter((segment) => segment.value > 0), [taskSegments]);
  const totalTasksForDonut = Math.max(1, nonDeletedTasks.length);
  const moduleStatus = [
    { label: 'Ticket Restaurante', icon: Utensils, detail: 'Módulo operativo', view: 'ticket-restaurante' as const, tone: 'ok' },
    { label: 'Presupuestos', icon: Landmark, detail: 'Escenarios disponibles', view: 'presupuestos' as const, tone: 'ok' },
    { label: 'Lotería', icon: Sparkles, detail: `Campaña ${loteriaCampaign.year}`, view: 'loteria' as const, tone: 'ok' },
    { label: 'Plantilla', icon: UsersRound, detail: 'Datos maestros disponibles', view: 'plantilla' as const, tone: 'ok' },
    { label: 'Criterios RRLL', icon: ShieldCheck, detail: 'Consulta disponible', view: 'criterios-rrll' as const, tone: 'ok' },
    { label: 'Teletrabajo', icon: Laptop, detail: pendingTelework.length ? `${pendingTelework.length} pendientes` : 'Sin pendientes', view: 'teletrabajo' as const, tone: pendingTelework.length ? 'warn' : 'ok' },
  ];

  return (
    <div className="dashboard-pro grid h-full min-h-0 grid-rows-[42px_82px_minmax(0,1fr)_minmax(0,0.88fr)] gap-2 overflow-hidden">
      <div className="grid grid-cols-6 gap-2">
        {[
          { label: 'Nueva tarea', icon: Plus, view: 'tareas' as const, primary: true },
          { label: 'Nueva sesión', icon: UsersRound, view: 'comite' as const },
          { label: 'Nueva acta', icon: FileText, view: 'actas' as const },
          { label: 'Importar plantilla', icon: Upload, view: 'plantilla' as const },
          { label: 'Teletrabajo', icon: Laptop, view: 'teletrabajo' as const },
          { label: 'Ticket Restaurante', icon: Utensils, view: 'ticket-restaurante' as const },
        ].map((action) => (
          <button
            className={`flex min-w-0 items-center justify-center gap-2 rounded-lg border px-2 text-[10px] font-bold transition ${action.primary
              ? 'border-red-400/30 bg-gradient-to-b from-red-500 to-red-600 text-white shadow-[0_8px_20px_rgba(220,38,38,0.2)] hover:from-red-400 hover:to-red-600'
              : 'border-sky-300/15 bg-gradient-to-b from-[#173b61] to-[#102944] text-slate-100 hover:border-sky-300/25 hover:from-[#1b456f] hover:to-[#12314f]'
            }`}
            key={action.label}
            onClick={() => openRecord({ view: action.view })}
            type="button"
          >
            <action.icon className="shrink-0" size={16} />
            <span className="truncate">{action.label}</span>
          </button>
        ))}
      </div>

      <div className="grid min-h-0 grid-cols-6 gap-2">
        <MetricCard icon={ClipboardList} label="Tareas abiertas" value={activeTasks.length} detail={overdueTasks.length ? `${overdueTasks.length} vencidas` : `${upcomingTasks.length} vencen en 7 días`} iconTone="border-sky-300/10 bg-sky-400/10 text-sky-200" onClick={() => showTaskPopup('Tareas abiertas', activeTasks)} />
        <MetricCard icon={AlertTriangle} label="Críticas" value={criticalTasks.length} detail="requieren atención" iconTone="border-red-400/15 bg-red-500/15 text-red-300" valueTone="text-white" onClick={() => showTaskPopup('Tareas críticas', criticalTasks)} />
        <MetricCard icon={UsersRound} label="Sesiones abiertas" value={allOpenSessions.length} detail={nextSession ? `próxima ${formatDisplayDate(nextSession.date)}` : 'sin próximas sesiones'} iconTone="border-sky-300/10 bg-sky-400/10 text-sky-200" onClick={() => openRecord({ view: 'comite' })} />
        <MetricCard icon={FileText} label="Actas en seguimiento" value={openActas.length} detail="con acciones pendientes" iconTone="border-sky-300/10 bg-sky-400/10 text-sky-200" onClick={() => openRecord({ view: 'actas' })} />
        <MetricCard icon={Laptop} label="Solicitudes teletrabajo" value={pendingTelework.length} detail="pendientes de gestión" iconTone="border-sky-300/10 bg-sky-400/10 text-sky-200" onClick={() => openRecord({ view: 'teletrabajo' })} />
        <MetricCard icon={UserRound} label="Licencias pendientes" value={pendingLicenses.length} detail={`${pendingSignatureLicenses.length} por firmar`} iconTone="border-sky-300/10 bg-sky-400/10 text-sky-200" onClick={() => openRecord({ view: 'licencias-sin-sueldo' })} />
      </div>

      <div className="grid min-h-0 grid-cols-[1.08fr_1.12fr_0.92fr] gap-2">
        <DashboardPanel className="flex flex-col">
          <PanelTitle
            icon={BellRing}
            title="Pendiente de atención"
            action={
              <div className="flex items-center gap-1.5">
                {attentionCriticalCount > 0 && (
                  <span className="rounded-full border border-red-400/20 bg-red-500/10 px-1.5 py-0.5 text-[8px] font-black text-red-200">
                    {attentionCriticalCount} prioritarios
                  </span>
                )}
                <span className="text-[8px] font-semibold text-slate-500">ordenado por urgencia</span>
              </div>
            }
          />
          <div className="grid min-h-0 flex-1 content-start overflow-hidden px-2 py-0.5">
            {attentionItems.length ? attentionItems.slice(0, 6).map((item, index) => {
              const AttentionIcon = attentionKindIcon[item.kind];
              return (
                <button
                  className={`dashboard-attention-row grid min-h-0 grid-cols-[24px_minmax(0,1fr)_auto_12px] items-center gap-2 border-l-2 px-2 py-1.5 text-left transition hover:bg-white/[0.04] ${attentionLevelTone[item.level]} ${index >= 4 ? 'dashboard-pro__large-only' : ''}`}
                  key={item.key}
                  onClick={() => openRecord({ view: item.view, recordId: item.recordId })}
                  type="button"
                >
                  <AttentionIcon className="opacity-90" size={15} />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[9px] font-extrabold text-slate-100">{item.title}</span>
                      <span className="shrink-0 rounded px-1 py-0.5 text-[7px] font-black uppercase tracking-wide opacity-75">{attentionLevelLabel[item.level]}</span>
                    </span>
                    <span className="block truncate text-[8px] font-medium text-slate-400">{item.subtitle}</span>
                  </span>
                  <span className="whitespace-nowrap text-[8px] font-black">{item.trailing}</span>
                  <ChevronRight className="text-slate-500" size={11} />
                </button>
              );
            }) : (
              <div className="grid h-full place-items-center text-center">
                <div><CircleCheck className="mx-auto text-emerald-400" size={24} /><p className="mt-2 text-[11px] font-bold text-emerald-200">Sin incidencias prioritarias</p><p className="mt-1 text-[8px] text-slate-500">No hay vencimientos ni expedientes envejecidos.</p></div>
              </div>
            )}
          </div>
        </DashboardPanel>

        <DashboardPanel className="flex flex-col">
          <PanelTitle icon={CalendarDays} title="Calendario" action={
            <div className="flex items-center gap-1.5">
              <button className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-white" onClick={() => setVisibleMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} type="button"><ChevronLeft size={13} /></button>
              <span className="min-w-[76px] text-center text-[9px] font-bold text-slate-200">{monthLabel}</span>
              <button className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-white" onClick={() => setVisibleMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} type="button"><ChevronRight size={13} /></button>
              <button className="ml-1 rounded-md border border-sky-300/15 bg-sky-400/5 px-2 py-1 text-[8px] font-bold text-sky-200" onClick={() => setVisibleMonth(new Date())} type="button">Hoy</button>
            </div>
          } />
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_82px] gap-2 p-2.5">
            <div className="grid min-h-0 grid-rows-[14px_minmax(0,1fr)]">
              <div className="grid grid-cols-7 text-center text-[8px] font-bold text-slate-400">{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map((d) => <span key={d}>{d}</span>)}</div>
              <div className="grid min-h-0 grid-cols-7 grid-rows-6 gap-px overflow-hidden rounded-md border border-sky-200/5 bg-sky-200/5">
                {monthCells.slice(0, 42).map((date, index) => {
                  const iso = date ? toIsoDate(date) : `empty-${index}`;
                  const events = date ? (eventsByDay[iso] ?? []) : [];
                  const isToday = iso === todayIso;
                  return (
                    <button className={`relative min-h-0 bg-[#0c1e33] text-[8px] font-semibold text-slate-300 hover:bg-[#15304e] ${isToday ? 'font-black text-white' : ''}`} disabled={!date} key={iso} onClick={() => date && setSelectedDate(iso)} type="button">
                      {isToday && <span className="absolute inset-1 rounded-full bg-red-500/90 shadow-[0_0_12px_rgba(239,68,68,0.35)]" />}
                      <span className="relative z-10">{date?.getDate() ?? ''}</span>
                      <span className="absolute bottom-0.5 left-1/2 z-10 flex -translate-x-1/2 gap-0.5">{events.slice(0, 3).map((event) => <span className={`h-1 w-1 rounded-full ${eventTone[event.type]}`} key={event.id} />)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col justify-center gap-2 border-l border-sky-200/10 pl-2 text-[8px] font-semibold text-slate-300">
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-red-500" />Tareas</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-sky-500" />Comité</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-400" />Paritaria</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-violet-500" />Actas</span>
            </div>
          </div>
        </DashboardPanel>

        <DashboardPanel className="flex flex-col">
          <PanelTitle icon={BarChart3} title="Tareas" action={<button className="text-[9px] font-bold text-sky-300 hover:text-sky-200" onClick={() => openRecord({ view: 'tareas' })} type="button">Ver detalle</button>} />
          <div className="grid min-h-0 flex-1 grid-cols-[94px_minmax(0,1fr)] items-center gap-2 px-3 py-2">
            <button className="relative mx-auto grid h-[88px] w-[88px] place-items-center rounded-full p-[13px]" onClick={() => showTaskPopup('Tareas abiertas', activeTasks)} style={donutStyle} type="button">
              <span className="grid h-full w-full place-items-center rounded-full bg-[#0e2239] text-center">
                <span><strong className="block text-[18px] font-black leading-none text-white">{activeTasks.length}</strong><small className="mt-1 block text-[8px] font-bold text-slate-300">tareas</small></span>
              </span>
            </button>
            <div className="space-y-1.5">
              {taskStateDisplay.slice(0, 4).map((segment) => (
                <div className="grid grid-cols-[8px_minmax(0,1fr)_20px_28px] items-center gap-1.5 text-[8px]" key={segment.label}>
                  <span className={`h-2 w-2 rounded-full ${segment.className}`} />
                  <span className="truncate font-semibold text-slate-300">{segment.label}</span>
                  <strong className="text-right text-slate-100">{segment.value}</strong>
                  <span className="text-right text-slate-400">{Math.round((segment.value / totalTasksForDonut) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </DashboardPanel>
      </div>

      <div className="grid min-h-0 grid-cols-[1.1fr_0.92fr_1.08fr] gap-2">
        <DashboardPanel className="flex flex-col">
          <PanelTitle icon={ClipboardList} title="Mis tareas prioritarias" action={<button className="text-[9px] font-bold text-sky-300 hover:text-sky-200" onClick={() => openRecord({ view: 'tareas' })} type="button">Ver todas</button>} />
          <div className="grid min-h-0 flex-1 content-start divide-y divide-sky-200/7 overflow-hidden px-2">
            {priorityTasks.length ? priorityTasks.map((task, index) => (
              <button className={`grid grid-cols-[14px_minmax(0,1fr)_48px_34px] items-center gap-2 px-1 py-1.5 text-left hover:bg-white/[0.025] ${index >= 4 ? 'dashboard-pro__large-only' : ''}`} key={task.id} onClick={() => openRecord({ view: 'tareas', recordId: task.id })} type="button">
                <span className={`text-[12px] ${task.prioridad === 'critica' || task.prioridad === 'alta' ? 'text-red-400' : 'text-amber-300'}`}>⚑</span>
                <span className="min-w-0"><span className="block truncate text-[9px] font-bold text-slate-100">{task.titulo}</span><span className="block truncate text-[8px] text-slate-400">{task.fase || 'Tareas'}</span></span>
                <span className={`rounded-md border px-1.5 py-1 text-center text-[8px] font-bold ${priorityPill[task.prioridad]}`}>{priorityLabels[task.prioridad]}</span>
                <span className="text-right text-[8px] font-semibold text-slate-300">{formatDisplayDate(task.fechaLimite)}</span>
              </button>
            )) : <div className="grid h-full place-items-center text-[9px] text-slate-400">No hay tareas abiertas.</div>}
          </div>
        </DashboardPanel>

        <DashboardPanel className="flex flex-col">
          <PanelTitle icon={CalendarDays} title="Próximos hitos" action={<button className="text-[9px] font-bold text-sky-300 hover:text-sky-200" onClick={() => openRecord({ view: 'comite' })} type="button">Ver agenda</button>} />
          <div className="grid min-h-0 flex-1 content-start overflow-hidden px-2 py-1">
            {upcomingEvents.slice(0, 6).map((event, index) => (
              <button className={`grid grid-cols-[44px_10px_minmax(0,1fr)] items-center gap-1.5 py-1 text-left hover:bg-white/[0.025] ${index >= 5 ? 'dashboard-pro__large-only' : ''}`} key={event.id} onClick={() => openRecord({ view: event.view, recordId: event.recordId })} type="button">
                <span className="text-right text-[8px] font-bold text-slate-300">{formatDisplayDate(event.date)}</span>
                <span className="relative grid h-full place-items-center"><span className={`z-10 h-2.5 w-2.5 rounded-full ${eventTone[event.type]}`} />{index < Math.min(upcomingEvents.length, 6) - 1 && <span className="absolute top-1/2 h-full w-px bg-sky-300/15" />}</span>
                <span className="min-w-0"><span className="block truncate text-[9px] font-bold text-slate-100">{event.title}</span><span className="block truncate text-[8px] text-slate-400">{event.detail}</span></span>
              </button>
            ))}
            {!upcomingEvents.length && <div className="grid h-full place-items-center text-[9px] text-slate-400">No hay hitos próximos.</div>}
          </div>
        </DashboardPanel>

        <DashboardPanel className="flex flex-col">
          <PanelTitle icon={BarChart3} title="Estado de módulos" action={<button className="text-[9px] font-bold text-sky-300 hover:text-sky-200" onClick={() => openRecord({ view: 'ajustes' })} type="button">Ver todos</button>} />
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5 p-2">
            {moduleStatus.map((module) => (
              <button className="grid min-h-0 grid-cols-[28px_minmax(0,1fr)_14px] items-center gap-2 rounded-lg border border-sky-300/10 bg-[#102842]/70 px-2 text-left hover:border-sky-300/20 hover:bg-[#14314f]" key={module.label} onClick={() => openRecord({ view: module.view })} type="button">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-sky-400/10 text-sky-200"><module.icon size={14} /></span>
                <span className="min-w-0"><span className="block truncate text-[8px] font-extrabold text-slate-100">{module.label}</span><span className="block truncate text-[7px] text-slate-400">{module.detail}</span></span>
                {module.tone === 'ok' ? <CircleCheck className="text-emerald-400" size={13} /> : <AlertTriangle className="text-amber-400" size={13} />}
              </button>
            ))}
          </div>
        </DashboardPanel>
      </div>

      {selectedDate && (
        <DashboardRecordsModal
          emptyText="No hay registros asociados a esta fecha."
          eyebrow="Calendario"
          items={selectedDateEvents}
          onClose={() => setSelectedDate(null)}
          onOpenItem={(item) => { openRecord({ view: item.view, recordId: item.recordId }); setSelectedDate(null); }}
          subtitle={`${selectedDateEvents.length} registro${selectedDateEvents.length === 1 ? '' : 's'}`}
          title={selectedDateLabel}
        />
      )}

      {dashboardPopup && (
        <DashboardRecordsModal
          emptyText={dashboardPopup.emptyText}
          eyebrow={dashboardPopup.eyebrow}
          items={dashboardPopup.items}
          onClose={() => setDashboardPopup(null)}
          onOpenItem={(item) => { openRecord({ view: item.view, recordId: item.recordId }); setDashboardPopup(null); }}
          subtitle={dashboardPopup.subtitle}
          title={dashboardPopup.title}
        />
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCircle2, ChevronRight, RefreshCw, WifiOff, X } from 'lucide-react';
import { getNavigationBreadcrumb, getNavigationIcon, type AppView } from '../navigation/navigation';
import { GlobalSearch } from './GlobalSearch';
import { ModuleHelpButton } from './ModuleHelp';
import { useModuleHelpRegistry } from '../services/moduleHelpRegistry';
import { useDatabaseStatus } from '../services/databaseStatus';
import { useDatabaseConnectivityState } from '../services/databaseConnectivityState';
import { useExternalDataSyncStatus } from '../services/externalDataSync';
import { readStorageItem, writeStorageItem } from '../services/persistence';
import { subscribeToAppNavigation } from '../services/appNavigationBus';
import { useTaskStore } from '../features/tareas/store/useTaskStore';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import { responsibleMatchesWindowsUser } from '../features/configuracion/domain/taskResponsibles';
import {
  getUnseenTaskAssignments,
  markTaskAssignmentsSeen,
} from '../features/tareas/domain/taskAssignmentNotifications';
import type { Task } from '../features/tareas/domain/task';

const viewHeaderCopy: Record<AppView, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Dashboard RRLL',
    subtitle: 'Prioridades, agenda y próximos hitos.',
  },
  plantilla: {
    title: 'Plantilla',
    subtitle: 'Gestión de personas, puestos, datos laborales y traducciones.',
  },
  tareas: {
    title: 'Tareas',
    subtitle: 'Seguimiento por fase, estado, prioridad y vencimiento.',
  },
  coordinacion: {
    title: 'Coordinación',
    subtitle: 'Reuniones con Dirección, otras áreas y seguimiento histórico por sindicato.',
  },
  comite: {
    title: 'Comité / Paritaria',
    subtitle: 'Gestión unificada de sesiones, puntos y clasificación por órgano.',
  },
  actas: {
    title: 'Actas',
    subtitle: 'Actas de Comité y Paritaria, estados y alegaciones sindicales.',
  },
  huelgas: {
    title: 'Huelgas',
    subtitle: 'Convocatorias, personal con turno y seguimiento de jornadas de huelga.',
  },
  paritaria: {
    title: 'Comisión Paritaria',
    subtitle: 'Sesiones, puntos del orden del día y tareas tratadas.',
  },
  'criterios-rrll': {
    title: 'Criterios RRLL',
    subtitle: 'Criterios internos, consultas y referencias de aplicación.',
  },
  teletrabajo: {
    title: 'Teletrabajo',
    subtitle: 'Solicitudes, validaciones, campañas y documentación asociada.',
  },
  'ayuda-escolar': {
    title: 'Ayuda escolar',
    subtitle: 'Recepción, identificación y archivo de documentación recibida por correo.',
  },
  'ticket-restaurante': {
    title: 'Ticket Restaurante',
    subtitle: 'Calendarios, ausencias, cálculo mensual y cotización.',
  },
  presupuestos: {
    title: 'Presupuestos RRLL',
    subtitle: 'Escenarios presupuestarios, simulación anual y comparativa con reales.',
  },
  'licencias-sin-sueldo': {
    title: 'Licencias sin sueldo',
    subtitle: 'Permisos no retribuidos por aprobación, firma, vigencia e histórico.',
  },
  sorteos: {
    title: 'Sorteos',
    subtitle: 'Creación de sorteos, exclusiones e histórico de resultados.',
  },
  loteria: {
    title: 'Lotería',
    subtitle: 'Campaña anual, solicitudes de décimos, cobros y control de caja.',
  },
  vinculograma: {
    title: 'Vinculograma',
    subtitle: 'Vinculaciones vigentes e histórico entre personas y áreas.',
  },
  especiales: {
    title: 'Especiales',
    subtitle: 'Comunicaciones, eventos y borradores de correo operativo.',
  },
  ajustes: {
    title: 'Ajustes',
    subtitle: 'Configuración de persistencia, datos y parámetros de la aplicación.',
  },
};

const getFallbackUserName = () => {
  if (typeof window === 'undefined') {
    return 'Usuario local';
  }

  return readStorageItem('traccion.header.username') ?? 'Usuario local';
};

type HeaderSyncVisual = {
  label: string;
  dotClass: string;
  textClass: string;
};

function buildHeaderSyncVisual(
  databaseReady: boolean,
  syncStatus: ReturnType<typeof useExternalDataSyncStatus>,
  connectivity: ReturnType<typeof useDatabaseConnectivityState>,
): HeaderSyncVisual {
  if (connectivity.phase === 'reconnecting') {
    return {
      label: 'Reconectando…',
      dotClass: 'bg-amber-400 animate-pulse shadow-[0_0_0_4px_rgba(251,191,36,0.10),0_0_14px_rgba(251,191,36,0.32)]',
      textClass: 'text-amber-100',
    };
  }

  if (connectivity.phase === 'syncing') {
    return {
      label: 'Actualizando…',
      dotClass: 'bg-sky-400 animate-pulse',
      textClass: 'text-sky-100',
    };
  }

  if (connectivity.phase === 'recovered') {
    return {
      label: 'Reconectado',
      dotClass: 'bg-emerald-400',
      textClass: 'text-emerald-200',
    };
  }
  if (!databaseReady) {
    return {
      label: 'Edición bloqueada',
      dotClass: 'bg-orange-400',
      textClass: 'text-orange-200',
    };
  }

  if (syncStatus.status === 'error') {
    return {
      label: 'Error de sync',
      dotClass: 'bg-red-500',
      textClass: 'text-red-200',
    };
  }

  if (syncStatus.status === 'checking') {
    return {
      label: 'Sincronizando…',
      dotClass:
        'bg-amber-400 animate-pulse shadow-[0_0_0_4px_rgba(251,191,36,0.10),0_0_14px_rgba(251,191,36,0.32)]',
      textClass: 'text-amber-100',
    };
  }

  return {
    label: 'Actualizado',
    dotClass: 'bg-emerald-400',
    textClass: 'text-emerald-200',
  };
}

function formatBreadcrumbLabel(value: string): string {
  return value.replace(/\s*›\s*/g, ' / ').toLocaleUpperCase('es');
}

function getUserInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) {
    return 'UL';
  }

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toLocaleUpperCase('es');
  }

  return cleaned.slice(0, 2).toLocaleUpperCase('es');
}

export function Header({
  activeView,
  onViewChange,
}: {
  activeView: AppView;
  onViewChange: (target: { view: AppView; recordId?: string; responsibleFilter?: string }) => void;
}) {
  const [windowsUserName, setWindowsUserName] = useState(getFallbackUserName);
  const headerCopy = useMemo(() => viewHeaderCopy[activeView], [activeView]);
  const breadcrumb = useMemo(() => formatBreadcrumbLabel(getNavigationBreadcrumb(activeView)), [activeView]);
  const ModuleIcon = useMemo(() => getNavigationIcon(activeView), [activeView]);
  const moduleHelp = useModuleHelpRegistry((state) => state.content);
  const dbStatus = useDatabaseStatus();
  const syncStatus = useExternalDataSyncStatus();
  const connectivity = useDatabaseConnectivityState();

  const tasks = useTaskStore((state) => state.tasks);
  const loadTasks = useTaskStore((state) => state.load);
  const taskResponsibles = useConfiguracionStore((state) => state.taskResponsibles);
  const loadConfiguracion = useConfiguracionStore((state) => state.load);
  const [openedAssignmentIds, setOpenedAssignmentIds] = useState<Set<string>>(() => new Set());
  const [isAssignmentNoticeOpen, setIsAssignmentNoticeOpen] = useState(false);
  const [isWindowsUserResolved, setIsWindowsUserResolved] = useState(false);
  const announcedAssignmentIds = useRef(new Set<string>());
  const assignmentNoticeRef = useRef<HTMLDivElement>(null);

  const currentResponsible = useMemo(
    () => taskResponsibles.find(
      (responsible) => responsible.active && responsibleMatchesWindowsUser(responsible, windowsUserName),
    ) ?? null,
    [taskResponsibles, windowsUserName],
  );
  const unseenAssignments = useMemo(
    () => currentResponsible
      ? getUnseenTaskAssignments(tasks, currentResponsible.nombre, windowsUserName)
        .filter((task) => !task.assignmentNoticeId || !openedAssignmentIds.has(task.assignmentNoticeId))
      : [],
    [currentResponsible, openedAssignmentIds, tasks, windowsUserName],
  );

  const syncVisual = buildHeaderSyncVisual(Boolean(dbStatus?.ready), syncStatus, connectivity);
  const userInitials = useMemo(() => getUserInitials(windowsUserName), [windowsUserName]);

  useEffect(() => {
    if (!dbStatus?.ready || !isWindowsUserResolved || !currentResponsible) return;
    const newlyAssigned = unseenAssignments.filter(
      (task) => task.assignmentNoticeId && !announcedAssignmentIds.current.has(task.assignmentNoticeId),
    );
    if (newlyAssigned.length === 0) return;
    newlyAssigned.forEach((task) => announcedAssignmentIds.current.add(task.assignmentNoticeId!));
    setIsAssignmentNoticeOpen(true);
  }, [currentResponsible, dbStatus?.ready, isWindowsUserResolved, unseenAssignments]);

  useEffect(() => {
    if (unseenAssignments.length === 0) setIsAssignmentNoticeOpen(false);
  }, [unseenAssignments.length]);

  useEffect(() => {
    if (!isAssignmentNoticeOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!assignmentNoticeRef.current?.contains(event.target as Node)) setIsAssignmentNoticeOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsAssignmentNoticeOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAssignmentNoticeOpen]);

  useEffect(() => subscribeToAppNavigation(onViewChange), [onViewChange]);

  useEffect(() => {
    // Carga inicial para que campana y responsables estén disponibles desde el arranque.
    // Los cambios posteriores llegan por externalDataSync; mantener además un polling
    // local de Tareas duplicaba lecturas SQLite y podía refrescar la UI fuera de ciclo.
    loadConfiguracion();
    loadTasks();
  }, [loadConfiguracion, loadTasks]);

  useEffect(() => {
    let isMounted = true;

    window.traccion
      ?.getWindowsUser?.()
      .then((userName) => {
        const normalizedUserName = userName?.trim() || 'Usuario local';
        if (!isMounted) {
          return;
        }

        setWindowsUserName(normalizedUserName);
        setIsWindowsUserResolved(true);
        writeStorageItem('traccion.header.username', normalizedUserName);
      })
      .catch(() => {
        if (isMounted) {
          setWindowsUserName('Usuario local');
          setIsWindowsUserResolved(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleOpenAssignment = (task: Task) => {
    markTaskAssignmentsSeen(windowsUserName, [task]);
    if (task.assignmentNoticeId) setOpenedAssignmentIds((current) => new Set(current).add(task.assignmentNoticeId!));
    setIsAssignmentNoticeOpen(false);
    onViewChange({ view: 'tareas', recordId: task.id, responsibleFilter: '__mine__' });
  };

  const handleOpenNewAssignments = () => {
    if (unseenAssignments.length === 0) return;
    markTaskAssignmentsSeen(windowsUserName, unseenAssignments);
    setOpenedAssignmentIds((current) => new Set([...current, ...unseenAssignments.map((task) => task.assignmentNoticeId).filter((id): id is string => Boolean(id))]));
    setIsAssignmentNoticeOpen(false);
    onViewChange({ view: 'tareas', responsibleFilter: '__mine__' });
  };

  return (
    <header className="relative z-40 px-1 pt-1 sm:px-1.5 sm:pt-1.5">
      <div className="relative grid min-w-0 gap-2.5 overflow-visible rounded-[16px] border border-white/10 bg-gradient-to-r from-[#071322] via-metro-topbar to-[#091424] px-3 py-2 shadow-[0_16px_32px_rgba(2,6,23,0.24)] lg:min-h-[58px] lg:grid-cols-[minmax(0,1fr)_minmax(270px,360px)_auto] lg:items-center lg:gap-3.5 lg:px-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-metro-red/35 bg-metro-red/10 text-metro-red shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <ModuleIcon aria-hidden="true" size={18} strokeWidth={2.1} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.14em] text-sky-100/80">
                {breadcrumb}
              </p>
              {moduleHelp ? (
                <ModuleHelpButton
                  title={moduleHelp.title}
                  subtitle={moduleHelp.subtitle}
                  sections={moduleHelp.sections}
                />
              ) : null}
            </div>
            <div className="mt-0.5 min-w-0 overflow-hidden">
              <h1 className="truncate text-[1.28rem] font-black leading-none tracking-tight text-metro-text">
                {headerCopy.title}
              </h1>
              <p className="mt-0.5 hidden truncate text-[11px] text-metro-muted xl:block">
                {headerCopy.subtitle}
              </p>
            </div>
          </div>
        </div>

        <div className="min-w-0 lg:justify-self-end lg:w-full lg:max-w-[22rem] xl:max-w-[24rem]">
          <GlobalSearch onNavigate={onViewChange} />
        </div>

        <div className="flex min-w-0 items-center gap-1.5 lg:justify-end">
          <div className="relative shrink-0" ref={assignmentNoticeRef}>
            <button
              aria-controls="task-assignment-notice"
              aria-expanded={isAssignmentNoticeOpen}
              aria-haspopup="dialog"
              aria-label={unseenAssignments.length > 0
                ? `${unseenAssignments.length} tarea${unseenAssignments.length === 1 ? '' : 's'} nueva${unseenAssignments.length === 1 ? '' : 's'} asignada${unseenAssignments.length === 1 ? '' : 's'}`
                : 'No hay nuevas tareas asignadas'}
              className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${
                unseenAssignments.length > 0
                  ? 'border-amber-400/35 bg-amber-400/10 text-amber-200 hover:border-amber-300/70 hover:bg-amber-400/18'
                  : 'border-white/10 bg-white/[0.045] text-metro-muted hover:border-white/20 hover:text-metro-text'
              }`}
              onClick={() => unseenAssignments.length > 0 ? setIsAssignmentNoticeOpen((open) => !open) : undefined}
              title={unseenAssignments.length > 0 ? 'Consultar nuevas tareas asignadas' : 'Sin nuevas tareas asignadas'}
              type="button"
            >
              <Bell size={16} aria-hidden="true" />
              {unseenAssignments.length > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-extrabold leading-none text-slate-950 ring-2 ring-[#08111F]">
                  {unseenAssignments.length > 9 ? '9+' : unseenAssignments.length}
                </span>
              ) : null}
            </button>
            {isAssignmentNoticeOpen && unseenAssignments.length > 0 ? (
              <section
                aria-label="Nuevas tareas asignadas"
                className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(22rem,calc(100vw-5rem))] overflow-hidden rounded-2xl border border-amber-400/25 bg-metro-surface text-metro-text shadow-[0_22px_55px_rgba(2,6,23,0.6)]"
                id="task-assignment-notice"
                role="dialog"
              >
                <div className="flex items-start gap-3 border-b border-white/10 bg-metro-panel px-4 py-3">
                  <span className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-2 text-amber-300"><Bell size={18} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold">{unseenAssignments.length === 1 ? 'Nueva tarea asignada' : 'Nuevas tareas asignadas'}</h2>
                    <p className="mt-0.5 text-xs text-metro-muted">Tienes {unseenAssignments.length} tarea{unseenAssignments.length === 1 ? '' : 's'} nueva{unseenAssignments.length === 1 ? '' : 's'}</p>
                  </div>
                  <button aria-label="Más tarde" className="rounded-lg p-1 text-metro-muted hover:bg-white/10 hover:text-metro-text" onClick={() => setIsAssignmentNoticeOpen(false)} type="button"><X size={17} /></button>
                </div>
                <div className="max-h-60 space-y-1 overflow-y-auto p-2">
                  {unseenAssignments.slice(0, 3).map((task) => (
                    <button className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:border-metro-border hover:bg-metro-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400" key={task.assignmentNoticeId} onClick={() => handleOpenAssignment(task)} title={`Ver tarea: ${task.titulo}`} type="button">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{task.titulo}</span><span className="block text-xs text-metro-muted">Prioridad {task.prioridad === 'critica' ? 'crítica' : task.prioridad}</span></span>
                      <ChevronRight className="shrink-0 text-amber-300" size={17} aria-hidden="true" />
                    </button>
                  ))}
                  {unseenAssignments.length > 3 ? <p className="px-3 py-1 text-xs text-metro-muted">Y {unseenAssignments.length - 3} más</p> : null}
                </div>
                <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2.5">
                  <button className="flex-1 rounded-lg bg-metro-red px-3 py-2 text-xs font-bold text-white transition hover:bg-metro-dark" onClick={() => unseenAssignments.length === 1 ? handleOpenAssignment(unseenAssignments[0]) : handleOpenNewAssignments()} type="button">{unseenAssignments.length === 1 ? 'Ver tarea' : 'Ver todas mis tareas'}</button>
                  <button className="rounded-lg px-3 py-2 text-xs font-semibold text-metro-secondary hover:bg-white/10" onClick={() => setIsAssignmentNoticeOpen(false)} type="button">Más tarde</button>
                </div>
              </section>
            ) : null}
          </div>

          <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.045] px-2.5 py-1.5 shadow-sm shadow-slate-950/15 lg:min-w-[188px]">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1E3650] text-[13px] font-black tracking-[0.02em] text-sky-100 ring-1 ring-white/8">
              {userInitials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold leading-tight text-metro-text" title={windowsUserName}>
                {windowsUserName}
              </p>
              <div className={`mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] font-semibold ${syncVisual.textClass}`} title={connectivity.phase === 'connected' ? syncStatus.message : connectivity.message}>
                {connectivity.phase === 'reconnecting' ? (
                  <WifiOff className="shrink-0 animate-pulse" size={12} aria-hidden="true" />
                ) : connectivity.phase === 'syncing' ? (
                  <RefreshCw className="shrink-0 animate-spin" size={12} aria-hidden="true" />
                ) : connectivity.phase === 'recovered' ? (
                  <CheckCircle2 className="shrink-0" size={12} aria-hidden="true" />
                ) : (
                  <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${syncVisual.dotClass}`} />
                )}
                <span className="truncate">{syncVisual.label}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

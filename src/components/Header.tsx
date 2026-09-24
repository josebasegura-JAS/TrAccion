import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronRight, X, UserRound } from 'lucide-react';
import { getNavigationBreadcrumb, type AppView } from '../navigation/navigation';
import { GlobalSearch } from './GlobalSearch';
import { ModuleHelpButton } from './ModuleHelp';
import { useModuleHelpRegistry } from '../services/moduleHelpRegistry';
import { useDatabaseStatus } from '../services/databaseStatus';
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
  chipClass: string;
};

function buildHeaderSyncVisual(
  databaseReady: boolean,
  syncStatus: ReturnType<typeof useExternalDataSyncStatus>,
): HeaderSyncVisual {
  if (!databaseReady) {
    return {
      label: 'Edición bloqueada',
      dotClass: 'bg-orange-400',
      chipClass: 'border-orange-400/20 bg-orange-500/10 text-orange-200',
    };
  }

  if (syncStatus.status === 'error') {
    return {
      label: 'Error de sync',
      dotClass: 'bg-red-500',
      chipClass: 'border-red-400/20 bg-red-500/10 text-red-200',
    };
  }

  if (syncStatus.status === 'checking') {
    return {
      label: 'Sincronizando…',
      dotClass:
        'bg-amber-400 animate-pulse shadow-[0_0_0_4px_rgba(251,191,36,0.10),0_0_14px_rgba(251,191,36,0.32)]',
      chipClass: 'border-amber-400/20 bg-amber-500/10 text-amber-100',
    };
  }

  return {
    label: 'Actualizado',
    dotClass: 'bg-emerald-400',
    chipClass: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100',
  };
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
  const breadcrumb = useMemo(() => getNavigationBreadcrumb(activeView), [activeView]);
  const moduleHelp = useModuleHelpRegistry((state) => state.content);
  const dbStatus = useDatabaseStatus();
  const syncStatus = useExternalDataSyncStatus();

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

  const syncVisual = buildHeaderSyncVisual(Boolean(dbStatus?.ready), syncStatus);

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
    loadConfiguracion();
    loadTasks();
    const interval = window.setInterval(() => loadTasks(), 60_000);
    return () => window.clearInterval(interval);
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
    <header className="relative z-40 border-b border-sky-300/[0.07] px-3 pb-2 pt-2.5 sm:px-4">
      <div className="grid min-w-0 gap-2 rounded-[22px] border border-white/10 bg-gradient-to-r from-metro-topbar via-metro-navy to-metro-topbar px-4 py-3 shadow-[0_14px_32px_rgba(2,6,23,0.22)] lg:grid-cols-[minmax(0,1fr)_minmax(280px,430px)_auto] lg:items-center lg:gap-4">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-metro-muted">
              {breadcrumb}
            </span>
            {moduleHelp ? (
              <ModuleHelpButton
                title={moduleHelp.title}
                subtitle={moduleHelp.subtitle}
                sections={moduleHelp.sections}
              />
            ) : null}
          </div>

          <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h1 className="truncate text-[1.45rem] font-black leading-tight tracking-tight text-metro-text">
              {headerCopy.title}
            </h1>
            <span className="hidden h-5 w-px shrink-0 bg-white/10 md:block" aria-hidden="true" />
            <p className="min-w-0 truncate text-sm text-metro-muted">{headerCopy.subtitle}</p>
          </div>
        </div>

        <div className="min-w-0 lg:justify-self-stretch">
          <GlobalSearch onNavigate={onViewChange} />
        </div>

        <div className="flex min-w-0 items-center gap-2 lg:justify-end">
          {unseenAssignments.length > 0 && (
            <div className="relative shrink-0" ref={assignmentNoticeRef}>
              <button
                aria-controls="task-assignment-notice"
                aria-expanded={isAssignmentNoticeOpen}
                aria-haspopup="dialog"
                aria-label={`${unseenAssignments.length} tarea${unseenAssignments.length === 1 ? '' : 's'} nueva${unseenAssignments.length === 1 ? '' : 's'} asignada${unseenAssignments.length === 1 ? '' : 's'}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-2.5 py-2 text-[11px] font-bold text-amber-200 shadow-sm transition hover:border-amber-300/70 hover:bg-amber-400/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                onClick={() => setIsAssignmentNoticeOpen((open) => !open)}
                title="Consultar nuevas tareas asignadas"
                type="button"
              >
                <AlertTriangle size={16} aria-hidden="true" />
                <span>{unseenAssignments.length} nueva{unseenAssignments.length === 1 ? '' : 's'}</span>
              </button>
              {isAssignmentNoticeOpen && (
                <section
                  aria-label="Nuevas tareas asignadas"
                  className="absolute right-0 top-[calc(100%+12px)] z-50 w-[min(22rem,calc(100vw-6rem))] overflow-hidden rounded-2xl border border-amber-400/25 bg-metro-surface text-metro-text shadow-[0_22px_55px_rgba(2,6,23,0.6)]"
                  id="task-assignment-notice"
                  role="dialog"
                >
                  <div className="flex items-start gap-3 border-b border-white/10 bg-metro-panel px-4 py-3">
                    <span className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-2 text-amber-300"><AlertTriangle size={19} aria-hidden="true" /></span>
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
                    {unseenAssignments.length > 3 && <p className="px-3 py-1 text-xs text-metro-muted">Y {unseenAssignments.length - 3} más</p>}
                  </div>
                  <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2.5">
                    <button className="flex-1 rounded-lg bg-metro-red px-3 py-2 text-xs font-bold text-white transition hover:bg-metro-dark" onClick={() => unseenAssignments.length === 1 ? handleOpenAssignment(unseenAssignments[0]) : handleOpenNewAssignments()} type="button">{unseenAssignments.length === 1 ? 'Ver tarea' : 'Ver todas mis tareas'}</button>
                    <button className="rounded-lg px-3 py-2 text-xs font-semibold text-metro-secondary hover:bg-white/10" onClick={() => setIsAssignmentNoticeOpen(false)} type="button">Más tarde</button>
                  </div>
                </section>
              )}
            </div>
          )}
          <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 shadow-sm shadow-slate-950/15 lg:w-[300px] lg:justify-start">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-metro-red/10 text-metro-red ring-1 ring-metro-red/20">
            <UserRound size={17} />
            <span
              aria-label={`Estado de sincronización: ${syncStatus.message}`}
              className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-metro-topbar transition-colors ${syncVisual.dotClass}`}
              data-tip={syncStatus.message}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-bold text-metro-text" title={windowsUserName}>
                {windowsUserName}
              </p>
              <span className="shrink-0 text-[10px] text-metro-muted/55">·</span>
              <span
                className={`inline-flex min-w-0 max-w-[116px] items-center rounded-full border px-2 py-0.5 text-[10px] font-bold leading-4 ${syncVisual.chipClass}`}
                title={syncStatus.message}
              >
                <span className="truncate">{syncVisual.label}</span>
              </span>
            </div>
          </div>
        </div>
        </div>
      </div>
    </header>
  );
}

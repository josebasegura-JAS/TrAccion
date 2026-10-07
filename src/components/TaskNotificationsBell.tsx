import { Bell, ChevronRight, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { responsibleMatchesWindowsUser } from '../features/configuracion/domain/taskResponsibles';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import type { Task } from '../features/tareas/domain/task';
import {
  getUnseenTaskAssignments,
  markTaskAssignmentsSeen,
} from '../features/tareas/domain/taskAssignmentNotifications';
import {
  getUnseenTaskCreations,
  initializeTaskCreationNoticeBaseline,
  markTaskCreationsSeen,
} from '../features/tareas/domain/taskCreationNotifications';
import { useTaskStore } from '../features/tareas/store/useTaskStore';
import type { AppView } from '../navigation/navigation';
import { useDatabaseStatus } from '../services/databaseStatus';

export function TaskNotificationsBell({
  windowsUserName,
  onViewChange,
}: {
  windowsUserName: string;
  onViewChange: (target: { view: AppView; recordId?: string; responsibleFilter?: string }) => void;
}) {
  const tasks = useTaskStore((state) => state.tasks);
  const loadTasks = useTaskStore((state) => state.load);
  const taskResponsibles = useConfiguracionStore((state) => state.taskResponsibles);
  const loadConfiguracion = useConfiguracionStore((state) => state.load);
  const dbStatus = useDatabaseStatus();

  const [openedAssignmentIds, setOpenedAssignmentIds] = useState<Set<string>>(() => new Set());
  const [dismissedCreationIds, setDismissedCreationIds] = useState<Set<string>>(() => new Set());
  const [isOpen, setIsOpen] = useState(false);
  const [isCreationBaselineReady, setIsCreationBaselineReady] = useState(false);
  const announcedAssignmentIds = useRef(new Set<string>());
  const announcedCreationIds = useRef(new Set<string>());
  const noticeRef = useRef<HTMLDivElement>(null);

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

  const unseenCreations = useMemo(
    () => isCreationBaselineReady
      ? getUnseenTaskCreations(tasks, windowsUserName)
        .filter((task) => !dismissedCreationIds.has(task.id))
      : [],
    [dismissedCreationIds, isCreationBaselineReady, tasks, windowsUserName],
  );

  const totalNotifications = unseenAssignments.length + unseenCreations.length;

  useEffect(() => {
    loadConfiguracion();
    loadTasks();
  }, [loadConfiguracion, loadTasks]);

  useEffect(() => {
    if (!dbStatus?.ready || !windowsUserName.trim()) return;
    initializeTaskCreationNoticeBaseline(windowsUserName);
    setIsCreationBaselineReady(true);
  }, [dbStatus?.ready, windowsUserName]);

  useEffect(() => {
    if (!dbStatus?.ready || !currentResponsible) return;
    const newlyAssigned = unseenAssignments.filter(
      (task) => task.assignmentNoticeId && !announcedAssignmentIds.current.has(task.assignmentNoticeId),
    );
    if (newlyAssigned.length === 0) return;
    newlyAssigned.forEach((task) => announcedAssignmentIds.current.add(task.assignmentNoticeId!));
    setIsOpen(true);
  }, [currentResponsible, dbStatus?.ready, unseenAssignments]);

  useEffect(() => {
    if (!dbStatus?.ready || !isCreationBaselineReady) return;
    const newlyCreated = unseenCreations.filter((task) => !announcedCreationIds.current.has(task.id));
    if (newlyCreated.length === 0) return;
    newlyCreated.forEach((task) => announcedCreationIds.current.add(task.id));
    setIsOpen(true);
  }, [dbStatus?.ready, isCreationBaselineReady, unseenCreations]);

  useEffect(() => {
    if (totalNotifications === 0) setIsOpen(false);
  }, [totalNotifications]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!noticeRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleOpenAssignment = (task: Task) => {
    markTaskAssignmentsSeen(windowsUserName, [task]);
    if (task.assignmentNoticeId) {
      setOpenedAssignmentIds((current) => new Set(current).add(task.assignmentNoticeId!));
    }
    setIsOpen(false);
    onViewChange({ view: 'tareas', recordId: task.id, responsibleFilter: '__mine__' });
  };

  const handleOpenAllAssignments = () => {
    if (unseenAssignments.length === 0) return;
    markTaskAssignmentsSeen(windowsUserName, unseenAssignments);
    setOpenedAssignmentIds((current) => new Set([
      ...current,
      ...unseenAssignments
        .map((task) => task.assignmentNoticeId)
        .filter((id): id is string => Boolean(id)),
    ]));
    setIsOpen(false);
    onViewChange({ view: 'tareas', responsibleFilter: '__mine__' });
  };

  const markCreationSeen = (task: Task) => {
    markTaskCreationsSeen(windowsUserName, [task]);
    setDismissedCreationIds((current) => new Set(current).add(task.id));
  };

  const handleOpenCreation = (task: Task) => {
    markCreationSeen(task);
    setIsOpen(false);
    onViewChange({ view: 'tareas', recordId: task.id });
  };

  const handleDismissAllCreations = () => {
    if (unseenCreations.length === 0) return;
    markTaskCreationsSeen(windowsUserName, unseenCreations);
    setDismissedCreationIds((current) => new Set([...current, ...unseenCreations.map((task) => task.id)]));
  };

  const formatCreationDate = (value: string) => new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

  return (
    <div className="relative shrink-0" ref={noticeRef}>
      <button
        aria-controls="task-notifications"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={totalNotifications > 0
          ? `${totalNotifications} notificación${totalNotifications === 1 ? '' : 'es'} de tareas`
          : 'No hay notificaciones de tareas'}
        className={`relative inline-flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${
          totalNotifications > 0
            ? 'border-amber-400/35 bg-amber-400/10 text-amber-200 hover:border-amber-300/70 hover:bg-amber-400/18'
            : 'border-white/10 bg-white/[0.045] text-metro-muted hover:border-white/20 hover:text-metro-text'
        }`}
        onClick={() => totalNotifications > 0 ? setIsOpen((open) => !open) : undefined}
        title={totalNotifications > 0 ? 'Notificaciones de tareas' : 'Sin notificaciones de tareas'}
        type="button"
      >
        <Bell size={15} aria-hidden="true" />
        {totalNotifications > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-extrabold leading-none text-slate-950 ring-2 ring-[#08111F]">
            {totalNotifications > 9 ? '9+' : totalNotifications}
          </span>
        ) : null}
      </button>

      {isOpen && totalNotifications > 0 ? (
        <section
          aria-label="Notificaciones de tareas"
          className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(26rem,calc(100vw-5rem))] overflow-hidden rounded-2xl border border-white/15 bg-metro-surface text-metro-text shadow-[0_22px_55px_rgba(2,6,23,0.6)]"
          id="task-notifications"
          role="dialog"
        >
          <div className="flex items-start gap-3 border-b border-white/10 bg-metro-panel px-4 py-3">
            <span className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-2 text-amber-300"><Bell size={18} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold">Notificaciones</h2>
              <p className="mt-0.5 text-xs text-metro-muted">
                {unseenAssignments.length > 0 ? `${unseenAssignments.length} asignada${unseenAssignments.length === 1 ? '' : 's'}` : 'Sin asignaciones'}
                {' · '}
                {unseenCreations.length > 0 ? `${unseenCreations.length} nueva${unseenCreations.length === 1 ? '' : 's'}` : 'Sin tareas nuevas'}
              </p>
            </div>
            <button aria-label="Cerrar notificaciones" className="rounded-lg p-1 text-metro-muted hover:bg-white/10 hover:text-metro-text" onClick={() => setIsOpen(false)} type="button"><X size={17} /></button>
          </div>

          <div className="max-h-[24rem] overflow-y-auto p-2">
            {unseenAssignments.length > 0 ? (
              <div className="mb-2">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-amber-300">Tareas asignadas</p>
                  <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">{unseenAssignments.length}</span>
                </div>
                <div className="space-y-1">
                  {unseenAssignments.slice(0, 3).map((task) => (
                    <button className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:border-metro-border hover:bg-metro-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400" key={task.assignmentNoticeId} onClick={() => handleOpenAssignment(task)} title={`Ver tarea: ${task.titulo}`} type="button">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{task.titulo}</span><span className="block text-xs text-metro-muted">Prioridad {task.prioridad === 'critica' ? 'crítica' : task.prioridad}</span></span>
                      <ChevronRight className="shrink-0 text-amber-300" size={17} aria-hidden="true" />
                    </button>
                  ))}
                  {unseenAssignments.length > 3 ? <p className="px-3 py-1 text-xs text-metro-muted">Y {unseenAssignments.length - 3} más</p> : null}
                </div>
                <div className="flex justify-end px-2 pt-1.5">
                  <button className="rounded-lg px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-400/10" onClick={handleOpenAllAssignments} type="button">{unseenAssignments.length === 1 ? 'Ver tarea' : 'Ver todas mis tareas'}</button>
                </div>
              </div>
            ) : null}

            {unseenCreations.length > 0 ? (
              <div className={unseenAssignments.length > 0 ? 'border-t border-white/10 pt-2' : ''}>
                <div className="flex items-center justify-between px-2 py-1.5">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-sky-300">Tareas nuevas</p>
                  <span className="rounded-full bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold text-sky-200">{unseenCreations.length}</span>
                </div>
                <div className="space-y-1">
                  {unseenCreations.slice(0, 4).map((task) => (
                    <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.045] px-3 py-2.5" key={task.id}>
                      <div className="flex items-start gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-400" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold" title={task.titulo}>{task.titulo}</p><p className="mt-0.5 text-[11px] text-metro-muted">Creada {formatCreationDate(task.createdAt)}{task.createdBy ? ` · ${task.createdBy}` : ''}</p></div></div>
                      <div className="mt-2 flex justify-end gap-2"><button className="rounded-lg border border-sky-400/25 px-2.5 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-400/10" onClick={() => handleOpenCreation(task)} type="button">Ver tarea</button><button className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-600" onClick={() => markCreationSeen(task)} type="button">OK</button></div>
                    </div>
                  ))}
                  {unseenCreations.length > 4 ? <p className="px-3 py-1 text-xs text-metro-muted">Y {unseenCreations.length - 4} más</p> : null}
                </div>
                <div className="flex justify-end px-2 pt-1.5">
                  <button className="rounded-lg px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-400/10" onClick={handleDismissAllCreations} type="button">Marcar nuevas como vistas</button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

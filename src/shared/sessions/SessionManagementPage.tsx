import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { Task } from '../../features/tareas/domain/task';
import { useTaskStore } from '../../features/tareas/store/useTaskStore';
import { withSharedModuleLocks } from '../../services/sharedModuleLock';
import { useSharedRecordLock } from '../../services/useSharedRecordLock';
import { useAppDialog } from '../../hooks/useAppDialog';
import { buildFilterLabel } from '../export/filterLabel';
import type { ExportColumn, ExportTablePayload } from '../export/types';
import { sanitizeFilenamePart } from '../export/tableExport';
import { ActionButton } from '../../components/ui/ActionButton';
import { TaskEditor } from '../../components/TaskEditor';
import { ModuleHelpButton, type ModuleHelpSection } from '../../components/ModuleHelp';
import { ExportPrintButtons } from '../print/ExportPrintButtons';
import { buildPrintableCommitteeSessionHtml } from './buildPrintableCommitteeSessionHtml';
import type { ManagedSessionStateStore } from './createSessionStore';
import { parseSessionImportText, type SessionImportPreview } from './sessionImport';
import {
  EMPTY_MANAGED_SESSION_DRAFT,
  isTaskInSessionPhase,
  managedSessionLabel,
  type ManagedSession,
  type ManagedSessionDraft,
  type SessionModuleConfig,
} from './session';

const sessionExportColumns: ExportColumn<ManagedSession>[] = [
  {
    key: 'status',
    header: 'Estado',
    value: (session) => (session.status === 'closed' ? 'Cerrada' : 'Abierta'),
  },
  { key: 'code', header: 'Código', value: (session) => session.code },
  { key: 'date', header: 'Fecha', value: (session) => session.date || null },
  { key: 'title', header: 'Título', value: (session) => session.title },
  { key: 'notes', header: 'Notas', value: (session) => session.notes || null },
  { key: 'items', header: 'Puntos', value: (session) => session.items.length },
  { key: 'closedAt', header: 'Cerrada', value: (session) => session.closedAt || null },
];

type SessionPointRow = {
  order: number;
  title: string;
  status: string;
  origin: string;
  union: string;
  responsible: string;
  dueDate: string;
  description: string;
};

const sessionPointExportColumns: ExportColumn<SessionPointRow>[] = [
  { key: 'order', header: 'Orden', value: (row) => row.order },
  { key: 'title', header: 'Punto / tarea', value: (row) => row.title },
  { key: 'status', header: 'Situación', value: (row) => row.status },
  { key: 'origin', header: 'Origen', value: (row) => row.origin || null },
  { key: 'union', header: 'Sindicato', value: (row) => row.union || null },
  { key: 'responsible', header: 'Responsable', value: (row) => row.responsible || null },
  { key: 'dueDate', header: 'Fecha límite', value: (row) => row.dueDate || null },
  { key: 'description', header: 'Descripción', value: (row) => row.description || null },
];

interface SessionManagementPageProps {
  config: SessionModuleConfig;
  useSessionStore: UseBoundStore<StoreApi<ManagedSessionStateStore>>;
  initialSessionId?: string | null;
  navigationNonce?: number;
  onClosedSession?: (session: ManagedSession, treatedTasks: Task[]) => void | Promise<void>;
  helpSections?: ModuleHelpSection[];
}

function sortOpenSessions(sessions: ManagedSession[]): ManagedSession[] {
  return [...sessions].sort(
    (first, second) =>
      String(first.date || '').localeCompare(String(second.date || '')) ||
      String(first.code || '').localeCompare(String(second.code || ''), 'es', {
        numeric: true,
        sensitivity: 'base',
      }),
  );
}

function normalizeSessionSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSessionSearchHaystack(
  session: ManagedSession,
  tasksById: Map<string, Task>,
  config: SessionModuleConfig,
): string {
  const taskValues = session.items.flatMap((taskId) => {
    const task = tasksById.get(taskId);
    if (!task) {
      return [taskId];
    }

    return [
      task.id,
      task.titulo,
      task.descripcion,
      task.observaciones,
      task.origen,
      task.sindicato,
      task.responsable,
      task.estado,
      task.prioridad,
      task.fechaLimite,
      task.mail,
      ...task.documentLinks.flatMap((link) => [link.nombre, link.ruta]),
      ...task.seguimiento.map((entry) => `${entry.fechaHora} ${entry.texto}`),
    ];
  });

  return normalizeSessionSearch(
    [
      config.title,
      config.shortTitle,
      session.id,
      session.code,
      session.date,
      session.title,
      session.notes,
      session.status,
      session.closedAt ?? '',
      ...session.treatedTaskIds,
      ...session.untreatedTaskIds,
      ...taskValues,
    ].join(' '),
  );
}

function matchesSessionSearch(
  session: ManagedSession,
  tasksById: Map<string, Task>,
  config: SessionModuleConfig,
  search: string,
): boolean {
  const terms = normalizeSessionSearch(search).split(' ').filter(Boolean);
  if (terms.length === 0) {
    return true;
  }

  const haystack = getSessionSearchHaystack(session, tasksById, config);
  return terms.every((term) => haystack.includes(term));
}

function getSessionHistoryYear(session: ManagedSession): string {
  const year = session.date.match(/^(\d{4})/)?.[1];
  return year ?? 'Sin año';
}

function groupClosedSessionsByYear(
  sessions: ManagedSession[],
): Array<{ year: string; sessions: ManagedSession[] }> {
  const groups = new Map<string, ManagedSession[]>();

  sessions.forEach((session) => {
    const year = getSessionHistoryYear(session);
    groups.set(year, [...(groups.get(year) ?? []), session]);
  });

  return Array.from(groups.entries())
    .sort(([firstYear], [secondYear]) =>
      secondYear.localeCompare(firstYear, 'es', { numeric: true }),
    )
    .map(([year, yearSessions]) => ({
      year,
      sessions: yearSessions.sort(
        (first, second) =>
          String(second.date || '').localeCompare(String(first.date || '')) ||
          String(second.code || '').localeCompare(String(first.code || ''), 'es', {
            numeric: true,
            sensitivity: 'base',
          }),
      ),
    }));
}

function getTaskTitle(tasksById: Map<string, Task>, taskId: string): string {
  return tasksById.get(taskId)?.titulo ?? 'Tarea no encontrada';
}

function describeTask(task: Task | undefined): string {
  if (!task) {
    return 'La tarea ya no existe o fue eliminada.';
  }

  return [
    task.origen ? `Origen: ${task.origen}` : '',
    task.sindicato ? `Sindicato: ${task.sindicato}` : '',
    task.responsable ? `Responsable: ${task.responsable}` : '',
    task.fechaLimite ? `Límite: ${task.fechaLimite}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function getTaskDescription(task: Task | undefined): string {
  if (!task) {
    return 'La tarea ya no existe o fue eliminada.';
  }

  return task.descripcion || task.observaciones || '';
}

function getSessionPointStatus(session: ManagedSession, taskId: string): string {
  if (session.status === 'open') {
    return 'Pendiente de tratar';
  }

  if (session.treatedTaskIds.includes(taskId)) {
    return 'Tratada';
  }

  if (session.untreatedTaskIds.includes(taskId)) {
    return 'No tratada';
  }

  return 'Sin clasificar';
}

function buildSessionPointRows(
  session: ManagedSession,
  tasksById: Map<string, Task>,
): SessionPointRow[] {
  return session.items.map((taskId, index) => {
    const task = tasksById.get(taskId);

    return {
      order: index + 1,
      title: getTaskTitle(tasksById, taskId),
      status: getSessionPointStatus(session, taskId),
      origin: task?.origen ?? '',
      union: task?.sindicato ?? '',
      responsible: task?.responsable ?? '',
      dueDate: task?.fechaLimite ?? '',
      description: getTaskDescription(task),
    };
  });
}

function buildSessionExportPayload(
  session: ManagedSession,
  tasksById: Map<string, Task>,
  config: SessionModuleConfig,
): ExportTablePayload<SessionPointRow> {
  const label = managedSessionLabel(session);
  const filenameParts = [config.moduleId, session.date, session.code, session.title]
    .map((part) => sanitizeFilenamePart(part))
    .filter(Boolean)
    .join('-');
  const filterLabel = buildFilterLabel([
    ['Sesión', label],
    ['Título', session.title],
    ['Estado', session.status === 'closed' ? 'Cerrada' : 'Abierta'],
    ['Notas', session.notes],
  ]);

  return {
    title: `${config.title} · ${label}`,
    filename: filenameParts || `${config.moduleId}-sesion`,
    columns: sessionPointExportColumns,
    rows: buildSessionPointRows(session, tasksById),
    filterLabel,
  };
}

export function SessionManagementPage({
  config,
  initialSessionId = null,
  navigationNonce,
  useSessionStore,
  onClosedSession,
  helpSections,
}: SessionManagementPageProps) {
  const {
    sessions,
    hasLoadedHistoricalSessions,
    load,
    loadHistoricalSessions,
    createWithConcurrencyCheck,
    importSessionsWithConcurrencyCheck,
    removeWithConcurrencyCheck,
    updateWithConcurrencyCheck,
    addTaskWithConcurrencyCheck,
    removeTaskWithConcurrencyCheck,
    moveTaskWithConcurrencyCheck,
    closeSessionWithConcurrencyCheck,
  } = useSessionStore();
  const {
    tasks,
    load: loadTasks,
    closeTasksFromSessionWithConcurrencyCheck,
    createManyFromImport,
  } = useTaskStore();
  const [draft, setDraft] = useState<ManagedSessionDraft>(EMPTY_MANAGED_SESSION_DRAFT);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ManagedSessionDraft>(EMPTY_MANAGED_SESSION_DRAFT);
  const [openPanel, setOpenPanel] = useState<'open' | 'history'>('open');
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [openHistoryYears, setOpenHistoryYears] = useState<Record<string, boolean>>({});
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);
  const [treatedTaskIds, setTreatedTaskIds] = useState<Record<string, boolean>>({});
  const [importPreview, setImportPreview] = useState<SessionImportPreview | null>(null);
  const [importError, setImportError] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const processedNavigationNonceRef = useRef<number | undefined>(undefined);
  const { alert, confirm, dialogNode } = useAppDialog();

  useEffect(() => {
    load();
    loadTasks();
  }, [load, loadTasks]);

  useEffect(() => {
    if (hasLoadedHistoricalSessions) {
      return;
    }

    if (sessionSearch.trim().length >= 2 || openPanel === 'history') {
      loadHistoricalSessions();
    }
  }, [hasLoadedHistoricalSessions, loadHistoricalSessions, openPanel, sessionSearch]);

  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const openSessions = useMemo(
    () => sortOpenSessions(sessions.filter((session) => session.status === 'open')),
    [sessions],
  );
  const closedSessions = useMemo(
    () => sessions.filter((session) => session.status === 'closed'),
    [sessions],
  );
  const hasSessionSearch = sessionSearch.trim().length >= 2;
  const effectiveSessionSearch = hasSessionSearch ? sessionSearch : '';
  const filteredOpenSessions = useMemo(
    () =>
      openSessions.filter((session) =>
        matchesSessionSearch(session, tasksById, config, effectiveSessionSearch),
      ),
    [config, effectiveSessionSearch, openSessions, tasksById],
  );
  const shouldRenderClosedSessions = hasSessionSearch || openPanel === 'history';
  const filteredClosedSessions = useMemo(
    () =>
      shouldRenderClosedSessions
        ? closedSessions.filter((session) =>
            matchesSessionSearch(session, tasksById, config, effectiveSessionSearch),
          )
        : [],
    [closedSessions, config, effectiveSessionSearch, shouldRenderClosedSessions, tasksById],
  );
  const closedSessionCount = shouldRenderClosedSessions
    ? filteredClosedSessions.length
    : hasLoadedHistoricalSessions
      ? closedSessions.length
      : 0;
  const closedSessionGroups = useMemo(
    () => (shouldRenderClosedSessions ? groupClosedSessionsByYear(filteredClosedSessions) : []),
    [filteredClosedSessions, shouldRenderClosedSessions],
  );
  const availableTasks = useMemo(
    () =>
      tasks
        .filter((task) => isTaskInSessionPhase(task, config.taskPhase))
        .sort((first, second) => first.titulo.localeCompare(second.titulo, 'es')),
    [config.taskPhase, tasks],
  );
  const closingSession = closingSessionId
    ? (sessions.find((session) => session.id === closingSessionId) ?? null)
    : null;
  const editingSession = editingSessionId
    ? (sessions.find((session) => session.id === editingSessionId) ?? null)
    : null;
  const editingTask = editingTaskId ? (tasks.find((task) => task.id === editingTaskId) ?? null) : null;
  const canEditSessions = config.moduleId === 'comite';
  const sessionFilterLabel = buildFilterLabel([
    ['Módulo', config.title],
    ['Búsqueda', sessionSearch],
  ]);
  const moduleImportKind = config.moduleId === 'paritaria' ? 'paritaria' : 'comite';
  const relevantImportSessions = useMemo(
    () => importPreview?.sessions.filter((session) => session.kind === moduleImportKind) ?? [],
    [importPreview, moduleImportKind],
  );
  const relevantTaskExternalKeys = useMemo(
    () => new Set(relevantImportSessions.flatMap((session) => session.taskExternalKeys)),
    [relevantImportSessions],
  );
  const relevantImportTasks = useMemo(
    () =>
      importPreview?.tasks.filter((task) => relevantTaskExternalKeys.has(task.externalKey)) ?? [],
    [importPreview, relevantTaskExternalKeys],
  );

  useEffect(() => {
    if (!initialSessionId || navigationNonce === undefined) {
      return;
    }

    if (processedNavigationNonceRef.current === navigationNonce) {
      return;
    }

    const targetSession = sessions.find((session) => session.id === initialSessionId);
    if (!targetSession) {
      return;
    }

    setOpenPanel(targetSession.status === 'closed' ? 'history' : 'open');
    setExpandedSessionId(targetSession.id);
    processedNavigationNonceRef.current = navigationNonce;
  }, [initialSessionId, navigationNonce, sessions]);

  const updateDraft = <K extends keyof ManagedSessionDraft>(
    key: K,
    value: ManagedSessionDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const updateEditDraft = <K extends keyof ManagedSessionDraft>(
    key: K,
    value: ManagedSessionDraft[K],
  ) => {
    setEditDraft((current) => ({ ...current, [key]: value }));
  };

  const handleCreate = async () => {
    if (!draft.date || !draft.code.trim()) {
      await alert('Indica al menos fecha y código documental de la sesión.', { type: 'warning' });
      return;
    }

    try {
      await withSharedModuleLocks([{ module: config.moduleId, label: config.title }], async () => {
        const result = await createWithConcurrencyCheck(draft);
        if (!result.ok || !result.sessionId) {
          throw new Error(result.message);
        }

        setDraft(EMPTY_MANAGED_SESSION_DRAFT);
        setIsCreateOpen(false);
        setOpenPanel('open');
        setExpandedSessionId(result.sessionId);
      });
    } catch (error) {
      await alert(error instanceof Error ? error.message : 'No se ha podido crear la sesión.', {
        type: 'error',
      });
    }
  };

  const openCloseModal = (session: ManagedSession) => {
    setTreatedTaskIds(Object.fromEntries(session.items.map((taskId) => [taskId, true])));
    setClosingSessionId(session.id);
  };

  const openEditModal = (session: ManagedSession) => {
    if (!canEditSessions) {
      return;
    }

    setEditDraft({
      date: session.date,
      code: session.code,
      title: session.title,
      notes: session.notes,
    });
    setEditingSessionId(session.id);
  };

  const cancelEditSession = () => {
    setEditingSessionId(null);
    setEditDraft(EMPTY_MANAGED_SESSION_DRAFT);
  };

  const saveEditSession = async () => {
    if (!editingSession) {
      return;
    }

    if (!editDraft.date || !editDraft.code.trim()) {
      await alert('Indica al menos fecha y código documental de la sesión.', { type: 'warning' });
      return;
    }

    try {
      await withSharedModuleLocks([{ module: config.moduleId, label: config.title }], async () => {
        const result = await updateWithConcurrencyCheck(
          editingSession.id,
          editDraft,
          editingSession.updatedAt ?? null,
        );
        if (!result.ok) {
          throw new Error(result.message);
        }

        cancelEditSession();
      });
    } catch (error) {
      await alert(error instanceof Error ? error.message : 'No se ha podido guardar la sesión.', {
        type: 'error',
      });
    }
  };

  const handleRemoveSession = async (session: ManagedSession) => {
    try {
      await withSharedModuleLocks([{ module: config.moduleId, label: config.title }], async () => {
        const result = await removeWithConcurrencyCheck(session.id, session.updatedAt ?? null);
        if (!result.ok) {
          throw new Error(result.message);
        }

        if (expandedSessionId === session.id) {
          setExpandedSessionId(null);
        }
      });
    } catch (error) {
      await alert(error instanceof Error ? error.message : 'No se ha podido eliminar la sesión.', {
        type: 'error',
      });
    }
  };


  const openEditTaskModal = async (session: ManagedSession, taskId: string) => {
    if (session.status !== 'open') {
      return;
    }

    const task = tasksById.get(taskId);
    if (!task) {
      await alert('No se ha encontrado el punto seleccionado. Recarga la sesión antes de continuar.', {
        type: 'warning',
      });
      return;
    }

    setEditingTaskId(task.id);
  };

  const handleAddTaskToSession = async (session: ManagedSession, taskId: string) => {
    try {
      await withSharedModuleLocks([{ module: config.moduleId, label: config.title }], async () => {
        const result = await addTaskWithConcurrencyCheck(
          session.id,
          taskId,
          session.updatedAt ?? null,
        );
        if (!result.ok) {
          throw new Error(result.message);
        }
      });
    } catch (error) {
      await alert(error instanceof Error ? error.message : 'No se ha podido añadir el punto.', {
        type: 'error',
      });
    }
  };

  const handleRemoveTaskFromSession = async (session: ManagedSession, taskId: string) => {
    try {
      await withSharedModuleLocks([{ module: config.moduleId, label: config.title }], async () => {
        const result = await removeTaskWithConcurrencyCheck(
          session.id,
          taskId,
          session.updatedAt ?? null,
        );
        if (!result.ok) {
          throw new Error(result.message);
        }
      });
    } catch (error) {
      await alert(error instanceof Error ? error.message : 'No se ha podido quitar el punto.', {
        type: 'error',
      });
    }
  };

  const handleMoveTaskInSession = async (
    session: ManagedSession,
    taskId: string,
    direction: 'up' | 'down',
  ) => {
    try {
      await withSharedModuleLocks([{ module: config.moduleId, label: config.title }], async () => {
        const result = await moveTaskWithConcurrencyCheck(
          session.id,
          taskId,
          direction,
          session.updatedAt ?? null,
        );
        if (!result.ok) {
          throw new Error(result.message);
        }
      });
    } catch (error) {
      await alert(error instanceof Error ? error.message : 'No se ha podido reordenar el punto.', {
        type: 'error',
      });
    }
  };

  const confirmCloseSession = async () => {
    if (!closingSession) {
      return;
    }

    try {
      await withSharedModuleLocks(
        [
          { module: config.moduleId, label: config.title },
          { module: 'tareas', label: 'Tareas' },
          { module: 'actas', label: 'Actas' },
        ],
        async () => {
          const treatedIds = closingSession.items.filter((taskId) => treatedTaskIds[taskId]);
          const treatedTasks = treatedIds.flatMap((taskId) => {
            const task = tasksById.get(taskId);
            return task ? [task] : [];
          });

          const closeSessionResult = await closeSessionWithConcurrencyCheck(
            closingSession.id,
            treatedIds,
            closingSession.updatedAt ?? null,
          );
          if (!closeSessionResult.ok || !closeSessionResult.session) {
            throw new Error(closeSessionResult.message);
          }

          const closeTasksResult = await closeTasksFromSessionWithConcurrencyCheck(
            treatedIds,
            config.closeTrackingLabel,
            managedSessionLabel(closeSessionResult.session),
          );
          if (!closeTasksResult.ok) {
            throw new Error(closeTasksResult.message);
          }

          if (
            await confirm('¿Desea crear un registro en Actas?', {
              confirmLabel: 'Crear acta',
              title: 'Crear acta',
            })
          ) {
            await onClosedSession?.(closeSessionResult.session, treatedTasks);
          }
          setClosingSessionId(null);
          setTreatedTaskIds({});
          setExpandedSessionId(null);
          setOpenPanel('history');
        },
      );
    } catch (error) {
      await alert(
        error instanceof Error
          ? error.message
          : 'No se ha podido cerrar la sesión de forma segura. Reintenta cuando finalicen otras ediciones.',
        { type: 'error' },
      );
    }
  };

  const openImporter = () => {
    setImportError('');
    fileInputRef.current?.click();
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setImportError('');
    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      let text = '';

      if (extension === 'docx') {
        const extractor = window.traccion?.extractDocxText;
        if (!extractor) {
          throw new Error('El lector de Word no está disponible en esta ejecución.');
        }
        const result = await extractor(await file.arrayBuffer());
        if (!result.ok || !result.text) {
          throw new Error(result.message || 'No se ha podido leer el documento Word.');
        }
        text = result.text;
      } else {
        text = await file.text();
      }

      const preview = parseSessionImportText(text, moduleImportKind);
      setImportPreview(preview);
      const matchingSessions = preview.sessions.filter(
        (session) => session.kind === moduleImportKind,
      );
      if (matchingSessions.length === 0) {
        setImportError(
          `El documento se ha leído, pero no se han detectado sesiones para ${config.title}.`,
        );
      }
    } catch (error) {
      setImportPreview(null);
      setImportError(
        error instanceof Error ? error.message : 'No se ha podido importar el documento.',
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const confirmImport = async () => {
    if (!importPreview || relevantImportSessions.length === 0) {
      return;
    }

    setImportError('');
    try {
      await withSharedModuleLocks(
        [
          { module: config.moduleId, label: config.title },
          { module: 'tareas', label: 'Tareas' },
        ],
        async () => {
          const latestSessions = useSessionStore.getState().sessions;
          const importableSessions = relevantImportSessions.filter((session) => {
            const normalizedCode = session.draft.code.trim().toLowerCase();
            return !latestSessions.some(
              (existingSession) =>
                existingSession.code.trim().toLowerCase() === normalizedCode &&
                existingSession.date === session.draft.date,
            );
          });
          const importableTaskKeys = new Set(
            importableSessions.flatMap((session) => session.taskExternalKeys),
          );
          const closedAtByTaskExternalKey = new Map(
            importableSessions.flatMap((session) =>
              session.taskExternalKeys.map(
                (externalKey) =>
                  [
                    externalKey,
                    session.draft.date ? `${session.draft.date}T00:00:00.000Z` : null,
                  ] as const,
              ),
            ),
          );
          const importableTasks = relevantImportTasks
            .filter((task) => importableTaskKeys.has(task.externalKey))
            .map((task) => ({
              ...task,
              closedAt: closedAtByTaskExternalKey.get(task.externalKey) ?? null,
            }));
          const taskIdsByExternalKey = createManyFromImport(importableTasks);
          const importedSessionsResult = await importSessionsWithConcurrencyCheck(
            importableSessions.map((session) => ({
              externalKey: session.externalKey,
              draft: session.draft,
              taskIds: session.taskExternalKeys.flatMap((externalKey) => {
                const taskId = taskIdsByExternalKey[externalKey];
                return taskId ? [taskId] : [];
              }),
            })),
          );
          if (!importedSessionsResult.ok) {
            throw new Error(importedSessionsResult.message);
          }

          loadTasks();
          setOpenPanel('history');
          setImportPreview(null);
          await alert(
            importedSessionsResult.importedCount > 0
              ? `Importación completada: ${importedSessionsResult.importedCount} sesiones históricas y ${importableTasks.length} puntos históricos procesados.`
              : 'No se han creado sesiones nuevas. Ya existían sesiones con el mismo código y fecha.',
            { type: 'info' },
          );
        },
      );
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : 'No se ha podido confirmar la importación de forma segura.',
      );
    }
  };

  return (
    <section
      className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card"
      id={config.moduleId}
    >
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Módulo</p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold text-metro-text">{config.title}</h2>
            {helpSections ? (
              <ModuleHelpButton
                title={config.title}
                subtitle={`Guía rápida de sesiones, puntos, cierre e histórico de ${config.title}.`}
                sections={helpSections}
              />
            ) : null}
          </div>
          <p className="mt-0.5 text-base text-metro-muted">
            Alta de sesiones, orden del día y cierre automático de tareas en fase {config.taskPhase}
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportPrintButtons
            payload={{
              title: config.exportTitle,
              filename: config.exportFilename,
              columns: sessionExportColumns,
              rows: sessions,
              filterLabel: sessionFilterLabel,
            }}
          />
          <input
            accept=".docx,.txt"
            className="hidden"
            onChange={(event) => handleImportFile(event.target.files?.[0])}
            ref={fileInputRef}
            type="file"
          />
          <ActionButton onClick={openImporter} variant="word">
            Importar Word
          </ActionButton>
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={() => setIsCreateOpen((current) => !current)}
            type="button"
          >
            <Plus size={16} /> {config.createButtonLabel}
          </button>
        </div>
      </div>

      {isCreateOpen && (
        <div className="mb-4 rounded-xl border border-metro-border bg-metro-panel p-3">
          <div className="grid gap-2 xl:grid-cols-[150px_180px_minmax(220px,1fr)]">
            <input
              className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => updateDraft('date', event.target.value)}
              type="date"
              value={draft.date}
            />
            <input
              className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => updateDraft('code', event.target.value)}
              placeholder="Código documento"
              value={draft.code}
            />
            <input
              className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => updateDraft('title', event.target.value)}
              placeholder="Título / referencia de la sesión"
              value={draft.title}
            />
          </div>
          <textarea
            className="mt-2 min-h-[82px] w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => updateDraft('notes', event.target.value)}
            placeholder="Notas de la sesión, documentación asociada, observaciones, etc."
            value={draft.notes}
          />
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button
              className="rounded-xl border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
              onClick={() => setIsCreateOpen(false)}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
              onClick={handleCreate}
              type="button"
            >
              Crear sesión
            </button>
          </div>
        </div>
      )}

      <div className="mb-4 rounded-xl border border-metro-border bg-metro-panel/80 p-3">
        <label
          className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-metro-muted"
          htmlFor={`${config.moduleId}-session-search`}
        >
          <Search size={14} className="text-metro-red" /> Buscar en {config.shortTitle}
        </label>
        <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center">
          <input
            className="min-w-0 flex-1 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
            id={`${config.moduleId}-session-search`}
            onChange={(event) => setSessionSearch(event.target.value)}
            placeholder="Buscar por sesión, fecha, código, punto, sindicato, responsable, descripción..."
            type="search"
            value={sessionSearch}
          />
          <span className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs text-metro-muted">
            {filteredOpenSessions.length + closedSessionCount} de {sessions.length} sesiones
          </span>
          {sessionSearch && (
            <button
              className="rounded-lg border border-metro-border px-3 py-2 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
              onClick={() => setSessionSearch('')}
              type="button"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(310px,0.85fr)]">
        <SessionPanel
          count={filteredOpenSessions.length}
          isOpen={hasSessionSearch || openPanel === 'open'}
          label="Sesiones abiertas"
          onToggle={() => setOpenPanel(openPanel === 'open' ? 'history' : 'open')}
        >
          {filteredOpenSessions.length === 0 && (
            <p className="text-sm text-metro-muted">
              {hasSessionSearch
                ? 'No hay sesiones abiertas que coincidan con la búsqueda.'
                : 'No hay sesiones abiertas.'}
            </p>
          )}
          {filteredOpenSessions.map((session) => (
            <SessionCard
              addTask={handleAddTaskToSession}
              availableTasks={availableTasks}
              config={config}
              isExpanded={expandedSessionId === session.id}
              key={session.id}
              moveTask={handleMoveTaskInSession}
              onEditTask={openEditTaskModal}
              onClose={openCloseModal}
              onEdit={canEditSessions ? openEditModal : undefined}
              onRemove={handleRemoveSession}
              onToggle={() =>
                setExpandedSessionId((current) => (current === session.id ? null : session.id))
              }
              removeTask={handleRemoveTaskFromSession}
              session={session}
              tasksById={tasksById}
            />
          ))}
        </SessionPanel>

        <SessionPanel
          count={closedSessionCount}
          isOpen={hasSessionSearch || openPanel === 'history'}
          label="Histórico de sesiones"
          onToggle={() => setOpenPanel(openPanel === 'history' ? 'open' : 'history')}
        >
          {!hasLoadedHistoricalSessions && !hasSessionSearch && (
            <p className="text-sm text-metro-muted">
              El histórico se cargará al abrir este panel o buscar sesiones cerradas.
            </p>
          )}
          {closedSessionCount === 0 && hasLoadedHistoricalSessions && (
            <p className="text-sm text-metro-muted">
              {hasSessionSearch
                ? 'No hay sesiones cerradas que coincidan con la búsqueda.'
                : 'No hay sesiones cerradas.'}
            </p>
          )}
          {closedSessionGroups.map((group) => {
            const isYearOpen = hasSessionSearch || (openHistoryYears[group.year] ?? false);

            return (
              <div
                className="overflow-hidden rounded-xl border border-metro-border"
                key={group.year}
              >
                <button
                  className="flex w-full items-center justify-between bg-metro-panel px-3 py-2 text-left text-sm font-bold text-metro-text hover:bg-metro-red/10"
                  onClick={() =>
                    setOpenHistoryYears((current) => ({ ...current, [group.year]: !isYearOpen }))
                  }
                  type="button"
                >
                  <span className="flex items-center gap-2">
                    {isYearOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    {group.year}
                  </span>
                  <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-red-200">
                    {group.sessions.length}
                  </span>
                </button>
                {isYearOpen && (
                  <div className="space-y-3 border-t border-metro-border bg-metro-surface p-3">
                    {group.sessions.map((session) => (
                      <HistoricSessionCard
                        config={config}
                        key={session.id}
                        onEdit={canEditSessions ? openEditModal : undefined}
                        onConfirm={confirm}
                        onRemove={handleRemoveSession}
                        session={session}
                        tasksById={tasksById}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </SessionPanel>
      </div>

      {importError && (
        <div className="mt-3 rounded-xl border border-red-500/40 bg-red-950/20 px-3 py-2 text-sm font-semibold text-red-100">
          {importError}
        </div>
      )}

      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="max-h-[86vh] w-full max-w-4xl overflow-auto rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-2xl">
            <h3 className="text-lg font-bold text-metro-text">
              Previsualización de importación · {config.title}
            </h3>
            <p className="mt-1 text-sm text-metro-muted">
              Se importarán solo las sesiones compatibles con este módulo. Las sesiones con el mismo
              código y fecha se omiten.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <ImportMetric label="Sesiones detectadas" value={relevantImportSessions.length} />
              <ImportMetric label="Puntos detectados" value={relevantImportTasks.length} />
              <ImportMetric label="Líneas ignoradas" value={importPreview.ignoredLines.length} />
            </div>
            <div className="mt-3 max-h-[380px] overflow-auto rounded-xl border border-metro-border">
              <table className="w-full table-fixed text-left text-xs">
                <thead className="sticky top-0 z-10 bg-metro-panel text-[11px] uppercase tracking-wide text-metro-muted">
                  <tr>
                    <th className="w-[130px] px-3 py-2">Fecha</th>
                    <th className="w-[160px] px-3 py-2">Código</th>
                    <th className="px-3 py-2">Título</th>
                    <th className="w-[90px] px-3 py-2 text-right">Puntos</th>
                  </tr>
                </thead>
                <tbody className="bg-metro-surface [&>tr:nth-child(even)]:bg-metro-panel/45">
                  {relevantImportSessions.map((session) => (
                    <tr key={session.externalKey}>
                      <td className="px-3 py-2 text-metro-muted">{session.draft.date || '—'}</td>
                      <td className="px-3 py-2 font-semibold text-metro-text">
                        {session.draft.code}
                      </td>
                      <td
                        className="truncate px-3 py-2 text-metro-muted"
                        title={session.draft.title}
                      >
                        {session.draft.title}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-metro-text">
                        {session.taskExternalKeys.length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                className="rounded-xl border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
                onClick={() => setImportPreview(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-60"
                disabled={relevantImportSessions.length === 0}
                onClick={confirmImport}
                type="button"
              >
                Confirmar importación
              </button>
            </div>
          </div>
        </div>
      )}

      {editingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="max-h-[86vh] w-full max-w-3xl overflow-auto rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-2xl">
            <h3 className="text-lg font-bold text-metro-text">
              Editar sesión de {config.shortTitle}
            </h3>
            <p className="mt-1 text-sm text-metro-muted">
              Modifica la fecha, el código documental, el título o las notas. El estado de la sesión
              no se cambia.
            </p>
            <div className="mt-4 grid gap-2 xl:grid-cols-[150px_180px_minmax(220px,1fr)]">
              <input
                className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => updateEditDraft('date', event.target.value)}
                type="date"
                value={editDraft.date}
              />
              <input
                className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => updateEditDraft('code', event.target.value)}
                placeholder="Código documento"
                value={editDraft.code}
              />
              <input
                className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => updateEditDraft('title', event.target.value)}
                placeholder="Título / referencia de la sesión"
                value={editDraft.title}
              />
            </div>
            <textarea
              className="mt-2 min-h-[120px] w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => updateEditDraft('notes', event.target.value)}
              placeholder="Notas de la sesión, documentación asociada, observaciones, etc."
              value={editDraft.notes}
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                className="rounded-xl border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
                onClick={cancelEditSession}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
                onClick={saveEditSession}
                type="button"
              >
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {editingTaskId && (
        <TaskEditor
          mode="edit"
          onDone={() => setEditingTaskId(null)}
          task={editingTask}
        />
      )}

      {closingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="max-h-[86vh] w-full max-w-3xl overflow-auto rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-2xl">
            <h3 className="text-lg font-bold text-metro-text">
              Cerrar sesión de {config.shortTitle}
            </h3>
            <p className="mt-1 text-sm text-metro-muted">
              Revisa los puntos tratados. Desmarca los no tratados para mantener sus tareas
              abiertas.
            </p>
            <div className="mt-3 rounded-xl border border-metro-border bg-metro-panel p-3 text-sm text-metro-muted">
              <strong className="text-metro-text">{closingSession.title}</strong>
              <br />
              {managedSessionLabel(closingSession)}
            </div>
            <div className="mt-3 space-y-2">
              {closingSession.items.length === 0 && (
                <p className="rounded-xl border border-metro-border bg-metro-panel p-3 text-sm text-metro-muted">
                  Esta sesión no tiene tareas asignadas. Puede cerrarse sin modificar tareas.
                </p>
              )}
              {closingSession.items.map((taskId, index) => {
                const task = tasksById.get(taskId);

                return (
                  <label
                    className="flex cursor-pointer gap-3 rounded-xl border border-metro-border bg-metro-panel p-3 hover:border-metro-red/60"
                    key={taskId}
                  >
                    <input
                      checked={treatedTaskIds[taskId] ?? true}
                      className="mt-1 h-4 w-4"
                      onChange={(event) =>
                        setTreatedTaskIds((current) => ({
                          ...current,
                          [taskId]: event.target.checked,
                        }))
                      }
                      type="checkbox"
                    />
                    <span>
                      <span className="block font-semibold text-metro-text">
                        {index + 1}. {getTaskTitle(tasksById, taskId)}
                      </span>
                      <span className="mt-1 block text-xs text-metro-muted">
                        {describeTask(task)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                className="rounded-xl border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
                onClick={() => setClosingSessionId(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
                onClick={confirmCloseSession}
                type="button"
              >
                Confirmar cierre
              </button>
            </div>
          </div>
        </div>
      )}
      {dialogNode}
    </section>
  );
}

function ImportMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-metro-muted">{label}</p>
      <p className="mt-1 text-xl font-black text-metro-text">{value}</p>
    </div>
  );
}

function SessionPanel({
  children,
  count,
  isOpen,
  label,
  onToggle,
}: {
  children: ReactNode;
  count: number;
  isOpen: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-metro-border">
      <button
        className="flex w-full items-center justify-between border-b border-metro-border bg-metro-panel px-3 py-2 text-left"
        onClick={onToggle}
        type="button"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-metro-text">
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          {label}
        </span>
        <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-red-200">
          {count}
        </span>
      </button>
      {isOpen && (
        <div className="max-h-[640px] space-y-3 overflow-auto bg-metro-surface p-3">{children}</div>
      )}
    </div>
  );
}

function SessionCard({
  addTask,
  availableTasks,
  config,
  isExpanded,
  moveTask,
  onClose,
  onEdit,
  onEditTask,
  onRemove,
  onToggle,
  removeTask,
  session,
  tasksById,
}: {
  addTask: (session: ManagedSession, taskId: string) => void | Promise<void>;
  availableTasks: Task[];
  config: SessionModuleConfig;
  isExpanded: boolean;
  moveTask: (
    session: ManagedSession,
    taskId: string,
    direction: 'up' | 'down',
  ) => void | Promise<void>;
  onClose: (session: ManagedSession) => void;
  onEdit?: (session: ManagedSession) => void;
  onEditTask: (session: ManagedSession, taskId: string) => void | Promise<void>;
  onRemove: (session: ManagedSession) => void | Promise<void>;
  onToggle: () => void;
  removeTask: (session: ManagedSession, taskId: string) => void | Promise<void>;
  session: ManagedSession;
  tasksById: Map<string, Task>;
}) {
  const unassignedTasks = availableTasks.filter((task) => !session.items.includes(task.id));
  const recordLock = useSharedRecordLock({
    module: config.moduleId,
    recordId: session.id,
    enabled: isExpanded && session.status === 'open',
  });
  const isReadOnly = recordLock.isReadOnly;
  const sessionExportPayload = buildSessionExportPayload(session, tasksById, config);
  const sessionPrintBuilder =
    config.moduleId === 'comite'
      ? () =>
          buildPrintableCommitteeSessionHtml({
            session,
            tasksById,
            config,
            generatedAt: new Date(),
          })
      : undefined;

  return (
    <article className="rounded-xl border border-metro-border bg-metro-panel p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <button className="min-w-0 flex-1 text-left" onClick={onToggle} type="button">
          <h3 className="flex items-center gap-2 text-base font-bold text-metro-text">
            {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
            <CalendarDays size={17} className="text-metro-red" /> {session.title}
          </h3>
          <p className="mt-1 text-xs text-metro-muted">
            {managedSessionLabel(session)} · {session.items.length} puntos
          </p>
          {session.notes && <p className="mt-2 text-sm text-metro-muted">{session.notes}</p>}
        </button>
        <div className="flex shrink-0 flex-wrap gap-2">
          <ExportPrintButtons htmlBuilder={sessionPrintBuilder} payload={sessionExportPayload} />
          {onEdit && (
            <button
              className="inline-flex items-center gap-1 rounded-xl border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!isExpanded || isReadOnly}
              onClick={() => onEdit(session)}
              title={
                !isExpanded ? 'Abre la sesión para bloquearla antes de editarla' : 'Editar sesión'
              }
              type="button"
            >
              <Pencil size={14} /> Editar
            </button>
          )}
          <button
            className="rounded-xl border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isExpanded || isReadOnly}
            title={!isExpanded ? 'Abre la sesión para bloquearla antes de cerrarla' : undefined}
            onClick={() => onClose(session)}
            type="button"
          >
            Cerrar sesión
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-xl border border-red-500/40 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isExpanded || isReadOnly}
            title={!isExpanded ? 'Abre la sesión para bloquearla antes de eliminarla' : undefined}
            onClick={() => void onRemove(session)}
            type="button"
          >
            <Trash2 size={14} /> Eliminar
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 rounded-xl border border-metro-border bg-metro-app/40 p-3">
          {recordLock.message && (
            <p
              className={`mb-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
                isReadOnly
                  ? 'border-red-400/40 bg-red-950/20 text-red-100'
                  : 'border-metro-border bg-metro-surface text-metro-muted'
              }`}
            >
              {recordLock.message}
            </p>
          )}
          <div className="flex flex-col gap-2 lg:flex-row">
            <select
              className="min-w-0 flex-1 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
              disabled={isReadOnly}
              onChange={(event) => {
                if (!isReadOnly && event.target.value) {
                  void addTask(session, event.target.value);
                  event.target.value = '';
                }
              }}
              value=""
            >
              <option value="">{config.taskSelectPlaceholder}</option>
              {unassignedTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.titulo}
                </option>
              ))}
            </select>
            <span className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs text-metro-muted">
              {unassignedTasks.length} tareas disponibles
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {session.items.length === 0 && (
              <p className="rounded-lg border border-dashed border-metro-border p-3 text-sm text-metro-muted">
                Sin tareas en el orden del día.
              </p>
            )}
            {session.items.map((taskId, index) => {
              const task = tasksById.get(taskId);

              return (
                <div
                  className="flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2"
                  key={taskId}
                >
                  <span className="w-7 shrink-0 text-sm font-bold text-metro-red">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-semibold text-metro-text"
                      title={getTaskTitle(tasksById, taskId)}
                    >
                      {getTaskTitle(tasksById, taskId)}
                    </p>
                    <p className="truncate text-xs text-metro-muted" title={describeTask(task)}>
                      {describeTask(task)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      className="rounded border border-metro-border px-2 py-1 text-xs text-metro-muted hover:border-metro-red hover:text-metro-text disabled:opacity-30"
                      disabled={isReadOnly || index === 0}
                      onClick={() => void moveTask(session, taskId, 'up')}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      className="rounded border border-metro-border px-2 py-1 text-xs text-metro-muted hover:border-metro-red hover:text-metro-text disabled:opacity-30"
                      disabled={isReadOnly || index === session.items.length - 1}
                      onClick={() => void moveTask(session, taskId, 'down')}
                      type="button"
                    >
                      ↓
                    </button>
                    <button
                      className="inline-flex items-center gap-1 rounded border border-metro-border px-2 py-1 text-xs text-metro-muted hover:border-metro-red hover:text-metro-text disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isReadOnly || !task}
                      onClick={() => void onEditTask(session, taskId)}
                      title={task ? 'Editar punto' : 'No se ha encontrado el punto'}
                      type="button"
                    >
                      <Pencil size={12} /> Editar
                    </button>
                    <button
                      className="rounded border border-metro-border px-2 py-1 text-xs text-metro-muted hover:border-red-400 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isReadOnly}
                      onClick={() => void removeTask(session, taskId)}
                      type="button"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}

function HistoricSessionCard({
  config,
  onEdit,
  onRemove,
  onConfirm,
  session,
  tasksById,
}: {
  config: SessionModuleConfig;
  onEdit?: (session: ManagedSession) => void;
  onRemove: (session: ManagedSession) => void | Promise<void>;
  onConfirm: (
    message: string,
    options?: { cancelLabel?: string; confirmLabel?: string; danger?: boolean; title?: string },
  ) => Promise<boolean>;
  session: ManagedSession;
  tasksById: Map<string, Task>;
}) {
  const sessionExportPayload = buildSessionExportPayload(session, tasksById, config);
  const sessionPrintBuilder =
    config.moduleId === 'comite'
      ? () =>
          buildPrintableCommitteeSessionHtml({
            session,
            tasksById,
            config,
            generatedAt: new Date(),
          })
      : undefined;

  return (
    <article className="rounded-xl border border-metro-border bg-metro-panel p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-base font-bold text-metro-text">
            <CheckCircle2 size={17} className="text-metro-red" /> {session.title}
          </h3>
          <p className="mt-1 text-xs text-metro-muted">
            {managedSessionLabel(session)} · Cerrada:{' '}
            {session.closedAt ? new Date(session.closedAt).toLocaleString('es-ES') : '—'}
          </p>
          {session.notes && <p className="mt-2 text-sm text-metro-muted">{session.notes}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <ExportPrintButtons htmlBuilder={sessionPrintBuilder} payload={sessionExportPayload} />
          {onEdit && (
            <button
              className="inline-flex items-center gap-1 rounded-xl border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
              onClick={() => onEdit(session)}
              title="Editar sesión histórica"
              type="button"
            >
              <Pencil size={14} /> Editar
            </button>
          )}
          <button
            className="inline-flex items-center gap-1 rounded-xl border border-red-500/40 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10"
            onClick={() => {
              void (async () => {
                const confirmed = await onConfirm(
                  '¿Eliminar definitivamente esta sesión histórica?\n\nEsta acción no puede deshacerse.',
                  { confirmLabel: 'Eliminar', danger: true, title: 'Eliminar sesión histórica' },
                );

                if (confirmed) {
                  void onRemove(session);
                }
              })();
            }}
            type="button"
          >
            <Trash2 size={14} /> Eliminar
          </button>
        </div>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <div className="rounded-lg border border-metro-border bg-metro-surface p-2">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-metro-muted">
            <ClipboardList size={14} /> Tratadas ({session.treatedTaskIds.length})
          </p>
          <ol className="space-y-1 text-sm text-metro-text">
            {session.treatedTaskIds.length === 0 && (
              <li className="text-metro-muted">Sin tareas tratadas.</li>
            )}
            {session.treatedTaskIds.map((taskId, index) => (
              <li className="truncate" key={taskId} title={getTaskTitle(tasksById, taskId)}>
                {index + 1}. {getTaskTitle(tasksById, taskId)}
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-lg border border-metro-border bg-metro-surface p-2">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-metro-muted">
            No tratadas ({session.untreatedTaskIds.length})
          </p>
          <ol className="space-y-1 text-sm text-metro-text">
            {session.untreatedTaskIds.length === 0 && (
              <li className="text-metro-muted">Sin pendientes.</li>
            )}
            {session.untreatedTaskIds.map((taskId, index) => (
              <li className="truncate" key={taskId} title={getTaskTitle(tasksById, taskId)}>
                {index + 1}. {getTaskTitle(tasksById, taskId)}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </article>
  );
}

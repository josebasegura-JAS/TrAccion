import { CalendarDays, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { Task } from '../../features/tareas/domain/task';
import { useTaskStore } from '../../features/tareas/store/useTaskStore';
import { withSharedModuleLocks } from '../../services/sharedModuleLock';
import { useAppDialog } from '../../hooks/useAppDialog';
import { buildFilterLabel } from '../export/filterLabel';
import { ActionButton } from '../../components/ui/ActionButton';
import { CountBadge } from '../../components/ui/CountBadge';
import { PageHeader } from '../../components/ui/PageHeader';
import { InlineSaveFeedback } from '../../components/InlineSaveFeedback';
import { TaskEditor } from '../../components/TaskEditor';
import { type ModuleHelpSection } from '../../components/ModuleHelp';
import { ExportPrintButtons } from '../print/ExportPrintButtons';
import type { ManagedSessionStateStore } from './createSessionStore';
import { parseSessionImportText, type SessionImportPreview } from './sessionImport';
import { HistoricSessionCard, SessionCard, SessionPanel } from './SessionManagementPageCards';
import { SessionImportPreviewModal } from './SessionImportPreviewModal';
import { SessionEditModal } from './SessionEditModal';
import { SessionCloseModal } from './SessionCloseModal';
import {
  matchesSessionSearch,
  groupClosedSessionsByYear,
  sessionExportColumns,
  sortOpenSessions,
} from './sessionManagementPage.helpers';
import {
  EMPTY_MANAGED_SESSION_DRAFT,
  isTaskInSessionPhase,
  managedSessionLabel,
  type ManagedSession,
  type ManagedSessionDraft,
  type SessionModuleConfig,
} from './session';

interface SessionManagementPageProps {
  config: SessionModuleConfig;
  useSessionStore: UseBoundStore<StoreApi<ManagedSessionStateStore>>;
  initialSessionId?: string | null;
  navigationNonce?: number;
  onClosedSession?: (session: ManagedSession, treatedTasks: Task[]) => void | Promise<void>;
  helpSections?: ModuleHelpSection[];
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
  const editingTask = editingTaskId
    ? (tasks.find((task) => task.id === editingTaskId) ?? null)
    : null;
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

  const openEditTaskModal = async (
    session: ManagedSession,
    taskId: string,
    isReadOnly: boolean,
  ) => {
    if (session.status !== 'open' || isReadOnly) {
      return;
    }

    const task = tasksById.get(taskId);
    if (!task) {
      await alert(
        'No se ha encontrado el punto seleccionado. Recarga la sesión antes de continuar.',
        {
          type: 'warning',
        },
      );
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
      <PageHeader
        actions={
          <>
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
            <ActionButton iconOnly={false} onClick={openImporter} variant="word">
              Importar Word
            </ActionButton>
            <ActionButton
              iconOnly={false}
              onClick={() => setIsCreateOpen((current) => !current)}
              variant="add"
            >
              {config.createButtonLabel}
            </ActionButton>
          </>
        }
        eyebrow="Módulo"
        helpSections={helpSections}
        icon={CalendarDays}
        helpSubtitle={`Guía rápida de sesiones, puntos, cierre e histórico de ${config.title}.`}
        helpTitle={config.title}
        subtitle={
          <>
            {`Alta de sesiones, orden del día y cierre automático de tareas en fase ${config.taskPhase}.`}
            <div className="mt-2">
              <InlineSaveFeedback />
            </div>
          </>
        }
        title={config.title}
      />

      {isCreateOpen && (
        <div className="mb-4 rounded-xl border border-metro-border bg-metro-panel p-3">
          <div className="grid grid-cols-[150px_180px_minmax(220px,1fr)] gap-2 overflow-x-auto">
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
        <div className="mt-2 flex flex-row flex-wrap items-center gap-2">
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
                  <CountBadge>{group.sessions.length}</CountBadge>
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
        <SessionImportPreviewModal
          config={config}
          ignoredLineCount={importPreview.ignoredLines.length}
          onCancel={() => setImportPreview(null)}
          onConfirm={() => void confirmImport()}
          relevantImportSessions={relevantImportSessions}
          relevantImportTaskCount={relevantImportTasks.length}
        />
      )}

      {editingSession && (
        <SessionEditModal
          config={config}
          editDraft={editDraft}
          onCancel={cancelEditSession}
          onSave={() => void saveEditSession()}
          updateEditDraft={updateEditDraft}
        />
      )}

      {editingTaskId && (
        <TaskEditor mode="edit" onDone={() => setEditingTaskId(null)} task={editingTask} />
      )}

      {closingSession && (
        <SessionCloseModal
          closingSession={closingSession}
          config={config}
          onCancel={() => setClosingSessionId(null)}
          onConfirm={() => void confirmCloseSession()}
          setTreatedTaskIds={setTreatedTaskIds}
          tasksById={tasksById}
          treatedTaskIds={treatedTaskIds}
        />
      )}
      {dialogNode}
    </section>
  );
}

import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  COMITE_TASK_PHASE,
  EMPTY_COMMITTEE_SESSION_DRAFT,
  committeeSessionLabel,
  formatCommitteeSessionDate,
  isCommitteeTask,
  type CommitteeSession,
  type CommitteeSessionDraft,
} from '../domain/comite';
import { useCommitteeSessionStore } from '../store/useCommitteeSessionStore';
import type { Task } from '../../tareas/domain/task';
import { useTaskStore } from '../../tareas/store/useTaskStore';
import { buildFilterLabel } from '../../../shared/export/filterLabel';
import type { ExportColumn, ExportTablePayload } from '../../../shared/export/types';
import { sanitizeFilenamePart } from '../../../shared/export/tableExport';
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';

const sessionExportColumns: ExportColumn<CommitteeSession>[] = [
  { key: 'status', header: 'Estado', value: (session) => (session.status === 'closed' ? 'Cerrada' : 'Abierta') },
  { key: 'code', header: 'Código', value: (session) => session.code },
  { key: 'date', header: 'Fecha', value: (session) => session.date || null },
  { key: 'title', header: 'Título', value: (session) => session.title },
  { key: 'notes', header: 'Notas', value: (session) => session.notes || null },
  { key: 'items', header: 'Puntos', value: (session) => session.items.length },
  { key: 'closedAt', header: 'Cerrada', value: (session) => session.closedAt || null },
];

type CommitteeSessionPointRow = {
  order: number;
  title: string;
  status: string;
  origin: string;
  union: string;
  responsible: string;
  dueDate: string;
  description: string;
};

const sessionPointExportColumns: ExportColumn<CommitteeSessionPointRow>[] = [
  { key: 'order', header: 'Orden', value: (row) => row.order },
  { key: 'title', header: 'Punto / tarea', value: (row) => row.title },
  { key: 'status', header: 'Situación', value: (row) => row.status },
  { key: 'origin', header: 'Origen', value: (row) => row.origin || null },
  { key: 'union', header: 'Sindicato', value: (row) => row.union || null },
  { key: 'responsible', header: 'Responsable', value: (row) => row.responsible || null },
  { key: 'dueDate', header: 'Fecha límite', value: (row) => row.dueDate || null },
  { key: 'description', header: 'Descripción', value: (row) => row.description || null },
];

function sortSessions(sessions: CommitteeSession[]): CommitteeSession[] {
  return [...sessions].sort(
    (first, second) =>
      String(first.date || '').localeCompare(String(second.date || '')) ||
      String(first.code || '').localeCompare(String(second.code || ''), 'es', {
        numeric: true,
        sensitivity: 'base',
      }),
  );
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

function getSessionPointStatus(session: CommitteeSession, taskId: string): string {
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
  session: CommitteeSession,
  tasksById: Map<string, Task>,
): CommitteeSessionPointRow[] {
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
  session: CommitteeSession,
  tasksById: Map<string, Task>,
): ExportTablePayload<CommitteeSessionPointRow> {
  const label = committeeSessionLabel(session);
  const filenameParts = ['comite', session.date, session.code, session.title]
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
    title: `Comité de Empresa · ${label}`,
    filename: filenameParts || 'comite-sesion',
    columns: sessionPointExportColumns,
    rows: buildSessionPointRows(session, tasksById),
    filterLabel,
  };
}

export function ComitePage() {
  const { sessions, load, create, remove, addTask, removeTask, moveTask, closeSession } =
    useCommitteeSessionStore();
  const { tasks, load: loadTasks, closeTasksFromCommittee } = useTaskStore();
  const [draft, setDraft] = useState<CommitteeSessionDraft>(EMPTY_COMMITTEE_SESSION_DRAFT);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [openPanel, setOpenPanel] = useState<'open' | 'history'>('open');
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);
  const [treatedTaskIds, setTreatedTaskIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    load();
    loadTasks();
  }, [load, loadTasks]);

  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const openSessions = useMemo(
    () => sortSessions(sessions.filter((session) => session.status === 'open')),
    [sessions],
  );
  const closedSessions = useMemo(
    () =>
      [...sessions]
        .filter((session) => session.status === 'closed')
        .sort((first, second) => String(second.closedAt || '').localeCompare(String(first.closedAt || ''))),
    [sessions],
  );
  const availableCommitteeTasks = useMemo(
    () => tasks.filter(isCommitteeTask).sort((first, second) => first.titulo.localeCompare(second.titulo, 'es')),
    [tasks],
  );
  const closingSession = closingSessionId
    ? sessions.find((session) => session.id === closingSessionId) ?? null
    : null;
  const sessionFilterLabel = buildFilterLabel([['Módulo', 'Comité de Empresa']]);

  const updateDraft = <K extends keyof CommitteeSessionDraft>(key: K, value: CommitteeSessionDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleCreate = () => {
    if (!draft.date || !draft.code.trim()) {
      window.alert('Indica al menos fecha y código documental de la sesión.');
      return;
    }

    const createdSessionId = create(draft);
    setDraft(EMPTY_COMMITTEE_SESSION_DRAFT);
    setIsCreateOpen(false);
    setOpenPanel('open');
    setExpandedSessionId(createdSessionId);
  };

  const openCloseModal = (session: CommitteeSession) => {
    const initialTreatedState = Object.fromEntries(session.items.map((taskId) => [taskId, true]));
    setTreatedTaskIds(initialTreatedState);
    setClosingSessionId(session.id);
  };

  const confirmCloseSession = () => {
    if (!closingSession) {
      return;
    }

    const treatedIds = closingSession.items.filter((taskId) => treatedTaskIds[taskId]);
    closeSession(closingSession.id, treatedIds);
    closeTasksFromCommittee(treatedIds, committeeSessionLabel(closingSession));
    setClosingSessionId(null);
    setTreatedTaskIds({});
    setExpandedSessionId(null);
    setOpenPanel('history');
  };

  return (
    <section className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card" id="comite">
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Módulo</p>
          <h2 className="text-2xl font-bold text-metro-text">Comité de Empresa</h2>
          <p className="mt-0.5 text-base text-metro-muted">
            Alta de sesiones, orden del día y cierre automático de tareas en fase {COMITE_TASK_PHASE}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportPrintButtons
            payload={{
              title: 'Sesiones de Comité',
              filename: 'sesiones-comite',
              columns: sessionExportColumns,
              rows: sessions,
              filterLabel: sessionFilterLabel,
            }}
          />
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={() => setIsCreateOpen((current) => !current)}
            type="button"
          >
            <Plus size={16} /> Nueva sesión
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(310px,0.85fr)]">
        <div className="overflow-hidden rounded-xl border border-metro-border">
          <button
            className="flex w-full items-center justify-between border-b border-metro-border bg-metro-panel px-3 py-2 text-left"
            onClick={() => setOpenPanel(openPanel === 'open' ? 'history' : 'open')}
            type="button"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-metro-text">
              {openPanel === 'open' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              Sesiones abiertas
            </span>
            <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-red-200">
              {openSessions.length}
            </span>
          </button>
          {openPanel === 'open' && (
            <div className="max-h-[640px] space-y-3 overflow-auto bg-metro-surface p-3">
              {openSessions.length === 0 && (
                <p className="text-sm text-metro-muted">No hay sesiones abiertas.</p>
              )}
              {openSessions.map((session) => (
                <SessionCard
                  addTask={addTask}
                  availableTasks={availableCommitteeTasks}
                  isExpanded={expandedSessionId === session.id}
                  key={session.id}
                  moveTask={moveTask}
                  onClose={openCloseModal}
                  onRemove={remove}
                  onToggle={() => setExpandedSessionId((current) => (current === session.id ? null : session.id))}
                  removeTask={removeTask}
                  session={session}
                  tasksById={tasksById}
                />
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-metro-border">
          <button
            className="flex w-full items-center justify-between border-b border-metro-border bg-metro-panel px-3 py-2 text-left"
            onClick={() => setOpenPanel(openPanel === 'history' ? 'open' : 'history')}
            type="button"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-metro-text">
              {openPanel === 'history' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              Histórico de sesiones
            </span>
            <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-red-200">
              {closedSessions.length}
            </span>
          </button>
          {openPanel === 'history' && (
            <div className="max-h-[640px] space-y-3 overflow-auto bg-metro-surface p-3">
              {closedSessions.length === 0 && (
                <p className="text-sm text-metro-muted">No hay sesiones cerradas.</p>
              )}
              {closedSessions.map((session) => (
                <HistoricSessionCard key={session.id} session={session} tasksById={tasksById} />
              ))}
            </div>
          )}
        </div>
      </div>

      {closingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="max-h-[86vh] w-full max-w-3xl overflow-auto rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-2xl">
            <h3 className="text-lg font-bold text-metro-text">Cerrar sesión de Comité</h3>
            <p className="mt-1 text-sm text-metro-muted">
              Revisa los puntos tratados. Desmarca los no tratados para mantener sus tareas abiertas.
            </p>
            <div className="mt-3 rounded-xl border border-metro-border bg-metro-panel p-3 text-sm text-metro-muted">
              <strong className="text-metro-text">{closingSession.title}</strong>
              <br />
              {committeeSessionLabel(closingSession)}
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
                        setTreatedTaskIds((current) => ({ ...current, [taskId]: event.target.checked }))
                      }
                      type="checkbox"
                    />
                    <span>
                      <span className="block font-semibold text-metro-text">
                        {index + 1}. {getTaskTitle(tasksById, taskId)}
                      </span>
                      <span className="mt-1 block text-xs text-metro-muted">{describeTask(task)}</span>
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
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SessionCard({
  session,
  tasksById,
  availableTasks,
  isExpanded,
  addTask,
  removeTask,
  moveTask,
  onClose,
  onRemove,
  onToggle,
}: {
  session: CommitteeSession;
  tasksById: Map<string, Task>;
  availableTasks: Task[];
  isExpanded: boolean;
  addTask: (sessionId: string, taskId: string) => void;
  removeTask: (sessionId: string, taskId: string) => void;
  moveTask: (sessionId: string, taskId: string, direction: 'up' | 'down') => void;
  onClose: (session: CommitteeSession) => void;
  onRemove: (sessionId: string) => void;
  onToggle: () => void;
}) {
  const unassignedTasks = availableTasks.filter((task) => !session.items.includes(task.id));
  const sessionExportPayload = buildSessionExportPayload(session, tasksById);

  return (
    <article className="rounded-xl border border-metro-border bg-metro-panel">
      <div className="flex flex-col gap-2 p-3 lg:flex-row lg:items-start lg:justify-between">
        <button className="min-w-0 flex-1 text-left" onClick={onToggle} type="button">
          <h3 className="flex items-center gap-2 text-base font-bold text-metro-text">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span className="truncate">{session.title}</span>
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-metro-muted">
            <CalendarDays size={14} /> Código: {session.code} · Fecha:{' '}
            {formatCommitteeSessionDate(session.date)} · Puntos actuales: {session.items.length}
          </p>
          {session.notes && <p className="mt-2 line-clamp-2 text-sm text-metro-muted">{session.notes}</p>}
        </button>
        <div className="flex shrink-0 flex-wrap gap-2">
          <ExportPrintButtons payload={sessionExportPayload} />
          <button
            className="rounded-lg border border-metro-border px-2.5 py-1.5 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={() => onClose(session)}
            type="button"
          >
            Cerrar
          </button>
          <button
            className="rounded-lg border border-metro-border px-2.5 py-1.5 text-xs font-semibold text-metro-muted hover:border-red-400 hover:text-red-200"
            onClick={() => onRemove(session.id)}
            type="button"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-metro-border p-3 pt-3">
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_190px]">
            <select
              className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => {
                if (event.target.value) {
                  addTask(session.id, event.target.value);
                  event.target.value = '';
                }
              }}
              value=""
            >
              <option value="">Añadir tarea en fase comité...</option>
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
                    <p className="truncate text-sm font-semibold text-metro-text" title={getTaskTitle(tasksById, taskId)}>
                      {getTaskTitle(tasksById, taskId)}
                    </p>
                    <p className="truncate text-xs text-metro-muted" title={describeTask(task)}>
                      {describeTask(task)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      className="rounded border border-metro-border px-2 py-1 text-xs text-metro-muted hover:border-metro-red hover:text-metro-text disabled:opacity-30"
                      disabled={index === 0}
                      onClick={() => moveTask(session.id, taskId, 'up')}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      className="rounded border border-metro-border px-2 py-1 text-xs text-metro-muted hover:border-metro-red hover:text-metro-text disabled:opacity-30"
                      disabled={index === session.items.length - 1}
                      onClick={() => moveTask(session.id, taskId, 'down')}
                      type="button"
                    >
                      ↓
                    </button>
                    <button
                      className="rounded border border-metro-border px-2 py-1 text-xs text-metro-muted hover:border-red-400 hover:text-red-200"
                      onClick={() => removeTask(session.id, taskId)}
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
  session,
  tasksById,
}: {
  session: CommitteeSession;
  tasksById: Map<string, Task>;
}) {
  const sessionExportPayload = buildSessionExportPayload(session, tasksById);

  return (
    <article className="rounded-xl border border-metro-border bg-metro-panel p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-base font-bold text-metro-text">
            <CheckCircle2 size={17} className="text-metro-red" /> {session.title}
          </h3>
          <p className="mt-1 text-xs text-metro-muted">
            {committeeSessionLabel(session)} · Cerrada:{' '}
            {session.closedAt ? new Date(session.closedAt).toLocaleString('es-ES') : '—'}
          </p>
          {session.notes && <p className="mt-2 text-sm text-metro-muted">{session.notes}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <ExportPrintButtons payload={sessionExportPayload} />
        </div>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <div className="rounded-lg border border-metro-border bg-metro-surface p-2">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-metro-muted">
            <ClipboardList size={14} /> Tratadas ({session.treatedTaskIds.length})
          </p>
          <ol className="space-y-1 text-sm text-metro-text">
            {session.treatedTaskIds.length === 0 && <li className="text-metro-muted">Sin tareas tratadas.</li>}
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
            {session.untreatedTaskIds.length === 0 && <li className="text-metro-muted">Sin pendientes.</li>}
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

import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Task } from '../../features/tareas/domain/task';
import { useSharedRecordLock } from '../../services/useSharedRecordLock';
import { CountBadge } from '../../components/ui/CountBadge';
import { ExportPrintButtons } from '../print/ExportPrintButtons';
import { buildPrintableCommitteeSessionHtml } from './buildPrintableCommitteeSessionHtml';
import { managedSessionLabel, type ManagedSession, type SessionModuleConfig } from './session';
import {
  buildSessionExportPayload,
  describeTask,
  getTaskTitle,
} from './sessionManagementPage.helpers';

export function ImportMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-metro-muted">{label}</p>
      <p className="mt-1 text-xl font-black text-metro-text">{value}</p>
    </div>
  );
}

export function SessionPanel({
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
        <CountBadge>{count}</CountBadge>
      </button>
      {isOpen && (
        <div className="max-h-[640px] space-y-3 overflow-auto bg-metro-surface p-3">{children}</div>
      )}
    </div>
  );
}

export function SessionCard({
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
  onEditTask: (
    session: ManagedSession,
    taskId: string,
    isReadOnly: boolean,
  ) => void | Promise<void>;
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
                      onClick={() => void onEditTask(session, taskId, isReadOnly)}
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

export function HistoricSessionCard({
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
              data-tip="Editar sesión histórica"
              onClick={() => onEdit(session)}
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

import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  GripVertical,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { useEffect, useState, type DragEvent, type ReactNode } from 'react';
import type { Task } from '../../features/tareas/domain/task';
import { useCommitteeSessionStore } from '../../features/comite/store/useCommitteeSessionStore';
import { useParitariaSessionStore } from '../../features/paritaria/store/useParitariaSessionStore';
import { withSharedModuleLocks } from '../../services/sharedModuleLock';
import { useSharedRecordLock } from '../../services/useSharedRecordLock';
import { ActionButton } from '../../components/ui/ActionButton';
import { CountBadge } from '../../components/ui/CountBadge';
import { ExportPrintButtons } from '../print/ExportPrintButtons';
import { buildPrintableCommitteeSessionHtml } from './buildPrintableCommitteeSessionHtml';
import {
  getManagedSessionTaskResult,
  managedSessionLabel,
  managedSessionTaskResultLabel,
  type ManagedSession,
  type SessionModuleConfig,
} from './session';
import { saveSessionTaskOrder } from './sessionTaskOrder';
import {
  buildSessionExportPayload,
  describeTask,
  getTaskTitle,
} from './sessionManagementPage.helpers';

export function ImportMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-metro-border/80 bg-metro-panel/70 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
      <p className="text-xs font-semibold text-metro-muted">{label}</p>
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
    <div className="overflow-hidden rounded-2xl border border-metro-border/80 bg-metro-panel/45 shadow-[0_12px_30px_rgba(2,8,23,0.16)]">
      <button
        className="flex w-full items-center justify-between border-b border-metro-border/70 bg-metro-panel/80 px-4 py-3 text-left"
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
        <div className="max-h-[640px] space-y-3 overflow-auto bg-metro-surface/45 p-3.5">{children}</div>
      )}
    </div>
  );
}

interface SessionOrderDraft {
  items: string[];
  baseItems: string[];
  baseUpdatedAt: string | null;
}

function sameOrder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((taskId, index) => taskId === right[index]);
}

function buildOrderDraft(session: ManagedSession): SessionOrderDraft {
  return {
    items: [...session.items],
    baseItems: [...session.items],
    baseUpdatedAt: session.updatedAt ?? null,
  };
}

export function SessionCard({
  addTask,
  availableTasks,
  isRefreshingTasks,
  onRefreshTasks,
  config,
  isExpanded,
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
  isRefreshingTasks: boolean;
  onRefreshTasks: () => void;
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
  const [orderDraft, setOrderDraft] = useState<SessionOrderDraft>(() => buildOrderDraft(session));
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [orderError, setOrderError] = useState('');
  const orderDirty = !sameOrder(orderDraft.items, orderDraft.baseItems);

  useEffect(() => {
    if (!orderDirty) {
      setOrderDraft(buildOrderDraft(session));
    }
  }, [orderDirty, session]);

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

  const reorderDraft = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    setOrderDraft((current) => {
      const fromIndex = current.items.indexOf(draggedId);
      const toIndex = current.items.indexOf(targetId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return current;

      const items = [...current.items];
      const [moved] = items.splice(fromIndex, 1);
      if (!moved) return current;
      items.splice(toIndex, 0, moved);
      return { ...current, items };
    });
  };

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, taskId: string) => {
    if (isReadOnly || isSavingOrder) {
      event.preventDefault();
      return;
    }
    setDraggedTaskId(taskId);
    setOrderError('');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', taskId);
  };

  const discardOrder = () => {
    setOrderDraft(buildOrderDraft(session));
    setDraggedTaskId(null);
    setOrderError('');
  };

  const saveOrder = async () => {
    if (!orderDirty || isReadOnly || isSavingOrder) return;

    setIsSavingOrder(true);
    setOrderError('');
    try {
      await withSharedModuleLocks([{ module: config.moduleId, label: config.title }], async () => {
        const result = await saveSessionTaskOrder(
          config,
          session.id,
          orderDraft.items,
          orderDraft.baseUpdatedAt,
        );
        if (!result.ok || !result.session) {
          throw new Error(result.message);
        }

        setOrderDraft(buildOrderDraft(result.session));
        if (config.moduleId === 'comite') {
          useCommitteeSessionStore.getState().reloadFromStorage();
        } else if (config.moduleId === 'paritaria') {
          useParitariaSessionStore.getState().reloadFromStorage();
        }
      });
    } catch (error) {
      setOrderError(
        error instanceof Error ? error.message : 'No se ha podido guardar el nuevo orden.',
      );
    } finally {
      setIsSavingOrder(false);
    }
  };

  return (
    <>
      <article className="rounded-2xl border border-metro-border/80 bg-metro-panel/65 p-4 shadow-[0_12px_26px_rgba(2,8,23,0.16)]">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <button className="min-w-0 flex-1 text-left" onClick={onToggle} type="button">
            <h3 className="flex items-center gap-2 text-base font-bold text-metro-text">
              {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
              <CalendarDays size={17} className="text-metro-red" /> {session.title}
            </h3>
            <p className="mt-1 text-xs text-metro-muted">
              {managedSessionLabel(session)} · {session.items.length} puntos
            </p>
            {session.observations && (
              <p className="mt-2 rounded-lg border border-metro-border/70 bg-metro-surface/55 px-3 py-2 text-sm text-metro-secondary">
                <span className="mr-1 font-bold text-metro-text">Observaciones:</span>{session.observations}
              </p>
            )}
            {session.notes && <p className="mt-2 text-xs text-metro-muted">{session.notes}</p>}
          </button>
          <div className="flex shrink-0 flex-wrap gap-2">
            <ExportPrintButtons htmlBuilder={sessionPrintBuilder} payload={sessionExportPayload} size="sm" />
            {onEdit && (
              <ActionButton
                disabled={!isExpanded || isReadOnly || orderDirty}
                iconOnly={false}
                onClick={() => onEdit(session)}
                size="sm"
                title={
                  orderDirty
                    ? 'Guarda o descarta primero el nuevo orden'
                    : !isExpanded
                      ? 'Abre la sesión para bloquearla antes de editarla'
                      : 'Editar sesión'
                }
                variant="edit"
              >
                Editar
              </ActionButton>
            )}
            <ActionButton
              disabled={!isExpanded || isReadOnly || orderDirty}
              iconOnly={false}
              onClick={() => onClose(session)}
              size="sm"
              title={
                orderDirty
                  ? 'Guarda o descarta primero el nuevo orden'
                  : !isExpanded
                    ? 'Abre la sesión para bloquearla antes de cerrarla'
                    : undefined
              }
              variant="secondary"
            >
              Cerrar sesión
            </ActionButton>
            <ActionButton
              disabled={!isExpanded || isReadOnly || orderDirty}
              iconOnly={false}
              onClick={() => void onRemove(session)}
              size="sm"
              title={
                orderDirty
                  ? 'Guarda o descarta primero el nuevo orden'
                  : !isExpanded
                    ? 'Abre la sesión para bloquearla antes de eliminarla'
                    : undefined
              }
              variant="delete"
            >
              Eliminar
            </ActionButton>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 rounded-xl border border-metro-border/70 bg-metro-app/45 p-3.5">
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
            {orderError && (
              <p className="mb-3 rounded-lg border border-red-400/40 bg-red-950/20 px-3 py-2 text-xs font-semibold text-red-100">
                {orderError}
              </p>
            )}
            <div className="flex flex-col gap-2 lg:flex-row">
              <select
                className="min-w-0 flex-1 rounded-xl border border-metro-border bg-metro-surface px-3 py-2.5 text-sm text-metro-text outline-none focus:border-metro-red"
                disabled={isReadOnly || isRefreshingTasks || orderDirty}
                onChange={(event) => {
                  if (!isReadOnly && !orderDirty && event.target.value) {
                    void addTask(session, event.target.value);
                    event.target.value = '';
                  }
                }}
                value=""
              >
                <option value="">
                  {orderDirty
                    ? 'Guarda o descarta el nuevo orden antes de añadir puntos'
                    : isRefreshingTasks
                      ? 'Actualizando tareas…'
                      : config.taskSelectPlaceholder}
                </option>
                {unassignedTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.titulo}
                  </option>
                ))}
              </select>
              <span className="rounded-xl border border-metro-border bg-metro-surface px-3 py-2.5 text-xs text-metro-muted">
                {unassignedTasks.length} tareas disponibles
              </span>
              <button
                type="button"
                onClick={onRefreshTasks}
                disabled={isRefreshingTasks}
                className="rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-text disabled:opacity-50"
              >
                {isRefreshingTasks ? 'Actualizando…' : 'Actualizar tareas'}
              </button>
            </div>

            <p className="mt-3 text-xs text-metro-muted">
              Arrastra los puntos desde el asa para ordenarlos. El nuevo orden no se guarda hasta pulsar Guardar orden.
            </p>

            <div className="mt-2 space-y-2">
              {orderDraft.items.length === 0 && (
                <p className="rounded-lg border border-dashed border-metro-border p-3 text-sm text-metro-muted">
                  Sin tareas en el orden del día.
                </p>
              )}
              {orderDraft.items.map((taskId, index) => {
                const task = tasksById.get(taskId);

                return (
                  <div
                    className={`flex items-center gap-2 rounded-xl border bg-metro-surface px-3 py-2.5 transition hover:bg-metro-raised/60 ${
                      draggedTaskId === taskId
                        ? 'border-metro-red/70 opacity-60'
                        : 'border-metro-border/60'
                    }`}
                    key={taskId}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      if (draggedTaskId) reorderDraft(draggedTaskId, taskId);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }}
                  >
                    <button
                      aria-label={`Mover punto ${index + 1}`}
                      className="cursor-grab rounded-md p-1 text-metro-muted hover:bg-metro-raised hover:text-metro-text active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
                      disabled={isReadOnly || isSavingOrder}
                      draggable={!isReadOnly && !isSavingOrder}
                      onDragEnd={() => setDraggedTaskId(null)}
                      onDragStart={(event) => handleDragStart(event, taskId)}
                      title="Arrastrar para cambiar el orden"
                      type="button"
                    >
                      <GripVertical size={16} />
                    </button>
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
                        className="inline-flex items-center gap-1 rounded-lg border border-metro-border px-2 py-1.5 text-xs text-metro-muted hover:border-metro-red hover:text-metro-text disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isReadOnly || !task}
                        onClick={() => void onEditTask(session, taskId, isReadOnly)}
                        title={task ? 'Editar punto' : 'No se ha encontrado el punto'}
                        type="button"
                      >
                        <Pencil size={12} /> Editar
                      </button>
                      <button
                        className="rounded-lg border border-metro-border px-2 py-1.5 text-xs text-metro-muted hover:border-red-400 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isReadOnly || orderDirty}
                        onClick={() => void removeTask(session, taskId)}
                        title={orderDirty ? 'Guarda o descarta primero el nuevo orden' : undefined}
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

      {isExpanded && orderDirty && (
        <div className="fixed bottom-5 right-5 z-[70] flex items-center gap-2 rounded-xl border border-metro-border bg-[#0b1725]/95 p-2 shadow-[0_14px_38px_rgba(2,6,23,0.42)] backdrop-blur">
          <span className="hidden px-2 text-xs font-semibold text-metro-muted sm:inline">
            Orden del día modificado
          </span>
          <ActionButton
            disabled={isSavingOrder}
            iconOnly={false}
            onClick={discardOrder}
            size="sm"
            variant="secondary"
          >
            Descartar
          </ActionButton>
          <ActionButton
            disabled={isReadOnly || isSavingOrder}
            icon={Save}
            iconOnly={false}
            loading={isSavingOrder}
            onClick={() => void saveOrder()}
            size="sm"
            variant="save"
          >
            {isSavingOrder ? 'Guardando…' : 'Guardar orden'}
          </ActionButton>
        </div>
      )}
    </>
  );
}

export function HistoricSessionCard({
  config,
  onEdit,
  onRemove,
  onReopen,
  onConfirm,
  onUpdateSummary,
  session,
  tasksById,
}: {
  config: SessionModuleConfig;
  onEdit?: (session: ManagedSession) => void;
  onRemove: (session: ManagedSession) => void | Promise<void>;
  onReopen: (session: ManagedSession) => void | Promise<void>;
  onUpdateSummary?: (session: ManagedSession) => void | Promise<void>;
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
    <article className="rounded-2xl border border-metro-border/80 bg-metro-panel/65 p-4 shadow-[0_12px_26px_rgba(2,8,23,0.16)]">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-base font-bold text-metro-text">
            <CheckCircle2 size={17} className="text-metro-red" /> {session.title}
          </h3>
          <p className="mt-1 text-xs text-metro-muted">
            {managedSessionLabel(session)} · Cerrada:{' '}
            {session.closedAt ? new Date(session.closedAt).toLocaleString('es-ES') : '—'}
          </p>
          {session.observations && (
            <p className="mt-2 rounded-lg border border-metro-border/70 bg-metro-surface/55 px-3 py-2 text-sm text-metro-secondary">
              <span className="mr-1 font-bold text-metro-text">Observaciones:</span>{session.observations}
            </p>
          )}
          {session.notes && <p className="mt-2 text-xs text-metro-muted">{session.notes}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <ExportPrintButtons htmlBuilder={sessionPrintBuilder} payload={sessionExportPayload} size="sm" />
          {onEdit && (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
              data-tip="Editar sesión histórica"
              onClick={() => onEdit(session)}
              type="button"
            >
              <Pencil size={14} /> Editar
            </button>
          )}
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={() => void onReopen(session)}
            type="button"
          >
            <RotateCcw size={14} /> Reabrir sesión
          </button>
          {onUpdateSummary && (
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
              data-tip={`Actualizar el resumen histórico Word de ${config.moduleId === 'comite' ? 'Comité' : 'Paritaria'}`}
              onClick={() => void onUpdateSummary(session)}
              type="button"
            >
              <RefreshCw size={14} /> Actualizar resumen Word
            </button>
          )}
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10"
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
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-metro-border/60 bg-metro-surface p-3">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-metro-muted">
            <ClipboardList size={14} /> Tratadas ({session.treatedTaskIds.length})
          </p>
          <ol className="space-y-1 text-sm text-metro-text">
            {session.treatedTaskIds.length === 0 && (
              <li className="text-metro-muted">Sin tareas tratadas.</li>
            )}
            {session.treatedTaskIds.map((taskId, index) => (
              <li className="flex min-w-0 items-center justify-between gap-2" key={taskId} title={getTaskTitle(tasksById, taskId)}>
                <span className="truncate">{index + 1}. {getTaskTitle(tasksById, taskId)}</span>
                <span className="shrink-0 text-[10px] font-semibold text-metro-muted">
                  {managedSessionTaskResultLabel(getManagedSessionTaskResult(session, taskId))}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-xl border border-metro-border/60 bg-metro-surface p-3">
          <p className="mb-2 text-xs font-semibold text-metro-muted">
            Pendientes / no tratadas ({session.untreatedTaskIds.length})
          </p>
          <ol className="space-y-1 text-sm text-metro-text">
            {session.untreatedTaskIds.length === 0 && (
              <li className="text-metro-muted">Sin pendientes.</li>
            )}
            {session.untreatedTaskIds.map((taskId, index) => (
              <li className="flex min-w-0 items-center justify-between gap-2" key={taskId} title={getTaskTitle(tasksById, taskId)}>
                <span className="truncate">{index + 1}. {getTaskTitle(tasksById, taskId)}</span>
                <span className="shrink-0 text-[10px] font-semibold text-metro-muted">
                  {managedSessionTaskResultLabel(getManagedSessionTaskResult(session, taskId))}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </article>
  );
}

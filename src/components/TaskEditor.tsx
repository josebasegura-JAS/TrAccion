import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import {
  EMPTY_TASK_DRAFT,
  TASK_PRIORITIES,
  TASK_STATES,
  TASK_TYPES,
  type Task,
  type TaskDraft,
  type TaskDraftField,
} from '../features/tareas/domain/task';
import { useTaskStore } from '../features/tareas/store/useTaskStore';
import { useSharedRecordLock } from '../services/useSharedRecordLock';

const taskTextFields: Array<{ field: TaskDraftField; label: string; required?: boolean; type?: string }> = [
  { field: 'titulo', label: 'Título', required: true },
  { field: 'responsable', label: 'Responsable' },
  { field: 'origen', label: 'Origen' },
  { field: 'sindicato', label: 'Sindicato' },
  { field: 'fechaLimite', label: 'Fecha límite', type: 'date' },
];

function formatUpdateDate(fechaHora: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(fechaHora));
}

function toDraft(task: Task | null): TaskDraft {
  if (!task) {
    return { ...EMPTY_TASK_DRAFT };
  }

  return {
    titulo: task.titulo,
    descripcion: task.descripcion,
    tipo: task.tipo,
    fase: task.fase,
    estado: task.estado,
    prioridad: task.prioridad,
    fechaLimite: task.fechaLimite,
    responsable: task.responsable,
    origen: task.origen,
    sindicato: task.sindicato,
    observaciones: task.observaciones,
  };
}

export function TaskEditor({
  task,
  mode,
  onDone,
}: {
  task: Task | null;
  mode: 'create' | 'edit';
  onDone: () => void;
}) {
  const taskPhases = useConfiguracionStore((state) => state.taskPhases);
  const loadConfiguracion = useConfiguracionStore((state) => state.load);
  const createTask = useTaskStore((state) => state.create);
  const updateTask = useTaskStore((state) => state.update);
  const removeTask = useTaskStore((state) => state.remove);
  const [draft, setDraft] = useState<TaskDraft>(() => toDraft(task));
  const [newUpdateText, setNewUpdateText] = useState('');
  const [loadedTaskIdentity, setLoadedTaskIdentity] = useState(() => `${mode}:${task?.id ?? 'new'}`);
  const [loadedTaskUpdatedAt, setLoadedTaskUpdatedAt] = useState(task?.updatedAt ?? null);
  const recordLock = useSharedRecordLock({
    module: 'tareas',
    recordId: task?.id ?? null,
    enabled: mode === 'edit' && Boolean(task?.id),
  });

  useEffect(() => {
    loadConfiguracion();
  }, [loadConfiguracion]);

  useEffect(() => {
    const nextIdentity = `${mode}:${task?.id ?? 'new'}`;
    if (nextIdentity !== loadedTaskIdentity) {
      setDraft(toDraft(task));
      setNewUpdateText('');
      setLoadedTaskIdentity(nextIdentity);
      setLoadedTaskUpdatedAt(task?.updatedAt ?? null);
    }
  }, [loadedTaskIdentity, mode, task]);

  const phaseOptions = useMemo(() => {
    const activePhaseNames = taskPhases.filter((phase) => phase.active).map((phase) => phase.nombre);
    return activePhaseNames.includes(draft.fase) ? activePhaseNames : [draft.fase, ...activePhaseNames];
  }, [draft.fase, taskPhases]);

  const isCreate = mode === 'create';
  const hasExternalTaskUpdate =
    !isCreate &&
    Boolean(task?.updatedAt) &&
    Boolean(loadedTaskUpdatedAt) &&
    task?.updatedAt !== loadedTaskUpdatedAt;
  const canSubmit = draft.titulo.trim().length > 0 && !recordLock.isReadOnly;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <aside
        aria-modal="true"
        className="flex max-h-[calc(100vh-2rem)] w-[min(820px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-panel p-3 shadow-2xl"
        role="dialog"
      >
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-metro-border bg-metro-surface px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-metro-red">
              {isCreate ? 'Nueva tarea' : 'Editar tarea'}
            </p>
            <h3 className="mt-1 truncate text-base font-bold text-metro-text">
              {isCreate ? 'Nueva tarea' : task?.titulo || 'Sin selección'}
            </h3>
            <p className="text-xs text-metro-muted">
              {isCreate
                ? 'Alta manual compacta para tarea interna o sindical.'
                : `Editando tarea ${task?.id ?? '—'}`}
            </p>
          </div>
          <button
            aria-label="Cerrar editor"
            className="rounded-lg border border-metro-border bg-metro-surface p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={onDone}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        {recordLock.message && (
          <p className={`mb-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
            recordLock.isReadOnly
              ? 'border-red-400/40 bg-red-950/20 text-red-100'
              : 'border-metro-border bg-metro-surface text-metro-muted'
          }`}>
            {recordLock.message}
          </p>
        )}

        {hasExternalTaskUpdate && recordLock.isReadOnly && (
          <p className="mb-3 rounded-lg border border-amber-400/40 bg-amber-950/20 px-3 py-2 text-xs font-semibold text-amber-100">
            Esta tarea ha recibido cambios externos. No se han aplicado al formulario abierto para no
            sobrescribir datos locales; cierra y vuelve a abrir para ver la versión compartida.
          </p>
        )}

        <form
          className="flex min-h-0 flex-1 flex-col space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit || recordLock.isReadOnly) {
              return;
            }

            if (isCreate) {
              createTask(draft, newUpdateText);
            } else if (task) {
              updateTask(task.id, draft, newUpdateText);
            }

            onDone();
          }}
        >
          <fieldset
            className="grid min-h-0 flex-1 gap-2 overflow-y-auto pr-1 disabled:opacity-70 sm:grid-cols-2"
            disabled={recordLock.isReadOnly}
          >
            <label className="text-xs font-semibold text-metro-muted">
              Tipo
              <select
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, tipo: event.target.value as TaskDraft['tipo'] }))
                }
                value={draft.tipo}
              >
                {TASK_TYPES.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-metro-muted">
              Fase
              <select
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => setDraft((current) => ({ ...current, fase: event.target.value }))}
                value={draft.fase}
              >
                {phaseOptions.map((fase) => (
                  <option key={fase} value={fase}>
                    {fase}
                  </option>
                ))}
              </select>
            </label>
            {taskTextFields.map(({ field, label, required, type }) => (
              <label className="text-xs font-semibold text-metro-muted" key={field}>
                {label}
                {field === 'sindicato' && draft.tipo === 'sindical' && (
                  <span className="ml-1 text-metro-red">visible para tarea sindical</span>
                )}
                <input
                  className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [field]: event.target.value }))
                  }
                  required={required}
                  type={type ?? 'text'}
                  value={draft[field]}
                />
              </label>
            ))}
            <label className="text-xs font-semibold text-metro-muted">
              Estado
              <select
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    estado: event.target.value as TaskDraft['estado'],
                  }))
                }
                value={draft.estado}
              >
                {TASK_STATES.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-metro-muted">
              Prioridad
              <select
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    prioridad: event.target.value as TaskDraft['prioridad'],
                  }))
                }
                value={draft.prioridad}
              >
                {TASK_PRIORITIES.map((prioridad) => (
                  <option key={prioridad} value={prioridad}>
                    {prioridad}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-metro-muted sm:col-span-2">
              Descripción
              <textarea
                className="mt-1 min-h-20 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, descripcion: event.target.value }))
                }
                value={draft.descripcion}
              />
            </label>

            <section className="rounded-xl border border-metro-border bg-metro-surface p-3 sm:col-span-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-metro-text">Seguimiento</h4>
                {!isCreate && task && (
                  <span className="rounded-full bg-metro-surface px-2 py-1 text-xs font-semibold text-metro-muted">
                    {task.seguimiento.length} seguimientos
                  </span>
                )}
              </div>
              <label className="text-xs font-semibold text-metro-muted">
                Añadir seguimiento
                <textarea
                  className="mt-1 min-h-20 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) => setNewUpdateText(event.target.value)}
                  placeholder="Registrar trabajo realizado..."
                  value={newUpdateText}
                />
              </label>
              {!isCreate && task && task.seguimiento.length > 0 && (
                <div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
                  {task.seguimiento.map((seguimiento) => (
                    <article
                      className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2"
                      key={`${seguimiento.fechaHora}-${seguimiento.texto}`}
                    >
                      <time className="text-xs font-bold text-metro-text" dateTime={seguimiento.fechaHora}>
                        {formatUpdateDate(seguimiento.fechaHora)}
                      </time>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-metro-muted">
                        {seguimiento.texto}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <label className="text-xs font-semibold text-metro-muted sm:col-span-2">
              Observaciones
              <textarea
                className="mt-1 min-h-20 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, observaciones: event.target.value }))
                }
                value={draft.observaciones}
              />
            </label>
          </fieldset>

          <div className="flex flex-wrap gap-2 border-t border-metro-border pt-3">
            <button
              className="rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSubmit}
              type="submit"
            >
              Guardar
            </button>
            {!isCreate && task && (
              <button
                className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
                disabled={recordLock.isReadOnly}
                onClick={() => {
                  removeTask(task.id);
                  onDone();
                }}
                type="button"
              >
                Eliminar
              </button>
            )}
            <button
              className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-muted hover:text-metro-text"
              onClick={onDone}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  EMPTY_TASK_DRAFT,
  TASK_PRIORITIES,
  TASK_STATES,
  type Task,
  type TaskDraft,
  type TaskDraftField,
} from '../features/tareas/domain/task';
import { useTaskStore } from '../features/tareas/store/useTaskStore';

const taskTextFields: Array<{ field: TaskDraftField; label: string; required?: boolean }> = [
  { field: 'titulo', label: 'Título', required: true },
  { field: 'responsable', label: 'Responsable' },
  { field: 'origenSindicato', label: 'Origen sindicato' },
  { field: 'fechaLimite', label: 'Fecha límite' },
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
    estado: task.estado,
    prioridad: task.prioridad,
    fechaLimite: task.fechaLimite,
    responsable: task.responsable,
    origenSindicato: task.origenSindicato,
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
  const createTask = useTaskStore((state) => state.create);
  const updateTask = useTaskStore((state) => state.update);
  const removeTask = useTaskStore((state) => state.remove);
  const [draft, setDraft] = useState<TaskDraft>(() => toDraft(task));
  const [newUpdateText, setNewUpdateText] = useState('');

  useEffect(() => {
    setDraft(toDraft(task));
    setNewUpdateText('');
  }, [task, mode]);

  const isCreate = mode === 'create';
  const canSubmit = draft.titulo.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[1px]">
      <aside
        aria-modal="true"
        className="flex max-h-[calc(100vh-2rem)] w-[min(760px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-metro-border bg-[#FAFBFC] p-3 shadow-2xl"
        role="dialog"
      >
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-metro-border bg-white px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-metro-red">
              {isCreate ? 'Nueva tarea' : 'Editar tarea'}
            </p>
            <h3 className="mt-1 truncate text-base font-bold text-metro-text">
              {isCreate ? 'Nueva tarea' : task?.titulo || 'Sin selección'}
            </h3>
            <p className="text-xs text-metro-muted">
              {isCreate ? 'Alta manual compacta.' : `Editando tarea ${task?.id ?? '—'}`}
            </p>
          </div>
          <button
            aria-label="Cerrar editor"
            className="rounded-lg border border-metro-border bg-white p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={onDone}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) {
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
          <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {taskTextFields.map(({ field, label, required }) => (
              <label className="text-xs font-semibold text-metro-muted" key={field}>
                {label}
                <input
                  className="mt-1 w-full rounded-lg border border-metro-border bg-white px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [field]: event.target.value }))
                  }
                  required={required}
                  type={field === 'fechaLimite' ? 'date' : 'text'}
                  value={draft[field]}
                />
              </label>
            ))}
            <label className="text-xs font-semibold text-metro-muted">
              Estado
              <select
                className="mt-1 w-full rounded-lg border border-metro-border bg-white px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, estado: event.target.value as TaskDraft['estado'] }))
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
                className="mt-1 w-full rounded-lg border border-metro-border bg-white px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
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
                className="mt-1 min-h-20 w-full rounded-lg border border-metro-border bg-white px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, descripcion: event.target.value }))
                }
                value={draft.descripcion}
              />
            </label>

            <section className="sm:col-span-2 rounded-xl border border-metro-border bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-metro-text">Seguimiento</h4>
                {!isCreate && task && (
                  <span className="rounded-full bg-metro-surface px-2 py-1 text-xs font-semibold text-metro-muted">
                    {task.actualizaciones.length} actualizaciones
                  </span>
                )}
              </div>
              <label className="text-xs font-semibold text-metro-muted">
                Añadir actualización
                <textarea
                  className="mt-1 min-h-20 w-full rounded-lg border border-metro-border bg-white px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) => setNewUpdateText(event.target.value)}
                  placeholder="Registrar trabajo realizado..."
                  value={newUpdateText}
                />
              </label>
              {!isCreate && task && task.actualizaciones.length > 0 && (
                <div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
                  {task.actualizaciones.map((actualizacion) => (
                    <article
                      className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2"
                      key={`${actualizacion.fechaHora}-${actualizacion.texto}`}
                    >
                      <time className="text-xs font-bold text-metro-text" dateTime={actualizacion.fechaHora}>
                        {formatUpdateDate(actualizacion.fechaHora)}
                      </time>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-metro-muted">{actualizacion.texto}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <label className="text-xs font-semibold text-metro-muted sm:col-span-2">
              Observaciones
              <textarea
                className="mt-1 min-h-20 w-full rounded-lg border border-metro-border bg-white px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, observaciones: event.target.value }))
                }
                value={draft.observaciones}
              />
            </label>
          </div>

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
                className="rounded-lg border border-metro-border bg-white px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
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
              className="rounded-lg border border-metro-border bg-white px-3 py-2 text-sm font-semibold text-metro-muted hover:text-metro-text"
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

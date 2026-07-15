import { managedSessionLabel, type ManagedSession, type SessionModuleConfig } from './session';
import { describeTask, getTaskTitle } from './sessionManagementPage.helpers';
import type { Task } from '../../features/tareas/domain/task';

export function SessionCloseModal({
  closingSession,
  config,
  onCancel,
  onConfirm,
  setTreatedTaskIds,
  tasksById,
  treatedTaskIds,
}: {
  closingSession: ManagedSession;
  config: SessionModuleConfig;
  onCancel: () => void;
  onConfirm: () => void;
  setTreatedTaskIds: (
    update: (current: Record<string, boolean>) => Record<string, boolean>,
  ) => void;
  tasksById: Map<string, Task>;
  treatedTaskIds: Record<string, boolean>;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="max-h-[86vh] w-full max-w-3xl overflow-auto rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-2xl">
        <h3 className="text-lg font-bold text-metro-text">Cerrar sesión de {config.shortTitle}</h3>
        <p className="mt-1 text-sm text-metro-muted">
          Revisa los puntos tratados. Desmarca los no tratados para mantener sus tareas abiertas.
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
                  <span className="mt-1 block text-xs text-metro-muted">{describeTask(task)}</span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            className="rounded-xl border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={onCancel}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={onConfirm}
            type="button"
          >
            Confirmar cierre
          </button>
        </div>
      </div>
    </div>
  );
}

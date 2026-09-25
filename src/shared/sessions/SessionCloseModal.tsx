import { ActionButton } from '../../components/ui/ActionButton';
import {
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalShell,
  ModalTitle,
} from '../../components/ui/ModalShell';
import type { Task } from '../../features/tareas/domain/task';
import { managedSessionLabel, type ManagedSession, type ManagedSessionTaskResult, type SessionModuleConfig } from './session';
import { describeTask, getTaskTitle } from './sessionManagementPage.helpers';

export function SessionCloseModal({
  closingSession,
  config,
  onCancel,
  onConfirm,
  pointResults,
  setPointResults,
  tasksById,
}: {
  closingSession: ManagedSession;
  config: SessionModuleConfig;
  onCancel: () => void;
  onConfirm: () => void;
  pointResults: Record<string, ManagedSessionTaskResult>;
  setPointResults: (
    update: (current: Record<string, ManagedSessionTaskResult>) => Record<string, ManagedSessionTaskResult>,
  ) => void;
  tasksById: Map<string, Task>;
}) {
  const titleId = 'session-close-modal-title';

  return (
    <ModalShell labelledBy={titleId} maxWidthClassName="max-w-3xl" onClose={onCancel}>
      <ModalHeader>
        <ModalTitle
          id={titleId}
          subtitle="Indica el resultado de cada punto. Solo “Tratado y resuelto” cerrará la tarea."
        >
          Cerrar sesión de {config.shortTitle}
        </ModalTitle>
      </ModalHeader>
      <ModalBody className="space-y-3">
        <div className="rounded-xl bg-metro-panel p-3 text-sm text-metro-muted">
          <strong className="text-metro-text">{closingSession.title}</strong>
          <br />
          {managedSessionLabel(closingSession)}
        </div>
        <div className="space-y-2">
          {closingSession.items.length === 0 && (
            <p className="rounded-xl bg-metro-panel p-3 text-sm text-metro-muted">
              Esta sesión no tiene tareas asignadas. Puede cerrarse sin modificar tareas.
            </p>
          )}
          {closingSession.items.map((taskId, index) => {
            const task = tasksById.get(taskId);

            return (
              <div className="grid gap-3 rounded-xl bg-metro-panel p-3 md:grid-cols-[minmax(0,1fr)_250px] md:items-center" key={taskId}>
                <span>
                  <span className="block font-semibold text-metro-text">
                    {index + 1}. {getTaskTitle(tasksById, taskId)}
                  </span>
                  <span className="mt-1 block text-xs text-metro-muted">{describeTask(task)}</span>
                </span>
                <select
                  className="ui-control ui-control--compact text-xs font-semibold"
                  onChange={(event) =>
                    setPointResults((current) => ({
                      ...current,
                      [taskId]: event.target.value as ManagedSessionTaskResult,
                    }))
                  }
                  value={pointResults[taskId] ?? 'resolved'}
                >
                  <option value="resolved">Tratado y resuelto</option>
                  <option value="followup">Tratado · requiere seguimiento</option>
                  <option value="return">Volver a próxima sesión</option>
                  <option value="not-treated">No tratado</option>
                </select>
              </div>
            );
          })}
        </div>
      </ModalBody>
      <ModalFooter>
        <ActionButton iconOnly={false} onClick={onCancel} variant="secondary">
          Cancelar
        </ActionButton>
        <ActionButton iconOnly={false} onClick={onConfirm} variant="save">
          Confirmar cierre
        </ActionButton>
      </ModalFooter>
    </ModalShell>
  );
}

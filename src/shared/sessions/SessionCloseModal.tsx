import { ActionButton } from '../../components/ui/ActionButton';
import {
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalShell,
  ModalTitle,
} from '../../components/ui/ModalShell';
import type { Task } from '../../features/tareas/domain/task';
import { managedSessionLabel, type ManagedSession, type SessionModuleConfig } from './session';
import { describeTask, getTaskTitle } from './sessionManagementPage.helpers';

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
  const titleId = 'session-close-modal-title';

  return (
    <ModalShell labelledBy={titleId} maxWidthClassName="max-w-3xl" onClose={onCancel}>
      <ModalHeader>
        <ModalTitle
          id={titleId}
          subtitle="Desmarca los puntos no tratados para mantener sus tareas abiertas."
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
              <label
                className="flex cursor-pointer gap-3 rounded-xl bg-metro-panel p-3 hover:bg-metro-raised"
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

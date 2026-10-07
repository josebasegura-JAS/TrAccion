import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';

type ClosureTask = {
  id: string;
  title: string;
  responsible: string;
};

export function CoordinationTaskClosureDialog({
  tasks,
  onCancel,
  onCloseNone,
  onCloseAll,
  onCloseSelected,
}: {
  tasks: ClosureTask[];
  onCancel: () => void;
  onCloseNone: () => void;
  onCloseAll: () => void;
  onCloseSelected: (taskIds: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleTask = (taskId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  };

  return (
    <ModalShell labelledBy="coordination-close-tasks-title" onClose={onCancel} size="sm" stacked>
      <ModalHeader>
        <ModalTitle
          id="coordination-close-tasks-title"
          subtitle="La reunión se cerrará. Las tareas solo cambiarán si lo indicas expresamente."
        >
          ¿Quieres cerrar alguna tarea tratada?
        </ModalTitle>
        <ModalCloseButton label="Cancelar cierre" onClick={onCancel} />
      </ModalHeader>

      <ModalBody>
        <div className="rounded-lg border border-metro-border bg-metro-panel/45 px-3 py-2 text-xs leading-5 text-metro-muted">
          Marcar una tarea como <strong className="text-metro-text">tratada</strong> en la reunión no modifica su estado ni su fase.
          Puedes cerrar la reunión sin cerrar ninguna tarea, cerrar todas o seleccionar solo las que realmente hayan finalizado.
        </div>

        <div className="mt-3 space-y-2">
          {tasks.map((task) => {
            const checked = selectedIds.has(task.id);
            return (
              <label
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 hover:border-metro-red/60"
                key={task.id}
              >
                <input
                  checked={checked}
                  className="mt-0.5 h-4 w-4 accent-red-600"
                  onChange={() => toggleTask(task.id)}
                  type="checkbox"
                />
                <span className="min-w-0">
                  <strong className="block text-sm text-metro-text">{task.title}</strong>
                  <span className="block text-xs text-metro-muted">
                    {task.responsible ? `Responsable: ${task.responsible}` : 'Sin responsable asignado'}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </ModalBody>

      <ModalFooter className="justify-between">
        <ActionButton iconOnly={false} onClick={onCancel} variant="secondary">Cancelar</ActionButton>
        <div className="flex flex-wrap justify-end gap-2">
          <ActionButton iconOnly={false} onClick={onCloseNone} variant="primary">
            Cerrar reunión sin cerrar tareas
          </ActionButton>
          <ActionButton
            disabled={selectedIds.size === 0}
            icon={CheckCircle2}
            iconOnly={false}
            onClick={() => onCloseSelected([...selectedIds])}
            variant="approve"
          >
            Cerrar seleccionadas ({selectedIds.size})
          </ActionButton>
          <ActionButton icon={CheckCircle2} iconOnly={false} onClick={onCloseAll} variant="approve">
            Cerrar todas ({tasks.length})
          </ActionButton>
        </div>
      </ModalFooter>
    </ModalShell>
  );
}

import { ActionButton } from '../../components/ui/ActionButton';
import { Input, Textarea } from '../../components/ui/Field';
import {
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalShell,
  ModalTitle,
} from '../../components/ui/ModalShell';
import type { ManagedSessionDraft, SessionModuleConfig } from './session';

export function SessionEditModal({
  config,
  editDraft,
  onCancel,
  onSave,
  updateEditDraft,
}: {
  config: SessionModuleConfig;
  editDraft: ManagedSessionDraft;
  onCancel: () => void;
  onSave: () => void;
  updateEditDraft: <K extends keyof ManagedSessionDraft>(
    key: K,
    value: ManagedSessionDraft[K],
  ) => void;
}) {
  const titleId = 'session-edit-modal-title';

  return (
    <ModalShell labelledBy={titleId} maxWidthClassName="max-w-3xl" onClose={onCancel}>
      <ModalHeader>
        <ModalTitle
          id={titleId}
          subtitle="Modifica fecha, código, título o notas. El estado de la sesión no cambia."
        >
          Editar sesión de {config.shortTitle}
        </ModalTitle>
      </ModalHeader>
      <ModalBody className="space-y-2">
        <div className="grid grid-cols-[150px_180px_minmax(220px,1fr)] gap-2 overflow-x-auto">
          <Input
            onChange={(event) => updateEditDraft('date', event.target.value)}
            type="date"
            value={editDraft.date}
          />
          <Input
            onChange={(event) => updateEditDraft('code', event.target.value)}
            placeholder="Código documento"
            value={editDraft.code}
          />
          <Input
            onChange={(event) => updateEditDraft('title', event.target.value)}
            placeholder="Título / referencia de la sesión"
            value={editDraft.title}
          />
        </div>
        <Textarea
          className="min-h-[120px]"
          onChange={(event) => updateEditDraft('notes', event.target.value)}
          placeholder="Notas de la sesión, documentación asociada, observaciones, etc."
          value={editDraft.notes}
        />
      </ModalBody>
      <ModalFooter>
        <ActionButton iconOnly={false} onClick={onCancel} variant="secondary">
          Cancelar
        </ActionButton>
        <ActionButton iconOnly={false} onClick={onSave} variant="save">
          Guardar cambios
        </ActionButton>
      </ModalFooter>
    </ModalShell>
  );
}

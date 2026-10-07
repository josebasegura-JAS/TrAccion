import { useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Field, Input, Textarea } from '../../../components/ui/Field';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import type { CoordinationMeeting } from '../domain/coordinacion';
import type { CoordinationMeetingDetailsDraft, CoordinationMeetingDetailsResult } from '../services/coordinationMeetingDetails';

export function CoordinationMeetingEditDialog({
  meeting,
  onCancel,
  onSave,
}: {
  meeting: CoordinationMeeting;
  onCancel: () => void;
  onSave: (draft: CoordinationMeetingDetailsDraft) => Promise<CoordinationMeetingDetailsResult>;
}) {
  const [title, setTitle] = useState(meeting.title ?? '');
  const [date, setDate] = useState(meeting.date);
  const [interlocutors, setInterlocutors] = useState(meeting.interlocutors ?? '');
  const [purpose, setPurpose] = useState(meeting.purpose ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (isSaving) return;
    setError('');
    setIsSaving(true);
    try {
      const result = await onSave({ title, date, interlocutors, purpose });
      if (!result.ok) setError(result.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalShell labelledBy="coordination-meeting-edit-title" onClose={onCancel} size="md" stacked>
      <ModalHeader>
        <ModalTitle
          id="coordination-meeting-edit-title"
          subtitle="Puedes actualizar los datos de la reunión sin modificar sus puntos ni tareas vinculadas."
        >
          Editar reunión
        </ModalTitle>
        <ModalCloseButton label="Cerrar edición de reunión" onClick={onCancel} />
      </ModalHeader>
      <ModalBody>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field className="sm:col-span-2" density="compact" label="Título de la reunión" required>
            <Input
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Título de la reunión"
              required
              value={title}
            />
          </Field>
          <Field density="compact" label="Fecha" required>
            <Input
              dateTone="request"
              onChange={(event) => setDate(event.target.value)}
              required
              type="date"
              value={date}
            />
          </Field>
          <Field density="compact" label="Interlocutores / participantes">
            <Input
              onChange={(event) => setInterlocutors(event.target.value)}
              placeholder="Personas participantes"
              value={interlocutors}
            />
          </Field>
          <Field className="sm:col-span-2" density="compact" label="Objetivo / contexto">
            <Textarea
              className="min-h-20"
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="Objetivo o contexto de la reunión"
              value={purpose}
            />
          </Field>
        </div>
        {error && (
          <p className="mt-3 rounded-lg border border-red-400/30 bg-red-950/20 px-3 py-2 text-xs font-semibold text-red-200">
            {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <ActionButton disabled={isSaving} iconOnly={false} onClick={onCancel} variant="secondary">
          Cancelar
        </ActionButton>
        <ActionButton
          disabled={!title.trim() || !date.trim()}
          iconOnly={false}
          loading={isSaving}
          onClick={() => void handleSave()}
          variant="save"
        >
          Guardar cambios
        </ActionButton>
      </ModalFooter>
    </ModalShell>
  );
}

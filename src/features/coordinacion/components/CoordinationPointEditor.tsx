import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Field, Input, Select, Textarea } from '../../../components/ui/Field';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Notice } from '../../../components/ui/Notice';
import { navigateInApp } from '../../../services/appNavigationBus';
import type { CoordinationMeeting, CoordinationPointStatus } from '../domain/coordinacion';
import { removeCoordinationMeetingPoint } from '../services/removeCoordinationMeetingPoint';
import { pointToDraft, type CoordinationPointDraft } from './coordinationPointDraft';

function pointDraftsEqual(a: CoordinationPointDraft, b: CoordinationPointDraft): boolean {
  return a.result === b.result
    && a.status === b.status
    && a.responsible === b.responsible
    && a.dueDate === b.dueDate;
}

function pointDraftIsDirty(
  point: CoordinationMeeting['points'][number],
  draft: CoordinationPointDraft,
): boolean {
  return draft.result !== point.result
    || draft.status !== point.status
    || draft.responsible !== (point.responsible ?? '')
    || draft.dueDate !== (point.dueDate ?? '');
}

export const CoordinationPointEditor = memo(function CoordinationPointEditor({
  index,
  isUnion,
  meetingOpen,
  onConvertToTask,
  onDelete,
  onDraftChange,
  onRemoteConflictChange,
  point,
}: {
  index: number;
  isUnion: boolean;
  meetingOpen: boolean;
  onConvertToTask: (pointId: string) => void;
  onDelete: (pointId: string, title: string) => void;
  onDraftChange: (pointId: string, draft: CoordinationPointDraft, dirty: boolean) => void;
  onRemoteConflictChange: (pointId: string, hasConflict: boolean) => void;
  point: CoordinationMeeting['points'][number];
}) {
  const [draft, setDraft] = useState<CoordinationPointDraft>(() => pointToDraft(point));
  const [hasRemoteConflict, setHasRemoteConflict] = useState(false);
  const sourcePointRef = useRef(point);
  const { alert, confirm, dialogNode } = useAppDialog();

  useEffect(() => {
    const previousPoint = sourcePointRef.current;
    const previousSourceDraft = pointToDraft(previousPoint);
    const nextSourceDraft = pointToDraft(point);
    const editableSourceChanged = !pointDraftsEqual(previousSourceDraft, nextSourceDraft);
    const localWasDirty = !pointDraftsEqual(draft, previousSourceDraft);

    sourcePointRef.current = point;
    if (!editableSourceChanged) return;

    // If the editor was clean, remote data can safely replace the local draft.
    // If both sides converged to the same values (for example after our own save),
    // the update is also safe and must not be reported as a conflict.
    if (!localWasDirty || pointDraftsEqual(draft, nextSourceDraft)) {
      setDraft(nextSourceDraft);
      setHasRemoteConflict(false);
      onDraftChange(point.id, nextSourceDraft, false);
      onRemoteConflictChange(point.id, false);
      return;
    }

    // Keep the local draft visible, but prevent it from overwriting the remote edit.
    setHasRemoteConflict(true);
    onRemoteConflictChange(point.id, true);
  }, [draft, onDraftChange, onRemoteConflictChange, point]);

  useEffect(() => () => {
    onRemoteConflictChange(point.id, false);
  }, [onRemoteConflictChange, point.id]);

  const reloadRemoteDraft = () => {
    const next = pointToDraft(point);
    sourcePointRef.current = point;
    setDraft(next);
    setHasRemoteConflict(false);
    onDraftChange(point.id, next, false);
    onRemoteConflictChange(point.id, false);
  };

  const updateDraft = (patch: Partial<CoordinationPointDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onDraftChange(point.id, next, pointDraftIsDirty(point, next));
  };

  return (
    <>
      {dialogNode}
      <article className="ui-subsection p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-metro-surface px-2 py-1 text-xs font-bold text-metro-muted">{index + 1}</span>
            <h4 className="font-bold text-metro-text">{point.title}</h4>
            {point.origin === 'task' && <StatusBadge tone="info" size="xs">Tarea de referencia</StatusBadge>}
          </div>
          {point.detail && <p className="mt-2 text-sm leading-5 text-metro-muted">{point.detail}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {point.taskId && (
            <ActionButton
              variant="secondary"
              size="sm"
              icon={ArrowRight}
              onClick={() => navigateInApp({ view: 'tareas', recordId: point.taskId ?? undefined })}
              title="Abrir la tarea vinculada"
            >
              Abrir tarea
            </ActionButton>
          )}
          <Select
            className="w-auto min-w-48 text-xs font-semibold"
            density="compact"
            disabled={!meetingOpen}
            onChange={(event) => updateDraft({ status: event.target.value as CoordinationPointStatus })}
            value={draft.status}
          >
            <option value="pendiente">Pendiente de tratar</option>
            <option value="tratado">Tratado y resuelto</option>
            <option value="seguimiento">Tratado · requiere seguimiento</option>
            <option value="volver">Volver a próxima reunión</option>
            <option value="no-tratado">No tratado</option>
            {isUnion && (
              <>
                <option value="pendiente-rrll">Pendiente de RRLL</option>
                <option value="pendiente-sindicato">Pendiente del sindicato</option>
              </>
            )}
          </Select>
          {point.origin === 'manual' && meetingOpen && (
            <ActionButton
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={() => onConvertToTask(point.id)}
              title="Crear una tarea conservando este punto"
            >
              Convertir en tarea
            </ActionButton>
          )}
          {meetingOpen && (
            <ActionButton
              variant="delete"
              size="sm"
              icon={Trash2}
              iconOnly
              onClick={() => {
                if (!point.taskId) {
                  onDelete(point.id, point.title);
                  return;
                }
                void (async () => {
                  const confirmed = await confirm(
                    `Se quitará la tarea “${point.title}” de esta reunión. La tarea seguirá existiendo en Tareas.`,
                    {
                      title: 'Quitar tarea de la reunión',
                      confirmLabel: 'Quitar de la reunión',
                      cancelLabel: 'Cancelar',
                      danger: true,
                    },
                  );
                  if (!confirmed) return;
                  const result = await removeCoordinationMeetingPoint(point.id);
                  if (!result.ok) await alert(result.message);
                })();
              }}
              title={point.taskId ? `Quitar ${point.title} de esta reunión` : `Eliminar punto manual ${point.title}`}
            />
          )}
        </div>
      </div>
      {hasRemoteConflict && (
        <Notice
          actionLabel="Recargar cambios"
          className="mt-3"
          live="assertive"
          onAction={reloadRemoteDraft}
          title="Este punto ha cambiado en otra sesión"
          tone="warning"
        >
          Tus cambios locales se conservan en pantalla, pero no se pueden guardar sobre la nueva versión. Recarga este punto para continuar.
        </Notice>
      )}
      <Field className="mt-3" density="compact" label="Resultado / acuerdos">
        <Textarea
          className="min-h-20"
          disabled={!meetingOpen}
          onChange={(event) => updateDraft({ result: event.target.value })}
          value={draft.result}
          placeholder="Decisión, actuación acordada y siguiente paso..."
        />
      </Field>
      {isUnion && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Field density="compact" label="Responsable del siguiente paso">
            <Input
              disabled={!meetingOpen}
              onChange={(event) => updateDraft({ responsible: event.target.value })}
              value={draft.responsible}
            />
          </Field>
          <Field density="compact" label="Fecha de compromiso">
            <Input
              dateTone="end"
              disabled={!meetingOpen}
              onChange={(event) => updateDraft({ dueDate: event.target.value })}
              value={draft.dueDate}
              type="date"
            />
          </Field>
        </div>
      )}
      </article>
    </>
  );
});

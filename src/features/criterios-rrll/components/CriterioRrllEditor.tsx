import { toLocalIsoDate as todayIso } from '../../../utils/dateOnly';

import { useEffect, useRef, useState } from 'react';
import {
  EMPTY_CRITERIO_RRLL_DRAFT,
  CRITERIO_RRLL_ESTADOS,
  CRITERIO_RRLL_SENTIDOS,
  type CriterioRrll,
  type CriterioRrllDraft,
  type CriterioRrllDraftField,
} from '../domain/criterioRrll';
import { useCriteriosRrllStore } from '../store/useCriteriosRrllStore';
import { InlineSaveFeedback } from '../../../components/InlineSaveFeedback';
import { ModalDatabaseStatus } from '../../../components/ModalDatabaseStatus';
import { useSharedRecordLock } from '../../../services/useSharedRecordLock';
import { ActionButton } from '../../../components/ui/ActionButton';
import { FieldLabel, Input, Select, Textarea } from '../../../components/ui/Field';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { RecordLockNotice } from '../../../components/ui/RecordLockNotice';
import { useUnsavedChanges } from '../../../hooks/useUnsavedChanges';
import { useEditorShortcuts } from '../../../hooks/useEditorShortcuts';

const criterioTextFields: Array<{
  field: CriterioRrllDraftField;
  label: string;
  required?: boolean;
}> = [
  { field: 'tema', label: 'Tema', required: true },
  { field: 'responsable', label: 'Responsable' },
  { field: 'fecha', label: 'Fecha' },
];

function toDraft(criterio: CriterioRrll | null): CriterioRrllDraft {
  if (!criterio) {
    return { ...EMPTY_CRITERIO_RRLL_DRAFT, fecha: todayIso() };
  }

  return {
    tema: criterio.tema,
    criterio: criterio.criterio,
    estado: criterio.estado,
    sentido: criterio.sentido,
    fecha: criterio.fecha,
    responsable: criterio.responsable,
    observaciones: criterio.observaciones,
  };
}

export function CriterioRrllEditor({
  criterio,
  mode,
  onDone,
}: {
  criterio: CriterioRrll | null;
  mode: 'create' | 'edit';
  onDone: () => void;
}) {
  const createCriterio = useCriteriosRrllStore((state) => state.createWithConcurrencyCheck);
  const updateCriterio = useCriteriosRrllStore((state) => state.updateWithConcurrencyCheck);
  const removeCriterio = useCriteriosRrllStore((state) => state.removeWithConcurrencyCheck);
  const [draft, setDraft] = useState<CriterioRrllDraft>(() => toDraft(criterio));
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setDraft(toDraft(criterio));
  }, [criterio, mode]);

  const isCreate = mode === 'create';
  const recordLock = useSharedRecordLock({
    module: 'criterios-rrll',
    recordId: criterio?.id ?? null,
    enabled: mode === 'edit' && Boolean(criterio?.id),
  });
  const isReadOnly = recordLock.isReadOnly;
  const canSubmit = draft.tema.trim().length > 0 && draft.criterio.trim().length > 0 && !isReadOnly;
  const { requestClose, dialogNode } = useUnsavedChanges({
    currentValue: draft,
    initialValue: toDraft(criterio),
    enabled: !isReadOnly,
    onDiscard: onDone,
  });
  const formRef = useRef<HTMLFormElement>(null);
  useEditorShortcuts({
    canSave: canSubmit,
    onClose: () => void requestClose(),
    onSave: () => formRef.current?.requestSubmit(),
  });

  return (
    <ModalShell
      labelledBy="criterio-rrll-editor-title"
      maxWidthClassName="max-w-[720px]"
      onClose={() => void requestClose()}
      panelClassName="bg-metro-panel"
    >
      <ModalHeader>
        <ModalTitle
          id="criterio-rrll-editor-title"
          subtitle={isCreate ? 'Alta manual compacta.' : `Editando criterio ${criterio?.id ?? '—'}`}
        >
          {isCreate ? 'Nuevo criterio RRLL' : criterio?.tema || 'Editar criterio RRLL'}
        </ModalTitle>
        <div className="flex shrink-0 items-center gap-2">
          <ModalDatabaseStatus />
          <ModalCloseButton label="Cerrar editor" onClick={() => void requestClose()} />
        </div>
      </ModalHeader>

        {recordLock.status === 'locked' && recordLock.lockedBy && (
          <RecordLockNotice className="mb-3" lockedBy={recordLock.lockedBy} />
        )}

        <form
          ref={formRef}
          className="flex min-h-0 flex-1 flex-col space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) {
              return;
            }

            void (async () => {
              setSaveError('');
              const result = isCreate
                ? await createCriterio(draft)
                : criterio
                  ? await updateCriterio(criterio.id, draft, criterio.updatedAt)
                  : { ok: false, message: 'No se ha encontrado el criterio seleccionado.' };

              if (!result.ok) {
                setSaveError(result.message);
                return;
              }
              onDone();
            })();
          }}
        >
          <div className="grid min-h-0 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {criterioTextFields.map(({ field, label, required }) => (
              <FieldLabel className="text-xs font-semibold text-metro-muted" key={field}>
                {label}{required ? <span className="ml-1 text-metro-red">*</span> : null}
                <Input
                  dateTone={field === 'fecha' ? 'request' : undefined}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [field]: event.target.value }))
                  }
                  disabled={isReadOnly}
                  required={required}
                  type={field === 'fecha' ? 'date' : 'text'}
                  value={draft[field]}
                />
              </FieldLabel>
            ))}
            <FieldLabel className="text-xs font-semibold text-metro-muted">
              Estado
              <Select
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    estado: event.target.value as CriterioRrllDraft['estado'],
                  }))
                }
                disabled={isReadOnly}
                value={draft.estado}
              >
                {CRITERIO_RRLL_ESTADOS.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado}
                  </option>
                ))}
              </Select>
            </FieldLabel>
            <FieldLabel className="text-xs font-semibold text-metro-muted">
              Sentido
              <Select
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    sentido: event.target.value as CriterioRrllDraft['sentido'],
                  }))
                }
                disabled={isReadOnly}
                value={draft.sentido}
              >
                {CRITERIO_RRLL_SENTIDOS.map((sentido) => (
                  <option key={sentido} value={sentido}>
                    {sentido}
                  </option>
                ))}
              </Select>
            </FieldLabel>
            <FieldLabel className="text-xs font-semibold text-metro-muted sm:col-span-2">
              Criterio <span className="text-metro-red">*</span>
              <Textarea
                className="min-h-28"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, criterio: event.target.value }))
                }
                disabled={isReadOnly}
                required
                value={draft.criterio}
              />
            </FieldLabel>
            <FieldLabel className="text-xs font-semibold text-metro-muted sm:col-span-2">
              Observaciones
              <Textarea
                className="min-h-20"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, observaciones: event.target.value }))
                }
                disabled={isReadOnly}
                value={draft.observaciones}
              />
            </FieldLabel>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-metro-border pt-3">
            {saveError && (
              <p className="w-full rounded-lg border border-metro-red/40 bg-metro-red/10 px-3 py-2 text-xs font-semibold text-metro-red">
                {saveError}
              </p>
            )}
            <ActionButton disabled={!canSubmit} iconOnly={false} type="submit" variant="save">
              Guardar <kbd className="ml-1 text-[10px] opacity-70">Ctrl S</kbd>
            </ActionButton>
            <InlineSaveFeedback />
            {!isCreate && criterio && (
              <ActionButton
                variant="delete"
                iconOnly={false}
                disabled={isReadOnly}
                onClick={() => {
                  void (async () => {
                    setSaveError('');
                    const result = await removeCriterio(criterio.id, criterio.updatedAt);
                    if (!result.ok) {
                      setSaveError(result.message);
                      return;
                    }
                    onDone();
                  })();
                }}
              >
                Eliminar
              </ActionButton>
            )}
            <ActionButton variant="secondary" iconOnly={false} onClick={() => void requestClose()}>
              Cancelar <kbd className="ml-1 text-[10px] opacity-70">Esc</kbd>
            </ActionButton>
          </div>
        </form>
      {dialogNode}
    </ModalShell>
  );
}

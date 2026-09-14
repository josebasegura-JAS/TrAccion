import { CalendarDays, FileText, MessageSquareText, ShieldCheck, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toLocalIsoDate as todayIso } from '../../../utils/dateOnly';
import {
  EMPTY_CRITERIO_RRLL_DRAFT,
  CRITERIO_RRLL_ESTADOS,
  CRITERIO_RRLL_SENTIDOS,
  type CriterioRrll,
  type CriterioRrllDraft,
} from '../domain/criterioRrll';
import { useCriteriosRrllStore } from '../store/useCriteriosRrllStore';
import { InlineSaveFeedback } from '../../../components/InlineSaveFeedback';
import { ModalDatabaseStatus } from '../../../components/ModalDatabaseStatus';
import { useSharedRecordLock } from '../../../services/useSharedRecordLock';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Field, Input, Select, Textarea } from '../../../components/ui/Field';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { RecordLockNotice } from '../../../components/ui/RecordLockNotice';
import { useUnsavedChanges } from '../../../hooks/useUnsavedChanges';
import { buildRecoverableDraftKey, useRecoverableDraft } from '../../../hooks/useRecoverableDraft';
import { useEditorShortcuts } from '../../../hooks/useEditorShortcuts';

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

function EditorSection({
  children,
  description,
  icon,
  tone = 'sky',
  title,
}: {
  children: ReactNode;
  description: string;
  icon: ReactNode;
  tone?: 'sky' | 'violet' | 'cyan' | 'amber';
  title: string;
}) {
  const toneClass = {
    sky: 'border-sky-400/20 bg-sky-500/10 text-sky-200',
    violet: 'border-violet-400/20 bg-violet-500/10 text-violet-200',
    cyan: 'border-cyan-400/20 bg-cyan-500/10 text-cyan-200',
    amber: 'border-amber-400/20 bg-amber-500/10 text-amber-200',
  }[tone];

  return (
    <section className="rounded-2xl border border-metro-border/80 bg-[linear-gradient(180deg,rgba(22,42,66,0.92),rgba(18,35,56,0.88))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="mb-4 flex items-start gap-3">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border ${toneClass}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-metro-text">{title}</h3>
          <p className="text-sm text-metro-muted">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const normalized = estado.toLowerCase();
  const tone = normalized.includes('vigente') || normalized.includes('activo')
    ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
    : normalized.includes('deneg') || normalized.includes('anulad')
      ? 'border-red-400/30 bg-red-500/10 text-red-200'
      : 'border-sky-400/30 bg-sky-500/10 text-sky-200';

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${tone}`}>
      <ShieldCheck size={14} />
      {estado || 'Sin estado'}
    </span>
  );
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
  const initialDraft = useMemo(() => toDraft(criterio), [criterio]);
  const recoveryKey = buildRecoverableDraftKey('criterios-rrll', criterio?.id ?? '__new__');
  const { clearDraft: clearRecoveryDraft, dialogNode: recoveryDialogNode } = useRecoverableDraft({
    currentValue: draft,
    initialValue: initialDraft,
    enabled: !isReadOnly,
    onRecover: setDraft,
    storageKey: recoveryKey,
  });
  const { requestClose, dialogNode } = useUnsavedChanges({
    currentValue: draft,
    initialValue: initialDraft,
    enabled: !isReadOnly,
    onDiscard: () => {
      clearRecoveryDraft();
      onDone();
    },
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
      maxWidthClassName="max-w-[1120px]"
      onClose={() => void requestClose()}
      panelClassName="bg-[linear-gradient(180deg,rgba(15,30,49,0.98),rgba(11,24,41,0.98))]"
    >
      <ModalHeader>
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-sky-400/20 bg-sky-500/10 text-sky-200">
            <FileText size={24} />
          </div>
          <ModalTitle
            id="criterio-rrll-editor-title"
            subtitle={isCreate ? 'Alta de nuevo criterio.' : `Editando criterio ${criterio?.id ?? '—'}`}
          >
            {isCreate ? 'Nuevo criterio RRLL' : criterio?.tema || 'Editar criterio RRLL'}
          </ModalTitle>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isCreate && <EstadoBadge estado={draft.estado} />}
          <ModalDatabaseStatus />
          <ModalCloseButton label="Cerrar editor" onClick={() => void requestClose()} />
        </div>
      </ModalHeader>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3">
        {recordLock.status === 'locked' && recordLock.lockedBy && (
          <RecordLockNotice className="mb-3" lockedBy={recordLock.lockedBy} />
        )}

        <form
          ref={formRef}
          className="flex min-h-0 flex-1 flex-col gap-4"
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
              clearRecoveryDraft();
              onDone();
            })();
          }}
        >
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto pr-1 lg:grid-cols-2">
            <div className="space-y-4">
              <EditorSection
                description="Datos básicos, estado y sentido del criterio."
                icon={<FileText size={20} />}
                title="Información general"
              >
                <div className="space-y-4">
                  <Field label="Tema" required>
                    <Input
                      disabled={isReadOnly}
                      onChange={(event) => setDraft((current) => ({ ...current, tema: event.target.value }))}
                      required
                      value={draft.tema}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Estado">
                      <Select
                        disabled={isReadOnly}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            estado: event.target.value as CriterioRrllDraft['estado'],
                          }))
                        }
                        value={draft.estado}
                      >
                        {CRITERIO_RRLL_ESTADOS.map((estado) => (
                          <option key={estado} value={estado}>{estado}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Sentido / aplicación">
                      <Select
                        disabled={isReadOnly}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            sentido: event.target.value as CriterioRrllDraft['sentido'],
                          }))
                        }
                        value={draft.sentido}
                      >
                        {CRITERIO_RRLL_SENTIDOS.map((sentido) => (
                          <option key={sentido} value={sentido}>{sentido}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </div>
              </EditorSection>

              <EditorSection
                description="Fecha de referencia y persona responsable."
                icon={<CalendarDays size={20} />}
                title="Fecha y gestión"
                tone="cyan"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Fecha">
                    <Input
                      dateTone="request"
                      disabled={isReadOnly}
                      onChange={(event) => setDraft((current) => ({ ...current, fecha: event.target.value }))}
                      type="date"
                      value={draft.fecha}
                    />
                  </Field>
                  <Field label="Responsable">
                    <Input
                      disabled={isReadOnly}
                      onChange={(event) => setDraft((current) => ({ ...current, responsable: event.target.value }))}
                      value={draft.responsable}
                    />
                  </Field>
                </div>
              </EditorSection>
            </div>

            <div className="space-y-4">
              <EditorSection
                description="Definición y alcance del criterio laboral."
                icon={<MessageSquareText size={20} />}
                title="Contenido del criterio"
                tone="violet"
              >
                <Field label="Criterio" required>
                  <Textarea
                    className="min-h-44 resize-y"
                    disabled={isReadOnly}
                    onChange={(event) => setDraft((current) => ({ ...current, criterio: event.target.value }))}
                    required
                    value={draft.criterio}
                  />
                </Field>
              </EditorSection>

              <EditorSection
                description="Notas internas para contextualizar o revisar el criterio."
                icon={<UserRound size={20} />}
                title="Observaciones"
                tone="amber"
              >
                <Field label="Observaciones internas">
                  <Textarea
                    className="min-h-28 resize-y"
                    disabled={isReadOnly}
                    onChange={(event) => setDraft((current) => ({ ...current, observaciones: event.target.value }))}
                    value={draft.observaciones}
                  />
                </Field>
              </EditorSection>
            </div>
          </div>

          <div className="border-t border-metro-border/80 pt-4">
            {saveError && (
              <p className="mb-3 w-full rounded-lg border border-metro-red/40 bg-metro-red/10 px-3 py-2 text-xs font-semibold text-metro-red">
                {saveError}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton disabled={!canSubmit} iconOnly={false} type="submit" variant="save">
                Guardar <kbd className="ml-1 text-[10px] opacity-70">Ctrl S</kbd>
              </ActionButton>
              <InlineSaveFeedback />
              <div className="flex-1" />
              <ActionButton iconOnly={false} onClick={() => void requestClose()} variant="secondary">
                Cancelar <kbd className="ml-1 text-[10px] opacity-70">Esc</kbd>
              </ActionButton>
              {!isCreate && criterio && (
                <ActionButton
                  disabled={isReadOnly}
                  iconOnly={false}
                  onClick={() => {
                    void (async () => {
                      setSaveError('');
                      const result = await removeCriterio(criterio.id, criterio.updatedAt);
                      if (!result.ok) {
                        setSaveError(result.message);
                        return;
                      }
                      clearRecoveryDraft();
                      onDone();
                    })();
                  }}
                  variant="delete"
                >
                  Eliminar
                </ActionButton>
              )}
            </div>
          </div>
        </form>
      </div>
      {recoveryDialogNode}
      {dialogNode}
    </ModalShell>
  );
}

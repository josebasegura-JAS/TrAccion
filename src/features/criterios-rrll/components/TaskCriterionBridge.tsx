import {
  CalendarDays,
  FileText,
  Link2,
  MessageSquareText,
  UserRound,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Field, Input, Select, Textarea } from '../../../components/ui/Field';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalDatabaseStatus } from '../../../components/ModalDatabaseStatus';
import { ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { InlineSaveFeedback } from '../../../components/InlineSaveFeedback';
import { useUnsavedChanges } from '../../../hooks/useUnsavedChanges';
import { useEditorShortcuts } from '../../../hooks/useEditorShortcuts';
import { navigateInApp } from '../../../services/appNavigationBus';
import {
  CRITERIO_RRLL_ESTADOS,
  CRITERIO_RRLL_SENTIDOS,
  type CriterioRrllDraft,
} from '../domain/criterioRrll';
import {
  getCriterionIdForTask,
  linkTaskToCriterion,
} from '../domain/taskCriterionLinks';
import {
  subscribeTaskCriterionEditor,
  type TaskCriterionEditorRequest,
} from '../domain/taskCriterionEditorBus';
import { useCriteriosRrllStore } from '../store/useCriteriosRrllStore';

const LazyCriterioRrllEditor = lazy(() =>
  import('./CriterioRrllEditor').then((module) => ({
    default: module.CriterioRrllEditor,
  })),
);

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

function TaskCriterionCreateEditor({
  request,
  onDone,
}: {
  request: Extract<TaskCriterionEditorRequest, { mode: 'create' }>;
  onDone: () => void;
}) {
  const createCriterio = useCriteriosRrllStore((state) => state.createWithConcurrencyCheck);
  const [draft, setDraft] = useState<CriterioRrllDraft>(request.draft);
  const [saveError, setSaveError] = useState('');
  const initialDraft = useMemo(() => request.draft, [request]);
  const canSubmit = draft.tema.trim().length > 0 && draft.criterio.trim().length > 0;
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setDraft(request.draft);
    setSaveError('');
  }, [request]);

  const { requestClose, dialogNode } = useUnsavedChanges({
    currentValue: draft,
    initialValue: initialDraft,
    enabled: true,
    onDiscard: onDone,
  });

  useEditorShortcuts({
    canSave: canSubmit,
    onClose: () => void requestClose(),
    onSave: () => formRef.current?.requestSubmit(),
  });

  return (
    <ModalShell
      labelledBy="task-criterion-create-title"
      maxWidthClassName="max-w-[1120px]"
      onClose={() => void requestClose()}
      panelClassName="bg-[linear-gradient(180deg,rgba(15,30,49,0.98),rgba(11,24,41,0.98))]"
    >
      <ModalHeader>
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-200">
            <FileText size={24} />
          </div>
          <ModalTitle
            id="task-criterion-create-title"
            subtitle="Alta iniciada desde una tarea. Revisa y completa los datos antes de guardar."
          >
            Nuevo criterio RRLL
          </ModalTitle>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ModalDatabaseStatus />
          <ModalCloseButton label="Cerrar editor" onClick={() => void requestClose()} />
        </div>
      </ModalHeader>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-400/20 bg-violet-500/[0.07] px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2 text-xs text-violet-100">
            <Link2 className="shrink-0 text-violet-300" size={15} />
            <span className="font-semibold">Creado desde tarea:</span>
            <span className="truncate text-metro-text">{request.taskTitle}</span>
          </div>
          <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold text-violet-200">
            La vinculación se crea al guardar
          </span>
        </div>

        <form
          ref={formRef}
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;

            void (async () => {
              setSaveError('');

              const existingCriterionId = getCriterionIdForTask(request.taskId);
              if (existingCriterionId) {
                setSaveError(
                  'Esta tarea ya tiene un criterio RRLL asociado. Cierra este alta y usa “Ver criterio RRLL”.',
                );
                return;
              }

              const result = await createCriterio(draft);
              if (!result.ok || !result.recordId) {
                setSaveError(result.message || 'No se ha podido crear el criterio.');
                return;
              }

              linkTaskToCriterion(request.taskId, result.recordId);
              onDone();
            })();
          }}
        >
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto pr-1 lg:grid-cols-2">
            <div className="space-y-4">
              <EditorSection
                description="El tema se propone desde el título de la tarea."
                icon={<FileText size={20} />}
                title="Información general"
              >
                <div className="space-y-4">
                  <Field label="Tema" required>
                    <Input
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, tema: event.target.value }))
                      }
                      required
                      value={draft.tema}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Estado">
                      <Select
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
                description="La fecha se propone automáticamente con la fecha del sistema."
                icon={<CalendarDays size={20} />}
                title="Fecha y gestión"
                tone="cyan"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Fecha">
                    <Input
                      dateTone="request"
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, fecha: event.target.value }))
                      }
                      type="date"
                      value={draft.fecha}
                    />
                  </Field>
                  <Field label="Responsable">
                    <Input
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, responsable: event.target.value }))
                      }
                      value={draft.responsable}
                    />
                  </Field>
                </div>
              </EditorSection>
            </div>

            <div className="space-y-4">
              <EditorSection
                description="La descripción de la tarea se propone como base del criterio."
                icon={<MessageSquareText size={20} />}
                title="Contenido del criterio"
                tone="violet"
              >
                <Field label="Criterio" required>
                  <Textarea
                    className="min-h-44 resize-y"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, criterio: event.target.value }))
                    }
                    required
                    value={draft.criterio}
                  />
                </Field>
              </EditorSection>

              <EditorSection
                description="Puedes completar aquí el contexto o referencia del asunto."
                icon={<UserRound size={20} />}
                title="Observaciones"
                tone="amber"
              >
                <Field label="Observaciones internas">
                  <Textarea
                    className="min-h-28 resize-y"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, observaciones: event.target.value }))
                    }
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
                Guardar criterio <kbd className="ml-1 text-[10px] opacity-70">Ctrl S</kbd>
              </ActionButton>
              <InlineSaveFeedback />
              <div className="flex-1" />
              <ActionButton
                iconOnly={false}
                onClick={() => void requestClose()}
                variant="secondary"
              >
                Cancelar <kbd className="ml-1 text-[10px] opacity-70">Esc</kbd>
              </ActionButton>
            </div>
          </div>
        </form>
      </div>
      {dialogNode}
    </ModalShell>
  );
}

export function TaskCriterionBridge() {
  const [request, setRequest] = useState<TaskCriterionEditorRequest | null>(null);
  const criterios = useCriteriosRrllStore((state) => state.criterios);
  const load = useCriteriosRrllStore((state) => state.load);

  useEffect(
    () =>
      subscribeTaskCriterionEditor((nextRequest) => {
        setRequest(nextRequest);
        if (nextRequest.mode === 'edit') {
          void load();
        }
      }),
    [load],
  );

  if (!request) {
    return null;
  }

  if (request.mode === 'create') {
    return <TaskCriterionCreateEditor onDone={() => setRequest(null)} request={request} />;
  }

  const criterio =
    criterios.find(
      (candidate) => candidate.id === request.criterioId && !candidate.deletedAt,
    ) ?? null;

  if (!criterio) {
    return (
      <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/55 p-6 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-2xl border border-metro-border bg-metro-panel p-5 shadow-2xl">
          <h2 className="text-base font-bold text-metro-text">Criterio RRLL no disponible</h2>
          <p className="mt-2 text-sm text-metro-muted">
            El criterio vinculado no se encuentra entre los registros activos. Puede haberse
            eliminado o todavía no haberse sincronizado.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <ActionButton
              iconOnly={false}
              onClick={() => {
                setRequest(null);
                navigateInApp({ view: 'tareas', recordId: request.taskId });
              }}
              variant="secondary"
            >
              Volver a la tarea
            </ActionButton>
            <ActionButton iconOnly={false} onClick={() => setRequest(null)} variant="secondary">
              Cerrar
            </ActionButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="pointer-events-none fixed left-1/2 top-3 z-[90] -translate-x-1/2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-violet-400/25 bg-[#14233a]/95 px-3 py-1.5 shadow-xl backdrop-blur">
          <Link2 className="text-violet-300" size={14} />
          <span className="max-w-[260px] truncate text-[11px] font-semibold text-violet-100">
            Vinculado a: {request.taskTitle}
          </span>
          <button
            className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-200 hover:bg-violet-500/20"
            onClick={() => {
              setRequest(null);
              navigateInApp({ view: 'tareas', recordId: request.taskId });
            }}
            type="button"
          >
            Ver tarea origen
          </button>
        </div>
      </div>
      <Suspense
        fallback={
          <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/45 backdrop-blur-sm">
            <div className="rounded-xl border border-metro-border bg-metro-panel px-4 py-3 text-sm font-semibold text-metro-text shadow-xl">
              Abriendo criterio RRLL…
            </div>
          </div>
        }
      >
        <LazyCriterioRrllEditor
          criterio={criterio}
          mode="edit"
          onDone={() => setRequest(null)}
        />
      </Suspense>
    </>
  );
}

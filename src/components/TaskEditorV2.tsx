import {
  CalendarDays,
  Eye,
  FileText,
  Info,
  LockKeyhole,
  Mail,
  MessageSquare,
  Paperclip,
  Search,
  UserRound,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActionButton } from './ui/ActionButton';
import { CountBadge } from './ui/CountBadge';
import { Input, Select, Textarea } from './ui/Field';
import { ModalCloseButton } from './ui/ModalCloseButton';
import { ModalHeader, ModalShell, ModalTitle } from './ui/ModalShell';
import { AuditHistoryButton } from '../shared/audit/AuditHistoryButton';
import { InlineSaveFeedback } from './InlineSaveFeedback';
import { ModalDatabaseStatus } from './ModalDatabaseStatus';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import { parseOutlookMsg } from '../features/especiales/domain/especiales';
import {
  EMPTY_TASK_DRAFT,
  TASK_PRIORITIES,
  TASK_STATES,
  TASK_TYPES,
  type Task,
  type TaskDocumentLink,
  type TaskDraft,
} from '../features/tareas/domain/task';
import { useTaskStore } from '../features/tareas/store/useTaskStore';
import { useEditorShortcuts } from '../hooks/useEditorShortcuts';
import { buildRecoverableDraftKey, useRecoverableDraft } from '../hooks/useRecoverableDraft';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { readStorageItem } from '../services/persistence';
import { useSharedRecordLock } from '../services/useSharedRecordLock';

const TRACKING_META_PREFIX = '[[traccion-seguimiento:';
const TRACKING_META_SUFFIX = ']]';

type TrackingMeta = { fecha: string; usuario: string };

function todayIsoDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function getActiveUser(): string {
  return readStorageItem('traccion.header.username')?.trim() || 'Usuario local';
}

function encodeTracking(text: string, date: string, user: string): string {
  const payload = JSON.stringify({ fecha: date || todayIsoDate(), usuario: user || 'Usuario local' });
  return `${TRACKING_META_PREFIX}${payload}${TRACKING_META_SUFFIX}\n${text.trim()}`;
}

function decodeTracking(text: string, fallbackDate: string): { text: string; date: string; user: string } {
  if (!text.startsWith(TRACKING_META_PREFIX)) {
    return { text, date: fallbackDate, user: '—' };
  }
  const end = text.indexOf(TRACKING_META_SUFFIX);
  if (end < 0) return { text, date: fallbackDate, user: '—' };
  const raw = text.slice(TRACKING_META_PREFIX.length, end);
  try {
    const parsed = JSON.parse(raw) as Partial<TrackingMeta>;
    return {
      text: text.slice(end + TRACKING_META_SUFFIX.length).replace(/^\s*\n?/, ''),
      date: parsed.fecha || fallbackDate,
      user: parsed.usuario || '—',
    };
  } catch {
    return { text, date: fallbackDate, user: '—' };
  }
}

function formatDate(value: string): string {
  if (!value) return '—';
  const normalized = value.length === 10 ? `${value}T00:00:00` : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('es-ES');
}

function getPathBaseName(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

function buildTaskDocumentLink(filePath: string): TaskDocumentLink {
  const route = filePath.trim();
  return {
    id: `task-doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    nombre: getPathBaseName(route),
    ruta: route,
    createdAt: new Date().toISOString(),
  };
}

function mergeDocumentLinks(current: TaskDocumentLink[], incoming: TaskDocumentLink[]): TaskDocumentLink[] {
  const routes = new Set(current.map((item) => item.ruta.trim().toLowerCase()));
  return [
    ...current,
    ...incoming.filter((item) => {
      const key = item.ruta.trim().toLowerCase();
      if (!key || routes.has(key)) return false;
      routes.add(key);
      return true;
    }),
  ];
}

function decodeHtmlEntities(value: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

function normalizeMailBodyAsPlainText(value: string): string {
  const source = /<[^>]+>/.test(value)
    ? value
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
    : value;
  return decodeHtmlEntities(source)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toDraft(task: Task | null): TaskDraft {
  if (!task) return { ...EMPTY_TASK_DRAFT, documentLinks: [] };
  return {
    titulo: task.titulo,
    descripcion: task.descripcion,
    tipo: task.tipo,
    fase: task.fase,
    estado: task.estado,
    prioridad: task.prioridad,
    createdAt: task.createdAt,
    fechaLimite: task.fechaLimite,
    responsable: task.responsable,
    origen: task.origen,
    sindicato: task.sindicato,
    observaciones: task.observaciones,
    mail: task.mail ?? '',
    documentLinks: Array.isArray(task.documentLinks) ? task.documentLinks : [],
  };
}

function Section({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: typeof FileText;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-sky-300/10 bg-[#0f2238]/85 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
      <div className="mb-2.5 flex min-w-0 items-center justify-between gap-3">
        <h4 className="inline-flex min-w-0 items-center gap-2 text-sm font-extrabold text-slate-100">
          <Icon className="shrink-0 text-sky-200" size={16} />
          <span className="truncate">{title}</span>
        </h4>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TaskEditor({
  task,
  mode,
  onDone,
}: {
  task: Task | null;
  mode: 'create' | 'edit';
  onDone: () => void;
}) {
  const taskPhases = useConfiguracionStore((state) => state.taskPhases);
  const taskOrigins = useConfiguracionStore((state) => state.taskOrigins);
  const loadConfiguracion = useConfiguracionStore((state) => state.load);
  const createTask = useTaskStore((state) => state.createWithConcurrencyCheck);
  const updateTask = useTaskStore((state) => state.updateWithConcurrencyCheck);
  const removeTask = useTaskStore((state) => state.removeWithConcurrencyCheck);

  const [draft, setDraft] = useState<TaskDraft>(() => toDraft(task));
  const [trackingText, setTrackingText] = useState('');
  const [trackingDate, setTrackingDate] = useState(todayIsoDate);
  const [trackingUser, setTrackingUser] = useState(getActiveUser);
  const [manualDocumentPath, setManualDocumentPath] = useState('');
  const [documentStatus, setDocumentStatus] = useState('');
  const [mailStatus, setMailStatus] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [saveStatusIsError, setSaveStatusIsError] = useState(false);
  const [loadedIdentity, setLoadedIdentity] = useState(() => `${mode}:${task?.id ?? 'new'}`);
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState(task?.updatedAt ?? null);

  const isCreate = mode === 'create';
  const recordLock = useSharedRecordLock({
    module: 'tareas',
    recordId: task?.id ?? null,
    enabled: mode === 'edit' && Boolean(task?.id),
  });
  const isFormReadOnly = !isCreate && (recordLock.isReadOnly || recordLock.status !== 'acquired');
  const lockMessage = recordLock.message || (!isCreate && recordLock.status !== 'acquired' ? 'Adquiriendo bloqueo de edición compartida...' : '');
  const canSubmit = draft.titulo.trim().length > 0 && !isFormReadOnly;
  const creationDate = isCreate
    ? todayIsoDate()
    : (draft.createdAt?.slice(0, 10) ?? task?.createdAt?.slice(0, 10) ?? todayIsoDate());

  useEffect(() => {
    loadConfiguracion();
  }, [loadConfiguracion]);

  useEffect(() => {
    let mounted = true;
    window.traccion?.getWindowsUser?.().then((value) => {
      if (mounted && value?.trim()) setTrackingUser(value.trim());
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const identity = `${mode}:${task?.id ?? 'new'}`;
    if (identity === loadedIdentity) return;
    setDraft(toDraft(task));
    setTrackingText('');
    setTrackingDate(todayIsoDate());
    setManualDocumentPath('');
    setDocumentStatus('');
    setMailStatus('');
    setSaveStatus('');
    setLoadedUpdatedAt(task?.updatedAt ?? null);
    setLoadedIdentity(identity);
  }, [loadedIdentity, mode, task]);

  const phaseOptions = useMemo(() => {
    const active = taskPhases.filter((item) => item.active).map((item) => item.nombre);
    return active.includes(draft.fase) ? active : [draft.fase, ...active].filter(Boolean);
  }, [draft.fase, taskPhases]);
  const originOptions = useMemo(() => {
    const active = taskOrigins.filter((item) => item.active).map((item) => item.nombre);
    return draft.sindicato && !active.includes(draft.sindicato) ? [draft.sindicato, ...active] : active;
  }, [draft.sindicato, taskOrigins]);

  const recoveryInitialValue = useMemo(
    () => ({ draft: toDraft(task), trackingText: '', trackingDate: todayIsoDate() }),
    [task],
  );
  const recoveryStorageKey = buildRecoverableDraftKey('tareas', task?.id ?? 'new');
  const { clearDraft: clearRecoveryDraft, dialogNode: recoveryDialogNode } = useRecoverableDraft({
    currentValue: { draft, trackingText, trackingDate },
    initialValue: recoveryInitialValue,
    enabled: !isFormReadOnly,
    onRecover: (value) => {
      setDraft(value.draft);
      setTrackingText(value.trackingText);
      setTrackingDate(value.trackingDate || todayIsoDate());
    },
    storageKey: recoveryStorageKey,
  });
  const { requestClose, dialogNode } = useUnsavedChanges({
    currentValue: { draft, trackingText, trackingDate },
    initialValue: recoveryInitialValue,
    enabled: !isFormReadOnly,
    onDiscard: () => {
      clearRecoveryDraft();
      onDone();
    },
  });

  const seguimientoForSave = trackingText.trim()
    ? encodeTracking(trackingText, trackingDate, trackingUser)
    : undefined;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaveStatus('');
    setSaveStatusIsError(false);

    if (isCreate) {
      const result = await createTask(draft, seguimientoForSave);
      if (!result.ok) {
        setSaveStatus(result.message);
        setSaveStatusIsError(true);
        return;
      }
      clearRecoveryDraft();
      onDone();
      return;
    }
    if (!task) return;

    const liveLock = await window.traccion?.getRecordLock?.({ module: 'tareas', recordId: task.id });
    if (!liveLock?.ok || liveLock.status !== 'acquired') {
      setSaveStatus(liveLock?.message || 'No se ha confirmado el bloqueo compartido de edición.');
      setSaveStatusIsError(true);
      return;
    }

    const result = await updateTask(task.id, draft, seguimientoForSave, loadedUpdatedAt);
    if (!result.ok) {
      setSaveStatus(result.message);
      setSaveStatusIsError(true);
      return;
    }
    clearRecoveryDraft();
    onDone();
  };

  useEditorShortcuts({
    canSave: canSubmit,
    onClose: () => void requestClose(),
    onSave: () => void handleSubmit(),
  });

  const handleAddDocument = () => {
    const route = manualDocumentPath.trim();
    if (!route) {
      setDocumentStatus('Indica una ruta antes de añadirla.');
      return;
    }
    setDraft((current) => ({ ...current, documentLinks: mergeDocumentLinks(current.documentLinks, [buildTaskDocumentLink(route)]) }));
    setManualDocumentPath('');
    setDocumentStatus('Ruta vinculada. Guarda la tarea para persistirla.');
  };

  const handleSelectDocument = async () => {
    const selector = window.traccion?.selectTaskDocument;
    if (!selector) {
      setDocumentStatus('Selector no disponible. Pega la ruta manualmente.');
      return;
    }
    const paths = await selector();
    if (!paths?.length) return;
    setDraft((current) => ({
      ...current,
      documentLinks: mergeDocumentLinks(current.documentLinks, paths.map(buildTaskDocumentLink)),
    }));
  };

  const handleImportMailFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.msg$/i.test(file.name)) {
      setMailStatus('Selecciona un archivo .msg de Outlook.');
      return;
    }
    setMailStatus('Leyendo mensaje Outlook...');
    const parsed = await parseOutlookMsg(file);
    if (!parsed.ok || !parsed.data) {
      setMailStatus(parsed.message || 'No se ha podido leer el mensaje.');
      return;
    }
    const parsedMailData = parsed.data;
    setDraft((current) => ({ ...current, mail: normalizeMailBodyAsPlainText(parsedMailData.body) }));
    setMailStatus('Texto del mensaje copiado al campo Email.');
  };

  const trackingItems = task?.seguimiento ?? [];

  return (
    <>
      <ModalShell
        blockEditorShortcuts={false}
        labelledBy="task-editor-title"
        maxWidthClassName="max-w-[1080px]"
        onClose={() => void requestClose()}
        panelClassName="bg-[#0b1a2c]"
      >
        <ModalHeader>
          <ModalTitle
            id="task-editor-title"
            subtitle={isCreate ? 'Alta de nueva tarea' : `Editando tarea ${task?.id ?? '—'}`}
          >
            {isCreate ? 'Nueva tarea' : task?.titulo || 'Tarea'}
          </ModalTitle>
          <div className="flex shrink-0 items-center gap-2">
            <ModalDatabaseStatus />
            <ModalCloseButton label="Cerrar editor" onClick={() => void requestClose()} />
          </div>
        </ModalHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); void handleSubmit(); }}>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {lockMessage && (
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${isFormReadOnly ? 'border-red-400/30 bg-red-950/20 text-red-200' : 'border-amber-400/30 bg-amber-950/20 text-amber-200'}`}>
                <LockKeyhole size={15} />
                <span>{lockMessage}</span>
              </div>
            )}

            <fieldset disabled={isFormReadOnly} className="space-y-3 disabled:opacity-70">
              <Section icon={FileText} title="Datos de la tarea">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-12">
                  <label className="text-xs font-semibold text-metro-muted lg:col-span-3">Tipo
                    <Select value={draft.tipo} onChange={(e) => setDraft((c) => ({ ...c, tipo: e.target.value as TaskDraft['tipo'] }))}>{TASK_TYPES.map((v) => <option key={v}>{v}</option>)}</Select>
                  </label>
                  <label className="text-xs font-semibold text-metro-muted lg:col-span-3">Fase
                    <Select value={draft.fase} onChange={(e) => setDraft((c) => ({ ...c, fase: e.target.value }))}>{phaseOptions.map((v) => <option key={v}>{v}</option>)}</Select>
                  </label>
                  <label className="text-xs font-semibold text-metro-muted lg:col-span-6">Título <span className="text-metro-red">*</span>
                    <Input required value={draft.titulo} onChange={(e) => setDraft((c) => ({ ...c, titulo: e.target.value }))} />
                  </label>

                  <label className="text-xs font-semibold text-metro-muted lg:col-span-4">Responsable
                    <Input value={draft.responsable} onChange={(e) => setDraft((c) => ({ ...c, responsable: e.target.value }))} />
                  </label>
                  <label className="text-xs font-semibold text-metro-muted lg:col-span-4">Detalle origen / solicitante
                    <Input value={draft.origen} onChange={(e) => setDraft((c) => ({ ...c, origen: e.target.value }))} />
                  </label>
                  <label className="text-xs font-semibold text-metro-muted lg:col-span-2">Fecha de creación
                    <Input
                      type="date"
                      value={creationDate}
                      disabled={isCreate}
                      onChange={(e) => {
                        const original = task?.createdAt ?? '';
                        const suffix = original.length > 10 ? original.slice(10) : 'T00:00:00.000Z';
                        setDraft((current) => ({
                          ...current,
                          createdAt: `${e.target.value}${suffix}`,
                        }));
                      }}
                    />
                  </label>
                  <label className="text-xs font-semibold text-metro-muted lg:col-span-2">Fecha límite
                    <Input type="date" value={draft.fechaLimite} onChange={(e) => setDraft((c) => ({ ...c, fechaLimite: e.target.value }))} />
                  </label>

                  <label className="text-xs font-semibold text-metro-muted lg:col-span-3">Origen
                    <Select value={draft.sindicato} onChange={(e) => setDraft((c) => ({ ...c, sindicato: e.target.value }))}>
                      <option value="">Sin origen</option>{originOptions.map((v) => <option key={v}>{v}</option>)}
                    </Select>
                  </label>
                  <label className="text-xs font-semibold text-metro-muted lg:col-span-3">Estado
                    <Select value={draft.estado} onChange={(e) => setDraft((c) => ({ ...c, estado: e.target.value as TaskDraft['estado'] }))}>{TASK_STATES.map((v) => <option key={v}>{v}</option>)}</Select>
                  </label>
                  <label className="text-xs font-semibold text-metro-muted lg:col-span-3">Prioridad
                    <Select value={draft.prioridad} onChange={(e) => setDraft((c) => ({ ...c, prioridad: e.target.value as TaskDraft['prioridad'] }))}>{TASK_PRIORITIES.map((v) => <option key={v}>{v}</option>)}</Select>
                  </label>
                </div>
              </Section>

              <Section icon={FileText} title="Descripción">
                <Textarea className="min-h-20" value={draft.descripcion} onChange={(e) => setDraft((c) => ({ ...c, descripcion: e.target.value }))} />
              </Section>

              <Section
                icon={MessageSquare}
                title="Seguimiento"
                action={<CountBadge tone="muted">{trackingItems.length} seguimientos</CountBadge>}
              >
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-[180px_180px_minmax(0,1fr)]">
                  <label className="text-xs font-semibold text-metro-muted">Fecha del cambio
                    <Input type="date" value={trackingDate} onChange={(e) => setTrackingDate(e.target.value)} />
                  </label>
                  <label className="text-xs font-semibold text-metro-muted">Usuario
                    <div className="mt-1 flex h-9 items-center gap-2 rounded-lg border border-metro-border bg-metro-panel px-3 text-sm font-semibold text-slate-200">
                      <UserRound size={14} className="text-sky-200" />{trackingUser}
                    </div>
                  </label>
                  <div className="flex items-end pb-1 text-[11px] font-medium text-slate-400">
                    <Info className="mr-1.5 shrink-0 text-sky-300" size={14} />
                    La fecha se propone con la del sistema, pero puedes corregirla antes de guardar.
                  </div>
                </div>
                <label className="mt-2 block text-xs font-semibold text-metro-muted">Registrar seguimiento
                  <Textarea className="min-h-20" placeholder="Escribe aquí el seguimiento de la tarea..." value={trackingText} onChange={(e) => setTrackingText(e.target.value)} />
                </label>
                {trackingText.trim() && <p className="mt-1 text-[11px] font-semibold text-sky-300">Este seguimiento se añadirá al pulsar Guardar.</p>}

                {trackingItems.length > 0 && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-sky-300/10 bg-[#0a1b2e]/70">
                    {trackingItems.map((entry, index) => {
                      const decoded = decodeTracking(entry.texto, entry.fechaHora);
                      return (
                        <article className="grid grid-cols-[110px_125px_minmax(0,1fr)] gap-3 border-b border-sky-300/10 px-3 py-2 last:border-b-0" key={`${entry.fechaHora}-${index}`}>
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-200"><CalendarDays size={13} className="text-sky-300" />{formatDate(decoded.date)}</div>
                          <div className="flex items-center gap-2 truncate text-xs font-semibold text-slate-300"><UserRound size={13} className="text-sky-300" /><span className="truncate">{decoded.user}</span></div>
                          <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{decoded.text}</p>
                        </article>
                      );
                    })}
                  </div>
                )}
              </Section>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <Section icon={Paperclip} title="Documentos vinculados">
                  <div className="flex gap-2">
                    <Input className="min-w-0 flex-1" placeholder="Pegar ruta de red o local..." value={manualDocumentPath} onChange={(e) => setManualDocumentPath(e.target.value)} />
                    <button aria-label="Buscar documento" className="rounded-lg border border-metro-border px-3 text-metro-muted hover:text-white" onClick={() => void handleSelectDocument()} type="button"><Search size={16} /></button>
                    <ActionButton iconOnly={false} onClick={handleAddDocument} size="sm" variant="add">Añadir ruta</ActionButton>
                  </div>
                  {draft.documentLinks.length > 0 && <div className="mt-2 space-y-1">{draft.documentLinks.map((link) => (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-metro-border bg-metro-panel px-2 py-1.5" key={link.id}>
                      <span className="min-w-0 truncate text-xs font-semibold text-slate-300" title={link.ruta}>{link.nombre}</span>
                      <div className="flex gap-1">
                        <button className="p-1.5 text-metro-muted hover:text-white" onClick={() => void window.traccion?.openTaskDocument?.(link.ruta)} type="button"><Eye size={14} /></button>
                        <ActionButton onClick={() => setDraft((c) => ({ ...c, documentLinks: c.documentLinks.filter((item) => item.id !== link.id) }))} size="sm" variant="delete" />
                      </div>
                    </div>
                  ))}</div>}
                  {documentStatus && <p className="mt-2 text-[11px] font-semibold text-metro-muted">{documentStatus}</p>}
                </Section>

                <Section
                  icon={Mail}
                  title="Email"
                  action={<label className="cursor-pointer rounded-md border border-metro-border px-2 py-1 text-[11px] font-semibold text-slate-300 hover:border-metro-red">Seleccionar mensaje .msg<input accept=".msg" className="sr-only" type="file" onChange={(e) => void handleImportMailFile(e.target.files?.[0])} /></label>}
                >
                  <Textarea className="min-h-28" placeholder="Texto plano del email vinculado..." value={draft.mail} onChange={(e) => setDraft((c) => ({ ...c, mail: e.target.value }))} />
                  {mailStatus && <p className="mt-2 text-[11px] font-semibold text-metro-muted">{mailStatus}</p>}
                </Section>
              </div>

              <Section icon={FileText} title="Observaciones">
                <Textarea className="min-h-16" value={draft.observaciones} onChange={(e) => setDraft((c) => ({ ...c, observaciones: e.target.value }))} />
              </Section>
            </fieldset>
          </div>

          <div className="shrink-0 border-t border-sky-300/10 bg-[#0c1b2e]/95 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton disabled={!canSubmit} iconOnly={false} type="submit" variant="save">Guardar <kbd className="ml-1 text-[10px] opacity-70">Ctrl S</kbd></ActionButton>
              <InlineSaveFeedback />
              {!isCreate && task && <AuditHistoryButton entityId={task.id} entityTitle={task.titulo || 'Tarea sin título'} module="tareas" />}
              {!isCreate && task && (
                <ActionButton disabled={isFormReadOnly} iconOnly={false} variant="delete" onClick={() => void (async () => {
                  const result = await removeTask(task.id, loadedUpdatedAt);
                  if (!result.ok) { setSaveStatus(result.message); setSaveStatusIsError(true); return; }
                  clearRecoveryDraft(); onDone();
                })()}>Eliminar</ActionButton>
              )}
              <button className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-muted hover:text-white" onClick={() => void requestClose()} type="button">Cancelar <kbd className="ml-1 text-[10px] opacity-70">Esc</kbd></button>
              {saveStatus && <p className={`ml-auto text-xs font-semibold ${saveStatusIsError ? 'text-red-300' : 'text-slate-400'}`}>{saveStatus}</p>}
            </div>
          </div>
        </form>
      </ModalShell>
      {dialogNode}
      {recoveryDialogNode}
    </>
  );
}

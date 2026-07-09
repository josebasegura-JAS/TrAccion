import { Eye, LockKeyhole, Mail, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import {
  EMPTY_TASK_DRAFT,
  TASK_PRIORITIES,
  TASK_STATES,
  TASK_TYPES,
  type Task,
  type TaskDraft,
  type TaskDraftField,
  type TaskDocumentLink,
} from '../features/tareas/domain/task';
import { parseOutlookMsg } from '../features/especiales/domain/especiales';
import { useTaskStore } from '../features/tareas/store/useTaskStore';
import { useSharedRecordLock } from '../services/useSharedRecordLock';
import { InlineSaveFeedback } from './InlineSaveFeedback';
import { ModalDatabaseStatus } from './ModalDatabaseStatus';
import { AuditHistoryButton } from '../shared/audit/AuditHistoryButton';

type TaskTextDraftField = Exclude<TaskDraftField, 'documentLinks'>;

const taskTextFields: Array<{
  field: TaskTextDraftField;
  label: string;
  required?: boolean;
  type?: string;
  className: string;
}> = [
  {
    field: 'titulo',
    label: 'Título',
    required: true,
    className: 'sm:col-span-3 lg:col-span-6',
  },
  { field: 'responsable', label: 'Responsable', className: 'sm:col-span-3 lg:col-span-6' },
  {
    field: 'origen',
    label: 'Detalle origen / solicitante',
    className: 'sm:col-span-4 lg:col-span-4',
  },
  {
    field: 'fechaLimite',
    label: 'Fecha límite',
    type: 'date',
    className: 'sm:col-span-2 lg:col-span-2',
  },
];

function getPathBaseName(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

function buildTaskDocumentLink(filePath: string): TaskDocumentLink {
  const trimmedPath = filePath.trim();
  return {
    id: `task-doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    nombre: getPathBaseName(trimmedPath),
    ruta: trimmedPath,
    createdAt: new Date().toISOString(),
  };
}

function mergeDocumentLinks(
  currentLinks: TaskDocumentLink[],
  nextLinks: TaskDocumentLink[],
): TaskDocumentLink[] {
  const seenRoutes = new Set(currentLinks.map((link) => link.ruta.trim().toLowerCase()));
  const dedupedNextLinks = nextLinks.filter((link) => {
    const routeKey = link.ruta.trim().toLowerCase();
    if (!routeKey || seenRoutes.has(routeKey)) {
      return false;
    }
    seenRoutes.add(routeKey);
    return true;
  });

  return [...currentLinks, ...dedupedNextLinks];
}

function decodeHtmlEntities(value: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

function stripHtmlToPlainText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>(?=\s*)/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );
}

function normalizeMailBodyAsPlainText(value: string): string {
  const withoutHtml = /<[^>]+>/.test(value) ? stripHtmlToPlainText(value) : decodeHtmlEntities(value);

  return withoutHtml
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatMailFromMsg(data: {
  body: string;
}): string {
  return normalizeMailBodyAsPlainText(data.body);
}

function formatSessionModuleLabel(sessionModule: string): string {
  if (sessionModule === 'comite') {
    return 'Comité de Empresa';
  }

  if (sessionModule === 'paritaria') {
    return 'Comisión Paritaria';
  }

  return sessionModule || 'Sesión';
}

function formatTaskSessionDate(sessionDate: string): string {
  if (!sessionDate) {
    return '';
  }

  const parsedDate = new Date(`${sessionDate}T00:00:00`);
  return Number.isNaN(parsedDate.getTime()) ? sessionDate : parsedDate.toLocaleDateString('es-ES');
}

function formatUpdateDate(fechaHora: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(fechaHora));
}

function toDraft(task: Task | null): TaskDraft {
  if (!task) {
    return { ...EMPTY_TASK_DRAFT };
  }

  return {
    titulo: task.titulo,
    descripcion: task.descripcion,
    tipo: task.tipo,
    fase: task.fase,
    estado: task.estado,
    prioridad: task.prioridad,
    fechaLimite: task.fechaLimite,
    responsable: task.responsable,
    origen: task.origen,
    sindicato: task.sindicato,
    observaciones: task.observaciones,
    mail: task.mail ?? '',
    documentLinks: Array.isArray(task.documentLinks) ? task.documentLinks : [],
  };
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
  const createTaskWithConcurrencyCheck = useTaskStore((state) => state.createWithConcurrencyCheck);
  const updateTaskWithConcurrencyCheck = useTaskStore(
    (state) => state.updateWithConcurrencyCheck,
  );
  const removeTaskWithConcurrencyCheck = useTaskStore((state) => state.removeWithConcurrencyCheck);
  const [draft, setDraft] = useState<TaskDraft>(() => toDraft(task));
  const [newUpdateText, setNewUpdateText] = useState('');
  const [manualDocumentPath, setManualDocumentPath] = useState('');
  const [documentStatus, setDocumentStatus] = useState('');
  const [documentStatusIsError, setDocumentStatusIsError] = useState(false);
  const [mailStatus, setMailStatus] = useState('');
  const [mailStatusIsError, setMailStatusIsError] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [saveStatusIsError, setSaveStatusIsError] = useState(false);
  const [loadedTaskIdentity, setLoadedTaskIdentity] = useState(
    () => `${mode}:${task?.id ?? 'new'}`,
  );
  const [loadedTaskUpdatedAt, setLoadedTaskUpdatedAt] = useState(task?.updatedAt ?? null);
  const [externalUpdateIgnoredAt, setExternalUpdateIgnoredAt] = useState<string | null>(null);
  const recordLock = useSharedRecordLock({
    module: 'tareas',
    recordId: task?.id ?? null,
    enabled: mode === 'edit' && Boolean(task?.id),
  });

  useEffect(() => {
    loadConfiguracion();
  }, [loadConfiguracion]);

  useEffect(() => {
    const nextIdentity = `${mode}:${task?.id ?? 'new'}`;
    if (nextIdentity !== loadedTaskIdentity) {
      setDraft(toDraft(task));
      setNewUpdateText('');
      setManualDocumentPath('');
      setDocumentStatus('');
      setMailStatus('');
      setSaveStatus('');
      setSaveStatusIsError(false);
      setLoadedTaskIdentity(nextIdentity);
      setLoadedTaskUpdatedAt(task?.updatedAt ?? null);
      setExternalUpdateIgnoredAt(null);
    }
  }, [loadedTaskIdentity, mode, task]);

  const phaseOptions = useMemo(() => {
    const activePhaseNames = taskPhases
      .filter((phase) => phase.active)
      .map((phase) => phase.nombre);
    return activePhaseNames.includes(draft.fase)
      ? activePhaseNames
      : [draft.fase, ...activePhaseNames];
  }, [draft.fase, taskPhases]);

  const originOptions = useMemo(() => {
    const activeOriginNames = taskOrigins
      .filter((origin) => origin.active)
      .map((origin) => origin.nombre);
    return draft.sindicato && !activeOriginNames.includes(draft.sindicato)
      ? [draft.sindicato, ...activeOriginNames]
      : activeOriginNames;
  }, [draft.sindicato, taskOrigins]);

  const isCreate = mode === 'create';
  const isEditWithoutAcquiredLock = !isCreate && recordLock.status !== 'acquired';
  const isFormReadOnly = recordLock.isReadOnly || isEditWithoutAcquiredLock;
  const lockMessage =
    recordLock.message ||
    (isEditWithoutAcquiredLock ? 'Adquiriendo bloqueo de edición compartida...' : '');
  const isWaitingForSharedDatabase = lockMessage.startsWith('Esperando base compartida');
  const shouldShowReadOnlyBadge = isFormReadOnly && !isWaitingForSharedDatabase;
  const canSubmit = draft.titulo.trim().length > 0 && !isFormReadOnly;

  const handleSubmit = async () => {
    if (!canSubmit || isFormReadOnly) {
      return;
    }

    setSaveStatus('');
    setSaveStatusIsError(false);

    if (isCreate) {
      const result = await createTaskWithConcurrencyCheck(draft, newUpdateText);
      if (!result.ok) {
        setSaveStatus(result.message);
        setSaveStatusIsError(true);
        return;
      }
      onDone();
      return;
    }

    if (!task) {
      return;
    }

    if (recordLock.status !== 'acquired') {
      setSaveStatus('No se puede guardar: la tarea no tiene bloqueo de edición activo.');
      setSaveStatusIsError(true);
      return;
    }

    const liveLock = await window.traccion?.getRecordLock?.({ module: 'tareas', recordId: task.id });
    if (!liveLock || liveLock.status !== 'acquired' || !liveLock.ok) {
      setSaveStatus(
        liveLock?.message
          ? `${liveLock.message} Abre la tarea en solo lectura y espera a que el otro usuario cierre la ventana.`
          : 'No se puede guardar: no se ha confirmado el bloqueo compartido de edición.',
      );
      setSaveStatusIsError(true);
      return;
    }

    try {
      const result = await updateTaskWithConcurrencyCheck(
        task.id,
        draft,
        newUpdateText,
        loadedTaskUpdatedAt,
      );

      if (!result.ok) {
        setSaveStatus(result.message);
        setSaveStatusIsError(true);
        return;
      }

      onDone();
    } catch (error) {
      setSaveStatus(
        error instanceof Error
          ? error.message
          : 'No se ha podido validar la tarea contra la base de datos compartida.',
      );
      setSaveStatusIsError(true);
    }
  };

  const handleAddManualDocumentPath = () => {
    if (isFormReadOnly) {
      return;
    }

    const trimmedPath = manualDocumentPath.trim();
    if (!trimmedPath) {
      setDocumentStatus('Indica una ruta de documento antes de añadirla.');
      setDocumentStatusIsError(true);
      return;
    }

    setDraft((current) => ({
      ...current,
      documentLinks: mergeDocumentLinks(current.documentLinks, [
        buildTaskDocumentLink(trimmedPath),
      ]),
    }));
    setManualDocumentPath('');
    setDocumentStatus('Ruta vinculada a la tarea.');
    setDocumentStatusIsError(false);
  };

  const handleSelectDocumentPath = async () => {
    if (isFormReadOnly) {
      return;
    }

    const selector = window.traccion?.selectTaskDocument;
    if (!selector) {
      setDocumentStatus('Selector de documentos no disponible. Pega la ruta manualmente.');
      setDocumentStatusIsError(true);
      return;
    }

    try {
      const selectedPaths = await selector();
      if (!selectedPaths?.length) {
        return;
      }

      setDraft((current) => ({
        ...current,
        documentLinks: mergeDocumentLinks(
          current.documentLinks,
          selectedPaths.map(buildTaskDocumentLink),
        ),
      }));
      setDocumentStatus(`${selectedPaths.length} vínculo(s) añadido(s).`);
      setDocumentStatusIsError(false);
    } catch (error) {
      setDocumentStatus(
        error instanceof Error ? error.message : 'No se ha podido seleccionar el documento.',
      );
      setDocumentStatusIsError(true);
    }
  };

  const handleOpenDocumentPath = async (filePath: string) => {
    const opener = window.traccion?.openTaskDocument;
    if (!opener) {
      setDocumentStatus('Apertura de documentos no disponible en este entorno.');
      setDocumentStatusIsError(true);
      return;
    }

    const result = await opener(filePath);
    setDocumentStatus(result.message);
    setDocumentStatusIsError(!result.ok);
  };

  const handleRemoveDocumentLink = (linkId: string) => {
    if (isFormReadOnly) {
      return;
    }

    setDraft((current) => ({
      ...current,
      documentLinks: current.documentLinks.filter((link) => link.id !== linkId),
    }));
    setDocumentStatus('Vínculo eliminado. Guarda la tarea para persistir el cambio.');
    setDocumentStatusIsError(false);
  };

  const handleImportMailFile = async (file: File | undefined) => {
    if (isFormReadOnly) {
      return;
    }

    if (!file) {
      return;
    }
    if (!/\.msg$/i.test(file.name)) {
      setMailStatus('Selecciona o arrastra un archivo .msg de Outlook.');
      setMailStatusIsError(true);
      return;
    }

    setMailStatus('Leyendo mensaje Outlook...');
    setMailStatusIsError(false);
    const parsed = await parseOutlookMsg(file);
    const parsedMailData = parsed.data;
    if (!parsed.ok || !parsedMailData) {
      setMailStatus(parsed.message || 'No se ha podido leer el mensaje Outlook.');
      setMailStatusIsError(true);
      return;
    }

    setDraft((current) => ({
      ...current,
      mail: formatMailFromMsg(parsedMailData),
    }));
    setMailStatus('Texto del mensaje copiado al campo Email.');
    setMailStatusIsError(false);
  };

  const externalTaskUpdatedAt = !isCreate ? (task?.updatedAt ?? null) : null;
  const hasExternalTaskUpdate =
    !isCreate &&
    Boolean(externalTaskUpdatedAt) &&
    Boolean(loadedTaskUpdatedAt) &&
    externalTaskUpdatedAt !== loadedTaskUpdatedAt &&
    externalTaskUpdatedAt !== externalUpdateIgnoredAt;

  const handleReloadExternalTask = () => {
    if (!task) {
      return;
    }

    setDraft(toDraft(task));
    setNewUpdateText('');
    setLoadedTaskUpdatedAt(task.updatedAt ?? null);
    setExternalUpdateIgnoredAt(null);
    setSaveStatus('Versión compartida recargada en el formulario.');
    setSaveStatusIsError(false);
  };

  const handleIgnoreExternalTask = () => {
    setExternalUpdateIgnoredAt(externalTaskUpdatedAt);
    setSaveStatus('Cambio externo ignorado temporalmente. Al guardar se validará contra SQLite.');
    setSaveStatusIsError(false);
  };
  const linkedSessionText = task?.sessionDocumentCode
    ? [
        formatSessionModuleLabel(task.sessionModule),
        task.sessionDocumentCode,
        formatTaskSessionDate(task.sessionDate),
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <aside
        aria-labelledby="task-editor-title"
        aria-modal="true"
        className="flex max-h-[calc(100vh-1rem)] w-[min(1040px,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-panel p-3 shadow-2xl"
        role="dialog"
      >
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-metro-border bg-metro-surface px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-metro-red">
              {isCreate ? 'Nueva tarea' : 'Editar tarea'}
            </p>
            <h3 className="mt-1 truncate text-base font-bold text-metro-text" id="task-editor-title">
              {isCreate ? 'Nueva tarea' : task?.titulo || 'Sin selección'}
            </h3>
            <p className="text-xs text-metro-muted">
              {isCreate
                ? 'Alta manual compacta para tarea interna o sindical.'
                : `Editando tarea ${task?.id ?? '—'}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ModalDatabaseStatus />
          <button
            aria-label="Cerrar editor"
            className="rounded-lg border border-metro-border bg-metro-surface p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={onDone}
            type="button"
          >
            <X size={16} />
          </button>
          </div>
        </div>

        {lockMessage && (
          <div
            className={`mb-3 flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
              isFormReadOnly && !isWaitingForSharedDatabase
                ? 'border-red-400/40 bg-red-950/30 text-red-200'
                : 'border-amber-400/30 bg-amber-950/20 text-amber-200'
            }`}
          >
            <LockKeyhole className="shrink-0 opacity-70" size={15} />
            <span className="text-xs font-semibold">{lockMessage}</span>
            {shouldShowReadOnlyBadge && (
              <span className="ml-auto shrink-0 rounded-md border border-red-400/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300">
                Solo lectura
              </span>
            )}
          </div>
        )}

        {hasExternalTaskUpdate && (
          <div className="mb-3 rounded-lg border border-amber-400/40 bg-amber-950/20 px-3 py-2 text-xs font-semibold text-amber-100">
            <p>
              ⚠️ Este registro fue modificado por otro usuario. Recarga la versión compartida antes
              de seguir, o ignora el aviso si quieres revisar tus cambios locales.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="rounded-md border border-amber-300/40 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-50 hover:bg-amber-400/10"
                onClick={handleReloadExternalTask}
                type="button"
              >
                Recargar
              </button>
              <button
                className="rounded-md border border-amber-300/20 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-100 hover:bg-amber-400/10"
                onClick={handleIgnoreExternalTask}
                type="button"
              >
                Ignorar
              </button>
            </div>
          </div>
        )}

        {linkedSessionText && (
          <div className="mb-3 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-muted">
            Código documental de sesión:{' '}
            <span className="text-metro-text">{linkedSessionText}</span>
          </div>
        )}

        <form
          className="flex min-h-0 flex-1 flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <fieldset
            className="grid min-h-0 max-h-[calc(100vh-14rem)] grid-cols-1 gap-2 overflow-y-auto overscroll-contain pr-2 disabled:opacity-70 sm:grid-cols-6 lg:grid-cols-12"
            disabled={isFormReadOnly}
          >
            <label className="text-xs font-semibold text-metro-muted sm:col-span-2 lg:col-span-2">
              Tipo
              <select
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    tipo: event.target.value as TaskDraft['tipo'],
                  }))
                }
                value={draft.tipo}
              >
                {TASK_TYPES.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-metro-muted sm:col-span-2 lg:col-span-2">
              Fase
              <select
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, fase: event.target.value }))
                }
                value={draft.fase}
              >
                {phaseOptions.map((fase) => (
                  <option key={fase} value={fase}>
                    {fase}
                  </option>
                ))}
              </select>
            </label>
            {taskTextFields.map(({ field, label, required, type, className }) => (
              <label className={`text-xs font-semibold text-metro-muted ${className}`} key={field}>
                {label}
                <input
                  className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [field]: event.target.value }))
                  }
                  required={required}
                  type={type ?? 'text'}
                  value={draft[field]}
                />
              </label>
            ))}
            <label className="text-xs font-semibold text-metro-muted sm:col-span-2 lg:col-span-2">
              Origen
              <select
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, sindicato: event.target.value }))
                }
                value={draft.sindicato}
              >
                <option value="">Sin origen</option>
                {originOptions.map((origin) => (
                  <option key={origin} value={origin}>
                    {origin}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-metro-muted sm:col-span-2 lg:col-span-2">
              Estado
              <select
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    estado: event.target.value as TaskDraft['estado'],
                  }))
                }
                value={draft.estado}
              >
                {TASK_STATES.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-metro-muted sm:col-span-2 lg:col-span-2">
              Prioridad
              <select
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    prioridad: event.target.value as TaskDraft['prioridad'],
                  }))
                }
                value={draft.prioridad}
              >
                {TASK_PRIORITIES.map((prioridad) => (
                  <option key={prioridad} value={prioridad}>
                    {prioridad}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-metro-muted sm:col-span-6 lg:col-span-12">
              Descripción
              <textarea
                className="mt-1 min-h-20 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, descripcion: event.target.value }))
                }
                value={draft.descripcion}
              />
            </label>

            <section className="rounded-xl border border-metro-border bg-metro-surface p-3 sm:col-span-6 lg:col-span-12">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-metro-text">Documentos vinculados</h4>
                <p className="text-xs font-semibold text-metro-muted">
                  Guarda solo la ruta; el documento permanece en la carpeta de red.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) => setManualDocumentPath(event.target.value)}
                  placeholder="Pegar ruta de red o local..."
                  value={manualDocumentPath}
                />
                <button
                  aria-label="Buscar documento en carpetas"
                  className="inline-flex items-center justify-center rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void handleSelectDocumentPath()}
                  title="Buscar documento"
                  type="button"
                >
                  <Search size={16} />
                </button>
                <button
                  className="rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-semibold text-metro-text hover:border-metro-red"
                  onClick={handleAddManualDocumentPath}
                  type="button"
                >
                  Añadir ruta
                </button>
              </div>
              {draft.documentLinks.length > 0 && (
                <div className="mt-3 space-y-2">
                  {draft.documentLinks.map((link) => (
                    <article
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-metro-border bg-metro-panel px-3 py-2"
                      key={link.id}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-metro-text">{link.nombre}</p>
                        <p className="truncate text-xs text-metro-muted" title={link.ruta}>
                          {link.ruta}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          aria-label={`Abrir ${link.nombre}`}
                          className="rounded-lg border border-metro-border bg-metro-surface p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
                          onClick={() => void handleOpenDocumentPath(link.ruta)}
                          type="button"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          aria-label={`Eliminar vínculo ${link.nombre}`}
                          className="rounded-lg border border-metro-border bg-metro-surface p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
                          onClick={() => handleRemoveDocumentLink(link.id)}
                          type="button"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {documentStatus && (
                <p
                  className={`mt-2 text-xs font-semibold ${
                    documentStatusIsError ? 'text-metro-red' : 'text-metro-muted'
                  }`}
                >
                  {documentStatus}
                </p>
              )}
            </section>

            <section className="rounded-xl border border-metro-border bg-metro-surface p-3 sm:col-span-6 lg:col-span-12">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="inline-flex items-center gap-2 text-sm font-bold text-metro-text">
                  <Mail size={15} />
                  Email
                </h4>
                <label className="cursor-pointer rounded-lg border border-metro-border bg-metro-surface px-2 py-1 text-xs font-semibold text-metro-text hover:border-metro-red">
                  Seleccionar mensaje .msg
                  <input
                    accept=".msg"
                    className="sr-only"
                    disabled={isFormReadOnly}
                    onChange={(event) => void handleImportMailFile(event.target.files?.[0])}
                    type="file"
                  />
                </label>
              </div>
              <div
                className="rounded-xl border border-dashed border-metro-border bg-metro-panel p-3"
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleImportMailFile(
                    Array.from(event.dataTransfer.files).find((file) => /\.msg$/i.test(file.name)),
                  );
                }}
              >
                <p className="mb-2 text-xs font-semibold text-metro-muted">
                  Arrastra aquí un mensaje .msg de Outlook. Se copiará solo el texto plano del cuerpo
                  al campo Email.
                </p>
                <textarea
                  className="min-h-32 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, mail: event.target.value }))
                  }
                  placeholder="Texto plano del email vinculado..."
                  value={draft.mail}
                />
              </div>
              {mailStatus && (
                <p
                  className={`mt-2 text-xs font-semibold ${
                    mailStatusIsError ? 'text-metro-red' : 'text-metro-muted'
                  }`}
                >
                  {mailStatus}
                </p>
              )}
            </section>

            <section className="rounded-xl border border-metro-border bg-metro-surface p-3 sm:col-span-6 lg:col-span-12">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-metro-text">Seguimiento</h4>
                {!isCreate && task && (
                  <span className="rounded-full bg-metro-surface px-2 py-1 text-xs font-semibold text-metro-muted">
                    {task.seguimiento.length} seguimientos
                  </span>
                )}
              </div>
              <label className="text-xs font-semibold text-metro-muted">
                Añadir seguimiento
                <textarea
                  className="mt-1 min-h-20 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) => setNewUpdateText(event.target.value)}
                  placeholder="Registrar trabajo realizado..."
                  value={newUpdateText}
                />
              </label>
              {!isCreate && task && task.seguimiento.length > 0 && (
                <div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
                  {task.seguimiento.map((seguimiento) => (
                    <article
                      className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2"
                      key={`${seguimiento.fechaHora}-${seguimiento.texto}`}
                    >
                      <time
                        className="text-xs font-bold text-metro-text"
                        dateTime={seguimiento.fechaHora}
                      >
                        {formatUpdateDate(seguimiento.fechaHora)}
                      </time>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-metro-muted">
                        {seguimiento.texto}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <label className="text-xs font-semibold text-metro-muted sm:col-span-6 lg:col-span-12">
              Observaciones
              <textarea
                className="mt-1 min-h-20 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, observaciones: event.target.value }))
                }
                value={draft.observaciones}
              />
            </label>
          </fieldset>

          <div className="shrink-0 flex flex-wrap gap-2 border-t border-metro-border pt-3">
            <button
              className="rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSubmit}
              type="submit"
            >
              Guardar
            </button>
            <InlineSaveFeedback />
            {saveStatus && (
              <p
                className={`self-center text-xs font-semibold ${
                  saveStatusIsError ? 'text-metro-red' : 'text-metro-muted'
                }`}
              >
                {saveStatus}
              </p>
            )}
            {!isCreate && task && (
              <AuditHistoryButton
                entityId={task.id}
                entityTitle={task.titulo || 'Tarea sin título'}
                module="tareas"
              />
            )}
            {!isCreate && task && (
              <button
                className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isFormReadOnly}
                onClick={() => {
                  void (async () => {
                    const result = await removeTaskWithConcurrencyCheck(task.id, loadedTaskUpdatedAt);
                    if (!result.ok) {
                      setSaveStatus(result.message);
                      setSaveStatusIsError(true);
                      return;
                    }
                    onDone();
                  })();
                }}
                type="button"
              >
                Eliminar
              </button>
            )}
            <button
              className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-muted hover:text-metro-text"
              onClick={onDone}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

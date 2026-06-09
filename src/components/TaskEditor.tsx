import { Eye, Mail, Search, Trash2, X } from 'lucide-react';
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

function formatMailFromMsg(data: {
  subject: string;
  senderName: string;
  senderEmail: string;
  date: string;
  body: string;
}): string {
  const header = [
    data.subject ? `Asunto: ${data.subject}` : '',
    data.senderName || data.senderEmail
      ? `De: ${[data.senderName, data.senderEmail ? `<${data.senderEmail}>` : ''].filter(Boolean).join(' ')}`
      : '',
    data.date ? `Fecha: ${data.date}` : '',
  ].filter(Boolean);

  return [...header, data.body].filter(Boolean).join('\n');
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
  const createTask = useTaskStore((state) => state.create);
  const updateTask = useTaskStore((state) => state.update);
  const removeTask = useTaskStore((state) => state.remove);
  const [draft, setDraft] = useState<TaskDraft>(() => toDraft(task));
  const [newUpdateText, setNewUpdateText] = useState('');
  const [manualDocumentPath, setManualDocumentPath] = useState('');
  const [documentStatus, setDocumentStatus] = useState('');
  const [documentStatusIsError, setDocumentStatusIsError] = useState(false);
  const [mailStatus, setMailStatus] = useState('');
  const [mailStatusIsError, setMailStatusIsError] = useState(false);
  const [loadedTaskIdentity, setLoadedTaskIdentity] = useState(
    () => `${mode}:${task?.id ?? 'new'}`,
  );
  const [loadedTaskUpdatedAt, setLoadedTaskUpdatedAt] = useState(task?.updatedAt ?? null);
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
      setLoadedTaskIdentity(nextIdentity);
      setLoadedTaskUpdatedAt(task?.updatedAt ?? null);
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
      .filter((origin) => origin.active && !origin.deletedAt)
      .map((origin) => origin.nombre);
    return draft.sindicato && !activeOriginNames.includes(draft.sindicato)
      ? [draft.sindicato, ...activeOriginNames]
      : activeOriginNames;
  }, [draft.sindicato, taskOrigins]);

  const handleAddManualDocumentPath = () => {
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
    setDraft((current) => ({
      ...current,
      documentLinks: current.documentLinks.filter((link) => link.id !== linkId),
    }));
    setDocumentStatus('Vínculo eliminado. Guarda la tarea para persistir el cambio.');
    setDocumentStatusIsError(false);
  };

  const handleImportMailFile = async (file: File | undefined) => {
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

  const isCreate = mode === 'create';
  const hasExternalTaskUpdate =
    !isCreate &&
    Boolean(task?.updatedAt) &&
    Boolean(loadedTaskUpdatedAt) &&
    task?.updatedAt !== loadedTaskUpdatedAt;
  const linkedSessionText = task?.sessionDocumentCode
    ? [
        formatSessionModuleLabel(task.sessionModule),
        task.sessionDocumentCode,
        formatTaskSessionDate(task.sessionDate),
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const canSubmit = draft.titulo.trim().length > 0 && !recordLock.isReadOnly;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <aside
        aria-modal="true"
        className="flex max-h-[calc(100vh-1rem)] w-[min(1040px,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-panel p-3 shadow-2xl"
        role="dialog"
      >
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-metro-border bg-metro-surface px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-metro-red">
              {isCreate ? 'Nueva tarea' : 'Editar tarea'}
            </p>
            <h3 className="mt-1 truncate text-base font-bold text-metro-text">
              {isCreate ? 'Nueva tarea' : task?.titulo || 'Sin selección'}
            </h3>
            <p className="text-xs text-metro-muted">
              {isCreate
                ? 'Alta manual compacta para tarea interna o sindical.'
                : `Editando tarea ${task?.id ?? '—'}`}
            </p>
          </div>
          <button
            aria-label="Cerrar editor"
            className="rounded-lg border border-metro-border bg-metro-surface p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={onDone}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        {recordLock.message && (
          <p
            className={`mb-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
              recordLock.isReadOnly
                ? 'border-red-400/40 bg-red-950/20 text-red-100'
                : 'border-metro-border bg-metro-surface text-metro-muted'
            }`}
          >
            {recordLock.message}
          </p>
        )}

        {hasExternalTaskUpdate && recordLock.isReadOnly && (
          <p className="mb-3 rounded-lg border border-amber-400/40 bg-amber-950/20 px-3 py-2 text-xs font-semibold text-amber-100">
            Esta tarea ha recibido cambios externos. No se han aplicado al formulario abierto para
            no sobrescribir datos locales; cierra y vuelve a abrir para ver la versión compartida.
          </p>
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
            if (!canSubmit || recordLock.isReadOnly) {
              return;
            }

            if (isCreate) {
              createTask(draft, newUpdateText);
            } else if (task) {
              updateTask(task.id, draft, newUpdateText);
            }

            onDone();
          }}
        >
          <fieldset
            className="grid min-h-0 max-h-[calc(100vh-14rem)] grid-cols-1 gap-2 overflow-y-auto overscroll-contain pr-2 disabled:opacity-70 sm:grid-cols-6 lg:grid-cols-12"
            disabled={recordLock.isReadOnly}
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
                  Arrastra aquí un mensaje .msg de Outlook. Se copiarán el asunto y el cuerpo
                  al campo Email.
                </p>
                <textarea
                  className="min-h-32 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, mail: event.target.value }))
                  }
                  placeholder="Asunto y cuerpo del email vinculado..."
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
                disabled={recordLock.isReadOnly}
                onClick={() => {
                  removeTask(task.id);
                  onDone();
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

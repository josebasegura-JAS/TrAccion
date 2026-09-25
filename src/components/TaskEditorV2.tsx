import {
  CalendarDays,
  Check,
  Eye,
  FileText,
  Info,
  LockKeyhole,
  BookOpen,
  Mail,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
  X,
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
import { useCoordinacionStore } from '../features/coordinacion/store/useCoordinacionStore';
import { parseOutlookMsg } from '../features/especiales/domain/especiales';
import {
  EMPTY_TASK_DRAFT,
  TASK_PRIORITIES,
  TASK_STATES,
  TASK_TYPES,
  type Task,
  type TaskDocumentLink,
  type TaskDraft,
  type TaskSeguimientoEntry,
} from '../features/tareas/domain/task';
import { useTaskStore } from '../features/tareas/store/useTaskStore';
import { useEditorShortcuts } from '../hooks/useEditorShortcuts';
import { buildRecoverableDraftKey, useRecoverableDraft } from '../hooks/useRecoverableDraft';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useAppDialog } from '../hooks/useAppDialog';
import { readStorageItem } from '../services/persistence';
import { useSharedRecordLock } from '../services/useSharedRecordLock';
import { enqueueAuditEvent } from '../shared/audit/auditTrail';
import { useCriteriosRrllStore } from '../features/criterios-rrll/store/useCriteriosRrllStore';
import {
  getCriterionIdForTask,
  unlinkTaskCriterion,
} from '../features/criterios-rrll/domain/taskCriterionLinks';
import { requestTaskCriterionEditor } from '../features/criterios-rrll/domain/taskCriterionEditorBus';
import { navigateInApp } from '../services/appNavigationBus';
import { TaskLinksSection } from '../features/task-links/components/TaskLinksSection';
import { formatImportedTaskMail } from '../features/tareas/domain/taskMail';

const TRACKING_META_PREFIX = '[[traccion-seguimiento:';
const TRACKING_META_SUFFIX = ']]';

type TrackingMeta = { fecha: string; usuario: string; id?: string };

function createTrackingId(): string {
  return `tracking-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function hashTrackingIdentity(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

type TaskRecoveryValue = {
  draft: TaskDraft;
  trackingText: string;
  trackingDate: string;
  sendToDirection: boolean;
  sendToUnion: boolean;
  selectedAreaTarget: string;
};

function todayIsoDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function getActiveUser(): string {
  return readStorageItem('traccion.header.username')?.trim() || 'Usuario local';
}

function encodeTracking(
  text: string,
  date: string,
  user: string,
  trackingId = createTrackingId(),
): string {
  const payload = JSON.stringify({
    fecha: date || todayIsoDate(),
    usuario: user || 'Usuario local',
    id: trackingId,
  });
  return `${TRACKING_META_PREFIX}${payload}${TRACKING_META_SUFFIX}\n${text.trim()}`;
}

function decodeTracking(
  text: string,
  fallbackDate: string,
): { text: string; date: string; user: string; id: string | null } {
  if (!text.startsWith(TRACKING_META_PREFIX)) {
    return { text, date: fallbackDate, user: '—', id: null };
  }
  const end = text.indexOf(TRACKING_META_SUFFIX);
  if (end < 0) return { text, date: fallbackDate, user: '—', id: null };
  const raw = text.slice(TRACKING_META_PREFIX.length, end);
  try {
    const parsed = JSON.parse(raw) as Partial<TrackingMeta>;
    return {
      text: text.slice(end + TRACKING_META_SUFFIX.length).replace(/^\s*\n?/, ''),
      date: parsed.fecha || fallbackDate,
      user: parsed.usuario || '—',
      id: typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id.trim() : null,
    };
  } catch {
    return { text, date: fallbackDate, user: '—', id: null };
  }
}

function resolveTrackingId(
  entry: TaskSeguimientoEntry,
  index: number,
  taskId: string,
): string {
  const decoded = decodeTracking(entry.texto, entry.fechaHora);

  if (entry.id?.trim()) {
    return entry.id.trim();
  }

  if (decoded.id) {
    return decoded.id;
  }

  return `tracking-legacy-${hashTrackingIdentity(
    `${taskId}|${entry.fechaHora}|${entry.texto}|${index}`,
  )}`;
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

function createInitialDraft(task: Task | null, initialDraft?: Partial<TaskDraft>): TaskDraft {
  const base = toDraft(task);
  if (task || !initialDraft) return base;
  return {
    ...base,
    ...initialDraft,
    documentLinks: initialDraft.documentLinks ?? base.documentLinks,
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
  initialDraft,
  initialTrackingText = '',
  onCreated,
}: {
  task: Task | null;
  mode: 'create' | 'edit';
  onDone: () => void;
  initialDraft?: Partial<TaskDraft>;
  initialTrackingText?: string;
  onCreated?: (taskId: string) => void | Promise<void>;
}) {
  const taskPhases = useConfiguracionStore((state) => state.taskPhases);
  const taskOrigins = useConfiguracionStore((state) => state.taskOrigins);
  const taskResponsibles = useConfiguracionStore((state) => state.taskResponsibles);
  const directionTaskIds = useCoordinacionStore((state) => state.directionTaskIds);
  const unionTaskIds = useCoordinacionStore((state) => state.unionTaskIds);
  const areaTaskIds = useCoordinacionStore((state) => state.areaTaskIds);
  const loadCoordinacion = useCoordinacionStore((state) => state.load);
  const setTaskForDirection = useCoordinacionStore((state) => state.setTaskForDirection);
  const setTaskForUnion = useCoordinacionStore((state) => state.setTaskForUnion);
  const setTaskForArea = useCoordinacionStore((state) => state.setTaskForArea);
  const loadConfiguracion = useConfiguracionStore((state) => state.load);
  const createTask = useTaskStore((state) => state.createWithConcurrencyCheck);
  const updateTask = useTaskStore((state) => state.updateWithConcurrencyCheck);
  const removeTask = useTaskStore((state) => state.removeWithConcurrencyCheck);
  const loadCriteriosRrll = useCriteriosRrllStore((state) => state.load);
  const [linkedCriterionId, setLinkedCriterionId] = useState<string | null>(null);
  const [criterionLinkReady, setCriterionLinkReady] = useState(false);
  const { confirm: confirmTrackingDelete, dialogNode: trackingDeleteDialogNode } = useAppDialog();

  const [draft, setDraft] = useState<TaskDraft>(() => createInitialDraft(task, initialDraft));
  const [sendToDirection, setSendToDirection] = useState(() => task ? directionTaskIds.includes(task.id) : false);
  const [sendToUnion, setSendToUnion] = useState(() => task
    ? Object.values(unionTaskIds).some((ids) => ids.includes(task.id))
    : false);
  const [selectedAreaTarget, setSelectedAreaTarget] = useState(() => task
    ? (Object.entries(areaTaskIds).find(([, ids]) => ids.includes(task.id))?.[0] ?? '')
    : '');
  const [showCircuitPicker, setShowCircuitPicker] = useState(false);
  const [customAreaTarget, setCustomAreaTarget] = useState('');
  const [trackingText, setTrackingText] = useState(initialTrackingText);
  const [trackingDate, setTrackingDate] = useState(todayIsoDate);
  const [trackingUser, setTrackingUser] = useState(getActiveUser);
  const [manualDocumentPath, setManualDocumentPath] = useState('');
  const [documentStatus, setDocumentStatus] = useState('');
  const [mailStatus, setMailStatus] = useState('');
  const [mailDragActive, setMailDragActive] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [saveStatusIsError, setSaveStatusIsError] = useState(false);
  const [loadedIdentity, setLoadedIdentity] = useState(() => `${mode}:${task?.id ?? 'new'}`);
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState(task?.updatedAt ?? null);
  const [editingTrackingId, setEditingTrackingId] = useState<string | null>(null);
  const [editingTrackingDate, setEditingTrackingDate] = useState('');
  const [editingTrackingText, setEditingTrackingText] = useState('');
  const [isSavingTrackingEdit, setIsSavingTrackingEdit] = useState(false);
  const [recoveryBaseline, setRecoveryBaseline] = useState<TaskRecoveryValue>(() => ({
    draft: createInitialDraft(task, initialDraft),
    trackingText: initialTrackingText,
    trackingDate: todayIsoDate(),
    sendToDirection: task ? directionTaskIds.includes(task.id) : false,
    sendToUnion: task ? Object.values(unionTaskIds).some((ids) => ids.includes(task.id)) : false,
    selectedAreaTarget: task ? (Object.entries(areaTaskIds).find(([, ids]) => ids.includes(task.id))?.[0] ?? '') : '',
  }));

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
    loadCoordinacion();
  }, [loadConfiguracion, loadCoordinacion]);

  useEffect(() => {
    let mounted = true;

    if (isCreate || !task?.id) {
      setLinkedCriterionId(null);
      setCriterionLinkReady(true);
      return () => {
        mounted = false;
      };
    }

    setCriterionLinkReady(false);
    void loadCriteriosRrll()
      .then(async () => {
        if (!mounted) return;
        const linkedId = await getCriterionIdForTask(task.id);
        if (!linkedId) {
          setLinkedCriterionId(null);
          return;
        }

        const exists = useCriteriosRrllStore
          .getState()
          .criterios.some((criterio) => criterio.id === linkedId && !criterio.deletedAt);

        if (!exists) {
          await unlinkTaskCriterion(task.id);
          setLinkedCriterionId(null);
          return;
        }

        setLinkedCriterionId(linkedId);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setLinkedCriterionId(null);
        setSaveStatus(
          error instanceof Error
            ? `No se ha podido consultar el vínculo con Criterios RRLL: ${error.message}`
            : 'No se ha podido consultar el vínculo con Criterios RRLL.',
        );
        setSaveStatusIsError(true);
      })
      .finally(() => {
        if (mounted) setCriterionLinkReady(true);
      });

    return () => {
      mounted = false;
    };
  }, [isCreate, loadCriteriosRrll, task?.id]);

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

    const nextDraft = toDraft(task);
    const nextTrackingDate = todayIsoDate();

    setDraft(nextDraft);
    setSendToDirection(task ? useCoordinacionStore.getState().directionTaskIds.includes(task.id) : false);
    setSendToUnion(task
      ? Object.values(useCoordinacionStore.getState().unionTaskIds).some((ids) => ids.includes(task.id))
      : false);
    setSelectedAreaTarget(task
      ? (Object.entries(useCoordinacionStore.getState().areaTaskIds).find(([, ids]) => ids.includes(task.id))?.[0] ?? '')
      : '');
    setShowCircuitPicker(false);
    setCustomAreaTarget('');
    setTrackingText('');
    setTrackingDate(nextTrackingDate);
    setRecoveryBaseline({
      draft: nextDraft,
      trackingText: '',
      trackingDate: nextTrackingDate,
      sendToDirection: task ? useCoordinacionStore.getState().directionTaskIds.includes(task.id) : false,
      sendToUnion: task ? Object.values(useCoordinacionStore.getState().unionTaskIds).some((ids) => ids.includes(task.id)) : false,
      selectedAreaTarget: task ? (Object.entries(useCoordinacionStore.getState().areaTaskIds).find(([, ids]) => ids.includes(task.id))?.[0] ?? '') : '',
    });
    setManualDocumentPath('');
    setDocumentStatus('');
    setMailStatus('');
    setSaveStatus('');
    setEditingTrackingId(null);
    setEditingTrackingDate('');
    setEditingTrackingText('');
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
  const responsibleOptions = useMemo(() => {
    const active = taskResponsibles.filter((item) => item.active).map((item) => item.nombre);
    const isKnown = active.includes(draft.responsable) || draft.responsable.startsWith('Otros:');
    return draft.responsable && !isKnown ? [draft.responsable, ...active] : active;
  }, [draft.responsable, taskResponsibles]);
  const responsibleSelectValue = draft.responsable.startsWith('Otros:') ? 'Otros' : draft.responsable;
  const otherResponsibleValue = draft.responsable.startsWith('Otros:') ? draft.responsable.slice('Otros:'.length).trimStart() : '';
  const selectedUnionOrigin = useMemo(
    () => taskOrigins.find((origin) => origin.tipo === 'sindicato' && origin.active && !origin.deletedAt && origin.nombre === draft.sindicato) ?? null,
    [draft.sindicato, taskOrigins],
  );
  const unionCircuitOptions = useMemo(
    () => taskOrigins.filter((origin) => origin.tipo === 'sindicato' && origin.active && !origin.deletedAt),
    [taskOrigins],
  );
  const areaCircuitOptions = useMemo(
    () => taskOrigins.filter((origin) => origin.tipo === 'empresa' && origin.active && !origin.deletedAt && origin.nombre.trim().toLocaleLowerCase('es') !== 'dirección'.toLocaleLowerCase('es')),
    [taskOrigins],
  );
  const normalizedDraftPhase = draft.fase.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const isCommitteeCircuit = normalizedDraftPhase === 'comite';
  const isParitariaCircuit = normalizedDraftPhase === 'paritaria';

  const updateCoordinationTargets = async (taskId: string) => {
    const directionResult = await setTaskForDirection(taskId, sendToDirection);
    if (!directionResult.ok) return directionResult;
    const unionResult = await setTaskForUnion(taskId, sendToUnion && selectedUnionOrigin ? selectedUnionOrigin.nombre : null);
    if (!unionResult.ok) return unionResult;
    return setTaskForArea(taskId, selectedAreaTarget || null);
  };

  const recoveryStorageKey = buildRecoverableDraftKey('tareas', task?.id ?? 'new');
  const { clearDraft: clearRecoveryDraft, dialogNode: recoveryDialogNode } = useRecoverableDraft({
    currentValue: { draft, trackingText, trackingDate, sendToDirection, sendToUnion, selectedAreaTarget },
    initialValue: recoveryBaseline,
    enabled: !isFormReadOnly,
    onRecover: (value) => {
      setDraft(value.draft);
      setTrackingText(value.trackingText);
      setTrackingDate(value.trackingDate || todayIsoDate());
      setSendToDirection(Boolean(value.sendToDirection));
      setSendToUnion(Boolean(value.sendToUnion));
      setSelectedAreaTarget(value.selectedAreaTarget || '');
    },
    storageKey: recoveryStorageKey,
  });
  const { requestClose, dialogNode } = useUnsavedChanges({
    currentValue: { draft, trackingText, trackingDate, sendToDirection, sendToUnion, selectedAreaTarget },
    initialValue: recoveryBaseline,
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
      if (result.recordId) {
        const coordinationResult = await updateCoordinationTargets(result.recordId);
        if (!coordinationResult.ok) {
          setSaveStatus(`Tarea guardada, pero no se ha podido actualizar Coordinación: ${coordinationResult.message}`);
          setSaveStatusIsError(true);
          return;
        }
        await onCreated?.(result.recordId);
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

    const coordinationResult = await updateCoordinationTargets(task.id);
    const savedTask = useTaskStore.getState().tasks.find((candidate) => candidate.id === task.id);
    const nextTrackingDate = todayIsoDate();

    if (savedTask) {
      const savedDraft = toDraft(savedTask);
      setDraft(savedDraft);
      setLoadedUpdatedAt(savedTask.updatedAt);
      setRecoveryBaseline({
        draft: savedDraft,
        trackingText: '',
        trackingDate: nextTrackingDate,
        sendToDirection,
        sendToUnion,
        selectedAreaTarget,
      });
    } else {
      setRecoveryBaseline({
        draft,
        trackingText: '',
        trackingDate: nextTrackingDate,
        sendToDirection,
        sendToUnion,
        selectedAreaTarget,
      });
    }

    setTrackingText('');
    setTrackingDate(nextTrackingDate);
    clearRecoveryDraft();
    setSaveStatus(coordinationResult.ok
      ? 'Guardado correctamente. Puedes seguir editando la tarea.'
      : `Tarea guardada, pero no se ha podido actualizar Coordinación: ${coordinationResult.message}`);
    setSaveStatusIsError(!coordinationResult.ok);
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
    setDraft((current) => ({ ...current, mail: formatImportedTaskMail(parsedMailData) }));
    setMailStatus('Correo importado con remitente, fecha, asunto y contenido. Guarda la tarea para persistirlo.');
  };

  const liveTask = useTaskStore((state) =>
    task ? state.tasks.find((candidate) => candidate.id === task.id) : undefined,
  );
  const trackingItems = liveTask?.seguimiento ?? task?.seguimiento ?? [];

  const verifyTrackingMutationCanProceed = async (): Promise<Task | null> => {
    if (!task || isFormReadOnly) return null;

    const liveLock = await window.traccion?.getRecordLock?.({
      module: 'tareas',
      recordId: task.id,
    });
    if (!liveLock?.ok || liveLock.status !== 'acquired') {
      setSaveStatus(
        liveLock?.message || 'No se ha confirmado el bloqueo compartido de edición.',
      );
      setSaveStatusIsError(true);
      return null;
    }

    const latestTask = useTaskStore.getState().tasks.find((candidate) => candidate.id === task.id);
    if (!latestTask) {
      setSaveStatus('La tarea ya no existe en la base de datos compartida.');
      setSaveStatusIsError(true);
      return null;
    }

    if (latestTask.updatedAt !== loadedUpdatedAt) {
      setSaveStatus(
        'La tarea ha cambiado desde que abriste el detalle. Cierra y vuelve a abrirla antes de modificar el seguimiento.',
      );
      setSaveStatusIsError(true);
      return null;
    }

    return latestTask;
  };

  const persistTrackingMutation = async (
    latestTask: Task,
    nextTracking: TaskSeguimientoEntry[],
    successMessage: string,
    auditSummary: string,
  ): Promise<boolean> => {
    const saveTaskRecord = window.traccion?.saveTaskRecordIfUnchanged;
    if (!saveTaskRecord) {
      setSaveStatus('El guardado directo de tareas no está disponible.');
      setSaveStatusIsError(true);
      return false;
    }

    const updatedTask: Task = {
      ...latestTask,
      seguimiento: nextTracking,
      updatedAt: new Date().toISOString(),
    };

    const result = await saveTaskRecord({
      id: latestTask.id,
      value: JSON.stringify(updatedTask),
      expectedUpdatedAt: loadedUpdatedAt,
    });

    if (!result.ok) {
      setSaveStatus(result.message || 'No se ha podido actualizar el seguimiento.');
      setSaveStatusIsError(true);
      return false;
    }

    useTaskStore.setState((state) => ({
      tasks: state.tasks.map((candidate) =>
        candidate.id === latestTask.id ? updatedTask : candidate,
      ),
    }));

    setLoadedUpdatedAt(updatedTask.updatedAt);
    setSaveStatus(successMessage);
    setSaveStatusIsError(false);

    enqueueAuditEvent({
      module: 'tareas',
      entityId: latestTask.id,
      action: 'updated',
      summary: auditSummary,
      changes: [],
    });

    return true;
  };

  const startTrackingEdit = (entry: TaskSeguimientoEntry, index: number) => {
    if (!task || isFormReadOnly) return;
    const decoded = decodeTracking(entry.texto, entry.fechaHora);
    setEditingTrackingId(resolveTrackingId(entry, index, task.id));
    setEditingTrackingDate(decoded.date || todayIsoDate());
    setEditingTrackingText(decoded.text);
    setSaveStatus('');
    setSaveStatusIsError(false);
  };

  const cancelTrackingEdit = () => {
    setEditingTrackingId(null);
    setEditingTrackingDate('');
    setEditingTrackingText('');
  };

  const handleSaveTrackingEdit = async (
    entry: TaskSeguimientoEntry,
    index: number,
  ) => {
    if (!task || isFormReadOnly || !editingTrackingText.trim()) return;

    const trackingId = resolveTrackingId(entry, index, task.id);
    if (editingTrackingId !== trackingId) return;

    setIsSavingTrackingEdit(true);
    try {
      const latestTask = await verifyTrackingMutationCanProceed();
      if (!latestTask) return;

      const latestIndex = latestTask.seguimiento.findIndex(
        (candidate, candidateIndex) =>
          resolveTrackingId(candidate, candidateIndex, latestTask.id) === trackingId,
      );
      if (latestIndex < 0) {
        setSaveStatus('Ese seguimiento ya no existe. Recarga la tarea.');
        setSaveStatusIsError(true);
        return;
      }

      const original = latestTask.seguimiento[latestIndex];
      const originalDecoded = decodeTracking(original.texto, original.fechaHora);
      const nextTracking = latestTask.seguimiento.map((candidate, candidateIndex) => {
        if (candidateIndex !== latestIndex) {
          return {
            ...candidate,
            id: candidate.id ?? resolveTrackingId(candidate, candidateIndex, latestTask.id),
          };
        }

        return {
          ...candidate,
          id: trackingId,
          texto: encodeTracking(
            editingTrackingText,
            editingTrackingDate,
            originalDecoded.user,
            trackingId,
          ),
        };
      });

      const saved = await persistTrackingMutation(
        latestTask,
        nextTracking,
        'Seguimiento actualizado.',
        'Seguimiento editado',
      );
      if (saved) {
        cancelTrackingEdit();
      }
    } finally {
      setIsSavingTrackingEdit(false);
    }
  };

  const handleDeleteTracking = async (index: number) => {
    if (!task || isFormReadOnly) return;

    const entry = trackingItems[index];
    if (!entry) return;

    const decoded = decodeTracking(entry.texto, entry.fechaHora);
    const preview =
      decoded.text.length > 90 ? `${decoded.text.slice(0, 87)}…` : decoded.text;

    const confirmed = await confirmTrackingDelete(
      `Se eliminará el seguimiento del ${formatDate(decoded.date)}${decoded.user !== '—' ? ` · ${decoded.user}` : ''}.` +
        `${preview ? `\n\n“${preview}”` : ''}\n\nEsta acción se guarda inmediatamente. ¿Continuar?`,
      {
        title: 'Eliminar seguimiento',
        confirmLabel: 'Eliminar',
        cancelLabel: 'Cancelar',
        danger: true,
      },
    );

    if (!confirmed) return;

    const latestTask = await verifyTrackingMutationCanProceed();
    if (!latestTask || !task) return;

    const trackingId = resolveTrackingId(entry, index, task.id);
    let removed = false;
    const nextTracking = latestTask.seguimiento
      .filter((candidate, candidateIndex) => {
        if (
          !removed &&
          resolveTrackingId(candidate, candidateIndex, latestTask.id) === trackingId
        ) {
          removed = true;
          return false;
        }
        return true;
      })
      .map((candidate, candidateIndex) => ({
        ...candidate,
        id: candidate.id ?? resolveTrackingId(candidate, candidateIndex, latestTask.id),
      }));

    if (!removed) {
      setSaveStatus('Ese seguimiento ya no existe. Recarga la tarea.');
      setSaveStatusIsError(true);
      return;
    }

    await persistTrackingMutation(
      latestTask,
      nextTracking,
      'Seguimiento eliminado.',
      'Seguimiento eliminado',
    );
  };

  const handleOpenCriterionRrll = async () => {
    if (!task || isCreate) return;

    const hasUnsavedTaskChanges =
      JSON.stringify({ draft, trackingText, trackingDate }) !== JSON.stringify(recoveryBaseline);

    if (hasUnsavedTaskChanges) {
      setSaveStatus(
        'Guarda o descarta primero los cambios de la tarea antes de crear o abrir su criterio RRLL.',
      );
      setSaveStatusIsError(true);
      return;
    }

    setSaveStatus('');
    setSaveStatusIsError(false);
    setCriterionLinkReady(false);

    try {
      await loadCriteriosRrll();

      const storedLinkedId = await getCriterionIdForTask(task.id);
      const currentCriterios = useCriteriosRrllStore.getState().criterios;
      const linkedCriterio = storedLinkedId
        ? currentCriterios.find(
            (criterio) => criterio.id === storedLinkedId && !criterio.deletedAt,
          )
        : null;

      if (storedLinkedId && !linkedCriterio) {
        await unlinkTaskCriterion(task.id);
      }

      const originReference = draft.sindicato.trim() || draft.origen.trim();
      const request = linkedCriterio
        ? {
            mode: 'edit' as const,
            taskId: task.id,
            taskTitle: draft.titulo || task.titulo,
            criterioId: linkedCriterio.id,
          }
        : {
            mode: 'create' as const,
            taskId: task.id,
            taskTitle: draft.titulo || task.titulo,
            draft: {
              tema: draft.titulo,
              criterio: draft.descripcion,
              estado: 'vigente' as const,
              sentido: 'sin clasificar' as const,
              fecha: todayIsoDate(),
              responsable: draft.responsable,
              observaciones: originReference ? `Origen de la tarea: ${originReference}` : '',
            },
          };

      setLinkedCriterionId(linkedCriterio?.id ?? null);
      clearRecoveryDraft();
      onDone();
      navigateInApp({ view: 'criterios-rrll' });
      window.setTimeout(() => requestTaskCriterionEditor(request), 0);
    } catch (error) {
      setSaveStatus(
        error instanceof Error
          ? error.message
          : 'No se ha podido abrir Criterios RRLL.',
      );
      setSaveStatusIsError(true);
    } finally {
      setCriterionLinkReady(true);
    }
  };

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
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-12">
                  <label className="text-[11px] font-semibold text-metro-muted lg:col-span-2">Tipo
                    <Select className="h-8 rounded-lg px-2 text-xs" value={draft.tipo} onChange={(e) => setDraft((c) => ({ ...c, tipo: e.target.value as TaskDraft['tipo'] }))}>{TASK_TYPES.map((v) => <option key={v}>{v}</option>)}</Select>
                  </label>
                  <label className="text-[11px] font-semibold text-metro-muted lg:col-span-2">Fase
                    <Select className="h-8 rounded-lg px-2 text-xs" value={draft.fase} onChange={(e) => setDraft((c) => ({ ...c, fase: e.target.value }))}>{phaseOptions.map((v) => <option key={v}>{v}</option>)}</Select>
                  </label>
                  <label className="text-[11px] font-semibold text-metro-muted lg:col-span-4">Título <span className="text-metro-red">*</span>
                    <Input className="h-8 rounded-lg px-2 text-xs" required value={draft.titulo} onChange={(e) => setDraft((c) => ({ ...c, titulo: e.target.value }))} />
                  </label>

                  <label className="text-[11px] font-semibold text-metro-muted lg:col-span-2">Responsable
                    <Select
                      className="h-8 rounded-lg px-2 text-xs"
                      value={responsibleSelectValue}
                      onChange={(e) => setDraft((c) => ({ ...c, responsable: e.target.value }))}
                    >
                      <option value="">Sin asignar</option>
                      {responsibleOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                    </Select>
                    {responsibleSelectValue === 'Otros' && (
                      <Input
                        className="mt-1 h-8 rounded-lg px-2 text-xs"
                        placeholder="Indica el responsable"
                        value={otherResponsibleValue}
                        onChange={(e) => setDraft((c) => ({ ...c, responsable: `Otros: ${e.target.value}` }))}
                      />
                    )}
                  </label>
                  <label className="text-[11px] font-semibold text-metro-muted lg:col-span-2">Estado
                    <Select className="h-8 rounded-lg px-2 text-xs" value={draft.estado} onChange={(e) => setDraft((c) => ({ ...c, estado: e.target.value as TaskDraft['estado'] }))}>{TASK_STATES.map((v) => <option key={v}>{v}</option>)}</Select>
                  </label>
                  <label className="text-[11px] font-semibold text-metro-muted lg:col-span-4">Detalle origen / solicitante
                    <Input className="h-8 rounded-lg px-2 text-xs" value={draft.origen} onChange={(e) => setDraft((c) => ({ ...c, origen: e.target.value }))} />
                  </label>
                  <label className="text-[11px] font-semibold text-metro-muted lg:col-span-2">Fecha de creación
                    <Input
                      className="h-8 rounded-lg px-2 text-xs"
                      type="date"
                      value={creationDate}
                      onChange={(e) => {
                        const nextDate = e.target.value;
                        const original = draft.createdAt ?? task?.createdAt ?? '';
                        const suffix = original.length > 10 ? original.slice(10) : 'T00:00:00.000Z';
                        setDraft((current) => ({
                          ...current,
                          createdAt: nextDate ? `${nextDate}${suffix}` : current.createdAt,
                        }));
                      }}
                    />
                  </label>
                  <label className="text-[11px] font-semibold text-metro-muted lg:col-span-2">Fecha límite
                    <Input className="h-8 rounded-lg px-2 text-xs" type="date" value={draft.fechaLimite} onChange={(e) => setDraft((c) => ({ ...c, fechaLimite: e.target.value }))} />
                  </label>

                  <label className="text-[11px] font-semibold text-metro-muted lg:col-span-2">Origen
                    <Select className="h-8 rounded-lg px-2 text-xs" value={draft.sindicato} onChange={(e) => setDraft((c) => ({ ...c, sindicato: e.target.value }))}>
                      <option value="">Sin origen</option>{originOptions.map((v) => <option key={v}>{v}</option>)}
                    </Select>
                  </label>
                  <label className="text-[11px] font-semibold text-metro-muted lg:col-span-2">Prioridad
                    <Select className="h-8 rounded-lg px-2 text-xs" value={draft.prioridad} onChange={(e) => setDraft((c) => ({ ...c, prioridad: e.target.value as TaskDraft['prioridad'] }))}>{TASK_PRIORITIES.map((v) => <option key={v}>{v}</option>)}</Select>
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
                {trackingItems.length > 0 && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-sky-300/10 bg-[#0a1b2e]/70">
                    {trackingItems.map((entry, index) => {
                      const decoded = decodeTracking(entry.texto, entry.fechaHora);
                      const trackingId = task
                        ? resolveTrackingId(entry, index, task.id)
                        : `${entry.fechaHora}-${index}`;
                      const isEditing = editingTrackingId === trackingId;

                      return (
                        <article
                          className={`border-b border-sky-300/10 px-3 py-2 last:border-b-0 ${
                            isEditing ? 'bg-sky-500/[0.05]' : ''
                          }`}
                          key={trackingId}
                        >
                          {isEditing ? (
                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-[150px_125px_minmax(0,1fr)_66px] lg:items-start">
                              <Input
                                aria-label="Fecha del seguimiento"
                                className="h-8 text-xs"
                                onChange={(event) => setEditingTrackingDate(event.target.value)}
                                type="date"
                                value={editingTrackingDate}
                              />
                              <div className="flex h-8 items-center gap-2 truncate rounded-lg border border-metro-border bg-metro-panel px-2 text-xs font-semibold text-slate-300">
                                <UserRound size={13} className="shrink-0 text-sky-300" />
                                <span className="truncate">{decoded.user}</span>
                              </div>
                              <Textarea
                                aria-label="Texto del seguimiento"
                                className="min-h-[62px] text-xs"
                                onChange={(event) => setEditingTrackingText(event.target.value)}
                                value={editingTrackingText}
                              />
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  aria-label="Guardar cambios del seguimiento"
                                  className="grid h-7 w-7 place-items-center rounded-md text-emerald-300 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                                  disabled={!editingTrackingText.trim() || isSavingTrackingEdit}
                                  onClick={() => void handleSaveTrackingEdit(entry, index)}
                                  title="Guardar cambios"
                                  type="button"
                                >
                                  <Check size={15} />
                                </button>
                                <button
                                  aria-label="Cancelar edición del seguimiento"
                                  className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
                                  disabled={isSavingTrackingEdit}
                                  onClick={cancelTrackingEdit}
                                  title="Cancelar"
                                  type="button"
                                >
                                  <X size={15} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-[110px_125px_minmax(0,1fr)_62px] items-start gap-3">
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                                <CalendarDays size={13} className="text-sky-300" />
                                {formatDate(decoded.date)}
                              </div>
                              <div className="flex items-center gap-2 truncate text-xs font-semibold text-slate-300">
                                <UserRound size={13} className="text-sky-300" />
                                <span className="truncate">{decoded.user}</span>
                              </div>
                              <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
                                {decoded.text}
                              </p>
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  aria-label={`Editar seguimiento del ${formatDate(decoded.date)}`}
                                  className="grid h-7 w-7 place-items-center rounded-md text-slate-500 transition hover:bg-sky-500/10 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
                                  disabled={isFormReadOnly || editingTrackingId !== null}
                                  onClick={() => startTrackingEdit(entry, index)}
                                  title="Editar seguimiento"
                                  type="button"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  aria-label={`Eliminar seguimiento del ${formatDate(decoded.date)}`}
                                  className="grid h-7 w-7 place-items-center rounded-md text-slate-500 transition hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                                  disabled={isFormReadOnly || editingTrackingId !== null}
                                  onClick={() => void handleDeleteTracking(index)}
                                  title="Eliminar seguimiento"
                                  type="button"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}

                <div className={trackingItems.length > 0 ? "mt-3 border-t border-sky-300/10 pt-3" : ""}>
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-200">
                    <Plus size={13} className="text-sky-300" />
                    Añadir nuevo seguimiento
                  </div>
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

                </div>
              </Section>

              {!isCreate && task && <TaskLinksSection task={liveTask ?? task} />}

                  <div className="rounded-xl border border-sky-300/15 bg-[#0a1b2e]/55 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <strong className="block text-xs text-slate-100">Circuitos</strong>
                        <span className="text-[10px] font-medium text-slate-400">Indica dónde debe tratarse este asunto. Los cambios se aplican al guardar la tarea.</span>
                      </div>
                      <button className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300/25 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-bold text-sky-100 hover:bg-sky-500/15" onClick={() => setShowCircuitPicker((current) => !current)} type="button"><Plus size={13}/>Llevar a…</button>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {sendToDirection && <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-100">Dirección<button aria-label="Quitar Dirección" className="text-sky-200/70 hover:text-white" onClick={() => setSendToDirection(false)} type="button"><X size={12}/></button></span>}
                      {isCommitteeCircuit && <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">Comité<button aria-label="Quitar Comité" className="text-amber-200/70 hover:text-white" onClick={() => setDraft((current) => ({ ...current, fase: 'tarea' }))} type="button"><X size={12}/></button></span>}
                      {isParitariaCircuit && <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">Paritaria<button aria-label="Quitar Paritaria" className="text-amber-200/70 hover:text-white" onClick={() => setDraft((current) => ({ ...current, fase: 'tarea' }))} type="button"><X size={12}/></button></span>}
                      {sendToUnion && selectedUnionOrigin && <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">{selectedUnionOrigin.nombre}<button aria-label={`Quitar ${selectedUnionOrigin.nombre}`} className="text-amber-200/70 hover:text-white" onClick={() => setSendToUnion(false)} type="button"><X size={12}/></button></span>}
                      {selectedAreaTarget && <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-100">{selectedAreaTarget}<button aria-label={`Quitar ${selectedAreaTarget}`} className="text-violet-200/70 hover:text-white" onClick={() => setSelectedAreaTarget('')} type="button"><X size={12}/></button></span>}
                      {!sendToDirection && !isCommitteeCircuit && !isParitariaCircuit && !(sendToUnion && selectedUnionOrigin) && !selectedAreaTarget && <span className="text-[11px] text-slate-500">Sin circuitos pendientes.</span>}
                    </div>

                    {showCircuitPicker && <div className="mt-3 grid gap-2 border-t border-sky-300/10 pt-3 md:grid-cols-2">
                      <button className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold ${sendToDirection ? 'border-sky-400/35 bg-sky-500/15 text-sky-100' : 'border-metro-border bg-metro-surface/70 text-metro-text hover:bg-sky-500/10'}`} onClick={() => setSendToDirection(true)} type="button">Dirección<span className="mt-0.5 block text-[10px] font-normal text-metro-muted">Próximo guion de Coordinación.</span></button>
                      <button className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold ${isCommitteeCircuit ? 'border-amber-400/35 bg-amber-500/15 text-amber-100' : 'border-metro-border bg-metro-surface/70 text-metro-text hover:bg-amber-500/10'}`} onClick={() => setDraft((current) => ({ ...current, fase: 'comite' }))} type="button">Comité<span className="mt-0.5 block text-[10px] font-normal text-metro-muted">Quedará disponible para asignar a una sesión.</span></button>
                      <button className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold ${isParitariaCircuit ? 'border-amber-400/35 bg-amber-500/15 text-amber-100' : 'border-metro-border bg-metro-surface/70 text-metro-text hover:bg-amber-500/10'}`} onClick={() => setDraft((current) => ({ ...current, fase: 'paritaria' }))} type="button">Paritaria<span className="mt-0.5 block text-[10px] font-normal text-metro-muted">Quedará disponible para asignar a una sesión.</span></button>
                      <label className="rounded-lg border border-metro-border bg-metro-surface/70 px-3 py-2 text-xs font-semibold text-metro-text">Sindicato
                        <select className="mt-1 w-full rounded-md border border-metro-border bg-metro-panel px-2 py-1.5 text-xs text-metro-text" onChange={(event) => { const value = event.target.value; if (!value) return; setDraft((current) => ({ ...current, sindicato: value })); setSendToUnion(true); }} value={sendToUnion && selectedUnionOrigin ? selectedUnionOrigin.nombre : ''}><option value="">Selecciona sindicato…</option>{unionCircuitOptions.map((origin) => <option key={origin.id} value={origin.nombre}>{origin.nombre}</option>)}</select>
                      </label>
                      <label className="rounded-lg border border-metro-border bg-metro-surface/70 px-3 py-2 text-xs font-semibold text-metro-text md:col-span-2">Otra área
                        <div className="mt-1 grid gap-2 sm:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_auto]"><select className="rounded-md border border-metro-border bg-metro-panel px-2 py-1.5 text-xs text-metro-text" onChange={(event) => { if (event.target.value) { setSelectedAreaTarget(event.target.value); setCustomAreaTarget(''); } }} value={areaCircuitOptions.some((origin) => origin.nombre === selectedAreaTarget) ? selectedAreaTarget : ''}><option value="">Selecciona un área…</option>{areaCircuitOptions.map((origin) => <option key={origin.id} value={origin.nombre}>{origin.nombre}</option>)}</select><input className="rounded-md border border-metro-border bg-metro-panel px-2 py-1.5 text-xs text-metro-text outline-none focus:border-metro-red" onChange={(event) => setCustomAreaTarget(event.target.value)} placeholder="Otra área…" value={customAreaTarget}/><button className="rounded-md border border-metro-border px-2.5 py-1.5 text-[11px] font-bold text-metro-text disabled:opacity-40" disabled={!customAreaTarget.trim()} onClick={() => { setSelectedAreaTarget(customAreaTarget.trim()); setCustomAreaTarget(''); }} type="button">Añadir</button></div>
                      </label>
                    </div>}
                  </div>

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
                  title="Email de origen"
                  action={<label className="cursor-pointer rounded-md border border-metro-border px-2 py-1 text-[11px] font-semibold text-slate-300 hover:border-metro-red">Seleccionar mensaje .msg<input accept=".msg" className="sr-only" type="file" onChange={(e) => void handleImportMailFile(e.target.files?.[0])} /></label>}
                >
                  <div
                    className={`rounded-lg border border-dashed p-2 transition-colors ${mailDragActive ? 'border-sky-300 bg-sky-400/10' : 'border-slate-600/80 bg-slate-950/10'}`}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      if (!isFormReadOnly) setMailDragActive(true);
                    }}
                    onDragLeave={(event) => {
                      event.preventDefault();
                      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                      setMailDragActive(false);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (!isFormReadOnly) event.dataTransfer.dropEffect = 'copy';
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setMailDragActive(false);
                      if (isFormReadOnly) return;
                      const file = Array.from(event.dataTransfer.files).find((candidate) => /\.msg$/i.test(candidate.name));
                      void handleImportMailFile(file);
                    }}
                  >
                    <p className="mb-2 text-[10px] font-semibold text-slate-400">Arrastra aquí un correo .msg de Outlook. Se guardarán remitente, fecha, asunto y contenido en texto plano.</p>
                    <Textarea className="min-h-40" placeholder="Correo vinculado a la tarea..." value={draft.mail} onChange={(e) => setDraft((c) => ({ ...c, mail: e.target.value }))} />
                  </div>
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
                <ActionButton
                  disabled={!criterionLinkReady || (isFormReadOnly && !linkedCriterionId)}
                  icon={BookOpen}
                  iconOnly={false}
                  onClick={() => void handleOpenCriterionRrll()}
                  variant="secondary"
                >
                  {!criterionLinkReady
                    ? 'Comprobando criterio…'
                    : linkedCriterionId
                      ? 'Ver criterio RRLL'
                      : 'Crear criterio RRLL'}
                </ActionButton>
              )}
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
      {trackingDeleteDialogNode}
    </>
  );
}

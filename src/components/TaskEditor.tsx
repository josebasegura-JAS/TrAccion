import {
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  BookOpen,
  Printer,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ActionButton } from './ui/ActionButton';
import { Textarea } from './ui/Field';
import { ModalCloseButton } from './ui/ModalCloseButton';
import { ModalHeader, ModalShell, ModalTitle } from './ui/ModalShell';
import { AuditHistoryButton } from '../shared/audit/AuditHistoryButton';
import { InlineSaveFeedback } from './InlineSaveFeedback';
import { ModalDatabaseStatus } from './ModalDatabaseStatus';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import { useCoordinacionStore } from '../features/coordinacion/store/useCoordinacionStore';
import { parseOutlookMsg } from '../features/especiales/domain/especiales';
import {
  type Task,
  type TaskDraft,
  type TaskSeguimientoEntry,
} from '../features/tareas/domain/task';
import { useTaskStore } from '../features/tareas/store/useTaskStore';
import { buildTaskReportHtml, exportTaskReportToExcel } from '../features/tareas/export/taskReport';
import { PrintPreviewModal } from '../shared/print/PrintPreviewModal';
import { useEditorShortcuts } from '../hooks/useEditorShortcuts';
import { buildRecoverableDraftKey, useRecoverableDraft } from '../hooks/useRecoverableDraft';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useAppDialog } from '../hooks/useAppDialog';
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
import { TaskEditorSection } from './task-editor/TaskEditorSection';
import { TaskGeneralFields } from './task-editor/TaskGeneralFields';
import { TaskTrackingSection } from './task-editor/TaskTrackingSection';
import { TaskCircuitsSection } from './task-editor/TaskCircuitsSection';
import { TaskAttachmentsSection } from './task-editor/TaskAttachmentsSection';
import {
  buildTaskDocumentLink,
  createInitialDraft,
  decodeTracking,
  encodeTracking,
  getActiveUser,
  mergeDocumentLinks,
  resolveTrackingId,
  todayIsoDate,
  type TaskRecoveryValue,
} from './task-editor/taskEditorModel';

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
  const [taskPrintPreviewHtml, setTaskPrintPreviewHtml] = useState<string | null>(null);

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
              <TaskGeneralFields
                creationDate={creationDate}
                draft={draft}
                originOptions={originOptions}
                otherResponsibleValue={otherResponsibleValue}
                phaseOptions={phaseOptions}
                responsibleOptions={responsibleOptions}
                responsibleSelectValue={responsibleSelectValue}
                setDraft={setDraft}
                task={task}
              />

              <TaskEditorSection icon={FileText} title="Descripción">
                <Textarea className="min-h-20" value={draft.descripcion} onChange={(e) => setDraft((c) => ({ ...c, descripcion: e.target.value }))} />
              </TaskEditorSection>

              <TaskTrackingSection
                editingTrackingDate={editingTrackingDate}
                editingTrackingId={editingTrackingId}
                editingTrackingText={editingTrackingText}
                isFormReadOnly={isFormReadOnly}
                isSavingTrackingEdit={isSavingTrackingEdit}
                onCancelTrackingEdit={cancelTrackingEdit}
                onDeleteTracking={handleDeleteTracking}
                onSaveTrackingEdit={handleSaveTrackingEdit}
                onStartTrackingEdit={startTrackingEdit}
                setEditingTrackingDate={setEditingTrackingDate}
                setEditingTrackingText={setEditingTrackingText}
                setTrackingDate={setTrackingDate}
                setTrackingText={setTrackingText}
                task={task}
                trackingDate={trackingDate}
                trackingItems={trackingItems}
                trackingText={trackingText}
                trackingUser={trackingUser}
              />

              {!isCreate && task && <TaskLinksSection task={liveTask ?? task} />}

              <TaskCircuitsSection
                areaCircuitOptions={areaCircuitOptions}
                customAreaTarget={customAreaTarget}
                draft={draft}
                isCommitteeCircuit={isCommitteeCircuit}
                isParitariaCircuit={isParitariaCircuit}
                selectedAreaTarget={selectedAreaTarget}
                selectedUnionOrigin={selectedUnionOrigin}
                sendToDirection={sendToDirection}
                sendToUnion={sendToUnion}
                setCustomAreaTarget={setCustomAreaTarget}
                setDraft={setDraft}
                setSelectedAreaTarget={setSelectedAreaTarget}
                setSendToDirection={setSendToDirection}
                setSendToUnion={setSendToUnion}
                setShowCircuitPicker={setShowCircuitPicker}
                showCircuitPicker={showCircuitPicker}
                unionCircuitOptions={unionCircuitOptions}
              />

              <TaskAttachmentsSection
                documentStatus={documentStatus}
                draft={draft}
                isFormReadOnly={isFormReadOnly}
                mailDragActive={mailDragActive}
                mailStatus={mailStatus}
                manualDocumentPath={manualDocumentPath}
                onAddDocument={handleAddDocument}
                onImportMailFile={handleImportMailFile}
                onSelectDocument={handleSelectDocument}
                setDraft={setDraft}
                setMailDragActive={setMailDragActive}
                setManualDocumentPath={setManualDocumentPath}
              />

              <TaskEditorSection icon={FileText} title="Observaciones">
                <Textarea className="min-h-16" value={draft.observaciones} onChange={(e) => setDraft((c) => ({ ...c, observaciones: e.target.value }))} />
              </TaskEditorSection>
            </fieldset>
          </div>

          <div className="shrink-0 border-t border-sky-300/10 bg-[#0c1b2e]/95 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton disabled={!canSubmit} iconOnly={false} type="submit" variant="save">Guardar <kbd className="ml-1 text-[10px] opacity-70">Ctrl S</kbd></ActionButton>
              <InlineSaveFeedback />
              {!isCreate && task && (
                <>
                  <ActionButton
                    icon={Printer}
                    iconOnly={false}
                    onClick={() => setTaskPrintPreviewHtml(buildTaskReportHtml({ task, draft }))}
                    type="button"
                    variant="secondary"
                  >
                    Imprimir
                  </ActionButton>
                  <ActionButton
                    icon={FileSpreadsheet}
                    iconOnly={false}
                    onClick={() => void exportTaskReportToExcel({ task, draft }).catch((error) => {
                      setSaveStatus(error instanceof Error ? error.message : 'No se ha podido generar el Excel.');
                      setSaveStatusIsError(true);
                    })}
                    type="button"
                    variant="secondary"
                  >
                    Exportar Excel
                  </ActionButton>
                </>
              )}
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
      {taskPrintPreviewHtml && (
        <PrintPreviewModal
          html={taskPrintPreviewHtml}
          onClose={() => setTaskPrintPreviewHtml(null)}
          title="Detalle de tarea"
        />
      )}
    </>
  );
}

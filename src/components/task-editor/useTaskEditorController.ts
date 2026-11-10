import { useEffect, useMemo, useRef, useState } from 'react';
import { useConfiguracionStore } from '../../features/configuracion/store/useConfiguracionStore';
import { useCoordinacionStore } from '../../features/coordinacion/store/useCoordinacionStore';
import { parseOutlookMsg } from '../../features/especiales/domain/especiales';
import {
  CLOSED_TASK_PHASE,
  isTaskClosed,
  type Task,
  type TaskDraft,
  type TaskSeguimientoEntry,
} from '../../features/tareas/domain/task';
import { useTaskStore } from '../../features/tareas/store/useTaskStore';
import { loadFreshTaskAfterLock, hasUnsavedTaskEditorChanges } from './taskEditorLockSnapshot';
import { useEditorShortcuts } from '../../hooks/useEditorShortcuts';
import { buildRecoverableDraftKey, useRecoverableDraft } from '../../hooks/useRecoverableDraft';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useAppDialog } from '../../hooks/useAppDialog';
import { useSharedRecordLock } from '../../services/useSharedRecordLock';
import { clearPersistenceBusy, emitPersistenceFeedback, publishPersistenceBusy } from '../../services/persistenceFeedback';
import { enqueueAuditEvent } from '../../shared/audit/auditTrail';
import { useCriteriosRrllStore } from '../../features/criterios-rrll/store/useCriteriosRrllStore';
import {
  getCriterionIdForTask,
  unlinkTaskCriterion,
} from '../../features/criterios-rrll/domain/taskCriterionLinks';
import { requestTaskCriterionEditor } from '../../features/criterios-rrll/domain/taskCriterionEditorBus';
import { navigateInApp } from '../../services/appNavigationBus';
import { formatImportedTaskMail } from '../../features/tareas/domain/taskMail';
import { markTaskCreationIdsSeen } from '../../features/tareas/domain/taskCreationNotifications';
import {
  buildTaskDocumentLink,
  createInitialDraft,
  decodeTracking,
  encodeTracking,
  formatDate,
  getActiveUser,
  mergeDocumentLinks,
  resolveTrackingId,
  todayIsoDate,
  toDraft,
  type TaskRecoveryValue,
} from './taskEditorModel';

export type TaskCreateOverrideInput = {
  draft: TaskDraft;
  seguimientoText?: string;
  targets: { direction: boolean; unionName: string | null; areaName: string | null };
};

export type TaskCreateOverride = (input: TaskCreateOverrideInput) => Promise<{
  ok: boolean;
  message: string;
  recordId?: string;
}>;

export type TaskEditorControllerArgs = {
  task: Task | null;
  mode: 'create' | 'edit';
  onDone: () => void;
  initialDraft?: Partial<TaskDraft>;
  initialTrackingText?: string;
  onCreated?: (taskId: string) => void | Promise<void>;
  createTaskOverride?: TaskCreateOverride;
};

export function useTaskEditorController({
  task,
  mode,
  onDone,
  initialDraft,
  initialTrackingText = '',
  onCreated,
  createTaskOverride,
}: TaskEditorControllerArgs) {
  const taskPhases = useConfiguracionStore((state) => state.taskPhases);
  const taskOrigins = useConfiguracionStore((state) => state.taskOrigins);
  const taskResponsibles = useConfiguracionStore((state) => state.taskResponsibles);
  const directionTaskIds = useCoordinacionStore((state) => state.directionTaskIds);
  const unionTaskIds = useCoordinacionStore((state) => state.unionTaskIds);
  const areaTaskIds = useCoordinacionStore((state) => state.areaTaskIds);
  const loadCoordinacion = useCoordinacionStore((state) => state.load);
  const setTaskTargets = useCoordinacionStore((state) => state.setTaskTargets);
  const loadConfiguracion = useConfiguracionStore((state) => state.load);
  const createTask = useTaskStore((state) => state.createWithConcurrencyCheck);
  const updateTask = useTaskStore((state) => state.updateWithConcurrencyCheck);
  const removeTask = useTaskStore((state) => state.removeWithConcurrencyCheck);
  const loadCriteriosRrll = useCriteriosRrllStore((state) => state.load);
  const [linkedCriterionId, setLinkedCriterionId] = useState<string | null>(null);
  const [criterionLinkReady, setCriterionLinkReady] = useState(false);
  const { confirm: confirmTrackingDelete, dialogNode: trackingDeleteDialogNode } = useAppDialog();
  const { confirm: confirmCriterionSave, dialogNode: criterionSaveDialogNode } = useAppDialog();
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
  const [quickActionEnabled, setQuickActionEnabled] = useState(false);
  const [quickActionTitle, setQuickActionTitle] = useState('');
  const [quickActionDate, setQuickActionDate] = useState('');
  const [quickActionAssignee, setQuickActionAssignee] = useState('');
  const taskUsers = useTaskStore((state) => state.tasks);
  const quickActionAssigneeOptions = useMemo(() => Array.from(new Set([
    ...taskResponsibles.filter((item) => item.active && item.windowsUser.trim()).map((item) => item.windowsUser.trim()),
    ...taskUsers.map((item) => item.createdBy?.trim() ?? '').filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b, 'es')), [taskResponsibles, taskUsers]);
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
  const pendingTrackingSaveRef = useRef<{
    taskId: string;
    attemptId: string;
    expectedUpdatedAt: string;
    successMessage: string;
    auditSummary: string;
  } | null>(null);
  const [freshLockTaskId, setFreshLockTaskId] = useState<string | null>(null);
  const [freshLockError, setFreshLockError] = useState('');
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
  // El bloqueo solo otorga permiso de edición; la versión del formulario debe
  // recargarse de SQLite antes de aceptar escrituras desde otra instancia.
  const isLockSnapshotReady = recordLock.status === 'acquired' && freshLockTaskId === task?.id;
  const isFormReadOnly = !isCreate && (recordLock.isReadOnly || !isLockSnapshotReady);
  const lockMessage = freshLockError || (!isCreate && recordLock.status === 'acquired' && !isLockSnapshotReady
    ? 'Sincronizando la última versión de la tarea antes de editar…'
    : recordLock.message || (!isCreate && recordLock.status !== 'acquired' ? 'Adquiriendo bloqueo de edición compartida...' : ''));

  const canSubmit = draft.titulo.trim().length > 0 && !isFormReadOnly;
  const creationDate = isCreate
    ? todayIsoDate()
    : (draft.createdAt?.slice(0, 10) ?? task?.createdAt?.slice(0, 10) ?? todayIsoDate());

  useEffect(() => {
    if (isCreate || !task?.id || recordLock.status !== 'acquired') {
      setFreshLockTaskId(null);
      setFreshLockError('');
      return;
    }

    let cancelled = false;
    const taskId = task.id;
    setFreshLockTaskId(null);
    setFreshLockError('');
    void (async () => {
      try {
        const latest = await loadFreshTaskAfterLock(taskId);
        if (cancelled) return;
        // No sustituir el borrador de una persona que había comenzado a editar
        // antes de perder temporalmente el lease compartido.
        const hasPendingChanges = hasUnsavedTaskEditorChanges({
          draft, trackingText, trackingDate, sendToDirection, sendToUnion, selectedAreaTarget,
        }, recoveryBaseline);
        if (hasPendingChanges) {
          setFreshLockError('Hay cambios sin guardar tras recuperar el bloqueo. Cierra y vuelve a abrir el detalle para evitar sobrescribirlos.');
          return;
        }

        const latestDraft = toDraft(latest);
        setDraft(latestDraft);
        setLoadedUpdatedAt(latest.updatedAt);
        setRecoveryBaseline({
          draft: latestDraft,
          trackingText: '',
          trackingDate,
          sendToDirection,
          sendToUnion,
          selectedAreaTarget,
        });
        setSaveStatus('');
        setSaveStatusIsError(false);
        // Refrescar también la fila de la tabla, sin alterar otras tareas.
        useTaskStore.setState((state) => ({
          tasks: state.tasks.map((entry) => entry.id === taskId ? latest : entry),
        }));
        setFreshLockTaskId(taskId);
      } catch (error) {
        if (!cancelled) {
          setFreshLockError(`No se ha podido sincronizar la tarea: ${error instanceof Error ? error.message : String(error)}. Cierra y vuelve a abrir el detalle.`);
        }
      }
    })();
    return () => { cancelled = true; };
    // Solo refrescar al ADQUIRIR el lease o cambiar de registro; nunca durante
    // cada render o cada heartbeat de renovación del bloqueo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreate, task?.id, recordLock.status]);

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
    setQuickActionEnabled(false);
    setQuickActionTitle('');
    setQuickActionDate('');
    setQuickActionAssignee('');
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

  const updateCoordinationTargets = (taskId: string) => {
    // Guardar una tarea no equivale a modificar los circuitos de Coordinación.
    // No escribir su índice si estos campos no se han tocado: evita conflictos
    // OCC ajenos a la tarea y no restaura destinos cambiados por otra persona.
    if (!isCreate &&
      sendToDirection === recoveryBaseline.sendToDirection &&
      sendToUnion === recoveryBaseline.sendToUnion &&
      (!sendToUnion || draft.sindicato === recoveryBaseline.draft.sindicato) &&
      selectedAreaTarget === recoveryBaseline.selectedAreaTarget) {
      return Promise.resolve({ ok: true, message: 'Circuitos de Coordinación sin cambios.' });
    }
    return setTaskTargets(taskId, {
      direction: sendToDirection,
      unionName: sendToUnion && selectedUnionOrigin ? selectedUnionOrigin.nombre : null,
      areaName: selectedAreaTarget || null,
    });
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

  const handleCloseTask = async (): Promise<boolean> => {
    if (isCreate || !task || isTaskClosed(task) || isFormReadOnly) return false;

    setSaveStatus('');
    setSaveStatusIsError(false);

    const liveLock = await window.traccion?.getRecordLock?.({ module: 'tareas', recordId: task.id });
    if (!liveLock?.ok || liveLock.status !== 'acquired') {
      setSaveStatus(liveLock?.message || 'No se ha confirmado el bloqueo compartido de edición.');
      setSaveStatusIsError(true);
      return false;
    }

    if (pendingTrackingSaveRef.current?.taskId === task.id) {
      setSaveStatus('Comprueba primero el guardado incierto del seguimiento antes de cerrar esta tarea.');
      setSaveStatusIsError(true);
      return false;
    }
    const closedDraft: TaskDraft = {
      ...draft,
      estado: 'cerrada',
      fase: CLOSED_TASK_PHASE,
    };
    const result = await updateTask(task.id, closedDraft, seguimientoForSave, loadedUpdatedAt);
    if (!result.ok) {
      setSaveStatus(result.message);
      setSaveStatusIsError(true);
      return false;
    }

    clearRecoveryDraft();
    onDone();
    return true;
  };

  const handleSubmit = async (): Promise<boolean> => {
    if (task && pendingTrackingSaveRef.current?.taskId === task.id) {
      setSaveStatus('Hay un guardado de seguimiento pendiente de verificar. Comprueba primero el seguimiento; no se enviará una nueva edición de la tarea.');
      setSaveStatusIsError(true);
      return false;
    }
    if (!canSubmit) return false;
    if (quickActionEnabled && (!trackingText.trim() || !quickActionTitle.trim())) {
      setSaveStatus('Para crear una acción pendiente debes escribir el seguimiento y la actuación.');
      setSaveStatusIsError(true);
      return false;
    }
    setSaveStatus('');
    setSaveStatusIsError(false);

    if (isCreate) {
      const targets = {
        direction: sendToDirection,
        unionName: sendToUnion && selectedUnionOrigin ? selectedUnionOrigin.nombre : null,
        areaName: selectedAreaTarget || null,
      };
      const result = createTaskOverride
        ? await createTaskOverride({ draft, seguimientoText: seguimientoForSave, targets })
        : await createTask(draft, seguimientoForSave);
      if (!result.ok) {
        setSaveStatus(result.message);
        setSaveStatusIsError(true);
        return false;
      }
      if (result.recordId) {
        markTaskCreationIdsSeen(trackingUser, [result.recordId]);
        if (!createTaskOverride) {
          const coordinationResult = await updateCoordinationTargets(result.recordId);
          if (!coordinationResult.ok) {
            setSaveStatus(`Tarea guardada, pero no se ha podido actualizar Coordinación: ${coordinationResult.message}`);
            setSaveStatusIsError(true);
            return false;
          }
        }
        await onCreated?.(result.recordId);
      }
      clearRecoveryDraft();
      onDone();
      return true;
    }
    if (!task) return false;

    const liveLock = await window.traccion?.getRecordLock?.({ module: 'tareas', recordId: task.id });
    if (!liveLock?.ok || liveLock.status !== 'acquired') {
      setSaveStatus(liveLock?.message || 'No se ha confirmado el bloqueo compartido de edición.');
      setSaveStatusIsError(true);
      return false;
    }

    const result = await updateTask(task.id, draft, seguimientoForSave, loadedUpdatedAt, quickActionEnabled ? { titulo: quickActionTitle.trim(), fechaObjetivo: quickActionDate || undefined, asignadaA: quickActionAssignee || undefined } : undefined);
    if (!result.ok) {
      setSaveStatus(result.message);
      setSaveStatusIsError(true);
      return false;
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
    setQuickActionEnabled(false);
    setQuickActionTitle('');
    setQuickActionDate('');
    setQuickActionAssignee('');
    setTrackingDate(nextTrackingDate);
    clearRecoveryDraft();
    setSaveStatus(coordinationResult.ok
      ? 'Guardado correctamente. Puedes seguir editando la tarea.'
      : `Tarea guardada, pero no se ha podido actualizar Coordinación: ${coordinationResult.message}`);
    setSaveStatusIsError(!coordinationResult.ok);
    return coordinationResult.ok;
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

    if (latestTask.updatedAt !== loadedUpdatedAt && pendingTrackingSaveRef.current?.taskId !== task.id) {
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

    const pending = pendingTrackingSaveRef.current;
    if (pending?.taskId === latestTask.id) {
      const loader = window.traccion?.loadTaskRecords;
      try {
        if (!loader) throw new Error('Lectura SQLite no disponible.');
        const snapshot = await loader({ mode: 'all', id: latestTask.id });
        if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
          throw new Error('SQLite todavía no está disponible.');
        }
        const row = snapshot.records.find((record) => record.id === latestTask.id);
        const persisted = row ? JSON.parse(row.value) as Task : null;
        if (persisted?.lastSaveAttemptId === pending.attemptId) {
          pendingTrackingSaveRef.current = null;
          useTaskStore.setState((state) => ({
            tasks: state.tasks.map((candidate) => candidate.id === latestTask.id ? persisted : candidate),
          }));
          setLoadedUpdatedAt(persisted.updatedAt);
          setSaveStatus('Se ha confirmado el guardado anterior del seguimiento. No se ha duplicado.');
          setSaveStatusIsError(false);
          enqueueAuditEvent({
            module: 'tareas', entityId: latestTask.id, action: 'updated',
            summary: pending.auditSummary, changes: [],
          });
          return true;
        }
        pendingTrackingSaveRef.current = null;
        setSaveStatus(
          persisted?.updatedAt === pending.expectedUpdatedAt
            ? 'El seguimiento anterior no figura guardado. No se ha enviado otra operación. Revisa y vuelve a guardar.'
            : 'El seguimiento no se ha confirmado: la tarea tiene otra versión o ya no existe. Recarga antes de continuar.',
        );
        setSaveStatusIsError(true);
        return false;
      } catch {
        setSaveStatus('No se puede comprobar todavía el guardado del seguimiento. Conserva los cambios y vuelve a intentarlo después; no se ha enviado otro guardado.');
        setSaveStatusIsError(true);
        return false;
      }
    }

    const attemptId = `tracking-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    const updatedTask: Task = {
      ...latestTask,
      seguimiento: nextTracking,
      updatedAt: new Date().toISOString(),
      lastSaveAttemptId: attemptId,
    };

    const feedbackKey = `task-tracking:${latestTask.id}`;
    publishPersistenceBusy(feedbackKey, 'Guardando seguimiento de tarea en SQLite…');
    let result;
    try {
      result = await saveTaskRecord({
        id: latestTask.id,
        value: JSON.stringify(updatedTask),
        expectedUpdatedAt: loadedUpdatedAt,
      });
    } catch (error) {
      clearPersistenceBusy(feedbackKey);
      const message = error instanceof Error ? error.message : 'No se ha podido actualizar el seguimiento.';
      if (/resultado (?:es )?indeterminado|operación puede seguir en curso|superó el límite de \d+ ms/i.test(message)) {
        pendingTrackingSaveRef.current = { taskId: latestTask.id, attemptId, expectedUpdatedAt: latestTask.updatedAt, successMessage, auditSummary };
        setSaveStatus('El seguimiento puede haberse guardado tras el timeout. Vuelve a utilizar la misma acción para comprobarlo; no se enviará otra escritura.');
        setSaveStatusIsError(true);
        return false;
      }
      emitPersistenceFeedback({ kind: 'error', updatedAt: new Date().toISOString(), key: feedbackKey, message });
      setSaveStatus(message);
      setSaveStatusIsError(true);
      return false;
    }

    if (!result.ok) {
      clearPersistenceBusy(feedbackKey);
      if (/resultado (?:es )?indeterminado|operación puede seguir en curso|superó el límite de \d+ ms/i.test(result.message)) {
        pendingTrackingSaveRef.current = { taskId: latestTask.id, attemptId, expectedUpdatedAt: latestTask.updatedAt, successMessage, auditSummary };
        setSaveStatus('El seguimiento puede haberse guardado tras el timeout. Vuelve a utilizar la misma acción para comprobarlo; no se enviará otra escritura.');
        setSaveStatusIsError(true);
        return false;
      }
      emitPersistenceFeedback({ kind: 'error', updatedAt: new Date().toISOString(), key: feedbackKey, message: result.message || 'No se ha podido actualizar el seguimiento.' });
      setSaveStatus(result.message || 'No se ha podido actualizar el seguimiento.');
      setSaveStatusIsError(true);
      return false;
    }

    clearPersistenceBusy(feedbackKey, 'Seguimiento de tarea guardado en SQLite.');

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

  const completeQuickAction = async (trackingId: string, actionId: string) => {
    const latest = await verifyTrackingMutationCanProceed();
    if (!latest) return;
    const now = new Date().toISOString();
    const next = latest.seguimiento.map((entry, index) => {
      if (resolveTrackingId(entry, index, latest.id) !== trackingId) return entry;
      return { ...entry, quickActions: entry.quickActions?.map((action) =>
        action.id === actionId ? { ...action, completedAt: now } : action,
      ) };
    });
    await persistTrackingMutation(latest, next, 'Acción marcada como realizada.', 'Acción pendiente completada');
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
      JSON.stringify({
        draft,
        trackingText,
        trackingDate,
        sendToDirection,
        sendToUnion,
        selectedAreaTarget,
      }) !== JSON.stringify(recoveryBaseline);

    if (hasUnsavedTaskChanges) {
      const confirmed = await confirmCriterionSave(
        'Hay cambios sin guardar en la tarea. Para crear o abrir su criterio RRLL, TrAcción debe guardar primero esos cambios.',
        {
          title: 'Guardar tarea antes de abrir Criterio RRLL',
          confirmLabel: 'Guardar y abrir',
          cancelLabel: 'Cancelar',
        },
      );
      if (!confirmed) return;

      const saved = await handleSubmit();
      if (!saved) return;
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

  return {
    areaCircuitOptions,
    canSubmit,
    cancelTrackingEdit,
    clearRecoveryDraft,
    creationDate,
    criterionLinkReady,
    criterionSaveDialogNode,
    customAreaTarget,
    dialogNode,
    documentStatus,
    draft,
    editingTrackingDate,
    editingTrackingId,
    editingTrackingText,
    handleAddDocument,
    handleDeleteTracking,
    completeQuickAction,
    handleImportMailFile,
    handleOpenCriterionRrll,
    handleSaveTrackingEdit,
    handleSelectDocument,
    handleCloseTask,
    handleSubmit,
    isCommitteeCircuit,
    isCreate,
    isFormReadOnly,
    isParitariaCircuit,
    isSavingTrackingEdit,
    linkedCriterionId,
    liveTask,
    loadedUpdatedAt,
    lockMessage,
    mailDragActive,
    mailStatus,
    manualDocumentPath,
    originOptions,
    otherResponsibleValue,
    phaseOptions,
    recoveryDialogNode,
    removeTask,
    requestClose,
    responsibleOptions,
    responsibleSelectValue,
    saveStatus,
    saveStatusIsError,
    selectedAreaTarget,
    selectedUnionOrigin,
    sendToDirection,
    sendToUnion,
    setCustomAreaTarget,
    setDraft,
    setEditingTrackingDate,
    setEditingTrackingText,
    setMailDragActive,
    setManualDocumentPath,
    setSaveStatus,
    setSaveStatusIsError,
    setSelectedAreaTarget,
    setSendToDirection,
    setSendToUnion,
    setShowCircuitPicker,
    setTrackingDate,
    setTrackingText,
    showCircuitPicker,
    startTrackingEdit,
    trackingDate,
    trackingDeleteDialogNode,
    trackingItems,
    trackingText,
    trackingUser,
    quickActionEnabled,
    setQuickActionEnabled,
    quickActionTitle,
    setQuickActionTitle,
    quickActionDate,
    setQuickActionDate,
    quickActionAssignee,
    setQuickActionAssignee,
    quickActionAssigneeOptions,
    unionCircuitOptions,
  };
}

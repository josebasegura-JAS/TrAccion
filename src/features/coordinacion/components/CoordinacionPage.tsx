import { isTaskClosed } from '../../tareas/domain/task';
import { Building2, CalendarDays, CheckCircle2, ChevronLeft, FileSpreadsheet, Plus, RotateCcw, Search, Trash2, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TaskEditor } from '../../../components/TaskEditor';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Field, Input, Select, Textarea } from '../../../components/ui/Field';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { syncCoordinacionExcelBackup } from '../../../shared/export/coordinacionExcelBackup';
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import { type Task, type TaskDraft } from '../../tareas/domain/task';
import { useTaskStore } from '../../tareas/store/useTaskStore';
import { coordinationMeetingDisplayTitle, formatCoordinationDate, type CoordinationArea, type CoordinationMeeting } from '../domain/coordinacion';
import { matchingMeetingPointTitles, meetingMatchesSearch } from '../domain/coordinationMeetingSearch';
import { coordinationPointStatusLabel, useCoordinacionStore } from '../store/useCoordinacionStore';
import { SindicatosCoordinationPanel } from './SindicatosCoordinationPanel';
import type { ModuleHelpSection } from '../../../components/ModuleHelp';
import { PageHeader } from '../../../components/ui/PageHeader';
import { FloatingSaveAction } from '../../../components/ui/FloatingSaveAction';
import { CoordinationPointEditor } from './CoordinationPointEditor';
import { CoordinationTaskClosureDialog } from './CoordinationTaskClosureDialog';
import { pointToDraft, type CoordinationPointDraft } from './coordinationPointDraft';
import { closeCoordinationTasks, meetingContext, syncMeetingTracking } from '../services/coordinationMeetingTracking';

const COORDINACION_HELP_SECTIONS: ModuleHelpSection[] = [
  { title: 'Para qué sirve', items: ['Prepara y conserva las reuniones de RRLL con Dirección, otras áreas y sindicatos.', 'Permite convertir tareas abiertas en puntos de reunión, añadir puntos libres y crear tareas nuevas sin perder la relación entre reunión y seguimiento.'] },
  { title: 'Dirección', items: ['Al crear una reunión se incorporan automáticamente las tareas marcadas previamente como «Trasladar a Dirección».', 'Dentro de la reunión puedes añadir tareas activas, puntos manuales o crear una tarea nueva desde la propia reunión.', 'Cada punto puede registrar su resultado y estado. Al guardar la reunión, los puntos vinculados actualizan automáticamente el seguimiento de sus tareas.'] },
  { title: 'Otras áreas', items: ['Indica el área, fecha y, si procede, interlocutores y objetivo. Una tarea inicial es opcional.', 'Si existen tareas pendientes marcadas para esa área, TrAcción puede incorporarlas al crear la reunión.', 'Los puntos pueden ser tareas existentes, puntos no inventariados o nuevas tareas creadas desde la reunión.'] },
  { title: 'Sindicatos', items: ['El seguimiento se organiza por organización sindical y mantiene el histórico de reuniones.', 'El guion es flexible y permite registrar asuntos, resultados y compromisos de seguimiento según la reunión.', 'Utiliza el histórico para consultar lo tratado anteriormente con cada sindicato sin depender de notas externas.'] },
  { title: 'Tareas y cierre', items: ['Vincular un punto a una tarea mantiene la trazabilidad entre ambos módulos.', 'Guardar un punto vinculado crea o actualiza un único seguimiento en la tarea madre; sucesivos guardados corrigen ese mismo seguimiento sin duplicarlo. Tratar un punto en una reunión no cambia ni cierra automáticamente su tarea.', 'Al cerrar la reunión puedes decidir expresamente si no quieres cerrar ninguna tarea tratada, si quieres cerrar todas o solo algunas.', 'Un punto manual puede enlazarse posteriormente a una tarea si el asunto pasa a requerir seguimiento formal.'] },
  { title: 'Histórico y Excel', items: ['Las reuniones permanecen disponibles como histórico una vez cerradas.', 'Usa «Buscar en reuniones» para localizar asuntos, acuerdos, responsables, interlocutores u objetivos en reuniones abiertas y cerradas.', 'Si una reunión se cerró por error, puedes reabrirla sin crear una copia ni perder sus puntos o vínculos.', 'El Excel automático utiliza la ruta configurada en Ajustes. Comprueba esa ruta si la exportación no puede actualizarse.', 'Eliminar una reunión o un punto manual debe reservarse para registros creados por error; para reuniones celebradas es preferible conservar el histórico.'] },
];

function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function isActiveTask(task: Task): boolean {
  return !task.deletedAt && !isTaskClosed(task);
}

export function CoordinacionPage({ initialMeetingId = null, navigationNonce }: { initialMeetingId?: string | null; navigationNonce?: number }) {
  const tasks = useTaskStore((state) => state.tasks);
  const loadTasks = useTaskStore((state) => state.load);
  const meetings = useCoordinacionStore((state) => state.meetings);
  const load = useCoordinacionStore((state) => state.load);
  const createDirectionMeeting = useCoordinacionStore((state) => state.createDirectionMeeting);
  const createOtherAreaMeeting = useCoordinacionStore((state) => state.createOtherAreaMeeting);
  const addManualPoint = useCoordinacionStore((state) => state.addManualPoint);
  const addTaskPoint = useCoordinacionStore((state) => state.addTaskPoint);
  const linkManualPointToTask = useCoordinacionStore((state) => state.linkManualPointToTask);
  const saveMeetingPoints = useCoordinacionStore((state) => state.saveMeetingPoints);
  const deleteManualPoint = useCoordinacionStore((state) => state.deleteManualPoint);
  const deleteMeeting = useCoordinacionStore((state) => state.deleteMeeting);
  const closeMeeting = useCoordinacionStore((state) => state.closeMeeting);
  const reopenMeeting = useCoordinacionStore((state) => state.reopenMeeting);
  const markedCount = useCoordinacionStore((state) => state.directionTaskIds.length);
  const areaTaskIds = useCoordinacionStore((state) => state.areaTaskIds);
  const backupPath = useConfiguracionStore((state) => state.rutaExportacionCoordinacion);
  const loadConfig = useConfiguracionStore((state) => state.load);
  const [area, setArea] = useState<CoordinationArea>('direccion');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [meetingTitle, setMeetingTitle] = useState('');
  const [areaName, setAreaName] = useState('');
  const [referenceTaskId, setReferenceTaskId] = useState('');
  const [interlocutors, setInterlocutors] = useState('');
  const [purpose, setPurpose] = useState('');
  const [newPoint, setNewPoint] = useState('');
  const [taskToAdd, setTaskToAdd] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [meetingSearch, setMeetingSearch] = useState('');
  const [taskCreation, setTaskCreation] = useState<{ pointId: string | null } | null>(null);
  const [status, setStatus] = useState('');
  const [isSavingMeeting, setIsSavingMeeting] = useState(false);
  const [taskClosurePrompt, setTaskClosurePrompt] = useState<{
    meetingId: string;
    tasks: Array<{ id: string; title: string; responsible: string }>;
    trackingFailures: string[];
  } | null>(null);
  const pointDraftsRef = useRef<Record<string, CoordinationPointDraft>>({});
  const dirtyPointIdsRef = useRef<Set<string>>(new Set());
  const [hasUnsavedMeetingChanges, setHasUnsavedMeetingChanges] = useState(false);
  const processedNavigationNonceRef = useRef<number | undefined>(undefined);
  const { confirm, dialogNode } = useAppDialog();

  useEffect(() => { load(); loadTasks(); loadConfig(); }, [load, loadConfig, loadTasks]);

  useEffect(() => {
    if (!initialMeetingId || navigationNonce === undefined || processedNavigationNonceRef.current === navigationNonce) return;
    const target = meetings.find((meeting) => meeting.id === initialMeetingId);
    if (!target) return;
    processedNavigationNonceRef.current = navigationNonce;
    setArea(target.area);
    setSelectedId(target.id);
  }, [initialMeetingId, meetings, navigationNonce]);

  const activeTasks = useMemo(() => tasks.filter(isActiveTask).sort((a, b) => a.titulo.localeCompare(b.titulo, 'es')), [tasks]);
  const markedAreaCount = useMemo(() => {
    const normalized = areaName.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!normalized) return 0;
    const match = Object.entries(areaTaskIds).find(([name]) => name.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '') === normalized);
    return match?.[1].length ?? 0;
  }, [areaName, areaTaskIds]);
  const visibleMeetings = useMemo(
    () => meetings.filter((meeting) => meeting.area === area).sort((a, b) => b.date.localeCompare(a.date)),
    [area, meetings],
  );
  const normalizedMeetingSearch = meetingSearch.trim();
  const meetingSearchResults = useMemo(
    () => normalizedMeetingSearch
      ? meetings.filter((meeting) => meetingMatchesSearch(meeting, normalizedMeetingSearch)).sort((a, b) => b.date.localeCompare(a.date))
      : [],
    [meetings, normalizedMeetingSearch],
  );
  const selected = meetings.find((meeting) => meeting.id === selectedId) ?? null;
  useEffect(() => {
    if (!selectedId) {
      pointDraftsRef.current = {};
      dirtyPointIdsRef.current = new Set();
      setHasUnsavedMeetingChanges(false);
      return;
    }
    const meeting = useCoordinacionStore.getState().meetings.find((item) => item.id === selectedId);
    if (!meeting) {
      pointDraftsRef.current = {};
      dirtyPointIdsRef.current = new Set();
      setHasUnsavedMeetingChanges(false);
      return;
    }
    pointDraftsRef.current = Object.fromEntries(meeting.points.map((point) => [point.id, pointToDraft(point)]));
    dirtyPointIdsRef.current = new Set();
    setHasUnsavedMeetingChanges(false);
  }, [selectedId]);

  const handlePointDraftChange = useCallback((pointId: string, draft: CoordinationPointDraft, dirty: boolean) => {
    pointDraftsRef.current[pointId] = draft;
    if (dirty) dirtyPointIdsRef.current.add(pointId); else dirtyPointIdsRef.current.delete(pointId);
    const hasDirtyPoints = dirtyPointIdsRef.current.size > 0;
    setHasUnsavedMeetingChanges((current) => current === hasDirtyPoints ? current : hasDirtyPoints);
  }, []);

  const backup = async () => {
    const message = await syncCoordinacionExcelBackup(useCoordinacionStore.getState().meetings);
    if (message) setStatus(message);
  };

  const handleSaveMeeting = async (tolerateTrackingFailures = false) => {
    if (!selected || selected.status === 'closed' || isSavingMeeting) return false;
    const dirtyPointIds = new Set(dirtyPointIdsRef.current);
    const patches = selected.points.map((point) => {
      const draft = pointDraftsRef.current[point.id] ?? pointToDraft(point);
      return { pointId: point.id, patch: draft };
    });
    setIsSavingMeeting(true);
    setStatus('Guardando cambios…');
    try {
      const result = await saveMeetingPoints(selected.id, patches);
      if (!result.ok) { setStatus(result.message || 'No se han podido guardar los cambios de la reunión.'); return false; }
      const latest = useCoordinacionStore.getState().meetings.find((meeting) => meeting.id === selected.id);
      if (!latest) { setStatus('La reunión se ha guardado, pero no se ha podido recargar para actualizar las tareas vinculadas.'); return false; }

      const trackingFailures = await syncMeetingTracking(latest, dirtyPointIds, {
        allowStatusOnly: false,
      });
      const failedPointIds = new Set(trackingFailures.map((failure) => failure.pointId));
      pointDraftsRef.current = Object.fromEntries(latest.points.map((point) => [point.id, pointToDraft(point)]));
      dirtyPointIdsRef.current = failedPointIds;
      setHasUnsavedMeetingChanges(failedPointIds.size > 0);
      if (trackingFailures.length > 0) {
        setStatus(`La reunión se ha guardado, pero no se ha podido actualizar el seguimiento de ${trackingFailures.length} tarea(s): ${trackingFailures.map((failure) => failure.message).join(' | ')}`);
        await backup();
        return tolerateTrackingFailures;
      }

      setStatus('Cambios guardados y seguimiento de tareas actualizado.');
      await backup();
      return true;
    } finally {
      setIsSavingMeeting(false);
    }
  };

  const handleCreate = async () => {
    setStatus('');
    const result = area === 'direccion'
      ? await createDirectionMeeting(date, meetingTitle, tasks)
      : await createOtherAreaMeeting(date, meetingTitle, areaName, referenceTaskId, interlocutors, purpose, tasks);
    if (!result.ok) { setStatus(result.message); return; }
    setSelectedId(result.recordId ?? null);
    setMeetingTitle('');
    if (area !== 'direccion') { setAreaName(''); setReferenceTaskId(''); setInterlocutors(''); setPurpose(''); }
    await backup();
  };

  const handleAddManual = async () => {
    if (!selected) return;
    const result = await addManualPoint(selected.id, newPoint);
    setStatus(result.message);
    if (result.ok) { setNewPoint(''); await backup(); }
  };

  const handleAddTask = async () => {
    if (!selected || !taskToAdd) return;
    const result = await addTaskPoint(selected.id, taskToAdd, tasks);
    setStatus(result.ok ? 'Tarea añadida al guion.' : result.message);
    if (result.ok) {
      setTaskToAdd('');
      setTaskSearch('');
      await backup();
    }
  };

  const handleCreatedTask = async (taskId: string) => {
    if (!selected) return;
    const currentTasks = useTaskStore.getState().tasks;
    const result = taskCreation?.pointId
      ? await linkManualPointToTask(selected.id, taskCreation.pointId, taskId, currentTasks)
      : await addTaskPoint(selected.id, taskId, currentTasks);
    setStatus(result.ok
      ? taskCreation?.pointId ? 'Punto convertido en tarea y vinculado a la reunión.' : 'Tarea creada y añadida a la reunión.'
      : `La tarea se ha creado, pero no ha podido vincularse a la reunión: ${result.message}`);
    if (result.ok) await backup();
  };

  const finalizeMeetingClose = async (
    meetingId: string,
    taskIdsToClose: string[],
    trackingFailures: string[],
  ) => {
    setTaskClosurePrompt(null);
    const result = await closeMeeting(meetingId);
    if (!result.ok) { setStatus(result.message); return; }

    const taskFailures = taskIdsToClose.length > 0
      ? await closeCoordinationTasks(taskIdsToClose)
      : [];
    const warnings = [
      ...trackingFailures,
      ...taskFailures.map((failure) => failure.message),
    ];

    if (warnings.length > 0) {
      setStatus(`Reunión cerrada. Hay ${warnings.length} incidencia(s) de sincronización de tareas: ${warnings.join(' | ')}`);
    } else if (taskIdsToClose.length > 0) {
      setStatus(`Reunión cerrada. Se han cerrado ${taskIdsToClose.length} tarea(s) seleccionada(s).`);
    } else {
      setStatus('Reunión cerrada. Las tareas vinculadas mantienen su estado y fase.');
    }
    await backup();
  };

  const handleClose = async () => {
    if (!selected) return;
    const saved = await handleSaveMeeting(true);
    if (!saved) return;
    const latest = useCoordinacionStore.getState().meetings.find((meeting) => meeting.id === selected.id);
    if (!latest) { setStatus('No se ha encontrado la reunión después de guardar los cambios.'); return; }
    const pending = latest.points.filter((point) => point.status === 'pendiente').length;
    if (pending > 0) { setStatus(`Quedan ${pending} punto(s) sin resultado. Indica si se resolvieron, requieren seguimiento, vuelven a la próxima reunión o no se trataron.`); return; }

    const trackingFailures = await syncMeetingTracking(
      latest,
      latest.points.filter((point) => point.status !== 'pendiente').map((point) => point.id),
      { allowStatusOnly: true },
    );

    const treatedTaskIds = new Set(
      latest.points
        .filter((point) => point.status === 'tratado' && point.taskId)
        .map((point) => point.taskId as string),
    );
    const treatedTasks = useTaskStore.getState().tasks
      .filter((task) => treatedTaskIds.has(task.id) && isActiveTask(task))
      .map((task) => ({ id: task.id, title: task.titulo, responsible: task.responsable }));
    const failureMessages = trackingFailures.map((failure) => failure.message);

    if (treatedTasks.length === 0) {
      await finalizeMeetingClose(latest.id, [], failureMessages);
      return;
    }

    setTaskClosurePrompt({
      meetingId: latest.id,
      tasks: treatedTasks,
      trackingFailures: failureMessages,
    });
  };

  const handleReopen = async () => {
    if (!selected || selected.status !== 'closed') return;
    const confirmed = await confirm(
      `La reunión “${coordinationMeetingDisplayTitle(selected)}” del ${formatCoordinationDate(selected.date)} volverá a estar abierta y podrá editarse de nuevo. Se conservarán todos sus puntos, vínculos y seguimientos ya registrados.`,
      {
        title: 'Reabrir reunión',
        confirmLabel: 'Reabrir reunión',
        cancelLabel: 'Cancelar',
      },
    );
    if (!confirmed) return;
    const result = await reopenMeeting(selected.id);
    setStatus(result.ok ? 'Reunión reabierta. Puedes volver a editarla y cerrarla cuando corresponda.' : result.message);
    if (result.ok) await backup();
  };

  const handleDeleteMeeting = async () => {
    if (!selected) return;
    const warning = selected.status === 'closed' ? '\n\nLos seguimientos ya registrados en las tareas vinculadas se conservarán.' : '';
    const confirmed = await confirm(`Se eliminará la reunión “${coordinationMeetingDisplayTitle(selected)}” del ${formatCoordinationDate(selected.date)} y todos sus puntos.${warning}`, {
      title: 'Eliminar reunión', confirmLabel: 'Eliminar reunión', cancelLabel: 'Cancelar', danger: true,
    });
    if (!confirmed) return;
    const result = await deleteMeeting(selected.id);
    setStatus(result.ok ? 'Reunión eliminada.' : result.message);
    if (result.ok) { setSelectedId(null); await backup(); }
  };

  const handleDeleteManualPoint = async (pointId: string, title: string) => {
    if (!selected) return;
    const confirmed = await confirm(`Se eliminará el punto manual “${title}”.`, {
      title: 'Eliminar punto manual', confirmLabel: 'Eliminar', cancelLabel: 'Cancelar', danger: true,
    });
    if (!confirmed) return;
    const result = await deleteManualPoint(selected.id, pointId);
    setStatus(result.ok ? 'Punto manual eliminado.' : result.message);
    if (result.ok) {
      delete pointDraftsRef.current[pointId];
      dirtyPointIdsRef.current.delete(pointId);
      setHasUnsavedMeetingChanges(dirtyPointIdsRef.current.size > 0);
      await backup();
    }
  };

  if (selected) {
    const isDirection = selected.area === 'direccion';
    const isUnion = selected.area === 'sindicatos';
    const normalizedTaskSearch = taskSearch.trim().toLocaleLowerCase('es');
    const availableTasks = activeTasks.filter((task) =>
      !selected.points.some((point) => point.taskId === task.id)
      && (!normalizedTaskSearch
        || task.titulo.toLocaleLowerCase('es').includes(normalizedTaskSearch)
        || task.responsable.toLocaleLowerCase('es').includes(normalizedTaskSearch)
        || task.sindicato.toLocaleLowerCase('es').includes(normalizedTaskSearch)),
    );
    const sourcePoint = taskCreation?.pointId
      ? selected.points.find((point) => point.id === taskCreation.pointId) ?? null
      : null;
    const taskInitialDraft: Partial<TaskDraft> = {
      titulo: sourcePoint?.title ?? '',
      descripcion: sourcePoint?.detail ?? '',
      responsable: sourcePoint?.responsible ?? '',
      fechaLimite: sourcePoint?.dueDate ?? '',
      origen: `Reunión con ${meetingContext(selected)}`,
    };
    const taskInitialTrackingText = sourcePoint
      ? `Tarea creada durante la reunión “${coordinationMeetingDisplayTitle(selected)}” con ${meetingContext(selected)} del ${formatCoordinationDate(selected.date)}, a partir del punto “${sourcePoint.title}”.`
      : `Tarea creada durante la reunión “${coordinationMeetingDisplayTitle(selected)}” con ${meetingContext(selected)} del ${formatCoordinationDate(selected.date)}.`;
    const exportPayload = {
      title: `${coordinationMeetingDisplayTitle(selected)} · ${meetingContext(selected)} · ${formatCoordinationDate(selected.date)}`,
      filename: `reunion-${meetingContext(selected)}-${selected.date}`,
      filterLabel: selected.status === 'closed' ? 'Reunión cerrada' : 'Guion de reunión',
      rows: selected.points,
      columns: [
        { key: 'title', header: 'Asunto', value: (point: CoordinationMeeting['points'][number]) => point.title },
        { key: 'detail', header: 'Detalle', value: (point: CoordinationMeeting['points'][number]) => point.detail },
        { key: 'status', header: 'Estado', value: (point: CoordinationMeeting['points'][number]) => coordinationPointStatusLabel(point.status) },
        { key: 'result', header: 'Resultado / acuerdo', value: (point: CoordinationMeeting['points'][number]) => point.result },
        { key: 'responsible', header: 'Responsable', value: (point: CoordinationMeeting['points'][number]) => point.responsible ?? '' },
        { key: 'dueDate', header: 'Fecha compromiso', value: (point: CoordinationMeeting['points'][number]) => point.dueDate ?? '' },
      ],
    };
    return <section className="space-y-4">
      <PageHeader title="Coordinación" helpSections={COORDINACION_HELP_SECTIONS} helpSubtitle="Guía rápida para preparar reuniones, vincular tareas y conservar el histórico." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-metro-muted hover:text-metro-text" onClick={() => setSelectedId(null)} type="button"><ChevronLeft size={15}/>Volver</button>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Coordinación · {meetingContext(selected)} · {formatCoordinationDate(selected.date)}</p>
          <h2 className="mt-1 text-2xl font-bold text-metro-text">{coordinationMeetingDisplayTitle(selected)}</h2>
          {!isDirection && <p className="mt-1 text-sm text-metro-muted">{isUnion && selected.meetingType ? `${selected.meetingType === 'urgente' ? 'Urgente' : selected.meetingType === 'seguimiento' ? 'Seguimiento' : 'Ordinaria'} · ` : ''}{selected.interlocutors ? `Interlocutores: ${selected.interlocutors}` : 'Sin interlocutores indicados'}{selected.purpose ? ` · ${selected.purpose}` : ''}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton icon={FileSpreadsheet} iconOnly={false} onClick={() => void backup()} size="sm" variant="secondary">Actualizar Excel</ActionButton>
          {isUnion && <ExportPrintButtons payload={exportPayload} size="sm" />}
          <ActionButton icon={Trash2} iconOnly={false} onClick={() => void handleDeleteMeeting()} size="sm" variant="delete">Eliminar reunión</ActionButton>
          {selected.status === 'closed' && <ActionButton icon={RotateCcw} iconOnly={false} onClick={() => void handleReopen()} size="sm" variant="secondary">Reabrir reunión</ActionButton>}
          {selected.status === 'open' && <ActionButton icon={CheckCircle2} iconOnly={false} onClick={() => void handleClose()} size="sm" variant="primary">Cerrar reunión</ActionButton>}
        </div>
      </div>
      <div className="ui-section p-3">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-bold text-metro-text">Guion de reunión</h3><span className="text-xs font-semibold text-metro-muted">{selected.points.length} puntos</span></div>
        <div className="space-y-3">
          {selected.points.map((point, index) => (
            <CoordinationPointEditor
              index={index}
              isUnion={isUnion}
              key={point.id}
              meetingOpen={selected.status === 'open'}
              onConvertToTask={(pointId) => setTaskCreation({ pointId })}
              onDelete={(pointId, title) => void handleDeleteManualPoint(pointId, title)}
              onDraftChange={handlePointDraftChange}
              point={point}
            />
          ))}
          {selected.points.length === 0 && <p className="rounded-xl border border-dashed border-metro-border p-5 text-center text-sm text-metro-muted">La reunión todavía no tiene puntos.</p>}
        </div>
        {selected.status === 'open' && <div className="mt-4 space-y-3">
          <div className="flex gap-2"><Input className="min-w-0 flex-1" density="compact" onChange={(event) => setNewPoint(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleAddManual(); }} placeholder="Añadir otro punto al guion..." value={newPoint}/><ActionButton icon={Plus} iconOnly={false} onClick={() => void handleAddManual()} size="sm" variant="primary">Crear punto</ActionButton></div>
          <div className="ui-subsection p-3">
            <p className="text-xs font-bold text-metro-text">Añadir una tarea abierta</p>
            <p className="mt-1 text-xs text-metro-muted">Puedes incorporar cualquier tarea activa aunque no estuviera marcada previamente para esta reunión.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(160px,0.7fr)_minmax(220px,1.3fr)_auto]">
              <Input className="min-w-0" density="compact" onChange={(event) => { setTaskSearch(event.target.value); setTaskToAdd(''); }} placeholder="Buscar tarea..." value={taskSearch}/>
              <Select className="min-w-0" density="compact" onChange={(event) => setTaskToAdd(event.target.value)} value={taskToAdd}><option value="">{availableTasks.length ? 'Selecciona una tarea activa' : 'No hay tareas coincidentes'}</option>{availableTasks.map((task) => <option key={task.id} value={task.id}>{task.titulo}{task.responsable ? ` · ${task.responsable}` : ''}</option>)}</Select>
              <ActionButton disabled={!taskToAdd} iconOnly={false} onClick={() => void handleAddTask()} size="sm" variant="secondary">Añadir tarea</ActionButton>
            </div>
          </div>
          <ActionButton icon={Plus} iconOnly={false} onClick={() => setTaskCreation({ pointId: null })} size="sm" variant="secondary">Crear nueva tarea desde la reunión</ActionButton>
        </div>}
      </div>
      <FloatingSaveAction
        onSave={handleSaveMeeting}
        saving={isSavingMeeting}
        visible={selected.status === 'open' && hasUnsavedMeetingChanges}
      />
      {status && <p className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-xs font-semibold text-metro-muted">{status}</p>}
      {taskCreation && <TaskEditor initialDraft={taskInitialDraft} initialTrackingText={taskInitialTrackingText} key={`meeting-task-${taskCreation.pointId ?? 'new'}`} mode="create" onCreated={handleCreatedTask} onDone={() => setTaskCreation(null)} task={null} />}
      {taskClosurePrompt && (
        <CoordinationTaskClosureDialog
          key={taskClosurePrompt.meetingId}
          onCancel={() => setTaskClosurePrompt(null)}
          onCloseAll={() => void finalizeMeetingClose(
            taskClosurePrompt.meetingId,
            taskClosurePrompt.tasks.map((task) => task.id),
            taskClosurePrompt.trackingFailures,
          )}
          onCloseNone={() => void finalizeMeetingClose(
            taskClosurePrompt.meetingId,
            [],
            taskClosurePrompt.trackingFailures,
          )}
          onCloseSelected={(taskIds) => void finalizeMeetingClose(
            taskClosurePrompt.meetingId,
            taskIds,
            taskClosurePrompt.trackingFailures,
          )}
          tasks={taskClosurePrompt.tasks}
        />
      )}
      {dialogNode}
    </section>;
  }

  return <section className="space-y-3">
    <PageHeader title="Coordinación" helpSections={COORDINACION_HELP_SECTIONS} helpSubtitle="Guía rápida para preparar reuniones, vincular tareas y conservar el histórico." />
    <div className="ui-section p-3">
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-metro-muted" size={16}/>
        <Input
          aria-label="Buscar en reuniones"
          className="pl-9"
          density="compact"
          onChange={(event) => setMeetingSearch(event.target.value)}
          placeholder="Buscar en reuniones: título, tema, acuerdo, responsable, área, sindicato..."
          value={meetingSearch}
        />
      </div>
      {normalizedMeetingSearch && <div className="mt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-metro-muted">{meetingSearchResults.length} reunión{meetingSearchResults.length === 1 ? '' : 'es'} encontrada{meetingSearchResults.length === 1 ? '' : 's'}</p>
          <ActionButton icon={RotateCcw} iconOnly={false} onClick={() => setMeetingSearch('')} size="sm" variant="secondary">Limpiar búsqueda</ActionButton>
        </div>
        <div className="space-y-2">
          {meetingSearchResults.map((meeting) => {
            const matchedPoints = matchingMeetingPointTitles(meeting, normalizedMeetingSearch);
            return <button
              className="ui-list-row"
              key={meeting.id}
              onClick={() => { setArea(meeting.area); setSelectedId(meeting.id); }}
              type="button"
            >
              <span className="min-w-0">
                <strong className="block truncate text-sm text-metro-text">{coordinationMeetingDisplayTitle(meeting)}</strong>
                <span className="block truncate text-xs text-metro-muted">{meetingContext(meeting)} · {formatCoordinationDate(meeting.date)} · 
                  {matchedPoints.length > 0 ? matchedPoints.join(' · ') : meeting.purpose || meeting.interlocutors || `${meeting.points.length} punto${meeting.points.length === 1 ? '' : 's'}`}
                </span>
              </span>
              <StatusBadge tone={meeting.status === 'closed' ? 'success' : 'warning'} size="xs">{meeting.status === 'closed' ? 'Cerrada' : 'Abierta'}</StatusBadge>
            </button>;
          })}
          {meetingSearchResults.length === 0 && <p className="rounded-xl border border-dashed border-metro-border p-5 text-center text-sm text-metro-muted">No hay reuniones que coincidan con la búsqueda.</p>}
        </div>
      </div>}
    </div>
    {!normalizedMeetingSearch && <>
    <div className="grid gap-2 md:grid-cols-3">
      <button className={`ui-area-selector ${area === 'direccion' ? 'ui-area-selector--active' : ''}`} onClick={() => setArea('direccion')} type="button"><Building2 className="mb-2 text-metro-red" size={20}/><strong className="block text-metro-text">Dirección</strong><span className="text-xs text-metro-muted">Tareas marcadas, nuevas tareas y puntos libres</span></button>
      <button className={`ui-area-selector ${area === 'otras-areas' ? 'ui-area-selector--active' : ''}`} onClick={() => setArea('otras-areas')} type="button"><UsersRound className="mb-2 text-metro-red" size={20}/><strong className="block text-metro-text">Otras áreas</strong><span className="text-xs text-metro-muted">Tareas existentes, nuevas y puntos libres</span></button>
      <button className={`ui-area-selector ${area === 'sindicatos' ? 'ui-area-selector--active' : ''}`} onClick={() => setArea('sindicatos')} type="button"><UsersRound className="mb-2 text-metro-red" size={20}/><strong className="block text-metro-text">Sindicatos</strong><span className="text-xs text-metro-muted">Guion flexible e histórico por organización</span></button>
    </div>
    {area === 'sindicatos' ? <SindicatosCoordinationPanel onChanged={backup} onOpenMeeting={setSelectedId} onStatus={setStatus} tasks={tasks}/> : <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      {area === 'direccion' ? <div className="ui-section p-3"><h3 className="font-bold text-metro-text">Nueva reunión con Dirección</h3><p className="mt-1 text-xs leading-5 text-metro-muted">Se incorporarán automáticamente las {markedCount} tarea(s) marcadas para trasladar a Dirección.</p><Field className="mt-4" density="compact" label="Título de la reunión" required><Input maxLength={120} onChange={(event) => setMeetingTitle(event.target.value)} placeholder="Ej. Seguimiento plantilla 2027" required value={meetingTitle}/></Field><Field className="mt-3" density="compact" label="Fecha"><Input dateTone="request" onChange={(event) => setDate(event.target.value)} type="date" value={date}/></Field><ActionButton className="mt-3 w-full" disabled={!meetingTitle.trim()} icon={CalendarDays} iconOnly={false} onClick={() => void handleCreate()} size="sm" variant="primary">Crear reunión</ActionButton><p className="mt-3 break-words text-xs text-metro-muted">Backup: {backupPath || 'Configura la ruta en Ajustes'}</p></div>
      : <div className="ui-section p-3"><h3 className="font-bold text-metro-text">Nueva reunión con otra área</h3><p className="mt-1 text-xs leading-5 text-metro-muted">{areaName.trim() ? `Se incorporarán automáticamente ${markedAreaCount} tarea(s) pendiente(s) para ${areaName.trim()}. También puedes añadir una tarea inicial opcional.` : 'Indica el área. Si tiene asuntos marcados desde Tareas, se incorporarán automáticamente al crear la reunión.'}</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field className="sm:col-span-2" density="compact" label="Título de la reunión" required><Input maxLength={120} onChange={(event) => setMeetingTitle(event.target.value)} placeholder="Ej. Cobertura turnos y necesidades de personal" required value={meetingTitle}/></Field><Field density="compact" label="Área" required><Input onChange={(event) => setAreaName(event.target.value)} placeholder="Operaciones, Prevención, Finanzas..." required value={areaName}/></Field><Field density="compact" label="Tarea inicial · opcional"><Select onChange={(event) => setReferenceTaskId(event.target.value)} value={referenceTaskId}><option value="">Sin tarea inicial</option>{activeTasks.map((task) => <option key={task.id} value={task.id}>{task.titulo}</option>)}</Select></Field><Field density="compact" label="Fecha"><Input dateTone="request" onChange={(event) => setDate(event.target.value)} type="date" value={date}/></Field><Field density="compact" label="Interlocutores"><Input onChange={(event) => setInterlocutors(event.target.value)} placeholder="Personas participantes" value={interlocutors}/></Field><Field className="sm:col-span-2" density="compact" label="Objetivo"><Textarea className="min-h-16" onChange={(event) => setPurpose(event.target.value)} placeholder="Qué se necesita tratar o resolver" value={purpose}/></Field></div><ActionButton className="mt-3 w-full" disabled={!meetingTitle.trim() || !areaName.trim()} icon={CalendarDays} iconOnly={false} onClick={() => void handleCreate()} size="sm" variant="primary">Crear reunión</ActionButton></div>}
      <div className="ui-section p-3"><h3 className="mb-3 font-bold text-metro-text">{area === 'direccion' ? 'Reuniones de Dirección' : 'Reuniones con otras áreas'}</h3><div className="space-y-2">{visibleMeetings.map((meeting) => <button className="ui-list-row" key={meeting.id} onClick={() => setSelectedId(meeting.id)} type="button"><span className="min-w-0"><strong className="block truncate text-sm text-metro-text">{coordinationMeetingDisplayTitle(meeting)}</strong><span className="block truncate text-xs text-metro-muted">{area === 'direccion' ? `${formatCoordinationDate(meeting.date)} · ${meeting.points.length} puntos` : `${meeting.areaName || 'Área sin indicar'} · ${formatCoordinationDate(meeting.date)} · ${meeting.points.length ? `${meeting.points.length} asunto${meeting.points.length === 1 ? '' : 's'}` : 'Sin asuntos todavía'}`}</span></span><StatusBadge tone={meeting.status === 'closed' ? 'success' : 'warning'} size="xs">{meeting.status === 'closed' ? 'Cerrada' : 'Abierta'}</StatusBadge></button>)}{visibleMeetings.length === 0 && <p className="rounded-xl border border-dashed border-metro-border p-5 text-center text-sm text-metro-muted">Todavía no hay reuniones registradas.</p>}</div></div>
    </div>}
    </>}
    {status && <p className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-xs font-semibold text-metro-muted">{status}</p>}{dialogNode}
  </section>;
}

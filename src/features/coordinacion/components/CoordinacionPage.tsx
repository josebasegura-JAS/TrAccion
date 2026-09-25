import { ArrowRight, Building2, CalendarDays, CheckCircle2, ChevronLeft, FileSpreadsheet, Plus, Trash2, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TaskEditor } from '../../../components/TaskEditor';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { syncCoordinacionExcelBackup } from '../../../shared/export/coordinacionExcelBackup';
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import { CLOSED_TASK_PHASE, type Task, type TaskDraft } from '../../tareas/domain/task';
import { useTaskStore } from '../../tareas/store/useTaskStore';
import { formatCoordinationDate, type CoordinationArea, type CoordinationMeeting, type CoordinationPointStatus } from '../domain/coordinacion';
import { coordinationPointStatusLabel, useCoordinacionStore } from '../store/useCoordinacionStore';
import { SindicatosCoordinationPanel } from './SindicatosCoordinationPanel';
import { navigateInApp } from '../../../services/appNavigationBus';

function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function taskToDraft(task: Task): TaskDraft {
  return {
    titulo: task.titulo, descripcion: task.descripcion, tipo: task.tipo, fase: task.fase,
    estado: task.estado, prioridad: task.prioridad, fechaLimite: task.fechaLimite,
    responsable: task.responsable, origen: task.origen, sindicato: task.sindicato,
    observaciones: task.observaciones, mail: task.mail, documentLinks: task.documentLinks,
    createdAt: task.createdAt,
  };
}

function meetingContext(meeting: CoordinationMeeting): string {
  if (meeting.area === 'direccion') return 'Dirección';
  if (meeting.area === 'sindicatos') return meeting.unionName?.trim() || 'sindicato';
  return meeting.areaName?.trim() || 'otra área';
}

async function appendMeetingTracking(meeting: CoordinationMeeting): Promise<string[]> {
  const failures: string[] = [];
  for (const point of meeting.points) {
    if (!point.taskId || point.status === 'pendiente') continue;
    const task = useTaskStore.getState().tasks.find((candidate) => candidate.id === point.taskId);
    if (!task || task.deletedAt) continue;
    const resultText = point.result.trim() || coordinationPointStatusLabel(point.status);
    const tracking = `Coordinación RRLL con ${meetingContext(meeting)} · ${formatCoordinationDate(meeting.date)}\n${coordinationPointStatusLabel(point.status)}${point.result.trim() ? ` · ${resultText}` : ''}`;
    if (task.seguimiento.some((entry) => entry.texto.includes(tracking))) continue;
    const draft = taskToDraft(task);
    if (point.status === 'tratado') {
      draft.estado = 'cerrada';
      draft.fase = CLOSED_TASK_PHASE;
    }
    const result = await useTaskStore.getState().updateWithConcurrencyCheck(task.id, draft, tracking, task.updatedAt);
    if (!result.ok) failures.push(`${task.titulo}: ${result.message}`);
  }
  return failures;
}

function isActiveTask(task: Task): boolean {
  return !task.deletedAt && task.estado !== 'cerrada' && task.fase.trim().toLowerCase() !== 'cerrada';
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
  const updatePoint = useCoordinacionStore((state) => state.updatePoint);
  const deleteManualPoint = useCoordinacionStore((state) => state.deleteManualPoint);
  const deleteMeeting = useCoordinacionStore((state) => state.deleteMeeting);
  const closeMeeting = useCoordinacionStore((state) => state.closeMeeting);
  const markedCount = useCoordinacionStore((state) => state.directionTaskIds.length);
  const areaTaskIds = useCoordinacionStore((state) => state.areaTaskIds);
  const backupPath = useConfiguracionStore((state) => state.rutaExportacionCoordinacion);
  const loadConfig = useConfiguracionStore((state) => state.load);
  const [area, setArea] = useState<CoordinationArea>('direccion');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [areaName, setAreaName] = useState('');
  const [referenceTaskId, setReferenceTaskId] = useState('');
  const [interlocutors, setInterlocutors] = useState('');
  const [purpose, setPurpose] = useState('');
  const [newPoint, setNewPoint] = useState('');
  const [taskToAdd, setTaskToAdd] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [taskCreation, setTaskCreation] = useState<{ pointId: string | null } | null>(null);
  const [status, setStatus] = useState('');
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
  const selected = meetings.find((meeting) => meeting.id === selectedId) ?? null;

  const backup = async () => {
    const message = await syncCoordinacionExcelBackup(useCoordinacionStore.getState().meetings);
    if (message) setStatus(message);
  };

  const handleCreate = async () => {
    setStatus('');
    const result = area === 'direccion'
      ? await createDirectionMeeting(date, tasks)
      : await createOtherAreaMeeting(date, areaName, referenceTaskId, interlocutors, purpose, tasks);
    if (!result.ok) { setStatus(result.message); return; }
    setSelectedId(result.recordId ?? null);
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

  const handleClose = async () => {
    if (!selected) return;
    const pending = selected.points.filter((point) => point.status === 'pendiente').length;
    if (pending > 0) { setStatus(`Quedan ${pending} punto(s) sin resultado. Indica si se resolvieron, requieren seguimiento, vuelven a la próxima reunión o no se trataron.`); return; }
    const failures = await appendMeetingTracking(selected);
    if (failures.length) { setStatus(`No se ha podido actualizar el seguimiento de ${failures.length} tarea(s): ${failures.join(' | ')}`); return; }
    const result = await closeMeeting(selected.id);
    setStatus(result.ok ? 'Reunión cerrada y seguimiento de tareas actualizado.' : result.message);
    if (result.ok) await backup();
  };

  const handleDeleteMeeting = async () => {
    if (!selected) return;
    const warning = selected.status === 'closed' ? '\n\nLos seguimientos ya registrados en las tareas vinculadas se conservarán.' : '';
    const confirmed = await confirm(`Se eliminará la reunión del ${formatCoordinationDate(selected.date)} y todos sus puntos.${warning}`, {
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
    if (result.ok) await backup();
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
      ? `Tarea creada durante la reunión con ${meetingContext(selected)} del ${formatCoordinationDate(selected.date)}, a partir del punto “${sourcePoint.title}”.`
      : `Tarea creada durante la reunión con ${meetingContext(selected)} del ${formatCoordinationDate(selected.date)}.`;
    const exportPayload = {
      title: `Reunión con ${meetingContext(selected)} · ${formatCoordinationDate(selected.date)}`,
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-metro-muted hover:text-metro-text" onClick={() => setSelectedId(null)} type="button"><ChevronLeft size={15}/>Volver</button>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Coordinación · {meetingContext(selected)}</p>
          <h2 className="mt-1 text-2xl font-bold text-metro-text">Reunión {formatCoordinationDate(selected.date)}</h2>
          {!isDirection && <p className="mt-1 text-sm text-metro-muted">{isUnion && selected.meetingType ? `${selected.meetingType === 'urgente' ? 'Urgente' : selected.meetingType === 'seguimiento' ? 'Seguimiento' : 'Ordinaria'} · ` : ''}{selected.interlocutors ? `Interlocutores: ${selected.interlocutors}` : 'Sin interlocutores indicados'}{selected.purpose ? ` · ${selected.purpose}` : ''}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text" onClick={() => void backup()} type="button"><FileSpreadsheet size={16}/>Actualizar Excel</button>
          {isUnion && <ExportPrintButtons payload={exportPayload} size="sm" />}
          <button className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/20 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-950/35" onClick={() => void handleDeleteMeeting()} type="button"><Trash2 size={16}/>Eliminar reunión</button>
          {selected.status === 'open' && <button className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark" onClick={() => void handleClose()} type="button"><CheckCircle2 size={16}/>Cerrar reunión</button>}
        </div>
      </div>
      <div className="ui-section p-3">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-bold text-metro-text">Guion de reunión</h3><span className="text-xs font-semibold text-metro-muted">{selected.points.length} puntos</span></div>
        <div className="space-y-3">
          {selected.points.map((point, index) => <article className="ui-subsection p-3" key={point.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="rounded-md bg-metro-surface px-2 py-1 text-xs font-bold text-metro-muted">{index + 1}</span><h4 className="font-bold text-metro-text">{point.title}</h4>{point.origin === 'task' && <span className="rounded-full border border-sky-400/30 px-2 py-0.5 text-[11px] font-bold text-sky-200">Tarea de referencia</span>}</div>{point.detail && <p className="mt-2 text-sm leading-5 text-metro-muted">{point.detail}</p>}</div>
              <div className="flex flex-wrap items-center justify-end gap-2">{point.taskId && <button className="inline-flex h-9 items-center gap-1 rounded-lg border border-sky-400/30 px-2 text-xs font-bold text-sky-200 transition hover:bg-sky-500/10" onClick={() => navigateInApp({ view: 'tareas', recordId: point.taskId ?? undefined })} title="Abrir la tarea vinculada" type="button">Abrir tarea<ArrowRight size={13}/></button>}<select className="ui-control ui-control--compact text-xs font-semibold" disabled={selected.status === 'closed'} onChange={(event) => void updatePoint(selected.id, point.id, { status: event.target.value as CoordinationPointStatus }).then(() => void backup())} value={point.status}><option value="pendiente">Pendiente de tratar</option><option value="tratado">Tratado y resuelto</option><option value="seguimiento">Tratado · requiere seguimiento</option><option value="volver">Volver a próxima reunión</option><option value="no-tratado">No tratado</option>{isUnion && <><option value="pendiente-rrll">Pendiente de RRLL</option><option value="pendiente-sindicato">Pendiente del sindicato</option></>}</select>{point.origin === 'manual' && selected.status === 'open' && <button className="inline-flex h-9 items-center gap-1 rounded-lg border border-sky-400/30 px-2 text-xs font-bold text-sky-200 transition hover:bg-sky-500/10" onClick={() => setTaskCreation({ pointId: point.id })} title="Crear una tarea conservando este punto" type="button"><Plus size={14}/>Convertir en tarea</button>}{point.origin === 'manual' && <button aria-label={`Eliminar punto manual ${point.title}`} className="grid h-9 w-9 place-items-center rounded-lg border border-red-500/30 text-red-300 transition hover:bg-red-500/10" onClick={() => void handleDeleteManualPoint(point.id, point.title)} title="Eliminar punto manual" type="button"><Trash2 size={15}/></button>}</div>
            </div>
            <label className="mt-3 block text-xs font-semibold text-metro-muted">Resultado / acuerdos<textarea className="mt-1 min-h-20 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red" defaultValue={point.result} disabled={selected.status === 'closed'} onBlur={(event) => void updatePoint(selected.id, point.id, { result: event.target.value }).then(() => void backup())} placeholder="Decisión, actuación acordada y siguiente paso..." /></label>
            {isUnion && <div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-xs font-semibold text-metro-muted">Responsable del siguiente paso<input className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text" defaultValue={point.responsible ?? ''} disabled={selected.status === 'closed'} onBlur={(event) => void updatePoint(selected.id, point.id, { responsible: event.target.value }).then(() => void backup())}/></label><label className="text-xs font-semibold text-metro-muted">Fecha de compromiso<input className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text" defaultValue={point.dueDate ?? ''} disabled={selected.status === 'closed'} onBlur={(event) => void updatePoint(selected.id, point.id, { dueDate: event.target.value }).then(() => void backup())} type="date"/></label></div>}
          </article>)}
          {selected.points.length === 0 && <p className="rounded-xl border border-dashed border-metro-border p-5 text-center text-sm text-metro-muted">La reunión todavía no tiene puntos.</p>}
        </div>
        {selected.status === 'open' && <div className="mt-4 space-y-3">
          <div className="flex gap-2"><input className="min-w-0 flex-1 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red" onChange={(event) => setNewPoint(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleAddManual(); }} placeholder="Añadir otro punto al guion..." value={newPoint}/><button className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white" onClick={() => void handleAddManual()} type="button"><Plus size={16}/>Crear punto</button></div>
          <div className="ui-subsection p-3">
            <p className="text-xs font-bold text-metro-text">Añadir una tarea abierta</p>
            <p className="mt-1 text-xs text-metro-muted">Puedes incorporar cualquier tarea activa aunque no estuviera marcada previamente para esta reunión.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(160px,0.7fr)_minmax(220px,1.3fr)_auto]">
              <input className="ui-control min-w-0" onChange={(event) => { setTaskSearch(event.target.value); setTaskToAdd(''); }} placeholder="Buscar tarea..." value={taskSearch}/>
              <select className="ui-control min-w-0" onChange={(event) => setTaskToAdd(event.target.value)} value={taskToAdd}><option value="">{availableTasks.length ? 'Selecciona una tarea activa' : 'No hay tareas coincidentes'}</option>{availableTasks.map((task) => <option key={task.id} value={task.id}>{task.titulo}{task.responsable ? ` · ${task.responsable}` : ''}</option>)}</select>
              <button className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text disabled:opacity-50" disabled={!taskToAdd} onClick={() => void handleAddTask()} type="button">Añadir tarea</button>
            </div>
          </div>
          <button className="inline-flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/15" onClick={() => setTaskCreation({ pointId: null })} type="button"><Plus size={16}/>Crear nueva tarea desde la reunión</button>
        </div>}
      </div>
      {status && <p className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-xs font-semibold text-metro-muted">{status}</p>}
      {taskCreation && <TaskEditor initialDraft={taskInitialDraft} initialTrackingText={taskInitialTrackingText} key={`meeting-task-${taskCreation.pointId ?? 'new'}`} mode="create" onCreated={handleCreatedTask} onDone={() => setTaskCreation(null)} task={null} />}
      {dialogNode}
    </section>;
  }

  return <section className="space-y-4">
    <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Coordinación</p><h2 className="mt-1 text-2xl font-bold text-metro-text">Seguimiento de reuniones</h2><p className="mt-2 text-sm text-metro-muted">Prepara el guion, registra acuerdos y conserva la trazabilidad con las tareas.</p></div>
    <div className="grid gap-3 md:grid-cols-3">
      <button className={`ui-area-selector ${area === 'direccion' ? 'ui-area-selector--active' : ''}`} onClick={() => setArea('direccion')} type="button"><Building2 className="mb-2 text-metro-red" size={20}/><strong className="block text-metro-text">Dirección</strong><span className="text-xs text-metro-muted">Tareas marcadas, nuevas tareas y puntos libres</span></button>
      <button className={`ui-area-selector ${area === 'otras-areas' ? 'ui-area-selector--active' : ''}`} onClick={() => setArea('otras-areas')} type="button"><UsersRound className="mb-2 text-metro-red" size={20}/><strong className="block text-metro-text">Otras áreas</strong><span className="text-xs text-metro-muted">Tareas existentes, nuevas y puntos libres</span></button>
      <button className={`ui-area-selector ${area === 'sindicatos' ? 'ui-area-selector--active' : ''}`} onClick={() => setArea('sindicatos')} type="button"><UsersRound className="mb-2 text-metro-red" size={20}/><strong className="block text-metro-text">Sindicatos</strong><span className="text-xs text-metro-muted">Guion flexible e histórico por organización</span></button>
    </div>
    {area === 'sindicatos' ? <SindicatosCoordinationPanel onChanged={backup} onOpenMeeting={setSelectedId} onStatus={setStatus} tasks={tasks}/> : <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      {area === 'direccion' ? <div className="ui-section p-3"><h3 className="font-bold text-metro-text">Nueva reunión con Dirección</h3><p className="mt-1 text-xs leading-5 text-metro-muted">Se incorporarán automáticamente las {markedCount} tarea(s) marcadas para trasladar a Dirección.</p><label className="mt-4 block text-xs font-semibold text-metro-muted">Fecha<input className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text" onChange={(event) => setDate(event.target.value)} type="date" value={date}/></label><button className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white" onClick={() => void handleCreate()} type="button"><CalendarDays size={16}/>Crear reunión</button><p className="mt-3 break-words text-xs text-metro-muted">Backup: {backupPath || 'Configura la ruta en Ajustes'}</p></div>
      : <div className="ui-section p-3"><h3 className="font-bold text-metro-text">Nueva reunión con otra área</h3><p className="mt-1 text-xs leading-5 text-metro-muted">{areaName.trim() ? `Se incorporarán automáticamente ${markedAreaCount} tarea(s) pendiente(s) para ${areaName.trim()}. También puedes añadir una tarea inicial opcional.` : 'Indica el área. Si tiene asuntos marcados desde Tareas, se incorporarán automáticamente al crear la reunión.'}</p><div className="mt-4 space-y-3"><label className="block text-xs font-semibold text-metro-muted">Área *<input className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red" onChange={(event) => setAreaName(event.target.value)} placeholder="Operaciones, Prevención, Finanzas..." value={areaName}/></label><label className="block text-xs font-semibold text-metro-muted">Tarea inicial · opcional<select className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red" onChange={(event) => setReferenceTaskId(event.target.value)} value={referenceTaskId}><option value="">Sin tarea inicial</option>{activeTasks.map((task) => <option key={task.id} value={task.id}>{task.titulo}</option>)}</select></label><label className="block text-xs font-semibold text-metro-muted">Fecha<input className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text" onChange={(event) => setDate(event.target.value)} type="date" value={date}/></label><label className="block text-xs font-semibold text-metro-muted">Interlocutores<input className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red" onChange={(event) => setInterlocutors(event.target.value)} placeholder="Personas participantes" value={interlocutors}/></label><label className="block text-xs font-semibold text-metro-muted">Objetivo<textarea className="mt-1 min-h-16 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red" onChange={(event) => setPurpose(event.target.value)} placeholder="Qué se necesita tratar o resolver" value={purpose}/></label></div><button className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!areaName.trim()} onClick={() => void handleCreate()} type="button"><CalendarDays size={16}/>Crear reunión</button></div>}
      <div className="ui-section p-3"><h3 className="mb-3 font-bold text-metro-text">{area === 'direccion' ? 'Reuniones de Dirección' : 'Reuniones con otras áreas'}</h3><div className="space-y-2">{visibleMeetings.map((meeting) => <button className="ui-list-row" key={meeting.id} onClick={() => setSelectedId(meeting.id)} type="button"><span className="min-w-0"><strong className="block truncate text-sm text-metro-text">{area === 'direccion' ? formatCoordinationDate(meeting.date) : meeting.areaName || 'Área sin indicar'}</strong><span className="block truncate text-xs text-metro-muted">{area === 'direccion' ? `${meeting.points.length} puntos` : `${formatCoordinationDate(meeting.date)} · ${meeting.points.length ? `${meeting.points.length} asunto${meeting.points.length === 1 ? '' : 's'}` : 'Sin asuntos todavía'}`}</span></span><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${meeting.status === 'closed' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>{meeting.status === 'closed' ? 'Cerrada' : 'Abierta'}</span></button>)}{visibleMeetings.length === 0 && <p className="rounded-xl border border-dashed border-metro-border p-5 text-center text-sm text-metro-muted">Todavía no hay reuniones registradas.</p>}</div></div>
    </div>}
    {status && <p className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-xs font-semibold text-metro-muted">{status}</p>}{dialogNode}
  </section>;
}

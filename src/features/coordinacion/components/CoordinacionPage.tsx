import { Building2, CalendarDays, CheckCircle2, ChevronLeft, FileSpreadsheet, Plus, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import type { Task, TaskDraft } from '../../tareas/domain/task';
import { useTaskStore } from '../../tareas/store/useTaskStore';
import { syncCoordinacionExcelBackup } from '../../../shared/export/coordinacionExcelBackup';
import { formatCoordinationDate, type CoordinationMeeting, type CoordinationPointStatus } from '../domain/coordinacion';
import { coordinationPointStatusLabel, useCoordinacionStore } from '../store/useCoordinacionStore';

function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function taskToDraft(task: Task): TaskDraft {
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
    mail: task.mail,
    documentLinks: task.documentLinks,
    createdAt: task.createdAt,
  };
}

async function appendMeetingTracking(meeting: CoordinationMeeting): Promise<string[]> {
  const failures: string[] = [];
  for (const point of meeting.points) {
    if (!point.taskId || point.status === 'pendiente') continue;
    const task = useTaskStore.getState().tasks.find((candidate) => candidate.id === point.taskId);
    if (!task || task.deletedAt) continue;
    const resultText = point.result.trim() || coordinationPointStatusLabel(point.status);
    const tracking = `Coordinación RRLL con Dirección · ${formatCoordinationDate(meeting.date)}\n${resultText}`;
    if (task.seguimiento.some((entry) => entry.texto.includes(tracking))) continue;
    const result = await useTaskStore.getState().updateWithConcurrencyCheck(
      task.id,
      taskToDraft(task),
      tracking,
      task.updatedAt,
    );
    if (!result.ok) failures.push(`${task.titulo}: ${result.message}`);
  }
  return failures;
}

export function CoordinacionPage() {
  const tasks = useTaskStore((state) => state.tasks);
  const loadTasks = useTaskStore((state) => state.load);
  const meetings = useCoordinacionStore((state) => state.meetings);
  const load = useCoordinacionStore((state) => state.load);
  const createMeeting = useCoordinacionStore((state) => state.createDirectionMeeting);
  const addManualPoint = useCoordinacionStore((state) => state.addManualPoint);
  const updatePoint = useCoordinacionStore((state) => state.updatePoint);
  const closeMeeting = useCoordinacionStore((state) => state.closeMeeting);
  const backupPath = useConfiguracionStore((state) => state.rutaExportacionCoordinacion);
  const loadConfig = useConfiguracionStore((state) => state.load);
  const [area, setArea] = useState<'direccion' | 'otras-areas' | 'sindicatos'>('direccion');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [newPoint, setNewPoint] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => { load(); loadTasks(); loadConfig(); }, [load, loadConfig, loadTasks]);

  const directionMeetings = useMemo(
    () => meetings.filter((meeting) => meeting.area === 'direccion').sort((a, b) => b.date.localeCompare(a.date)),
    [meetings],
  );
  const selected = directionMeetings.find((meeting) => meeting.id === selectedId) ?? null;
  const markedCount = useCoordinacionStore((state) => state.directionTaskIds.length);

  const backup = async () => {
    const message = await syncCoordinacionExcelBackup(useCoordinacionStore.getState().meetings);
    if (message) setStatus(message);
  };

  const handleCreate = async () => {
    setStatus('');
    const result = await createMeeting(date, tasks);
    if (!result.ok) { setStatus(result.message); return; }
    setSelectedId(result.recordId ?? null);
    await backup();
  };

  const handleAddManual = async () => {
    if (!selected) return;
    const result = await addManualPoint(selected.id, newPoint);
    setStatus(result.message);
    if (result.ok) { setNewPoint(''); await backup(); }
  };

  const handleClose = async () => {
    if (!selected) return;
    const pending = selected.points.filter((point) => point.status === 'pendiente').length;
    if (pending > 0) {
      setStatus(`Quedan ${pending} punto(s) pendientes. Márcalos como Tratado o Volver a tratar antes de cerrar.`);
      return;
    }
    const failures = await appendMeetingTracking(selected);
    if (failures.length) {
      setStatus(`No se ha podido actualizar el seguimiento de ${failures.length} tarea(s): ${failures.join(' | ')}`);
      return;
    }
    const result = await closeMeeting(selected.id);
    setStatus(result.ok ? 'Reunión cerrada y seguimiento de tareas actualizado.' : result.message);
    if (result.ok) await backup();
  };

  if (selected) {
    return (
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-metro-muted hover:text-metro-text" onClick={() => setSelectedId(null)} type="button"><ChevronLeft size={15}/>Volver</button>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Coordinación · Dirección</p>
            <h2 className="mt-1 text-2xl font-bold text-metro-text">Reunión {formatCoordinationDate(selected.date)}</h2>
          </div>
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text" onClick={() => void backup()} type="button"><FileSpreadsheet size={16}/>Actualizar Excel</button>
            {selected.status === 'open' && <button className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark" onClick={() => void handleClose()} type="button"><CheckCircle2 size={16}/>Cerrar reunión</button>}
          </div>
        </div>

        <div className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between"><h3 className="font-bold text-metro-text">Guion de reunión</h3><span className="text-xs font-semibold text-metro-muted">{selected.points.length} puntos</span></div>
          <div className="space-y-3">
            {selected.points.map((point, index) => (
              <article className="rounded-xl border border-metro-border bg-metro-panel p-3" key={point.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="rounded-md bg-metro-surface px-2 py-1 text-xs font-bold text-metro-muted">{index + 1}</span><h4 className="font-bold text-metro-text">{point.title}</h4>{point.origin === 'task' && <span className="rounded-full border border-sky-400/30 px-2 py-0.5 text-[11px] font-bold text-sky-200">Tarea</span>}</div>{point.detail && <p className="mt-2 text-sm leading-5 text-metro-muted">{point.detail}</p>}</div>
                  <select className="rounded-lg border border-metro-border bg-metro-surface px-2 py-2 text-xs font-semibold text-metro-text" disabled={selected.status === 'closed'} onChange={(event) => void updatePoint(selected.id, point.id, { status: event.target.value as CoordinationPointStatus }).then(() => backup())} value={point.status}><option value="pendiente">Pendiente</option><option value="tratado">Tratado</option><option value="volver">Volver a tratar</option></select>
                </div>
                <label className="mt-3 block text-xs font-semibold text-metro-muted">Resultado / indicaciones de Dirección<textarea className="mt-1 min-h-20 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red" defaultValue={point.result} disabled={selected.status === 'closed'} onBlur={(event) => void updatePoint(selected.id, point.id, { result: event.target.value }).then(() => backup())} placeholder="Decisión, criterio, actuación acordada..." /></label>
              </article>
            ))}
            {selected.points.length === 0 && <p className="rounded-xl border border-dashed border-metro-border p-5 text-center text-sm text-metro-muted">La reunión todavía no tiene puntos.</p>}
          </div>
          {selected.status === 'open' && <div className="mt-4 flex gap-2"><input className="min-w-0 flex-1 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red" onChange={(event) => setNewPoint(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleAddManual(); }} placeholder="Añadir punto menor al guion..." value={newPoint}/><button className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white" onClick={() => void handleAddManual()} type="button"><Plus size={16}/>Crear punto</button></div>}
        </div>
        {status && <p className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-xs font-semibold text-metro-muted">{status}</p>}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Coordinación</p><h2 className="mt-1 text-2xl font-bold text-metro-text">Seguimiento de reuniones</h2><p className="mt-2 text-sm text-metro-muted">Prepara el guion, registra acuerdos y conserva la trazabilidad con las tareas.</p></div>
      <div className="grid gap-3 md:grid-cols-3">
        <button className={`rounded-2xl border p-4 text-left ${area === 'direccion' ? 'border-metro-red bg-metro-panel' : 'border-metro-border bg-metro-surface'}`} onClick={() => setArea('direccion')} type="button"><Building2 className="mb-3 text-metro-red" size={22}/><strong className="block text-metro-text">Dirección</strong><span className="text-xs text-metro-muted">Disponible</span></button>
        <button className="cursor-not-allowed rounded-2xl border border-metro-border bg-metro-surface p-4 text-left opacity-50" disabled type="button"><UsersRound className="mb-3" size={22}/><strong className="block text-metro-text">Otras áreas</strong><span className="text-xs text-metro-muted">Próximamente</span></button>
        <button className="cursor-not-allowed rounded-2xl border border-metro-border bg-metro-surface p-4 text-left opacity-50" disabled type="button"><UsersRound className="mb-3" size={22}/><strong className="block text-metro-text">Sindicatos</strong><span className="text-xs text-metro-muted">Próximamente</span></button>
      </div>
      {area === 'direccion' && <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card"><h3 className="font-bold text-metro-text">Nueva reunión con Dirección</h3><p className="mt-1 text-xs leading-5 text-metro-muted">Se incorporarán automáticamente las {markedCount} tarea(s) marcadas para trasladar a Dirección.</p><label className="mt-4 block text-xs font-semibold text-metro-muted">Fecha<input className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text" onChange={(event) => setDate(event.target.value)} type="date" value={date}/></label><button className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white" onClick={() => void handleCreate()} type="button"><CalendarDays size={16}/>Crear reunión</button><p className="mt-3 break-words text-[11px] text-metro-muted">Backup: {backupPath || 'Configura la ruta en Ajustes'}</p></div>
        <div className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card"><h3 className="mb-3 font-bold text-metro-text">Reuniones de Dirección</h3><div className="space-y-2">{directionMeetings.map((meeting) => <button className="flex w-full items-center justify-between rounded-xl border border-metro-border bg-metro-panel px-3 py-3 text-left hover:border-metro-red" key={meeting.id} onClick={() => setSelectedId(meeting.id)} type="button"><span><strong className="block text-sm text-metro-text">{formatCoordinationDate(meeting.date)}</strong><span className="text-xs text-metro-muted">{meeting.points.length} puntos</span></span><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${meeting.status === 'closed' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>{meeting.status === 'closed' ? 'Cerrada' : 'Abierta'}</span></button>)}{directionMeetings.length === 0 && <p className="rounded-xl border border-dashed border-metro-border p-5 text-center text-sm text-metro-muted">Todavía no hay reuniones registradas.</p>}</div></div>
      </div>}
      {status && <p className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-xs font-semibold text-metro-muted">{status}</p>}
    </section>
  );
}

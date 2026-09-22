import { CalendarDays, CheckSquare2, Clock3, History, UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import type { Task } from '../../tareas/domain/task';
import { formatCoordinationDate, type UnionMeetingType } from '../domain/coordinacion';
import { useCoordinacionStore } from '../store/useCoordinacionStore';

function isActiveTask(task: Task): boolean {
  return !task.deletedAt && task.estado !== 'cerrada' && task.fase.trim().toLowerCase() !== 'cerrada';
}

export function SindicatosCoordinationPanel({
  tasks,
  onOpenMeeting,
  onStatus,
  onChanged,
}: {
  tasks: Task[];
  onOpenMeeting: (meetingId: string) => void;
  onStatus: (message: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const meetings = useCoordinacionStore((state) => state.meetings);
  const unionTaskIds = useCoordinacionStore((state) => state.unionTaskIds);
  const createUnionMeeting = useCoordinacionStore((state) => state.createUnionMeeting);
  const taskOrigins = useConfiguracionStore((state) => state.taskOrigins);
  const unions = useMemo(
    () => taskOrigins.filter((origin) => origin.tipo === 'sindicato' && origin.active && !origin.deletedAt).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [taskOrigins],
  );
  const [selectedUnion, setSelectedUnion] = useState('');
  const [date, setDate] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10));
  const [meetingType, setMeetingType] = useState<UnionMeetingType>('ordinaria');
  const [interlocutors, setInterlocutors] = useState('');
  const [purpose, setPurpose] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  const unionMeetings = useMemo(
    () => meetings.filter((meeting) => meeting.area === 'sindicatos' && meeting.unionName === selectedUnion).sort((a, b) => b.date.localeCompare(a.date)),
    [meetings, selectedUnion],
  );
  const relevantTasks = useMemo(() => {
    if (!selectedUnion) return [];
    const marked = new Set(unionTaskIds[selectedUnion] ?? []);
    return tasks
      .filter((task) => isActiveTask(task) && (task.sindicato === selectedUnion || marked.has(task.id)))
      .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
  }, [selectedUnion, tasks, unionTaskIds]);

  const selectUnion = (name: string) => {
    setSelectedUnion(name);
    const marked = new Set(unionTaskIds[name] ?? []);
    setSelectedTaskIds(tasks.filter((task) => isActiveTask(task) && marked.has(task.id)).map((task) => task.id));
    onStatus('');
  };

  const toggleTask = (taskId: string) => {
    setSelectedTaskIds((current) => current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]);
  };

  const handleCreate = async () => {
    const result = await createUnionMeeting(date, selectedUnion, meetingType, interlocutors, purpose, selectedTaskIds, tasks);
    if (!result.ok) { onStatus(result.message); return; }
    setInterlocutors('');
    setPurpose('');
    await onChanged();
    if (result.recordId) onOpenMeeting(result.recordId);
  };

  return <div className="space-y-4">
    <section className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><h3 className="font-bold text-metro-text">Sindicatos</h3><p className="mt-1 text-xs text-metro-muted">Selecciona un sindicato para consultar su situación e histórico.</p></div>
        <span className="rounded-full bg-metro-panel px-2.5 py-1 text-xs font-bold text-metro-muted">{unions.length} activos</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {unions.map((union) => {
          const history = meetings.filter((meeting) => meeting.area === 'sindicatos' && meeting.unionName === union.nombre);
          const lastMeeting = [...history].sort((a, b) => b.date.localeCompare(a.date))[0];
          const pending = unionTaskIds[union.nombre]?.length ?? 0;
          return <button className={`rounded-xl border p-3 text-left transition ${selectedUnion === union.nombre ? 'border-metro-red bg-metro-panel' : 'border-metro-border bg-metro-panel/60 hover:border-metro-red/60'}`} key={union.id} onClick={() => selectUnion(union.nombre)} type="button">
            <div className="flex items-start justify-between gap-2"><strong className="text-sm text-metro-text">{union.nombre}</strong>{pending > 0 && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">{pending} pendientes</span>}</div>
            <span className="mt-2 block text-[11px] text-metro-muted">{lastMeeting ? `Última: ${formatCoordinationDate(lastMeeting.date)}` : 'Sin reuniones registradas'}</span>
          </button>;
        })}
        {unions.length === 0 && <p className="col-span-full rounded-xl border border-dashed border-metro-border p-5 text-center text-sm text-metro-muted">No hay sindicatos activos. Puedes gestionarlos desde los orígenes de Tareas.</p>}
      </div>
    </section>

    {selectedUnion && <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card">
        <div className="flex items-center gap-2"><UsersRound className="text-metro-red" size={19}/><h3 className="font-bold text-metro-text">Nueva reunión · {selectedUnion}</h3></div>
        <p className="mt-1 text-xs leading-5 text-metro-muted">Selecciona las tareas del guion. También se incorporarán los asuntos marcados y los pendientes de la última reunión.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-metro-muted">Fecha<input className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text" onChange={(event) => setDate(event.target.value)} type="date" value={date}/></label>
          <label className="text-xs font-semibold text-metro-muted">Tipo<select className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text" onChange={(event) => setMeetingType(event.target.value as UnionMeetingType)} value={meetingType}><option value="ordinaria">Ordinaria</option><option value="seguimiento">Seguimiento</option><option value="urgente">Urgente</option></select></label>
        </div>
        <label className="mt-3 block text-xs font-semibold text-metro-muted">Interlocutores<input className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text" onChange={(event) => setInterlocutors(event.target.value)} placeholder="Personas participantes" value={interlocutors}/></label>
        <label className="mt-3 block text-xs font-semibold text-metro-muted">Objetivo / notas previas<textarea className="mt-1 min-h-16 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text" onChange={(event) => setPurpose(event.target.value)} placeholder="Finalidad de la reunión" value={purpose}/></label>
        <div className="mt-4"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold text-metro-muted">Tareas del guion</span><span className="text-[11px] text-metro-muted">{selectedTaskIds.length} seleccionadas</span></div><div className="max-h-52 space-y-2 overflow-y-auto pr-1">{relevantTasks.map((task) => <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-metro-border bg-metro-panel px-3 py-2" key={task.id}><input checked={selectedTaskIds.includes(task.id)} className="mt-0.5 h-4 w-4 accent-red-600" onChange={() => toggleTask(task.id)} type="checkbox"/><span className="min-w-0"><strong className="block truncate text-xs text-metro-text">{task.titulo}</strong><span className="block truncate text-[10px] text-metro-muted">{task.estado} · {task.prioridad}</span></span></label>)}{relevantTasks.length === 0 && <p className="rounded-lg border border-dashed border-metro-border p-3 text-center text-xs text-metro-muted">No hay tareas activas vinculadas a este sindicato.</p>}</div></div>
        <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={selectedTaskIds.length === 0} onClick={() => void handleCreate()} type="button"><CalendarDays size={16}/>Crear reunión</button>
      </section>

      <section className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between"><div><h3 className="font-bold text-metro-text">Histórico · {selectedUnion}</h3><p className="mt-1 text-xs text-metro-muted">Reuniones y asuntos tratados con este sindicato.</p></div><History className="text-metro-muted" size={19}/></div>
        <div className="space-y-2">{unionMeetings.map((meeting) => {
          const pending = meeting.points.filter((point) => point.status !== 'tratado').length;
          return <button className="flex w-full items-center justify-between gap-3 rounded-xl border border-metro-border bg-metro-panel px-3 py-3 text-left hover:border-metro-red" key={meeting.id} onClick={() => onOpenMeeting(meeting.id)} type="button"><span className="min-w-0"><strong className="flex items-center gap-2 text-sm text-metro-text"><CalendarDays size={14}/>{formatCoordinationDate(meeting.date)}</strong><span className="mt-1 block truncate text-xs text-metro-muted">{meeting.meetingType === 'urgente' ? 'Urgente' : meeting.meetingType === 'seguimiento' ? 'Seguimiento' : 'Ordinaria'} · {meeting.points.length} asuntos</span></span><span className="flex shrink-0 items-center gap-2">{pending > 0 && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300"><Clock3 size={12}/>{pending}</span>}<span className={`rounded-full px-2 py-1 text-[11px] font-bold ${meeting.status === 'closed' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>{meeting.status === 'closed' ? 'Cerrada' : 'Abierta'}</span></span></button>;
        })}{unionMeetings.length === 0 && <div className="rounded-xl border border-dashed border-metro-border p-6 text-center"><CheckSquare2 className="mx-auto mb-2 text-metro-muted" size={24}/><p className="text-sm text-metro-muted">Todavía no hay reuniones con {selectedUnion}.</p></div>}</div>
      </section>
    </div>}
  </div>;
}

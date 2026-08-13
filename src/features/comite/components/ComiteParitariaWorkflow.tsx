import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Handshake,
  Inbox,
  ListChecks,
  Plus,
  UsersRound,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ManagedSession } from '../../../shared/sessions/session';
import { formatManagedSessionDate } from '../../../shared/sessions/session';
import { DEFAULT_TASK_PHASE, PETICION_TASK_PHASE, isTaskClosed, type Task, type TaskDraft } from '../../tareas/domain/task';
import { useTaskStore } from '../../tareas/store/useTaskStore';
import { COMITE_TASK_PHASE } from '../domain/comite';
import { useCommitteeSessionStore } from '../store/useCommitteeSessionStore';
import { PARITARIA_TASK_PHASE } from '../../paritaria/domain/paritaria';
import { useParitariaSessionStore } from '../../paritaria/store/useParitariaSessionStore';
import { useModuleHelpRegistry } from '../../../services/moduleHelpRegistry';
import { COMITE_PARITARIA_HELP_SECTIONS } from './comiteHelpSections';

type Organ = 'comite' | 'paritaria';

type WorkflowProps = {
  onOpenOrgan: (organ: Organ, sessionId?: string | null) => void;
};

const toTaskDraft = (task: Task, fase: string): TaskDraft => ({
  titulo: task.titulo,
  descripcion: task.descripcion,
  tipo: task.tipo,
  fase,
  estado: task.estado,
  prioridad: task.prioridad,
  fechaLimite: task.fechaLimite,
  responsable: task.responsable,
  origen: task.origen,
  sindicato: task.sindicato,
  observaciones: task.observaciones,
  mail: task.mail,
  documentLinks: task.documentLinks,
});

const sessionSortValue = (session: ManagedSession) => session.date || session.createdAt.slice(0, 10);

const getCurrentSession = (sessions: ManagedSession[]) =>
  [...sessions]
    .filter((session) => session.status === 'open')
    .sort((a, b) => sessionSortValue(a).localeCompare(sessionSortValue(b)))[0] ?? null;

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string | number;
  tone: 'blue' | 'amber' | 'green' | 'violet';
}) {
  const toneClasses = {
    blue: 'border-blue-400/20 bg-blue-500/[0.06] text-blue-300',
    amber: 'border-amber-400/20 bg-amber-500/[0.06] text-amber-300',
    green: 'border-emerald-400/20 bg-emerald-500/[0.06] text-emerald-300',
    violet: 'border-violet-400/20 bg-violet-500/[0.06] text-violet-300',
  }[tone];

  return (
    <div className={`flex min-h-[62px] items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 ${toneClasses}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/20">
        <Icon size={19} />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-metro-muted">{label}</div>
        <div className="mt-0.5 whitespace-nowrap text-xl font-black leading-tight text-metro-text">{value}</div>
      </div>
    </div>
  );
}

function StatusPill({ state }: { state: Task['estado'] }) {
  const classes =
    state === 'cerrada' || state === 'resuelta'
      ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300'
      : state === 'en curso'
        ? 'border-blue-400/25 bg-blue-500/10 text-blue-300'
        : state === 'bloqueada'
          ? 'border-violet-400/25 bg-violet-500/10 text-violet-300'
          : 'border-amber-400/25 bg-amber-500/10 text-amber-300';
  return <span className={`inline-flex max-w-full items-center justify-center whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none ${classes}`}>{state}</span>;
}

function OrganPanel({
  organ,
  sessions,
  tasks,
  onOpen,
}: {
  organ: Organ;
  sessions: ManagedSession[];
  tasks: Task[];
  onOpen: (sessionId?: string | null) => void;
}) {
  const isComite = organ === 'comite';
  const activeSession = getCurrentSession(sessions);
  const phase = isComite ? COMITE_TASK_PHASE : PARITARIA_TASK_PHASE;
  const organTasks = tasks.filter((task) => !isTaskClosed(task) && task.fase.trim().toLowerCase() === phase);
  const recentTasks = organTasks.slice(0, 4);
  const accent = isComite ? 'blue' : 'violet';
  const Icon = isComite ? UsersRound : Handshake;
  const title = isComite ? 'Comité' : 'Paritaria';

  return (
    <section className={`overflow-hidden rounded-2xl border bg-metro-panel/75 ${isComite ? 'border-blue-400/35' : 'border-violet-400/35'}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Icon className={isComite ? 'text-blue-400' : 'text-violet-400'} size={22} />
          <h3 className="text-lg font-black text-metro-text">{title}</h3>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${isComite ? 'border-blue-400/25 bg-blue-500/10 text-blue-300' : 'border-violet-400/25 bg-violet-500/10 text-violet-300'}`}>
          {activeSession ? 'Sesión activa' : 'Sin sesión abierta'}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-white/10 px-4 py-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-metro-muted">Sesión</div>
            <div className="mt-1 font-bold text-metro-text">{activeSession ? formatManagedSessionDate(activeSession.date) : '—'}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-metro-muted">Puntos</div>
            <div className="mt-1 text-lg font-black text-metro-text">{activeSession?.items.length ?? 0}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-metro-muted">Disponibles</div>
            <div className="mt-1 text-lg font-black text-amber-300">{organTasks.length}</div>
          </div>
        </div>
        <button
          className={`self-center rounded-xl border px-3 py-2 text-sm font-bold transition hover:-translate-y-0.5 ${isComite ? 'border-blue-400/30 bg-blue-500/10 text-blue-200 hover:bg-blue-500/15' : 'border-violet-400/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/15'}`}
          onClick={() => onOpen(activeSession?.id)}
          type="button"
        >
          Abrir gestión
        </button>
      </div>

      <div className="px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-metro-muted">Puntos recientes</span>
          <button className={`text-xs font-bold ${accent === 'blue' ? 'text-blue-300' : 'text-violet-300'}`} onClick={() => onOpen(activeSession?.id)} type="button">
            Ver todos
          </button>
        </div>
        <div className="space-y-1.5">
          {recentTasks.length ? recentTasks.map((task) => (
            <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-white/[0.07] bg-metro-slate/40 px-3 py-2" key={task.id}>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-metro-secondary">{task.titulo}</div>
                <div className="truncate text-[11px] text-metro-muted">{task.origen || task.responsable || 'Sin origen'}</div>
              </div>
              <StatusPill state={task.estado} />
            </div>
          )) : (
            <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-sm text-metro-muted">
              No hay puntos disponibles para {title}.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function ComiteParitariaWorkflow({ onOpenOrgan }: WorkflowProps) {
  const committeeSessions = useCommitteeSessionStore((state) => state.sessions);
  const loadCommittee = useCommitteeSessionStore((state) => state.load);
  const loadCommitteeHistory = useCommitteeSessionStore((state) => state.loadHistoricalSessions);
  const paritariaSessions = useParitariaSessionStore((state) => state.sessions);
  const loadParitaria = useParitariaSessionStore((state) => state.load);
  const loadParitariaHistory = useParitariaSessionStore((state) => state.loadHistoricalSessions);
  const tasks = useTaskStore((state) => state.tasks);
  const loadTasks = useTaskStore((state) => state.load);
  const updateTask = useTaskStore((state) => state.updateWithConcurrencyCheck);
  const [filter, setFilter] = useState<'todos' | Organ>('todos');
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null);
  const [assignmentMessage, setAssignmentMessage] = useState('');
  const setModuleHelp = useModuleHelpRegistry((state) => state.setModuleHelp);
  const clearModuleHelp = useModuleHelpRegistry((state) => state.clearModuleHelp);

  useEffect(() => {
    setModuleHelp({
      title: 'Comité / Paritaria',
      subtitle: 'Guía rápida de la bandeja unificada, clasificación de puntos y acceso a las sesiones.',
      sections: COMITE_PARITARIA_HELP_SECTIONS,
    });
    return () => clearModuleHelp();
  }, [clearModuleHelp, setModuleHelp]);

  useEffect(() => {
    loadCommittee();
    loadParitaria();
    loadTasks();
    loadCommitteeHistory();
    loadParitariaHistory();
  }, [loadCommittee, loadCommitteeHistory, loadParitaria, loadParitariaHistory, loadTasks]);

  const activeCommittee = committeeSessions.filter((session) => session.status === 'open');
  const activeParitaria = paritariaSessions.filter((session) => session.status === 'open');
  const committeeTasks = tasks.filter((task) => !isTaskClosed(task) && task.fase.trim().toLowerCase() === COMITE_TASK_PHASE);
  const paritariaTasks = tasks.filter((task) => !isTaskClosed(task) && task.fase.trim().toLowerCase() === PARITARIA_TASK_PHASE);
  const inboxTasks = useMemo(
    () => tasks.filter((task) => {
      if (isTaskClosed(task)) return false;
      const phase = task.fase.trim().toLowerCase();
      return phase === DEFAULT_TASK_PHASE || phase === PETICION_TASK_PHASE;
    }).slice(0, 8),
    [tasks],
  );

  const closedThisYear = [...committeeSessions, ...paritariaSessions].filter((session) =>
    session.status === 'closed' && session.date.startsWith(String(new Date().getFullYear())),
  ).length;

  const nextSessions = [...activeCommittee, ...activeParitaria]
    .filter((session) => session.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextSession = nextSessions[0] ?? null;

  const assignTask = async (task: Task, organ: Organ) => {
    setAssigningTaskId(task.id);
    setAssignmentMessage('');
    const result = await updateTask(
      task.id,
      toTaskDraft(task, organ === 'comite' ? COMITE_TASK_PHASE : PARITARIA_TASK_PHASE),
      `Clasificado para ${organ === 'comite' ? 'Comité de Empresa' : 'Comisión Paritaria'} desde la bandeja unificada.`,
      task.updatedAt,
    );
    setAssigningTaskId(null);
    setAssignmentMessage(result.ok ? 'Punto clasificado correctamente.' : result.message);
  };

  const visibleCommittee = filter !== 'paritaria';
  const visibleParitaria = filter !== 'comite';

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-white/10 bg-metro-panel/80 p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-metro-text">Comité y Paritaria</h2>
            <p className="mt-0.5 text-sm text-metro-muted">Gestión unificada de sesiones, puntos y seguimiento.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-white/10 bg-metro-slate/70 p-1">
              {([
                ['todos', 'Todos'],
                ['comite', 'Comité'],
                ['paritaria', 'Paritaria'],
              ] as const).map(([value, label]) => (
                <button
                  className={`rounded-lg px-4 py-2 text-sm font-bold transition ${filter === value ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/30' : 'text-metro-secondary hover:bg-white/[0.05]'}`}
                  key={value}
                  onClick={() => setFilter(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="flex items-center gap-2 rounded-xl bg-metro-red px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-red-500"
              onClick={() => onOpenOrgan('comite')}
              type="button"
            >
              <Plus size={18} /> Nueva sesión
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_230px]">
        <main className="min-w-0 space-y-3">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard icon={CalendarDays} label="Sesiones abiertas" tone="blue" value={activeCommittee.length + activeParitaria.length} />
            <KpiCard icon={ClipboardList} label="Puntos pendientes" tone="amber" value={committeeTasks.length + paritariaTasks.length} />
            <KpiCard icon={CheckCircle2} label="Sesiones cerradas este año" tone="green" value={closedThisYear} />
            <KpiCard icon={Clock3} label="Próxima sesión" tone="violet" value={nextSession ? formatManagedSessionDate(nextSession.date) : 'Sin fecha'} />
          </div>

          <div className={`grid gap-3 ${visibleCommittee && visibleParitaria ? 'xl:grid-cols-2' : 'grid-cols-1'}`}>
            {visibleCommittee && <OrganPanel organ="comite" sessions={committeeSessions} tasks={tasks} onOpen={(sessionId) => onOpenOrgan('comite', sessionId)} />}
            {visibleParitaria && <OrganPanel organ="paritaria" sessions={paritariaSessions} tasks={tasks} onOpen={(sessionId) => onOpenOrgan('paritaria', sessionId)} />}
          </div>

          <section className="rounded-2xl border border-white/10 bg-metro-panel/75 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Inbox className="text-amber-300" size={20} />
                  <h3 className="text-lg font-black text-metro-text">Bandeja de entrada de puntos</h3>
                  <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-300">{inboxTasks.length} por clasificar</span>
                </div>
                <p className="mt-1 text-xs text-metro-muted">Tareas generales o peticiones abiertas que todavía no están asignadas a Comité ni Paritaria.</p>
              </div>
              {assignmentMessage && <span className="text-xs font-semibold text-metro-secondary">{assignmentMessage}</span>}
            </div>

            <div className="overflow-hidden rounded-xl border border-white/[0.08]">
              <div className="grid grid-cols-[minmax(0,1fr)_72px_82px_214px] gap-2 bg-metro-slate/80 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-metro-muted">
                <span>Punto</span><span>Origen</span><span>Estado</span><span>Destino</span>
              </div>
              {inboxTasks.length ? inboxTasks.map((task) => (
                <div className="grid grid-cols-[minmax(0,1fr)_72px_82px_214px] items-center gap-2 border-t border-white/[0.06] px-3 py-2.5" key={task.id}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-metro-secondary">{task.titulo}</div>
                    <div className="truncate text-[11px] text-metro-muted">{task.descripcion || 'Sin descripción'}</div>
                  </div>
                  <span className="truncate text-xs text-metro-muted">{task.origen || '—'}</span>
                  <StatusPill state={task.estado} />
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      className="flex min-w-0 items-center justify-center gap-1 rounded-lg border border-blue-400/30 bg-blue-500/10 px-1 py-1.5 text-[10px] font-bold text-blue-200 transition hover:bg-blue-500/20 disabled:opacity-50"
                      disabled={assigningTaskId === task.id}
                      onClick={() => void assignTask(task, 'comite')}
                      type="button"
                    >
                      <UsersRound size={13} /> <span>Comité</span> <ArrowRight size={12} />
                    </button>
                    <button
                      className="flex min-w-0 items-center justify-center gap-1 rounded-lg border border-violet-400/30 bg-violet-500/10 px-1 py-1.5 text-[10px] font-bold text-violet-200 transition hover:bg-violet-500/20 disabled:opacity-50"
                      disabled={assigningTaskId === task.id}
                      onClick={() => void assignTask(task, 'paritaria')}
                      type="button"
                    >
                      <Handshake size={13} /> <span>Paritaria</span> <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              )) : (
                <div className="border-t border-white/[0.06] px-4 py-6 text-center text-sm text-metro-muted">No hay puntos pendientes de clasificar.</div>
              )}
            </div>
          </section>
        </main>

        <aside className="space-y-3">
          <section className="rounded-2xl border border-white/10 bg-metro-panel/80 p-4">
            <div className="mb-4 flex items-center gap-2">
              <ListChecks className="text-red-300" size={20} />
              <h3 className="text-base font-black text-metro-text">Estado del flujo</h3>
            </div>
            <div className="space-y-2.5">
              {[
                ['Sesiones configuradas', activeCommittee.length + activeParitaria.length > 0],
                ['Puntos pendientes de asignación', inboxTasks.length === 0],
                ['Comité preparado', activeCommittee.length > 0],
                ['Paritaria preparada', activeParitaria.length > 0],
              ].map(([label, ok]) => (
                <div className="flex items-center gap-2.5" key={String(label)}>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${ok ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300' : 'border-amber-400/30 bg-amber-500/10 text-amber-300'}`}>
                    {ok ? <CheckCircle2 size={13} /> : <Clock3 size={12} />}
                  </span>
                  <span className="text-xs font-semibold leading-snug text-metro-secondary">{label}</span>
                </div>
              ))}
            </div>
          </section>

          <KpiCard icon={Inbox} label="Pendientes de clasificar" tone="amber" value={inboxTasks.length} />
          <KpiCard icon={CalendarDays} label="Próximas sesiones" tone="violet" value={activeCommittee.length + activeParitaria.length} />
          <KpiCard icon={CheckCircle2} label="Cerradas este año" tone="green" value={closedThisYear} />

          <section className="rounded-2xl border border-white/10 bg-metro-panel/80 p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-metro-muted">Accesos rápidos</div>
            <div className="grid gap-2">
              <button className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-metro-slate/50 px-3 py-2.5 text-sm font-bold text-metro-secondary hover:bg-white/[0.05]" onClick={() => onOpenOrgan('comite')} type="button">
                <span className="flex items-center gap-2"><UsersRound className="text-blue-300" size={17} /> Comité</span><ArrowRight size={15} />
              </button>
              <button className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-metro-slate/50 px-3 py-2.5 text-sm font-bold text-metro-secondary hover:bg-white/[0.05]" onClick={() => onOpenOrgan('paritaria')} type="button">
                <span className="flex items-center gap-2"><Handshake className="text-violet-300" size={17} /> Paritaria</span><ArrowRight size={15} />
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

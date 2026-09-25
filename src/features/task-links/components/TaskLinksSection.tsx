import { ArrowRight, Building2, CalendarDays, Handshake, UsersRound } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useCommitteeSessionStore } from '../../comite/store/useCommitteeSessionStore';
import { useParitariaSessionStore } from '../../paritaria/store/useParitariaSessionStore';
import { useCoordinacionStore } from '../../coordinacion/store/useCoordinacionStore';
import { formatCoordinationDate } from '../../coordinacion/domain/coordinacion';
import type { Task } from '../../tareas/domain/task';
import { formatManagedSessionDate, getManagedSessionTaskResult } from '../../../shared/sessions/session';
import { navigateInApp } from '../../../services/appNavigationBus';

type LinkStatus = 'pending' | 'scheduled' | 'treated' | 'followup' | 'return' | 'not-treated';

type TaskLink = {
  id: string;
  label: string;
  detail: string;
  status: LinkStatus;
  target?: { view: 'coordinacion' | 'comite' | 'paritaria'; recordId?: string };
  icon: 'meeting' | 'organ' | 'union';
};

function statusClasses(status: LinkStatus): string {
  if (status === 'treated') return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200';
  if (status === 'scheduled') return 'border-sky-400/20 bg-sky-500/10 text-sky-200';
  if (status === 'followup' || status === 'return' || status === 'not-treated') return 'border-amber-400/20 bg-amber-500/10 text-amber-200';
  return 'border-amber-400/20 bg-amber-500/10 text-amber-200';
}

function statusLabel(status: LinkStatus): string {
  if (status === 'treated') return 'Tratado';
  if (status === 'scheduled') return 'Incluido';
  if (status === 'followup') return 'Requiere seguimiento';
  if (status === 'return') return 'Volver a próxima';
  if (status === 'not-treated') return 'No tratado';
  return 'Pendiente';
}

function LinkIcon({ type }: { type: TaskLink['icon'] }) {
  if (type === 'organ') return <CalendarDays size={15} />;
  if (type === 'union') return <UsersRound size={15} />;
  return <Building2 size={15} />;
}

export function TaskLinksSection({ task }: { task: Task }) {
  const meetings = useCoordinacionStore((state) => state.meetings);
  const directionTaskIds = useCoordinacionStore((state) => state.directionTaskIds);
  const unionTaskIds = useCoordinacionStore((state) => state.unionTaskIds);
  const areaTaskIds = useCoordinacionStore((state) => state.areaTaskIds);
  const loadCoordination = useCoordinacionStore((state) => state.load);
  const committeeSessions = useCommitteeSessionStore((state) => state.sessions);
  const loadCommittee = useCommitteeSessionStore((state) => state.loadHistoricalSessions);
  const paritariaSessions = useParitariaSessionStore((state) => state.sessions);
  const loadParitaria = useParitariaSessionStore((state) => state.loadHistoricalSessions);

  useEffect(() => {
    loadCoordination();
    loadCommittee();
    loadParitaria();
  }, [loadCommittee, loadCoordination, loadParitaria]);

  const links = useMemo<TaskLink[]>(() => {
    const result: TaskLink[] = [];

    const addSessionLinks = (
      sessions: typeof committeeSessions,
      organ: 'comite' | 'paritaria',
      label: string,
    ) => {
      const taskSessions = sessions
        .filter((session) => session.items.includes(task.id))
        .sort((a, b) => b.date.localeCompare(a.date));

      taskSessions.forEach((session) => {
        const sessionResult = getManagedSessionTaskResult(session, task.id);
        const status: LinkStatus = session.status === 'open'
          ? 'scheduled'
          : sessionResult === 'resolved'
            ? 'treated'
            : sessionResult === 'followup'
              ? 'followup'
              : sessionResult === 'return'
                ? 'return'
                : 'not-treated';
        result.push({
          id: `${organ}:${session.id}`,
          label,
          detail: `${session.code || 'Sin código'} · ${formatManagedSessionDate(session.date)}`,
          status,
          target: { view: organ, recordId: session.id },
          icon: 'organ',
        });
      });

      const normalizedPhase = task.fase.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (normalizedPhase === organ && !taskSessions.some((session) => session.status === 'open')) {
        result.push({
          id: `${organ}:pending`,
          label,
          detail: 'Pendiente de asignar a una sesión',
          status: 'pending',
          target: { view: organ },
          icon: 'organ',
        });
      }
    };

    addSessionLinks(committeeSessions, 'comite', 'Comité');
    addSessionLinks(paritariaSessions, 'paritaria', 'Paritaria');

    meetings
      .filter((meeting) => meeting.points.some((point) => point.taskId === task.id))
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach((meeting) => {
        const point = meeting.points.find((candidate) => candidate.taskId === task.id);
        if (!point) return;
        const label = meeting.area === 'direccion'
          ? 'Dirección'
          : meeting.area === 'sindicatos'
            ? (meeting.unionName?.trim() || 'Sindicato')
            : (meeting.areaName?.trim() || 'Otra área');
        const status: LinkStatus = meeting.status === 'open'
          ? 'scheduled'
          : point.status === 'tratado'
            ? 'treated'
            : point.status === 'seguimiento'
              ? 'followup'
              : point.status === 'volver'
                ? 'return'
                : 'not-treated';
        result.push({
          id: `coord:${meeting.id}`,
          label,
          detail: `Coordinación · ${formatCoordinationDate(meeting.date)}`,
          status,
          target: { view: 'coordinacion', recordId: meeting.id },
          icon: meeting.area === 'sindicatos' ? 'union' : 'meeting',
        });
      });

    if (directionTaskIds.includes(task.id) && !meetings.some((meeting) => meeting.status === 'open' && meeting.area === 'direccion' && meeting.points.some((point) => point.taskId === task.id))) {
      result.push({
        id: 'direction:pending',
        label: 'Dirección',
        detail: 'Pendiente de próxima reunión',
        status: 'pending',
        target: { view: 'coordinacion' },
        icon: 'meeting',
      });
    }

    for (const [unionName, taskIds] of Object.entries(unionTaskIds)) {
      if (!taskIds.includes(task.id)) continue;
      const alreadyOpen = meetings.some((meeting) => meeting.status === 'open' && meeting.area === 'sindicatos' && meeting.unionName === unionName && meeting.points.some((point) => point.taskId === task.id));
      if (!alreadyOpen) {
        result.push({
          id: `union:${unionName}:pending`,
          label: unionName,
          detail: 'Pendiente de próxima reunión sindical',
          status: 'pending',
          target: { view: 'coordinacion' },
          icon: 'union',
        });
      }
    }

    for (const [areaName, taskIds] of Object.entries(areaTaskIds)) {
      if (!taskIds.includes(task.id)) continue;
      const alreadyOpen = meetings.some((meeting) => meeting.status === 'open' && meeting.area === 'otras-areas' && meeting.areaName === areaName && meeting.points.some((point) => point.taskId === task.id));
      if (!alreadyOpen) {
        result.push({
          id: `area:${areaName}:pending`,
          label: areaName,
          detail: 'Pendiente de próxima reunión con el área',
          status: 'pending',
          target: { view: 'coordinacion' },
          icon: 'meeting',
        });
      }
    }

    return result;
  }, [areaTaskIds, committeeSessions, directionTaskIds, meetings, paritariaSessions, task.fase, task.id, unionTaskIds]);

  return (
    <section className="rounded-xl border border-metro-border bg-metro-panel/55 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Handshake className="text-sky-300" size={16} />
          <div>
            <h3 className="text-sm font-bold text-metro-text">Vínculos y circuitos</h3>
            <p className="text-[11px] text-metro-muted">Dónde está pendiente o en qué reuniones se ha incluido esta tarea.</p>
          </div>
        </div>
        <span className="rounded-full border border-metro-border bg-metro-surface px-2 py-1 text-[11px] font-bold text-metro-muted">{links.length}</span>
      </div>

      {links.length === 0 ? (
        <p className="rounded-lg border border-dashed border-metro-border px-3 py-3 text-xs text-metro-muted">Esta tarea todavía no tiene vínculos con reuniones o sesiones.</p>
      ) : (
        <div className="space-y-1.5">
          {links.map((link) => (
            <div className="flex min-h-11 items-center gap-3 rounded-lg border border-metro-border/80 bg-metro-surface/60 px-3 py-2" key={link.id}>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-metro-panel text-sky-200"><LinkIcon type={link.icon} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <strong className="truncate text-xs text-metro-text">{link.label}</strong>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClasses(link.status)}`}>{statusLabel(link.status)}</span>
                </div>
                <p className="truncate text-[11px] text-metro-muted">{link.detail}</p>
              </div>
              {link.target && (
                <button
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-metro-border px-2.5 py-1.5 text-[11px] font-bold text-sky-200 transition hover:bg-sky-500/10"
                  onClick={() => navigateInApp(link.target!)}
                  type="button"
                >
                  Abrir <ArrowRight size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

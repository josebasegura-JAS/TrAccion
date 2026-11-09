import { CheckCircle2, Circle, CalendarClock, UserRound } from 'lucide-react';
import type { Task, TaskQuickAction } from '../../features/tareas/domain/task';

export function getTaskQuickActions(task: Pick<Task, 'seguimiento'>): TaskQuickAction[] {
  return task.seguimiento
    .flatMap((entry) => entry.quickActions ?? [])
    .sort((first, second) => Number(Boolean(first.completedAt)) - Number(Boolean(second.completedAt)));
}

export function TaskQuickActionsPreview({ task }: { task: Task }) {
  const actions = getTaskQuickActions(task);
  const pending = actions.filter((action) => !action.completedAt).length;
  const completed = actions.length - pending;
  const today = new Date();
  const todayLocal = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  return (
    <section
      id={`task-actions-${task.id}`}
      aria-label={`Acciones vinculadas a ${task.titulo}`}
      className="px-4 py-3 sm:pl-9"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-metro-muted">
        <span>Acciones vinculadas</span>
        <span className="rounded-full border border-metro-border px-2 py-0.5">
          {pending} pendientes · {completed} completadas
        </span>
        <span className="ml-auto text-[11px] font-normal">Solo consulta</span>
      </div>
      <ul className="space-y-1.5">
        {actions.map((action) => {
          const completedAction = Boolean(action.completedAt);
          const isOverdue = !completedAction && Boolean(action.fechaObjetivo) && action.fechaObjetivo < todayLocal;
          return (
            <li
              className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-lg border border-metro-border/60 bg-metro-surface/55 px-3 py-2 text-xs"
              key={action.id}
            >
              {completedAction
                ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={15} aria-label="Completada" />
                : <Circle className="mt-0.5 shrink-0 text-amber-400" size={15} aria-label="Pendiente" />}
              <span className={`min-w-[180px] flex-1 whitespace-normal break-words font-semibold ${completedAction ? 'text-metro-muted line-through' : 'text-metro-text'}`}>
                {action.titulo}
              </span>
              {action.asignadaA && (
                <span className="inline-flex items-center gap-1 text-metro-muted">
                  <UserRound size={12} aria-hidden="true" />{action.asignadaA}
                </span>
              )}
              {action.fechaObjetivo && (
                <span className={`inline-flex items-center gap-1 ${isOverdue ? 'font-semibold text-red-400' : 'text-metro-muted'}`}>
                  <CalendarClock size={12} aria-hidden="true" />
                  {action.fechaObjetivo}
                  {isOverdue && <span>· Vencida</span>}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import type { Dispatch, SetStateAction } from 'react';
import { Activity, CalendarDays, Flag, UserRound } from 'lucide-react';
import { TASK_PRIORITIES, type TaskDraft } from '../../features/tareas/domain/task';
import { useConfiguracionStore } from '../../features/configuracion/store/useConfiguracionStore';
import { Input, Select } from '../ui/Field';

export function TaskStatusPanel({ draft, setDraft, responsibleOptions, responsibleSelectValue, otherResponsibleValue }: {
  draft: TaskDraft;
  setDraft: Dispatch<SetStateAction<TaskDraft>>;
  responsibleOptions: string[];
  responsibleSelectValue: string;
  otherResponsibleValue: string;
}) {
  const taskStates = useConfiguracionStore((state) => state.taskStates);
  const stateOptions = taskStates.filter((state) => state.active || state.id === draft.estado);
  return (
    <section className="rounded-xl border border-sky-300/20 bg-[#102239]/90 p-3">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-100">
        <Activity size={17} className="text-cyan-300" aria-hidden="true" />Estado de la tarea
      </h3>
      <div className="divide-y divide-white/10 rounded-lg border border-white/10 bg-[#0d1d31]/60">
        <label className="grid grid-cols-[90px_minmax(0,1fr)] items-center gap-2 px-2 py-2 text-xs text-slate-200">
          <span className="flex items-center gap-1.5"><Activity size={14} className="text-emerald-300" />Estado</span>
          <Select aria-label="Estado de la tarea" className="h-8 rounded-lg border-emerald-400/35 bg-emerald-500/10 px-2 text-xs font-semibold text-emerald-100" value={draft.estado} onChange={(event) => setDraft((current) => ({ ...current, estado: event.target.value as TaskDraft['estado'] }))}>
            {stateOptions.map((state) => <option key={state.id} value={state.id}>{state.nombre}</option>)}
          </Select>
        </label>
        <label className="grid grid-cols-[90px_minmax(0,1fr)] items-center gap-2 px-2 py-2 text-xs text-slate-200">
          <span className="flex items-center gap-1.5"><Flag size={14} className="text-amber-300" />Prioridad</span>
          <Select aria-label="Prioridad de la tarea" className="h-8 rounded-lg border-amber-400/35 bg-amber-500/10 px-2 text-xs font-semibold text-amber-100" value={draft.prioridad} onChange={(event) => setDraft((current) => ({ ...current, prioridad: event.target.value as TaskDraft['prioridad'] }))}>
            {TASK_PRIORITIES.map((value) => <option key={value} value={value}>{value}</option>)}
          </Select>
        </label>
        <label className="grid grid-cols-[90px_minmax(0,1fr)] items-center gap-2 px-2 py-2 text-xs text-slate-200">
          <span className="flex items-center gap-1.5"><UserRound size={14} className="text-sky-300" />Responsable</span>
          <span className="min-w-0">
            <Select aria-label="Responsable de la tarea" className="h-8 w-full rounded-lg border-sky-400/35 bg-sky-500/10 px-2 text-xs font-semibold text-sky-100" value={responsibleSelectValue} onChange={(event) => setDraft((current) => ({ ...current, responsable: event.target.value }))}>
              <option value="">Sin asignar</option>
              {responsibleOptions.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
            {responsibleSelectValue === 'Otros' && (
              <Input aria-label="Indica el responsable" className="mt-1 h-8 rounded-lg px-2 text-xs" placeholder="Indica el responsable" value={otherResponsibleValue} onChange={(event) => setDraft((current) => ({ ...current, responsable: `Otros: ${event.target.value}` }))} />
            )}
          </span>
        </label>
        <div className="grid grid-cols-[90px_minmax(0,1fr)] items-center gap-2 px-2 py-2 text-xs text-slate-300">
          <span className="flex items-center gap-1.5"><CalendarDays size={14} className="text-sky-300" />Fecha límite</span>
          <span className="font-semibold text-slate-100">{draft.fechaLimite ? draft.fechaLimite.split('-').reverse().join('/') : 'Sin fecha límite'}</span>
        </div>
      </div>
    </section>
  );
}

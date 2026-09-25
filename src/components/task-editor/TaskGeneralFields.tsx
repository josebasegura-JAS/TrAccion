import type { Dispatch, SetStateAction } from 'react';
import { FileText } from 'lucide-react';
import { Input, Select } from '../ui/Field';
import { TASK_PRIORITIES, TASK_STATES, TASK_TYPES, type Task, type TaskDraft } from '../../features/tareas/domain/task';
import { TaskEditorSection } from './TaskEditorSection';

export function TaskGeneralFields({
  draft,
  setDraft,
  task,
  phaseOptions,
  originOptions,
  responsibleOptions,
  responsibleSelectValue,
  otherResponsibleValue,
  creationDate,
}: {
  draft: TaskDraft;
  setDraft: Dispatch<SetStateAction<TaskDraft>>;
  task: Task | null;
  phaseOptions: string[];
  originOptions: string[];
  responsibleOptions: string[];
  responsibleSelectValue: string;
  otherResponsibleValue: string;
  creationDate: string;
}) {
  return (
    <TaskEditorSection icon={FileText} title="Datos de la tarea">
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-12">
        <label className="text-[11px] font-semibold text-metro-muted lg:col-span-2">Tipo
          <Select className="h-8 rounded-lg px-2 text-xs" value={draft.tipo} onChange={(e) => setDraft((c) => ({ ...c, tipo: e.target.value as TaskDraft['tipo'] }))}>{TASK_TYPES.map((v) => <option key={v}>{v}</option>)}</Select>
        </label>
        <label className="text-[11px] font-semibold text-metro-muted lg:col-span-2">Fase
          <Select className="h-8 rounded-lg px-2 text-xs" value={draft.fase} onChange={(e) => setDraft((c) => ({ ...c, fase: e.target.value }))}>{phaseOptions.map((v) => <option key={v}>{v}</option>)}</Select>
        </label>
        <label className="text-[11px] font-semibold text-metro-muted lg:col-span-4">Título <span className="text-metro-red">*</span>
          <Input className="h-8 rounded-lg px-2 text-xs" required value={draft.titulo} onChange={(e) => setDraft((c) => ({ ...c, titulo: e.target.value }))} />
        </label>
        <label className="text-[11px] font-semibold text-metro-muted lg:col-span-2">Responsable
          <Select className="h-8 rounded-lg px-2 text-xs" value={responsibleSelectValue} onChange={(e) => setDraft((c) => ({ ...c, responsable: e.target.value }))}>
            <option value="">Sin asignar</option>
            {responsibleOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </Select>
          {responsibleSelectValue === 'Otros' && <Input className="mt-1 h-8 rounded-lg px-2 text-xs" placeholder="Indica el responsable" value={otherResponsibleValue} onChange={(e) => setDraft((c) => ({ ...c, responsable: `Otros: ${e.target.value}` }))} />}
        </label>
        <label className="text-[11px] font-semibold text-metro-muted lg:col-span-2">Estado
          <Select className="h-8 rounded-lg px-2 text-xs" value={draft.estado} onChange={(e) => setDraft((c) => ({ ...c, estado: e.target.value as TaskDraft['estado'] }))}>{TASK_STATES.map((v) => <option key={v}>{v}</option>)}</Select>
        </label>
        <label className="text-[11px] font-semibold text-metro-muted lg:col-span-4">Detalle origen / solicitante
          <Input className="h-8 rounded-lg px-2 text-xs" value={draft.origen} onChange={(e) => setDraft((c) => ({ ...c, origen: e.target.value }))} />
        </label>
        <label className="text-[11px] font-semibold text-metro-muted lg:col-span-2">Fecha de creación
          <Input className="h-8 rounded-lg px-2 text-xs" type="date" value={creationDate} onChange={(e) => {
            const nextDate = e.target.value;
            const original = draft.createdAt ?? task?.createdAt ?? '';
            const suffix = original.length > 10 ? original.slice(10) : 'T00:00:00.000Z';
            setDraft((current) => ({ ...current, createdAt: nextDate ? `${nextDate}${suffix}` : current.createdAt }));
          }} />
        </label>
        <label className="text-[11px] font-semibold text-metro-muted lg:col-span-2">Fecha límite
          <Input className="h-8 rounded-lg px-2 text-xs" type="date" value={draft.fechaLimite} onChange={(e) => setDraft((c) => ({ ...c, fechaLimite: e.target.value }))} />
        </label>
        <label className="text-[11px] font-semibold text-metro-muted lg:col-span-2">Origen
          <Select className="h-8 rounded-lg px-2 text-xs" value={draft.sindicato} onChange={(e) => setDraft((c) => ({ ...c, sindicato: e.target.value }))}>
            <option value="">Sin origen</option>{originOptions.map((v) => <option key={v}>{v}</option>)}
          </Select>
        </label>
        <label className="text-[11px] font-semibold text-metro-muted lg:col-span-2">Prioridad
          <Select className="h-8 rounded-lg px-2 text-xs" value={draft.prioridad} onChange={(e) => setDraft((c) => ({ ...c, prioridad: e.target.value as TaskDraft['prioridad'] }))}>{TASK_PRIORITIES.map((v) => <option key={v}>{v}</option>)}</Select>
        </label>
      </div>
    </TaskEditorSection>
  );
}

import type { Dispatch, SetStateAction } from 'react';
import { FileText, UserRound } from 'lucide-react';
import { Input, Select } from '../ui/Field';
import { TASK_TYPES, type Task, type TaskDraft } from '../../features/tareas/domain/task';
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
  const createdBy = task?.createdBy?.trim() || draft.createdBy?.trim() || 'Creador no registrado';
  return (
    <TaskEditorSection
      icon={FileText}
      title="Resumen"
      action={
        <span className="inline-flex min-w-0 max-w-[55%] items-center gap-1.5 text-[11px] text-metro-muted" title={`Creada por: ${createdBy}`}>
          <UserRound className="shrink-0" size={13} />
          <span className="shrink-0">Creada por:</span>
          <span className="truncate font-semibold text-metro-text">{createdBy}</span>
        </span>
      }
    >
      <div className="space-y-2.5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.35fr)_minmax(220px,1fr)]">
          <label className="min-w-0 text-[11px] font-semibold text-metro-muted">
            Título <span className="text-metro-red">*</span>
            <Input className="h-9 rounded-lg px-3 text-sm" required value={draft.titulo} onChange={(e) => setDraft((current) => ({ ...current, titulo: e.target.value }))} />
          </label>
          <label className="min-w-0 text-[11px] font-semibold text-metro-muted">
            Responsable
            <Select className="h-9 rounded-lg px-2 text-sm" value={responsibleSelectValue} onChange={(e) => setDraft((current) => ({ ...current, responsable: e.target.value }))}>
              <option value="">Sin asignar</option>
              {responsibleOptions.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
            {responsibleSelectValue === 'Otros' && <Input className="mt-1 h-8 rounded-lg px-2 text-xs" placeholder="Indica el responsable" value={otherResponsibleValue} onChange={(e) => setDraft((current) => ({ ...current, responsable: `Otros: ${e.target.value}` }))} />}
          </label>
        </div>
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,145px),1fr))]">
          <label className="min-w-0 text-[11px] font-semibold text-metro-muted">Tipo
            <Select className="h-8 rounded-lg px-2 text-xs" value={draft.tipo} onChange={(e) => setDraft((current) => ({ ...current, tipo: e.target.value as TaskDraft['tipo'] }))}>{TASK_TYPES.map((value) => <option key={value}>{value}</option>)}</Select>
          </label>
          <label className="min-w-0 text-[11px] font-semibold text-metro-muted">Fase
            <Select className="h-8 rounded-lg px-2 text-xs" value={draft.fase} onChange={(e) => setDraft((current) => ({ ...current, fase: e.target.value }))}>{phaseOptions.map((value) => <option key={value}>{value}</option>)}</Select>
          </label>
          <label className="min-w-0 text-[11px] font-semibold text-metro-muted">Fecha de creación
            <Input className="h-8 rounded-lg px-2 text-xs" type="date" value={creationDate} onChange={(e) => {
              const nextDate = e.target.value;
              const original = draft.createdAt ?? task?.createdAt ?? '';
              const suffix = original.length > 10 ? original.slice(10) : 'T00:00:00.000Z';
              setDraft((current) => ({ ...current, createdAt: nextDate ? `${nextDate}${suffix}` : current.createdAt }));
            }} />
          </label>
          <label className="min-w-0 text-[11px] font-semibold text-metro-muted">Fecha límite
            <Input className="h-8 rounded-lg px-2 text-xs" type="date" value={draft.fechaLimite} onChange={(e) => setDraft((current) => ({ ...current, fechaLimite: e.target.value }))} />
          </label>
          <label className="min-w-0 text-[11px] font-semibold text-metro-muted">Origen
            <Select className="h-8 rounded-lg px-2 text-xs" value={draft.sindicato} onChange={(e) => setDraft((current) => ({ ...current, sindicato: e.target.value }))}>
              <option value="">Sin origen</option>{originOptions.map((value) => <option key={value}>{value}</option>)}
            </Select>
          </label>
          <label className="min-w-0 text-[11px] font-semibold text-metro-muted">Detalle origen / solicitante
            <Input className="h-8 rounded-lg px-2 text-xs" value={draft.origen} onChange={(e) => setDraft((current) => ({ ...current, origen: e.target.value }))} />
          </label>
        </div>
      </div>
    </TaskEditorSection>
  );
}

import type { Dispatch, SetStateAction } from 'react';
import { CalendarDays, Check, Info, MessageSquare, Pencil, Plus, Trash2, UserRound, X } from 'lucide-react';
import { CountBadge } from '../ui/CountBadge';
import { Input, Textarea } from '../ui/Field';
import type { Task, TaskSeguimientoEntry } from '../../features/tareas/domain/task';
import { TaskEditorSection } from './TaskEditorSection';
import { decodeTracking, formatDate, resolveTrackingId } from './taskEditorModel';

export function TaskTrackingSection({
  task,
  trackingItems,
  editingTrackingId,
  editingTrackingDate,
  setEditingTrackingDate,
  editingTrackingText,
  setEditingTrackingText,
  isSavingTrackingEdit,
  isFormReadOnly,
  onSaveTrackingEdit,
  onCancelTrackingEdit,
  onStartTrackingEdit,
  onDeleteTracking,
  trackingDate,
  setTrackingDate,
  trackingUser,
  trackingText,
  setTrackingText,
}: {
  task: Task | null;
  trackingItems: TaskSeguimientoEntry[];
  editingTrackingId: string | null;
  editingTrackingDate: string;
  setEditingTrackingDate: Dispatch<SetStateAction<string>>;
  editingTrackingText: string;
  setEditingTrackingText: Dispatch<SetStateAction<string>>;
  isSavingTrackingEdit: boolean;
  isFormReadOnly: boolean;
  onSaveTrackingEdit: (entry: TaskSeguimientoEntry, index: number) => Promise<void>;
  onCancelTrackingEdit: () => void;
  onStartTrackingEdit: (entry: TaskSeguimientoEntry, index: number) => void;
  onDeleteTracking: (index: number) => Promise<void>;
  trackingDate: string;
  setTrackingDate: Dispatch<SetStateAction<string>>;
  trackingUser: string;
  trackingText: string;
  setTrackingText: Dispatch<SetStateAction<string>>;
}) {
  return (
    <TaskEditorSection icon={MessageSquare} title="Seguimiento" action={<CountBadge tone="muted">{trackingItems.length} seguimientos</CountBadge>}>
      {trackingItems.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-lg border border-sky-300/10 bg-[#0a1b2e]/70">
          {trackingItems.map((entry, index) => {
            const decoded = decodeTracking(entry.texto, entry.fechaHora);
            const trackingId = task ? resolveTrackingId(entry, index, task.id) : `${entry.fechaHora}-${index}`;
            const isEditing = editingTrackingId === trackingId;
            return (
              <article className={`border-b border-sky-300/10 px-3 py-2 last:border-b-0 ${isEditing ? 'bg-sky-500/[0.05]' : ''}`} key={trackingId}>
                {isEditing ? (
                  <div className="grid grid-cols-1 gap-2 lg:grid-cols-[150px_125px_minmax(0,1fr)_66px] lg:items-start">
                    <Input aria-label="Fecha del seguimiento" className="h-8 text-xs" onChange={(event) => setEditingTrackingDate(event.target.value)} type="date" value={editingTrackingDate} />
                    <div className="flex h-8 items-center gap-2 truncate rounded-lg border border-metro-border bg-metro-panel px-2 text-xs font-semibold text-slate-300"><UserRound size={13} className="shrink-0 text-sky-300" /><span className="truncate">{decoded.user}</span></div>
                    <Textarea aria-label="Texto del seguimiento" className="min-h-[62px] text-xs" onChange={(event) => setEditingTrackingText(event.target.value)} value={editingTrackingText} />
                    <div className="flex items-center justify-end gap-1">
                      <button aria-label="Guardar cambios del seguimiento" className="grid h-7 w-7 place-items-center rounded-md text-emerald-300 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40" disabled={!editingTrackingText.trim() || isSavingTrackingEdit} onClick={() => void onSaveTrackingEdit(entry, index)} title="Guardar cambios" type="button"><Check size={15} /></button>
                      <button aria-label="Cancelar edición del seguimiento" className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-white/5 hover:text-white disabled:opacity-40" disabled={isSavingTrackingEdit} onClick={onCancelTrackingEdit} title="Cancelar" type="button"><X size={15} /></button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-[110px_125px_minmax(0,1fr)_62px] items-start gap-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-200"><CalendarDays size={13} className="text-sky-300" />{formatDate(decoded.date)}</div>
                    <div className="flex items-center gap-2 truncate text-xs font-semibold text-slate-300"><UserRound size={13} className="text-sky-300" /><span className="truncate">{decoded.user}</span></div>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{decoded.text}</p>
                    <div className="flex items-center justify-end gap-1">
                      <button aria-label={`Editar seguimiento del ${formatDate(decoded.date)}`} className="grid h-7 w-7 place-items-center rounded-md text-slate-500 transition hover:bg-sky-500/10 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40" disabled={isFormReadOnly || editingTrackingId !== null} onClick={() => onStartTrackingEdit(entry, index)} title="Editar seguimiento" type="button"><Pencil size={13} /></button>
                      <button aria-label={`Eliminar seguimiento del ${formatDate(decoded.date)}`} className="grid h-7 w-7 place-items-center rounded-md text-slate-500 transition hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40" disabled={isFormReadOnly || editingTrackingId !== null} onClick={() => void onDeleteTracking(index)} title="Eliminar seguimiento" type="button"><Trash2 size={14} /></button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <div className={trackingItems.length > 0 ? 'mt-3 border-t border-sky-300/10 pt-3' : ''}>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-200"><Plus size={13} className="text-sky-300" />Añadir nuevo seguimiento</div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[180px_180px_minmax(0,1fr)]">
          <label className="text-xs font-semibold text-metro-muted">Fecha del cambio<Input type="date" value={trackingDate} onChange={(e) => setTrackingDate(e.target.value)} /></label>
          <label className="text-xs font-semibold text-metro-muted">Usuario<div className="mt-1 flex h-9 items-center gap-2 rounded-lg border border-metro-border bg-metro-panel px-3 text-sm font-semibold text-slate-200"><UserRound size={14} className="text-sky-200" />{trackingUser}</div></label>
          <div className="flex items-end pb-1 text-[11px] font-medium text-slate-400"><Info className="mr-1.5 shrink-0 text-sky-300" size={14} />La fecha se propone con la del sistema, pero puedes corregirla antes de guardar.</div>
        </div>
        <label className="mt-2 block text-xs font-semibold text-metro-muted">Registrar seguimiento<Textarea className="min-h-20" placeholder="Escribe aquí el seguimiento de la tarea..." value={trackingText} onChange={(e) => setTrackingText(e.target.value)} /></label>
        {trackingText.trim() && <p className="mt-1 text-[11px] font-semibold text-sky-300">Este seguimiento se añadirá al pulsar Guardar.</p>}
      </div>
    </TaskEditorSection>
  );
}

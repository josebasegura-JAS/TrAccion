import type { Dispatch, SetStateAction } from 'react';
import { ArrowUpRight, CalendarDays, Check, Info, MessageSquare, Pencil, Plus, Trash2, UserRound, X } from 'lucide-react';
import { CountBadge } from '../ui/CountBadge';
import { Input, Textarea } from '../ui/Field';
import type { Task, TaskSeguimientoEntry } from '../../features/tareas/domain/task';
import { TaskEditorSection } from './TaskEditorSection';
import { decodeTracking, formatDate, resolveTrackingId } from './taskEditorModel';
import { navigateInApp } from '../../services/appNavigationBus';

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
  quickActionEnabled, setQuickActionEnabled, quickActionTitle, setQuickActionTitle, quickActionDate, setQuickActionDate, quickActionAssignee, setQuickActionAssignee, quickActionAssigneeOptions, onCompleteQuickAction,
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
  quickActionEnabled: boolean;
  setQuickActionEnabled: Dispatch<SetStateAction<boolean>>;
  quickActionTitle: string;
  setQuickActionTitle: Dispatch<SetStateAction<string>>;
  quickActionDate: string;
  setQuickActionDate: Dispatch<SetStateAction<string>>;
  quickActionAssignee: string;
  setQuickActionAssignee: Dispatch<SetStateAction<string>>;
  quickActionAssigneeOptions: string[];
  onCompleteQuickAction: (trackingId: string, actionId: string) => Promise<void>;
}) {
  return (
    <TaskEditorSection icon={MessageSquare} title="Seguimiento" action={<CountBadge tone="muted">{trackingItems.length} seguimientos</CountBadge>}>
      <div className="rounded-xl border border-sky-300/15 bg-[linear-gradient(120deg,rgba(32,64,94,0.68),rgba(19,42,66,0.66))] p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-200"><Plus size={13} className="text-sky-300" />Nuevo seguimiento <span className="ml-auto text-[10px] font-normal text-metro-muted">Se guardará junto con la tarea</span></div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[180px_180px_minmax(0,1fr)]">
          <label className="text-xs font-semibold text-metro-muted">Fecha del cambio<Input type="date" value={trackingDate} onChange={(e) => setTrackingDate(e.target.value)} /></label>
          <label className="text-xs font-semibold text-metro-muted">Usuario<div className="mt-1 flex h-9 items-center gap-2 rounded-lg border border-metro-border bg-metro-panel px-3 text-sm font-semibold text-slate-200"><UserRound size={14} className="text-sky-200" />{trackingUser}</div></label>
          <div className="flex items-end pb-1 text-[11px] font-medium text-slate-400"><Info className="mr-1.5 shrink-0 text-sky-300" size={14} />La fecha se propone con la del sistema, pero puedes corregirla antes de guardar.</div>
        </div>
        <label className="mt-2 block text-xs font-semibold text-metro-muted">Registrar seguimiento<Textarea className="min-h-[62px] bg-[#213a55]/50" placeholder="Escribe aquí el seguimiento de la tarea..." value={trackingText} onChange={(e) => setTrackingText(e.target.value)} /></label>
        {task && <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-metro-text"><input type="checkbox" checked={quickActionEnabled} disabled={isFormReadOnly} onChange={(event) => setQuickActionEnabled(event.target.checked)}/>Crear acción pendiente vinculada a este seguimiento</label>}
        {quickActionEnabled && <div className="mt-2 grid gap-2 rounded-lg border border-metro-border p-3 sm:grid-cols-[1fr_170px_160px]"><label className="text-xs text-metro-muted">¿Qué hay que hacer?<Input value={quickActionTitle} onChange={(event) => setQuickActionTitle(event.target.value)} placeholder="Ej.: Convocar reunión con Operaciones" /></label><label className="text-xs text-metro-muted">Fecha objetivo (opcional)<Input type="date" value={quickActionDate} onChange={(event) => setQuickActionDate(event.target.value)} /></label><label className="text-xs text-metro-muted">Asignada a (opcional)<select className="mt-1 h-9 w-full rounded-lg border border-metro-border bg-metro-panel px-2 text-xs text-metro-text" value={quickActionAssignee} onChange={(e) => setQuickActionAssignee(e.target.value)}><option value="">Sin asignar</option>{quickActionAssigneeOptions.map((user) => <option key={user} value={user}>{user}</option>)}</select></label></div>}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-400">{trackingText.trim() ? 'El seguimiento se incorporará al guardar la tarea.' : 'Escribe el seguimiento para poder añadirlo.'}</p>
          <button type="submit" disabled={isFormReadOnly || !trackingText.trim()} title="Guarda la tarea e incorpora el nuevo seguimiento" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/40 bg-emerald-700/70 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-600/80 disabled:cursor-not-allowed disabled:opacity-40"><Plus size={14} /> Añadir seguimiento</button>
        </div>
      </div>
      {trackingItems.length > 0 && (
        <div className="relative mt-2 space-y-1.5 border-l-2 border-sky-400/35 pl-3">
          {trackingItems.map((entry, index) => {
            const decoded = decodeTracking(entry.texto, entry.fechaHora);
            const trackingId = task ? resolveTrackingId(entry, index, task.id) : `${entry.fechaHora}-${index}`;
            const isEditing = editingTrackingId === trackingId;
            return (
              <article className={`relative rounded-lg border border-sky-300/15 bg-[#122b43]/65 px-3 py-2 before:absolute before:-left-[19px] before:top-4 before:h-2.5 before:w-2.5 before:rounded-full before:bg-sky-300 ${isEditing ? 'bg-sky-500/[0.05]' : ''}`} key={trackingId}>
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
                  <div className="grid grid-cols-[minmax(105px,135px)_minmax(0,1fr)_62px] items-start gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200"><CalendarDays size={13} className="text-sky-300" />{formatDate(decoded.date)}</div>
                      <div className="flex items-center gap-1.5 truncate text-xs font-semibold text-slate-300"><UserRound size={13} className="text-sky-300" /><span className="truncate">{decoded.user}</span></div>
                    </div>
                    <div className="min-w-0">
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{decoded.text}</p>
                      {entry.quickActions?.map((action) => <label key={action.id} className="mt-2 flex items-center gap-2 rounded border border-metro-border px-2 py-1 text-xs text-metro-text"><input type="checkbox" checked={Boolean(action.completedAt)} disabled={isFormReadOnly || Boolean(action.completedAt)} onChange={() => void onCompleteQuickAction(trackingId, action.id)} /><span className={action.completedAt ? 'line-through opacity-60' : 'font-semibold'}>{action.titulo}</span>{action.asignadaA && <span className="text-metro-muted">· {action.asignadaA}</span>}{action.fechaObjetivo && <span className="ml-auto text-metro-muted">{action.fechaObjetivo}</span>}</label>)}
                      {entry.source?.module === 'coordinacion' ? (
                        <button
                          className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-sky-400/20 px-2 py-1 text-[10px] font-bold text-sky-300 transition hover:bg-sky-500/10"
                          onClick={() => navigateInApp({ view: 'coordinacion', recordId: entry.source?.recordId, pointId: entry.source?.pointId })}
                          title={entry.source.label}
                          type="button"
                        >
                          Ver reunión de origen: {entry.source.label}<ArrowUpRight size={11} aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
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
    </TaskEditorSection>
  );
}

import type { Dispatch, SetStateAction } from 'react';
import { Plus, X } from 'lucide-react';
import type { TaskOriginConfig } from '../../features/configuracion/domain/taskOrigins';
import type { TaskDraft } from '../../features/tareas/domain/task';

export function TaskCircuitsSection({
  setDraft, sendToDirection, setSendToDirection, sendToUnion, setSendToUnion,
  selectedAreaTarget, setSelectedAreaTarget, showCircuitPicker, setShowCircuitPicker,
  customAreaTarget, setCustomAreaTarget, selectedUnionOrigin, unionCircuitOptions,
  areaCircuitOptions, isCommitteeCircuit, isParitariaCircuit,
}: {
  draft: TaskDraft;
  setDraft: Dispatch<SetStateAction<TaskDraft>>;
  sendToDirection: boolean;
  setSendToDirection: Dispatch<SetStateAction<boolean>>;
  sendToUnion: boolean;
  setSendToUnion: Dispatch<SetStateAction<boolean>>;
  selectedAreaTarget: string;
  setSelectedAreaTarget: Dispatch<SetStateAction<string>>;
  showCircuitPicker: boolean;
  setShowCircuitPicker: Dispatch<SetStateAction<boolean>>;
  customAreaTarget: string;
  setCustomAreaTarget: Dispatch<SetStateAction<string>>;
  selectedUnionOrigin: TaskOriginConfig | null;
  unionCircuitOptions: TaskOriginConfig[];
  areaCircuitOptions: TaskOriginConfig[];
  isCommitteeCircuit: boolean;
  isParitariaCircuit: boolean;
}) {
  return <div className="rounded-xl border border-sky-300/15 bg-[#0a1b2e]/55 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><strong className="block text-xs text-slate-100">Circuitos</strong><span className="text-[10px] font-medium text-slate-400">Indica dónde debe tratarse este asunto. Los cambios se aplican al guardar la tarea.</span></div>
      <button className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300/25 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-bold text-sky-100 hover:bg-sky-500/15" onClick={() => setShowCircuitPicker((current) => !current)} type="button"><Plus size={13}/>Llevar a…</button>
    </div>
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sendToDirection && <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-100">Dirección<button aria-label="Quitar Dirección" className="text-sky-200/70 hover:text-white" onClick={() => setSendToDirection(false)} type="button"><X size={12}/></button></span>}
      {isCommitteeCircuit && <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">Comité<button aria-label="Quitar Comité" className="text-amber-200/70 hover:text-white" onClick={() => setDraft((current) => ({ ...current, fase: 'tarea' }))} type="button"><X size={12}/></button></span>}
      {isParitariaCircuit && <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">Paritaria<button aria-label="Quitar Paritaria" className="text-amber-200/70 hover:text-white" onClick={() => setDraft((current) => ({ ...current, fase: 'tarea' }))} type="button"><X size={12}/></button></span>}
      {sendToUnion && selectedUnionOrigin && <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">{selectedUnionOrigin.nombre}<button aria-label={`Quitar ${selectedUnionOrigin.nombre}`} className="text-amber-200/70 hover:text-white" onClick={() => setSendToUnion(false)} type="button"><X size={12}/></button></span>}
      {selectedAreaTarget && <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-100">{selectedAreaTarget}<button aria-label={`Quitar ${selectedAreaTarget}`} className="text-violet-200/70 hover:text-white" onClick={() => setSelectedAreaTarget('')} type="button"><X size={12}/></button></span>}
      {!sendToDirection && !isCommitteeCircuit && !isParitariaCircuit && !(sendToUnion && selectedUnionOrigin) && !selectedAreaTarget && <span className="text-[11px] text-slate-500">Sin circuitos pendientes.</span>}
    </div>
    {showCircuitPicker && <div className="mt-3 grid gap-2 border-t border-sky-300/10 pt-3 md:grid-cols-2">
      <button className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold ${sendToDirection ? 'border-sky-400/35 bg-sky-500/15 text-sky-100' : 'border-metro-border bg-metro-surface/70 text-metro-text hover:bg-sky-500/10'}`} onClick={() => setSendToDirection(true)} type="button">Dirección<span className="mt-0.5 block text-[10px] font-normal text-metro-muted">Próximo guion de Coordinación.</span></button>
      <button className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold ${isCommitteeCircuit ? 'border-amber-400/35 bg-amber-500/15 text-amber-100' : 'border-metro-border bg-metro-surface/70 text-metro-text hover:bg-amber-500/10'}`} onClick={() => setDraft((current) => ({ ...current, fase: 'comite' }))} type="button">Comité<span className="mt-0.5 block text-[10px] font-normal text-metro-muted">Quedará disponible para asignar a una sesión.</span></button>
      <button className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold ${isParitariaCircuit ? 'border-amber-400/35 bg-amber-500/15 text-amber-100' : 'border-metro-border bg-metro-surface/70 text-metro-text hover:bg-amber-500/10'}`} onClick={() => setDraft((current) => ({ ...current, fase: 'paritaria' }))} type="button">Paritaria<span className="mt-0.5 block text-[10px] font-normal text-metro-muted">Quedará disponible para asignar a una sesión.</span></button>
      <label className="rounded-lg border border-metro-border bg-metro-surface/70 px-3 py-2 text-xs font-semibold text-metro-text">Sindicato<select className="mt-1 w-full rounded-md border border-metro-border bg-metro-panel px-2 py-1.5 text-xs text-metro-text" onChange={(event) => { const value = event.target.value; if (!value) return; setDraft((current) => ({ ...current, sindicato: value })); setSendToUnion(true); }} value={sendToUnion && selectedUnionOrigin ? selectedUnionOrigin.nombre : ''}><option value="">Selecciona sindicato…</option>{unionCircuitOptions.map((origin) => <option key={origin.id} value={origin.nombre}>{origin.nombre}</option>)}</select></label>
      <label className="rounded-lg border border-metro-border bg-metro-surface/70 px-3 py-2 text-xs font-semibold text-metro-text md:col-span-2">Otra área<div className="mt-1 grid gap-2 sm:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_auto]"><select className="rounded-md border border-metro-border bg-metro-panel px-2 py-1.5 text-xs text-metro-text" onChange={(event) => { if (event.target.value) { setSelectedAreaTarget(event.target.value); setCustomAreaTarget(''); } }} value={areaCircuitOptions.some((origin) => origin.nombre === selectedAreaTarget) ? selectedAreaTarget : ''}><option value="">Selecciona un área…</option>{areaCircuitOptions.map((origin) => <option key={origin.id} value={origin.nombre}>{origin.nombre}</option>)}</select><input className="rounded-md border border-metro-border bg-metro-panel px-2 py-1.5 text-xs text-metro-text outline-none focus:border-metro-red" onChange={(event) => setCustomAreaTarget(event.target.value)} placeholder="Otra área…" value={customAreaTarget}/><button className="rounded-md border border-metro-border px-2.5 py-1.5 text-[11px] font-bold text-metro-text disabled:opacity-40" disabled={!customAreaTarget.trim()} onClick={() => { setSelectedAreaTarget(customAreaTarget.trim()); setCustomAreaTarget(''); }} type="button">Añadir</button></div></label>
    </div>}
  </div>;
}

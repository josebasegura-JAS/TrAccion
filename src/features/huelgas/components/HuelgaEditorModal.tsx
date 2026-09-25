import { CalendarDays, Clock3, Trash2, UsersRound } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { createId, type HuelgaDraft } from './huelgasPageModel';

type Props = {
  open: boolean;
  editingId: string | null;
  draft: HuelgaDraft;
  sindicatos: string[];
  saving: boolean;
  onClose: () => void;
  onDraftChange: (updater: (current: HuelgaDraft) => HuelgaDraft) => void;
  onToggleSindicato: (sindicato: string) => void;
  onAddTramo: () => void;
  onUpdateTramo: (id: string, field: 'inicio' | 'fin', value: string) => void;
  onRemoveTramo: (id: string) => void;
  onSave: () => void;
};

export function HuelgaEditorModal({
  open,
  editingId,
  draft,
  sindicatos,
  saving,
  onClose,
  onDraftChange,
  onToggleSindicato,
  onAddTramo,
  onUpdateTramo,
  onRemoveTramo,
  onSave,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="presentation">
      <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-metro-border bg-metro-app shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="huelga-editor-title">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-metro-border bg-metro-app/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 id="huelga-editor-title" className="text-lg font-semibold text-metro-text">{editingId ? 'Editar convocatoria' : 'Nueva convocatoria de huelga'}</h2>
            <p className="mt-1 text-sm text-metro-muted">Registra los datos básicos de la jornada convocada.</p>
          </div>
          <button className="rounded-lg px-2 py-1 text-xl text-metro-muted hover:bg-metro-raised hover:text-metro-text" onClick={onClose} type="button" aria-label="Cerrar">×</button>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium text-metro-text">
              Fecha de huelga <span className="text-metro-red">*</span>
              <input className="w-full rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5 text-metro-text outline-none focus:border-metro-red" type="date" value={draft.fecha} onChange={(event) => onDraftChange((current) => ({ ...current, fecha: event.target.value }))} />
            </label>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-metro-text">Tipo de convocatoria <span className="text-metro-red">*</span></legend>
              <div className="grid grid-cols-2 gap-2">
                <button className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${draft.tipo === 'jornada-completa' ? 'border-metro-red bg-metro-red/15 text-metro-text' : 'border-metro-border bg-metro-panel text-metro-muted hover:bg-metro-raised'}`} onClick={() => onDraftChange((current) => ({ ...current, tipo: 'jornada-completa', tramos: [] }))} type="button">Jornada completa</button>
                <button className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${draft.tipo === 'paros-parciales' ? 'border-metro-red bg-metro-red/15 text-metro-text' : 'border-metro-border bg-metro-panel text-metro-muted hover:bg-metro-raised'}`} onClick={() => onDraftChange((current) => ({ ...current, tipo: 'paros-parciales', tramos: current.tramos.length ? current.tramos : [{ id: createId('tramo'), inicio: '', fin: '' }] }))} type="button">Paros parciales</button>
              </div>
            </fieldset>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-metro-text">Sindicato/s convocante/s <span className="text-metro-red">*</span></legend>
            <div className="flex flex-wrap gap-2 rounded-xl border border-metro-border bg-metro-panel p-3">
              {sindicatos.length === 0 ? (
                <p className="text-sm text-metro-muted">No hay sindicatos activos configurados.</p>
              ) : sindicatos.map((sindicato) => {
                const selected = draft.sindicatos.includes(sindicato);
                return <button key={sindicato} type="button" onClick={() => onToggleSindicato(sindicato)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selected ? 'border-metro-red bg-metro-red text-white' : 'border-metro-border bg-metro-app text-metro-muted hover:border-metro-red hover:text-metro-text'}`}>{sindicato}</button>;
              })}
            </div>
          </fieldset>

          {draft.tipo === 'paros-parciales' && (
            <fieldset className="space-y-3 rounded-xl border border-metro-border bg-metro-panel/55 p-4">
              <div className="flex items-center justify-between gap-3">
                <legend className="text-sm font-medium text-metro-text">Tramos de paro</legend>
                <ActionButton variant="add" size="sm" iconOnly={false} onClick={onAddTramo}>Añadir tramo</ActionButton>
              </div>
              <div className="space-y-2">
                {draft.tramos.map((tramo, index) => (
                  <div className="grid grid-cols-[1fr_auto_1fr_auto] items-end gap-2" key={tramo.id}>
                    <label className="space-y-1 text-xs text-metro-muted">Inicio<input className="w-full rounded-lg border border-metro-border bg-metro-app px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red" type="time" value={tramo.inicio} onChange={(event) => onUpdateTramo(tramo.id, 'inicio', event.target.value)} /></label>
                    <span className="pb-2 text-metro-muted">—</span>
                    <label className="space-y-1 text-xs text-metro-muted">Fin<input className="w-full rounded-lg border border-metro-border bg-metro-app px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red" type="time" value={tramo.fin} onChange={(event) => onUpdateTramo(tramo.id, 'fin', event.target.value)} /></label>
                    <button className="mb-0.5 rounded-lg border border-metro-border p-2 text-metro-muted transition hover:border-red-500/50 hover:bg-red-950/25 hover:text-red-200" type="button" onClick={() => onRemoveTramo(tramo.id)} aria-label={`Eliminar tramo ${index + 1}`}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          <label className="block space-y-1.5 text-sm font-medium text-metro-text">
            Observaciones
            <textarea className="min-h-24 w-full resize-y rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5 text-sm text-metro-text outline-none focus:border-metro-red" placeholder="Texto breve sobre la convocatoria..." value={draft.observaciones} onChange={(event) => onDraftChange((current) => ({ ...current, observaciones: event.target.value }))} />
          </label>

          <div className="grid gap-3 rounded-xl border border-metro-border bg-metro-panel/45 p-3 text-xs text-metro-muted sm:grid-cols-3">
            <div className="flex items-center gap-2"><CalendarDays size={15} /> Fecha de convocatoria</div>
            <div className="flex items-center gap-2"><UsersRound size={15} /> Uno o varios sindicatos</div>
            <div className="flex items-center gap-2"><Clock3 size={15} /> Varios tramos si procede</div>
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-metro-border bg-metro-app/95 px-5 py-4 backdrop-blur">
          <ActionButton variant="secondary" iconOnly={false} onClick={onClose}>Cancelar</ActionButton>
          <ActionButton variant="save" iconOnly={false} loading={saving} onClick={onSave}>{editingId ? 'Guardar cambios' : 'Guardar huelga'}</ActionButton>
        </div>
      </section>
    </div>
  );
}

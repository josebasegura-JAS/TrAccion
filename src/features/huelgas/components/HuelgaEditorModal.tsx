import { CalendarDays, Clock3, Trash2, UsersRound } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
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
    <ModalShell labelledBy="huelga-editor-title" onClose={onClose} size="md">
      <ModalHeader>
        <ModalTitle id="huelga-editor-title" subtitle="Registra los datos básicos de la jornada convocada.">
          {editingId ? 'Editar convocatoria' : 'Nueva convocatoria de huelga'}
        </ModalTitle>
        <ModalCloseButton onClick={onClose} />
      </ModalHeader>

      <ModalBody className="space-y-5">
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
      </ModalBody>

      <ModalFooter>
        <ActionButton variant="secondary" iconOnly={false} onClick={onClose}>Cancelar</ActionButton>
        <ActionButton variant="save" iconOnly={false} loading={saving} onClick={onSave}>{editingId ? 'Guardar cambios' : 'Guardar huelga'}</ActionButton>
      </ModalFooter>
    </ModalShell>
  );
}

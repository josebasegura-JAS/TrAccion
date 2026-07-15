import type { ManagedSessionDraft, SessionModuleConfig } from './session';

export function SessionEditModal({
  config,
  editDraft,
  onCancel,
  onSave,
  updateEditDraft,
}: {
  config: SessionModuleConfig;
  editDraft: ManagedSessionDraft;
  onCancel: () => void;
  onSave: () => void;
  updateEditDraft: <K extends keyof ManagedSessionDraft>(
    key: K,
    value: ManagedSessionDraft[K],
  ) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="max-h-[86vh] w-full max-w-3xl overflow-auto rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-2xl">
        <h3 className="text-lg font-bold text-metro-text">Editar sesión de {config.shortTitle}</h3>
        <p className="mt-1 text-sm text-metro-muted">
          Modifica la fecha, el código documental, el título o las notas. El estado de la sesión no
          se cambia.
        </p>
        <div className="mt-4 grid grid-cols-[150px_180px_minmax(220px,1fr)] gap-2 overflow-x-auto">
          <input
            className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => updateEditDraft('date', event.target.value)}
            type="date"
            value={editDraft.date}
          />
          <input
            className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => updateEditDraft('code', event.target.value)}
            placeholder="Código documento"
            value={editDraft.code}
          />
          <input
            className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => updateEditDraft('title', event.target.value)}
            placeholder="Título / referencia de la sesión"
            value={editDraft.title}
          />
        </div>
        <textarea
          className="mt-2 min-h-[120px] w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
          onChange={(event) => updateEditDraft('notes', event.target.value)}
          placeholder="Notas de la sesión, documentación asociada, observaciones, etc."
          value={editDraft.notes}
        />
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            className="rounded-xl border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={onCancel}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={onSave}
            type="button"
          >
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

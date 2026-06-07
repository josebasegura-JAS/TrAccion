import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  EMPTY_CRITERIO_RRLL_DRAFT,
  CRITERIO_RRLL_ESTADOS,
  type CriterioRrll,
  type CriterioRrllDraft,
  type CriterioRrllDraftField,
} from '../domain/criterioRrll';
import { useCriteriosRrllStore } from '../store/useCriteriosRrllStore';
import { InlineSaveFeedback } from '../../../components/InlineSaveFeedback';

const criterioTextFields: Array<{
  field: CriterioRrllDraftField;
  label: string;
  required?: boolean;
}> = [
  { field: 'tema', label: 'Tema', required: true },
  { field: 'responsable', label: 'Responsable' },
  { field: 'fecha', label: 'Fecha' },
];

function toDraft(criterio: CriterioRrll | null): CriterioRrllDraft {
  if (!criterio) {
    return { ...EMPTY_CRITERIO_RRLL_DRAFT };
  }

  return {
    tema: criterio.tema,
    criterio: criterio.criterio,
    estado: criterio.estado,
    fecha: criterio.fecha,
    responsable: criterio.responsable,
    observaciones: criterio.observaciones,
  };
}

export function CriterioRrllEditor({
  criterio,
  mode,
  onDone,
}: {
  criterio: CriterioRrll | null;
  mode: 'create' | 'edit';
  onDone: () => void;
}) {
  const createCriterio = useCriteriosRrllStore((state) => state.create);
  const updateCriterio = useCriteriosRrllStore((state) => state.update);
  const removeCriterio = useCriteriosRrllStore((state) => state.remove);
  const [draft, setDraft] = useState<CriterioRrllDraft>(() => toDraft(criterio));

  useEffect(() => {
    setDraft(toDraft(criterio));
  }, [criterio, mode]);

  const isCreate = mode === 'create';
  const canSubmit = draft.tema.trim().length > 0 && draft.criterio.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <aside
        aria-modal="true"
        className="flex max-h-[calc(100vh-2rem)] w-[min(720px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-panel p-3 shadow-2xl"
        role="dialog"
      >
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-metro-border bg-metro-surface px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-metro-red">
              {isCreate ? 'Nuevo criterio RRLL' : 'Editar criterio RRLL'}
            </p>
            <h3 className="mt-1 truncate text-base font-bold text-metro-text">
              {isCreate ? 'Nuevo criterio' : criterio?.tema || 'Sin selección'}
            </h3>
            <p className="text-xs text-metro-muted">
              {isCreate ? 'Alta manual compacta.' : `Editando criterio ${criterio?.id ?? '—'}`}
            </p>
          </div>
          <button
            aria-label="Cerrar editor"
            className="rounded-lg border border-metro-border bg-metro-surface p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={onDone}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) {
              return;
            }

            if (isCreate) {
              createCriterio(draft);
            } else if (criterio) {
              updateCriterio(criterio.id, draft);
            }
            onDone();
          }}
        >
          <div className="grid min-h-0 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {criterioTextFields.map(({ field, label, required }) => (
              <label className="text-xs font-semibold text-metro-muted" key={field}>
                {label}
                <input
                  className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [field]: event.target.value }))
                  }
                  required={required}
                  type={field === 'fecha' ? 'date' : 'text'}
                  value={draft[field]}
                />
              </label>
            ))}
            <label className="text-xs font-semibold text-metro-muted">
              Estado
              <select
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    estado: event.target.value as CriterioRrllDraft['estado'],
                  }))
                }
                value={draft.estado}
              >
                {CRITERIO_RRLL_ESTADOS.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-metro-muted sm:col-span-2">
              Criterio
              <textarea
                className="mt-1 min-h-28 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, criterio: event.target.value }))
                }
                required
                value={draft.criterio}
              />
            </label>
            <label className="text-xs font-semibold text-metro-muted sm:col-span-2">
              Observaciones
              <textarea
                className="mt-1 min-h-20 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, observaciones: event.target.value }))
                }
                value={draft.observaciones}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-metro-border pt-3">
            <button
              className="rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSubmit}
              type="submit"
            >
              Guardar
            </button>
            <InlineSaveFeedback />
            {!isCreate && criterio && (
              <button
                className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
                onClick={() => {
                  removeCriterio(criterio.id);
                  onDone();
                }}
                type="button"
              >
                Eliminar
              </button>
            )}
            <button
              className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-muted hover:text-metro-text"
              onClick={onDone}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

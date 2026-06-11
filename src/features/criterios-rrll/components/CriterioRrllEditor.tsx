import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  EMPTY_CRITERIO_RRLL_DRAFT,
  CRITERIO_RRLL_ESTADOS,
  CRITERIO_RRLL_SENTIDOS,
  type CriterioRrll,
  type CriterioRrllDraft,
  type CriterioRrllDraftField,
} from '../domain/criterioRrll';
import { useCriteriosRrllStore } from '../store/useCriteriosRrllStore';
import { InlineSaveFeedback } from '../../../components/InlineSaveFeedback';
import { useSharedRecordLock } from '../../../services/useSharedRecordLock';

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
    sentido: criterio.sentido,
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
  const createCriterio = useCriteriosRrllStore((state) => state.createWithConcurrencyCheck);
  const updateCriterio = useCriteriosRrllStore((state) => state.updateWithConcurrencyCheck);
  const removeCriterio = useCriteriosRrllStore((state) => state.removeWithConcurrencyCheck);
  const [draft, setDraft] = useState<CriterioRrllDraft>(() => toDraft(criterio));
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setDraft(toDraft(criterio));
  }, [criterio, mode]);

  const isCreate = mode === 'create';
  const recordLock = useSharedRecordLock({
    module: 'criterios-rrll',
    recordId: criterio?.id ?? null,
    enabled: mode === 'edit' && Boolean(criterio?.id),
  });
  const isReadOnly = recordLock.isReadOnly;
  const canSubmit = draft.tema.trim().length > 0 && draft.criterio.trim().length > 0 && !isReadOnly;

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

        {recordLock.status === 'locked' && recordLock.lockedBy && (
          <div className="mb-3 rounded-xl border border-yellow-400/40 bg-yellow-500/10 px-4 py-3 text-sm font-semibold text-yellow-100">
            📖 Modo consulta — editando: {recordLock.lockedBy.ownerName}@{recordLock.lockedBy.machineName}
          </div>
        )}

        <form
          className="flex min-h-0 flex-1 flex-col space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) {
              return;
            }

            void (async () => {
              setSaveError('');
              const result = isCreate
                ? await createCriterio(draft)
                : criterio
                  ? await updateCriterio(criterio.id, draft, criterio.updatedAt)
                  : { ok: false, message: 'No se ha encontrado el criterio seleccionado.' };

              if (!result.ok) {
                setSaveError(result.message);
                return;
              }
              onDone();
            })();
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
                  disabled={isReadOnly}
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
                disabled={isReadOnly}
                value={draft.estado}
              >
                {CRITERIO_RRLL_ESTADOS.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-metro-muted">
              Sentido
              <select
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    sentido: event.target.value as CriterioRrllDraft['sentido'],
                  }))
                }
                disabled={isReadOnly}
                value={draft.sentido}
              >
                {CRITERIO_RRLL_SENTIDOS.map((sentido) => (
                  <option key={sentido} value={sentido}>
                    {sentido}
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
                disabled={isReadOnly}
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
                disabled={isReadOnly}
                value={draft.observaciones}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-metro-border pt-3">
            {saveError && (
              <p className="w-full rounded-lg border border-metro-red/40 bg-metro-red/10 px-3 py-2 text-xs font-semibold text-metro-red">
                {saveError}
              </p>
            )}
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
                disabled={isReadOnly}
                onClick={() => {
                  void (async () => {
                    setSaveError('');
                    const result = await removeCriterio(criterio.id, criterio.updatedAt);
                    if (!result.ok) {
                      setSaveError(result.message);
                      return;
                    }
                    onDone();
                  })();
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

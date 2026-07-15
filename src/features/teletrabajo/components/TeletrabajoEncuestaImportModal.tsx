import { AlertTriangle } from 'lucide-react';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalShell } from '../../../components/ui/ModalShell';
import { normalizeJobPosition } from '../../plantilla/domain/jobPositionTranslation';

export interface PendingEncuestaImport {
  file: File;
  unknownPuestos: string[];
  mapping: Record<string, string>;
}

export function TeletrabajoEncuestaImportModal({
  masterPuestos,
  onClose,
  onConfirm,
  pendingEncuestaImport,
  setPendingEncuestaImport,
}: {
  masterPuestos: readonly string[];
  onClose: () => void;
  onConfirm: () => void;
  pendingEncuestaImport: PendingEncuestaImport;
  setPendingEncuestaImport: (
    update: (current: PendingEncuestaImport | null) => PendingEncuestaImport | null,
  ) => void;
}) {
  return (
    <ModalShell
      labelledBy="teletrabajo-encuesta-import-modal-title"
      maxWidthClassName="max-w-4xl"
      onClose={onClose}
    >
      <header className="flex items-start justify-between gap-3 border-b border-metro-border p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
            Importar encuesta
          </p>
          <h3
            className="text-xl font-bold text-metro-text"
            id="teletrabajo-encuesta-import-modal-title"
          >
            Resolver puestos no reconocidos
          </h3>
          <p className="mt-1 text-sm text-metro-muted">
            Asigna cada puesto de Plantilla al puesto correcto de la tabla de Traducción de puestos.
          </p>
        </div>
        <ModalCloseButton label="Cancelar resolución de puestos" onClick={onClose} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-100">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>
            Hay {pendingEncuestaImport.unknownPuestos.length} puesto
            {pendingEncuestaImport.unknownPuestos.length === 1 ? '' : 's'} que no cuadran con la
            tabla maestra.
          </span>
        </div>
        <div className="space-y-2">
          {pendingEncuestaImport.unknownPuestos.map((puesto) => {
            const key = normalizeJobPosition(puesto);
            return (
              <div
                className="grid gap-2 rounded-xl border border-metro-border bg-metro-panel p-3 lg:grid-cols-[minmax(220px,1fr)_minmax(280px,1.2fr)] lg:items-center"
                key={key}
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                    Puesto en Plantilla
                  </p>
                  <p className="font-semibold text-metro-text">{puesto}</p>
                </div>
                <label className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Puesto correcto
                  <select
                    className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                    onChange={(event) =>
                      setPendingEncuestaImport((current) =>
                        current
                          ? {
                              ...current,
                              mapping: { ...current.mapping, [key]: event.target.value },
                            }
                          : current,
                      )
                    }
                    value={pendingEncuestaImport.mapping[key] ?? ''}
                  >
                    <option value="">Selecciona puesto...</option>
                    {masterPuestos.map((candidate) => (
                      <option key={candidate} value={candidate}>
                        {candidate}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            );
          })}
        </div>
      </div>
      <footer className="flex flex-wrap justify-end gap-2 border-t border-metro-border p-4">
        <button
          className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
          onClick={onClose}
          type="button"
        >
          Cancelar importación
        </button>
        <button
          className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
          onClick={onConfirm}
          type="button"
        >
          Confirmar e importar
        </button>
      </footer>
    </ModalShell>
  );
}

import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalShell } from '../../../components/ui/ModalShell';

export function TeletrabajoPeriodoModal({
  copyFromPreviousPeriodo,
  newPeriodoName,
  onClose,
  onCreatePeriodo,
  periodoStatus,
  periodos,
  setCopyFromPreviousPeriodo,
  setNewPeriodoName,
  setSourcePeriodo,
  sourcePeriodo,
}: {
  copyFromPreviousPeriodo: boolean;
  newPeriodoName: string;
  onClose: () => void;
  onCreatePeriodo: () => void;
  periodoStatus: string;
  periodos: readonly string[];
  setCopyFromPreviousPeriodo: (value: boolean) => void;
  setNewPeriodoName: (value: string) => void;
  setSourcePeriodo: (value: string) => void;
  sourcePeriodo: string;
}) {
  return (
    <ModalShell
      labelledBy="teletrabajo-periodo-modal-title"
      maxWidthClassName="max-w-xl"
      onClose={onClose}
    >
      <header className="flex items-start justify-between gap-3 border-b border-metro-border p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
            Teletrabajo
          </p>
          <h3 className="text-xl font-bold text-metro-text" id="teletrabajo-periodo-modal-title">
            Nuevo periodo
          </h3>
          <p className="mt-1 text-sm text-metro-muted">
            Crea una nueva campaña sin modificar las solicitudes del periodo anterior.
          </p>
        </div>
        <ModalCloseButton label="Cerrar creación de periodo" onClick={onClose} />
      </header>
      <div className="space-y-4 p-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-metro-muted">
          Nombre del nuevo periodo
          <input
            className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm normal-case tracking-normal text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => setNewPeriodoName(event.target.value)}
            placeholder="2027-2028"
            type="text"
            value={newPeriodoName}
          />
        </label>
        <label className="flex items-start gap-2 rounded-xl border border-metro-border bg-metro-panel p-3 text-sm font-semibold text-metro-text">
          <input
            checked={copyFromPreviousPeriodo}
            className="mt-1"
            disabled={periodos.length === 0}
            onChange={(event) => setCopyFromPreviousPeriodo(event.target.checked)}
            type="checkbox"
          />
          <span>
            Generar renovaciones desde un periodo anterior
            <span className="mt-1 block text-xs font-normal text-metro-muted">
              Copia solicitudes aprobadas o analizadas, las marca como renovación, las deja
              pendientes y limpia revisión y validaciones.
            </span>
          </span>
        </label>
        {copyFromPreviousPeriodo && (
          <label className="block text-xs font-semibold uppercase tracking-wide text-metro-muted">
            Periodo origen
            <select
              className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm normal-case tracking-normal text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => setSourcePeriodo(event.target.value)}
              value={sourcePeriodo}
            >
              <option value="">Selecciona periodo...</option>
              {periodos.map((periodo) => (
                <option key={periodo} value={periodo}>
                  {periodo}
                </option>
              ))}
            </select>
          </label>
        )}
        {periodoStatus && (
          <div className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text">
            {periodoStatus}
          </div>
        )}
      </div>
      <footer className="flex flex-wrap justify-end gap-2 border-t border-metro-border p-4">
        <button
          className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
          onClick={onClose}
          type="button"
        >
          Cancelar
        </button>
        <button
          className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!newPeriodoName.trim() || (copyFromPreviousPeriodo && !sourcePeriodo.trim())}
          onClick={onCreatePeriodo}
          type="button"
        >
          Crear periodo
        </button>
      </footer>
    </ModalShell>
  );
}

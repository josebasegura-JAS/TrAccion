import { X } from 'lucide-react';
import { ModalDatabaseStatus } from '../ModalDatabaseStatus';

type TeletrabajoEditorHeaderProps = {
  isCreate: boolean;
  isNuevaPeticion: boolean;
  empleado: string;
  nombreApellidos: string;
  solicitudId?: string | null;
  onDone: () => void;
};

export function TeletrabajoEditorHeader({
  isCreate,
  isNuevaPeticion,
  empleado,
  nombreApellidos,
  solicitudId,
  onDone,
}: TeletrabajoEditorHeaderProps) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-metro-border bg-metro-surface px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-metro-red">
          {isCreate ? 'Nueva solicitud' : 'Editar solicitud'}
        </p>
        <h3 className="mt-1 truncate text-base font-bold text-metro-text">
          {isCreate ? 'Nueva solicitud de teletrabajo' : nombreApellidos || 'Sin selección'}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-xs text-metro-muted">
            {isCreate ? 'Alta manual compacta.' : `Editando solicitud ${solicitudId ?? '—'}`}
          </p>
          {isNuevaPeticion && empleado.trim().length > 0 && (
            <span
              className="rounded-full border border-amber-400/60 bg-amber-300 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-950"
              title="No consta teletrabajo aprobado o analizado para esta persona en el periodo anterior."
            >
              Nueva petición, enviar documentación
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ModalDatabaseStatus />
        <button
          aria-label="Cerrar editor"
          className="rounded-lg border border-metro-border bg-metro-surface p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
          onClick={onDone}
          type="button"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}


import { ModalDatabaseStatus } from '../ModalDatabaseStatus';
import { ModalCloseButton } from '../ui/ModalCloseButton';

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
    <div className="mb-3 flex items-start justify-between gap-3 border-b border-metro-border/70 pb-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-metro-red">
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
              className="rounded-full bg-amber-300 px-2 py-0.5 text-xs font-bold text-slate-950"
              title="No consta teletrabajo aprobado o analizado para esta persona en el periodo anterior."
            >
              Nueva petición, enviar documentación
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ModalDatabaseStatus />
        <ModalCloseButton label="Cerrar editor" onClick={onDone} />
      </div>
    </div>
  );
}

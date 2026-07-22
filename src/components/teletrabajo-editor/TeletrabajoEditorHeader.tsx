
import { ModalDatabaseStatus } from '../ModalDatabaseStatus';
import { ModalCloseButton } from '../ui/ModalCloseButton';
import { ModalHeader, ModalTitle } from '../ui/ModalShell';

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
  const subtitle = (
    <div className="flex flex-wrap items-center gap-2">
      <span>{isCreate ? 'Alta manual compacta.' : `Editando solicitud ${solicitudId ?? '—'}`}</span>
      {isNuevaPeticion && empleado.trim().length > 0 && (
        <span
          className="rounded-full bg-amber-300 px-2 py-0.5 text-xs font-bold text-slate-950"
          title="No consta teletrabajo aprobado o analizado para esta persona en el periodo anterior."
        >
          Nueva petición, enviar documentación
        </span>
      )}
    </div>
  );

  return (
    <ModalHeader>
      <ModalTitle id="teletrabajo-editor-title" subtitle={subtitle}>
        {isCreate ? 'Nueva solicitud de teletrabajo' : nombreApellidos || 'Sin selección'}
      </ModalTitle>
      <div className="flex shrink-0 items-center gap-2">
        <ModalDatabaseStatus />
        <ModalCloseButton label="Cerrar editor" onClick={onDone} />
      </div>
    </ModalHeader>
  );
}

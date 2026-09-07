
import { ModalDatabaseStatus } from '../ModalDatabaseStatus';
import { ModalCloseButton } from '../ui/ModalCloseButton';
import { ModalHeader, ModalTitle } from '../ui/ModalShell';
import { StatusBadge } from '../ui/StatusBadge';

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
        <StatusBadge
          size="xs"
          title="No consta teletrabajo aprobado o analizado para esta persona en el periodo anterior."
          tone="warning"
        >
          Nueva petición, enviar documentación
        </StatusBadge>
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

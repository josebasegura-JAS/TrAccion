import { ActionButton } from '../../../components/ui/ActionButton';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { formatManutencionMonth } from './ticketRestaurantePageHelpers';

export function TicketRestauranteAbsenceImportHelpModal({
  onClose,
  onSelectFile,
}: {
  onClose: () => void;
  onSelectFile: () => void;
}) {
  return (
    <ModalShell labelledBy="absence-import-help-title" maxWidthClassName="max-w-lg" onClose={onClose}>
      <ModalHeader>
        <ModalTitle
          id="absence-import-help-title"
          subtitle="Obtén primero el Excel de ausencias y después selecciónalo para importarlo."
        >
          Importar ausencias
        </ModalTitle>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-3 text-sm text-metro-text">
          <div className="rounded-lg border border-metro-border bg-metro-surface p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-metro-muted">
              Cómo obtener el Excel en Zerkos
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Entrar en <strong>Supervisión</strong>.</li>
              <li>Abrir <strong>Justif. Ausencias de día</strong>.</li>
              <li>Seleccionar las fechas del <strong>último mes</strong>.</li>
              <li>Exportar el resultado a <strong>Excel</strong>.</li>
            </ol>
          </div>
          <p className="text-xs leading-relaxed text-metro-muted">
            Al importar, solo se cargarán ausencias de personas activas con derecho a Ticket
            Restaurante que coincidan al menos con un día que genere ticket según su calendario.
            Fines de semana, festivos y otros días sin derecho a ticket se ignorarán.
          </p>
        </div>
      </ModalBody>
      <ModalFooter>
        <ActionButton iconOnly={false} onClick={onClose} variant="secondary">Cancelar</ActionButton>
        <ActionButton iconOnly={false} onClick={onSelectFile} variant="import">Seleccionar Excel</ActionButton>
      </ModalFooter>
    </ModalShell>
  );
}

export function TicketRestauranteManutencionMonthModal({
  month,
  onClose,
  onMoveMonth,
  onSave,
  year,
}: {
  month: number;
  onClose: () => void;
  onMoveMonth: (offset: number) => void;
  onSave: () => void;
  year: number;
}) {
  return (
    <ModalShell labelledBy="manutencion-month-title" maxWidthClassName="max-w-md" onClose={onClose}>
      <ModalHeader>
        <ModalTitle
          id="manutencion-month-title"
          subtitle="Las notas de gasto marcadas como afectantes descontarán tickets en este mes."
        >
          ¿A qué mes lo imputamos?
        </ModalTitle>
      </ModalHeader>
      <ModalBody>
        <div className="flex items-center justify-center gap-3 py-2">
          <ActionButton iconOnly onClick={() => onMoveMonth(-1)} variant="secondary">←</ActionButton>
          <div className="min-w-44 rounded-xl bg-metro-panel px-4 py-3 text-center text-base font-bold text-metro-text">
            {formatManutencionMonth(year, month)}
          </div>
          <ActionButton iconOnly onClick={() => onMoveMonth(1)} variant="secondary">→</ActionButton>
        </div>
      </ModalBody>
      <ModalFooter>
        <ActionButton iconOnly={false} onClick={onClose} variant="secondary">Cancelar</ActionButton>
        <ActionButton iconOnly={false} onClick={onSave} variant="save">Guardar</ActionButton>
      </ModalFooter>
    </ModalShell>
  );
}

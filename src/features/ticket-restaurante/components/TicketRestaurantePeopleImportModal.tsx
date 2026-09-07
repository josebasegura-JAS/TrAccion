import { ActionButton } from '../../../components/ui/ActionButton';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { CompactTable, CompactTableBody, CompactTableHead } from '../../../shared/table/CompactTable';
import type { TicketCalendar, TicketPerson } from '../domain/ticketRestaurante';
import { normalizeCalendarName, type TicketPeopleImportResult } from '../domain/importPeople';
import { ImportReviewSummary } from './TicketRestauranteImportReview';

export function TicketRestaurantePeopleImportModal({
  fileName,
  result,
  currentPeople,
  calendars,
  onCancel,
  onConfirm,
  saving,
}: {
  fileName: string;
  result: TicketPeopleImportResult;
  currentPeople: TicketPerson[];
  calendars: TicketCalendar[];
  onCancel: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  const currentByEmployee = new Map(currentPeople.map((person) => [person.empleado, person]));
  const calendarNames = new Set(calendars.filter((calendar) => !calendar.deletedAt).map((calendar) => normalizeCalendarName(calendar.nombre)));
  const newPeople = result.drafts.filter((draft) => !currentByEmployee.has(draft.empleado)).length;
  const updatedPeople = result.drafts.length - newPeople;
  const newCalendars = Array.from(new Set(result.drafts.map((draft) => draft.calendarName).filter((name) => !calendarNames.has(normalizeCalendarName(name)))));
  const incidentCount = result.missingEmployees.length + result.duplicateRows + result.ignored;

  return (
    <ModalShell labelledBy="people-import-review-title" maxWidthClassName="max-w-6xl" onClose={onCancel}>
      <ModalHeader>
        <ModalTitle
          id="people-import-review-title"
          subtitle="Nada se guardará hasta que confirmes la importación."
        >
          Revisar importación de personas
        </ModalTitle>
      </ModalHeader>
      <ModalBody className="space-y-4 overflow-auto">
        <ImportReviewSummary
          detail={`${newPeople} altas · ${updatedPeople} personas existentes a actualizar${newCalendars.length > 0 ? ` · ${newCalendars.length} calendario(s) se crearán automáticamente` : ''}.`}
          errors={result.missingEmployees.length}
          fileName={fileName}
          ignored={result.ignored + result.duplicateRows}
          ready={result.drafts.length}
          total={result.drafts.length + result.ignored}
        />

        {incidentCount > 0 ? (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-metro-muted">
            <strong className="text-amber-300">Incidencias detectadas.</strong>{' '}
            {result.missingEmployees.length > 0 ? `${result.missingEmployees.length} persona(s) no existen en Plantilla. ` : ''}
            {result.duplicateRows > 0 ? `${result.duplicateRows} fila(s) duplicadas en el Excel; se conservará la última. ` : ''}
            {result.ignored > 0 ? `${result.ignored} fila(s) incompletas o no importables serán ignoradas.` : ''}
          </div>
        ) : null}

        {newCalendars.length > 0 ? (
          <div className="rounded-lg border border-metro-border bg-metro-surface p-3 text-xs text-metro-muted">
            <strong className="text-metro-text">Calendarios nuevos:</strong> {newCalendars.join(', ')}
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-metro-border">
          <CompactTable minWidthClassName="min-w-[960px]">
            <CompactTableHead>
              <tr>
                <th className="px-2 py-2">Acción</th>
                <th className="px-2 py-2">Nº empleado</th>
                <th className="px-2 py-2">Nombre y apellidos</th>
                <th className="px-2 py-2">Puesto</th>
                <th className="px-2 py-2">Calendario</th>
                <th className="px-2 py-2">Estado</th>
              </tr>
            </CompactTableHead>
            <CompactTableBody>
              {result.drafts.map((draft) => {
                const exists = currentByEmployee.has(draft.empleado);
                return (
                  <tr className="border-t border-metro-border" key={draft.empleado}>
                    <td className="px-2 py-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${exists ? 'bg-sky-400/10 text-sky-300' : 'bg-emerald-400/10 text-emerald-300'}`}>
                        {exists ? 'Actualizar' : 'Alta'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 font-semibold text-metro-text">{draft.empleado}</td>
                    <td className="px-2 py-1.5 text-metro-text">{draft.nombreApellidos}</td>
                    <td className="px-2 py-1.5 text-metro-muted">{draft.puesto || '—'}</td>
                    <td className="px-2 py-1.5 text-metro-muted">{draft.calendarName}</td>
                    <td className="px-2 py-1.5 text-metro-muted">{draft.activo ? 'Activo' : 'Inactivo'}</td>
                  </tr>
                );
              })}
            </CompactTableBody>
          </CompactTable>
        </div>
      </ModalBody>
      <ModalFooter>
        <ActionButton disabled={saving} iconOnly={false} onClick={onCancel} variant="secondary">
          Cancelar
        </ActionButton>
        <ActionButton disabled={saving || result.drafts.length === 0} iconOnly={false} onClick={onConfirm} variant="import">
          {saving ? 'Guardando…' : `Confirmar ${result.drafts.length} cambios`}
        </ActionButton>
      </ModalFooter>
    </ModalShell>
  );
}

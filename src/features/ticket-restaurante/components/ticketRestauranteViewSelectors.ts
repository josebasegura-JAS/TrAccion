import type { TicketPerson } from '../domain/ticketRestaurante';
import type { TicketManutencion } from '../domain/importManutenciones';

/** Selectores puros: la UI no modifica los registros SQLite ni los arrays del store. */
export function selectVisibleTicketPeople(people: readonly TicketPerson[]): TicketPerson[] {
  return [...people]
    .filter((person) => !person.deletedAt)
    .sort((first, second) =>
      first.nombreApellidos.localeCompare(second.nombreApellidos, 'es', {
        numeric: true,
        sensitivity: 'base',
      }),
    );
}

export function selectTicketManutencionesByMonth(
  manutenciones: readonly TicketManutencion[], year: number, month: number,
): TicketManutencion[] {
  return [...manutenciones]
    .filter((row) =>
      !row.deletedAt && row.imputacionYear === year && row.imputacionMonth === month)
    .sort((first, second) =>
      first.fechaGasto === second.fechaGasto
        ? first.nombreApellidos.localeCompare(second.nombreApellidos, 'es', { numeric: true, sensitivity: 'base' })
        : second.fechaGasto.localeCompare(first.fechaGasto),
    );
}

import { describe, expect, it } from 'vitest';
import { selectVisibleTicketPeople, selectTicketManutencionesByMonth } from './ticketRestauranteViewSelectors';
import type { TicketPerson } from '../domain/ticketRestaurante';
import type { TicketManutencion } from '../domain/importManutenciones';

describe('selectores UI de Ticket Restaurante', () => {
  it('filtra personas eliminadas, ordena alfabéticamente y no modifica el store', () => {
    const people = [
      { empleado: '2', nombreApellidos: 'Zulema', deletedAt: null },
      { empleado: '3', nombreApellidos: 'Eliminada', deletedAt: '2026-01-01' },
      { empleado: '1', nombreApellidos: 'Álvaro', deletedAt: null },
    ] as TicketPerson[];
    expect(selectVisibleTicketPeople(people).map((p) => p.empleado)).toEqual(['1', '2']);
    expect(people[0].empleado).toBe('2');
  });
  it('filtra manutenciones por imputación y ordena por fecha descendente', () => {
    const rows = [
      { id: 'a', imputacionYear: 2026, imputacionMonth: 11, fechaGasto: '2026-11-01', nombreApellidos: 'Ana', deletedAt: null },
      { id: 'b', imputacionYear: 2026, imputacionMonth: 11, fechaGasto: '2026-11-02', nombreApellidos: 'Begoña', deletedAt: null },
      { id: 'c', imputacionYear: 2026, imputacionMonth: 10, fechaGasto: '2026-10-30', nombreApellidos: 'C', deletedAt: null },
      { id: 'd', imputacionYear: 2026, imputacionMonth: 11, fechaGasto: '2026-11-03', nombreApellidos: 'D', deletedAt: '2026-11-03' },
    ] as TicketManutencion[];
    expect(selectTicketManutencionesByMonth(rows, 2026, 11).map((row) => row.id)).toEqual(['b', 'a']);
    expect(rows[0].id).toBe('a');
  });
});

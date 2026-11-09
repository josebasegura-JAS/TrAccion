import { describe, expect, it } from 'vitest';
import { importTicketRestaurantAbsences } from './importAbsences';

describe('Ticket Restaurante — bajas iniciadas antes del periodo gestionado', () => {
  const headings = ['N empleado', 'Nombre y apellidos', 'Desde', 'Hasta', 'Motivo', 'Total días'];

  it('conserva una ENF de larga duración en formato limpio y con descuento', () => {
    const rows = importTicketRestaurantAbsences([
      headings,
      ['123', 'Persona de prueba', '03/12/2025', '25/11/2026', 'ENF', '358'],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      empleado: '123', desde: '2025-12-03', hasta: '2026-11-25',
      motivo: 'ENF', afectaTicket: true, errors: [],
    });
  });

  it('no incorpora ausencias finalizadas antes de marzo de 2026', () => {
    const rows = importTicketRestaurantAbsences([
      headings,
      ['123', 'Persona de prueba', '01/01/2026', '28/02/2026', 'ENF', '59'],
    ]);
    expect(rows).toHaveLength(0);
  });

  it('conserva los datos inválidos en la previsualización para avisar', () => {
    const rows = importTicketRestaurantAbsences([
      headings,
      ['123', 'Persona de prueba', '03/12/2025', '', 'ENF', '10'],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.errors).toContain('Hasta debe ser una fecha válida.');
  });
});

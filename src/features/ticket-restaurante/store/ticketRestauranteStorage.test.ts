import { describe, expect, it } from 'vitest';
import type { TicketRestauranteSqliteRecord } from './ticketRestauranteSqliteRepository';
import {
  isTicketCalendar,
  isTicketManutencion,
  isTicketPerson,
  isTicketRestaurantAbsence,
  parseTicketAbsenceRecords,
  parseTicketCalendarRecords,
} from './ticketRestauranteStorage';

function record(id: string, value: unknown): TicketRestauranteSqliteRecord {
  return {
    id,
    value: typeof value === 'string' ? value : JSON.stringify(value),
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
    deletedAt: null,
  };
}

const calendar = {
  id: 'calendar-1',
  nombre: 'General',
  activo: true,
  diasSinTicket: ['2026-10-12'],
  createdAt: '2026-01-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
  deletedAt: null,
};

const person = {
  empleado: '123',
  nombreApellidos: 'Ane Bilbao',
  puesto: 'Técnica',
  calendarId: 'calendar-1',
  activo: true,
  createdAt: '2026-01-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
  deletedAt: null,
};

const absence = {
  id: 'absence-1',
  empleado: '123',
  nombreApellidos: 'Ane Bilbao',
  desde: '2026-10-01',
  hasta: '2026-10-02',
  motivo: 'ENF',
  totalDias: 2,
  afectaTicket: true,
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
  deletedAt: null,
};

const manutencion = {
  id: 'meal-1',
  empleado: '123',
  nombreApellidos: 'Ane Bilbao',
  fechaGasto: '2026-10-01',
  origen: 'importacion',
  afectaTicket: true,
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
  deletedAt: null,
};

describe('ticketRestauranteStorage', () => {
  it('mantiene los guards actuales de calendarios, personas, ausencias y manutenciones', () => {
    expect(isTicketCalendar(calendar)).toBe(true);
    expect(isTicketPerson(person)).toBe(true);
    expect(isTicketRestaurantAbsence(absence)).toBe(true);
    expect(isTicketManutencion(manutencion)).toBe(true);
  });

  it('rechaza registros incompletos en vez de aceptarlos parcialmente', () => {
    expect(isTicketCalendar({ ...calendar, nombre: undefined })).toBe(false);
    expect(isTicketPerson({ ...person, calendarId: undefined })).toBe(false);
    expect(isTicketRestaurantAbsence({ ...absence, afectaTicket: undefined })).toBe(false);
    expect(isTicketManutencion({ ...manutencion, fechaGasto: undefined })).toBe(false);
  });

  it('parsea calendarios válidos e ignora JSON roto o registros de otra entidad', () => {
    const parsed = parseTicketCalendarRecords([
      record('calendar-1', calendar),
      record('broken', '{esto no es json'),
      record('person-1', person),
    ]);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe('calendar-1');
    expect(parsed[0]?.nombre).toBe('General');
  });

  it('parsea ausencias válidas e ignora registros inválidos', () => {
    const parsed = parseTicketAbsenceRecords([
      record('absence-1', absence),
      record('invalid-absence', { ...absence, totalDias: '2' }),
    ]);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe('absence-1');
    expect(parsed[0]?.totalDias).toBe(2);
  });
});

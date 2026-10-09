import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTicketRestauranteStore } from './useTicketRestauranteStore';

function buildSqliteRecord(value: { id?: string; empleado?: string; updatedAt: string }) {
  return {
    id: value.id ?? value.empleado ?? '',
    value: JSON.stringify(value),
    createdAt: value.updatedAt,
    updatedAt: value.updatedAt,
    deletedAt: null,
  };
}

function createCalendarAndPerson() {
  const calendar = {
    id: 'calendar-1',
    nombre: 'Calendario central',
    activo: true,
    diasSinTicket: [],
    ticketIsoWeekdays: [1, 2, 3, 4, 5],
    createdAt: '2026-06-17T09:00:00.000Z',
    updatedAt: '2026-06-17T09:00:00.000Z',
    deletedAt: null,
  };
  const person = {
    empleado: '100',
    nombre: 'Ana',
    apellido1: 'García',
    apellido2: '',
    dni: '00000000T',
    nombreApellidos: 'Ana García',
    puesto: 'Puesto',
    calendarId: calendar.id,
    activo: true,
    createdAt: '2026-06-17T09:05:00.000Z',
    updatedAt: '2026-06-17T09:05:00.000Z',
    deletedAt: null,
  };
  return { calendar, person };
}

describe('useTicketRestauranteStore removeCalendar atómico', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useTicketRestauranteStore.setState({
      calendars: [],
      absences: [],
      people: [],
      manutenciones: [],
    });
  });

  it('usa una única operación atómica y actualiza el estado solo tras confirmación', async () => {
    const { calendar, person } = createCalendarAndPerson();
    const saveCalendar = vi.fn();
    const savePeople = vi.fn();
    const atomicRemove = vi.fn(async () => ({
      ok: true,
      status: { ready: true, phase: 'active', message: 'SQLite activo' },
      message: 'Eliminación atómica confirmada.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadTicketRestauranteCalendarRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [buildSqliteRecord(calendar)],
        })),
        saveTicketRestauranteCalendarRecordIfUnchanged: saveCalendar,
        loadTicketRestaurantePersonRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [buildSqliteRecord(person)],
        })),
        saveTicketRestaurantePersonRecordIfUnchanged: vi.fn(),
        saveTicketRestaurantePersonRecordsIfUnchanged: savePeople,
        removeTicketRestauranteCalendarWithPeopleAtomically: atomicRemove,
      },
    });

    useTicketRestauranteStore.getState().load();
    await vi.waitFor(() => {
      expect(useTicketRestauranteStore.getState().calendars).toHaveLength(1);
      expect(useTicketRestauranteStore.getState().people).toHaveLength(1);
    });

    const result = await useTicketRestauranteStore.getState().removeCalendar(calendar.id);

    expect(result.ok).toBe(true);
    expect(atomicRemove).toHaveBeenCalledTimes(1);
    const payload = atomicRemove.mock.calls[0]?.[0];
    expect(payload.calendar.id).toBe(calendar.id);
    expect(payload.calendar.expectedUpdatedAt).toBe(calendar.updatedAt);
    expect(payload.people).toHaveLength(1);
    expect(payload.people[0]?.id).toBe(person.empleado);
    expect(payload.people[0]?.expectedUpdatedAt).toBe(person.updatedAt);
    expect(saveCalendar).not.toHaveBeenCalled();
    expect(savePeople).not.toHaveBeenCalled();
    expect(useTicketRestauranteStore.getState().calendars[0]?.deletedAt).toBeTruthy();
    expect(useTicketRestauranteStore.getState().people[0]?.deletedAt).toBeTruthy();
  });

  it('si la operación atómica falla conserva calendario y personas sin cambios locales', async () => {
    const { calendar, person } = createCalendarAndPerson();
    const atomicRemove = vi.fn(async () => ({
      ok: false,
      status: { ready: true, phase: 'active', message: 'SQLite activo' },
      failedRecordId: person.empleado,
      message: 'Una persona asociada ha sido modificada por otro usuario.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadTicketRestauranteCalendarRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [buildSqliteRecord(calendar)],
        })),
        saveTicketRestauranteCalendarRecordIfUnchanged: vi.fn(),
        loadTicketRestaurantePersonRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [buildSqliteRecord(person)],
        })),
        saveTicketRestaurantePersonRecordIfUnchanged: vi.fn(),
        saveTicketRestaurantePersonRecordsIfUnchanged: vi.fn(),
        removeTicketRestauranteCalendarWithPeopleAtomically: atomicRemove,
      },
    });

    useTicketRestauranteStore.getState().load();
    await vi.waitFor(() => {
      expect(useTicketRestauranteStore.getState().calendars).toHaveLength(1);
      expect(useTicketRestauranteStore.getState().people).toHaveLength(1);
    });

    const calendarsBefore = useTicketRestauranteStore.getState().calendars;
    const peopleBefore = useTicketRestauranteStore.getState().people;
    const result = await useTicketRestauranteStore.getState().removeCalendar(calendar.id);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('modificada por otro usuario');
    expect(useTicketRestauranteStore.getState().calendars).toBe(calendarsBefore);
    expect(useTicketRestauranteStore.getState().people).toBe(peopleBefore);
    expect(useTicketRestauranteStore.getState().calendars[0]?.deletedAt).toBeNull();
    expect(useTicketRestauranteStore.getState().people[0]?.deletedAt).toBeNull();
  });
});

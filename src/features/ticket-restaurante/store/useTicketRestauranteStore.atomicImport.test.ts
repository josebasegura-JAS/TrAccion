import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTicketRestauranteStore } from './useTicketRestauranteStore';

const sqliteStatus = { ready: true, phase: 'active' as const, message: 'SQLite activo' };

function draft() {
  return {
    empleado: '100',
    nombre: 'Ana',
    apellido1: 'García',
    apellido2: '',
    dni: '00000000T',
    nombreApellidos: 'Ana García',
    puesto: 'Puesto',
    calendarId: '',
    calendarName: 'Calendario nuevo',
    activo: true,
  };
}

describe('useTicketRestauranteStore importPeople atómico', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useTicketRestauranteStore.setState({
      calendars: [],
      absences: [],
      people: [],
      manutenciones: [],
    });
  });

  it('envía calendarios y personas en una única operación y aplica estado solo tras confirmación', async () => {
    const legacyCalendarBatch = vi.fn();
    const legacyPeopleBatch = vi.fn();
    let resolveImport: ((value: {
      ok: boolean;
      status: typeof sqliteStatus;
      message: string;
    }) => void) | undefined;
    const atomicImport = vi.fn(() => new Promise((resolve) => {
      resolveImport = resolve;
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadTicketRestauranteCalendarRecords: vi.fn(async () => ({ status: sqliteStatus, records: [] })),
        loadTicketRestaurantePersonRecords: vi.fn(async () => ({ status: sqliteStatus, records: [] })),
        saveTicketRestauranteCalendarRecordIfUnchanged: vi.fn(),
        saveTicketRestaurantePersonRecordIfUnchanged: vi.fn(),
        saveTicketRestauranteCalendarRecordsIfUnchanged: legacyCalendarBatch,
        saveTicketRestaurantePersonRecordsIfUnchanged: legacyPeopleBatch,
        importTicketRestaurantePeopleAtomically: atomicImport,
      },
    });

    useTicketRestauranteStore.getState().load();
    await vi.waitFor(() => expect(atomicImport).not.toHaveBeenCalled());

    const pending = useTicketRestauranteStore.getState().importPeople([draft()]);
    await vi.waitFor(() => expect(atomicImport).toHaveBeenCalledTimes(1));
    expect(useTicketRestauranteStore.getState().calendars).toHaveLength(0);
    expect(useTicketRestauranteStore.getState().people).toHaveLength(0);

    const payload = atomicImport.mock.calls[0]?.[0];
    expect(payload.calendars).toHaveLength(1);
    expect(payload.people).toHaveLength(1);
    expect(payload.calendars[0]?.expectedUpdatedAt).toBeNull();
    expect(payload.people[0]?.id).toBe('100');
    expect(payload.people[0]?.expectedUpdatedAt).toBeNull();
    expect(legacyCalendarBatch).not.toHaveBeenCalled();
    expect(legacyPeopleBatch).not.toHaveBeenCalled();

    resolveImport?.({ ok: true, status: sqliteStatus, message: 'Importación atómica confirmada.' });
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(useTicketRestauranteStore.getState().calendars).toHaveLength(1);
    expect(useTicketRestauranteStore.getState().people).toHaveLength(1);
    expect(useTicketRestauranteStore.getState().people[0]?.calendarId).toBe(
      useTicketRestauranteStore.getState().calendars[0]?.id,
    );
  });

  it('si la operación atómica falla no crea ni calendario ni persona en memoria', async () => {
    const atomicImport = vi.fn(async () => ({
      ok: false,
      status: sqliteStatus,
      failedRecordId: '100',
      message: 'Una persona de Ticket Restaurante ha cambiado mientras importabas.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadTicketRestauranteCalendarRecords: vi.fn(async () => ({ status: sqliteStatus, records: [] })),
        loadTicketRestaurantePersonRecords: vi.fn(async () => ({ status: sqliteStatus, records: [] })),
        saveTicketRestauranteCalendarRecordIfUnchanged: vi.fn(),
        saveTicketRestaurantePersonRecordIfUnchanged: vi.fn(),
        saveTicketRestauranteCalendarRecordsIfUnchanged: vi.fn(),
        saveTicketRestaurantePersonRecordsIfUnchanged: vi.fn(),
        importTicketRestaurantePeopleAtomically: atomicImport,
      },
    });

    useTicketRestauranteStore.getState().load();
    const calendarsBefore = useTicketRestauranteStore.getState().calendars;
    const peopleBefore = useTicketRestauranteStore.getState().people;
    const result = await useTicketRestauranteStore.getState().importPeople([draft()]);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('ha cambiado mientras importabas');
    expect(useTicketRestauranteStore.getState().calendars).toBe(calendarsBefore);
    expect(useTicketRestauranteStore.getState().people).toBe(peopleBefore);
  });
});

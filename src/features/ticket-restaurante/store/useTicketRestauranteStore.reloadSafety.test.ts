import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTicketRestauranteStore } from './useTicketRestauranteStore';
import type { TicketCalendar } from '../domain/ticketRestaurante';

describe('Ticket Restaurante: la recarga compartida no sustituye el store por caché antigua', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    useTicketRestauranteStore.setState({ calendars: [], people: [], absences: [], manutenciones: [] });
  });
  it('mantiene el snapshot previo mientras SQLite prepara una recarga', async () => {
    const calendar = { id: 'actual', nombre: 'Actual', activo: true, diasSinTicket: [], ticketIsoWeekdays: [1,2,3,4,5], createdAt: '', updatedAt: '', deletedAt: null } as TicketCalendar;
    useTicketRestauranteStore.setState({ calendars: [calendar] });
    let release!: (value: unknown) => void;
    const pending = new Promise<unknown>((resolve) => { release = resolve; });
    Object.defineProperty(window, 'traccion', { configurable: true, value: {
      loadTicketRestauranteCalendarRecords: vi.fn(() => pending),
      saveTicketRestauranteCalendarRecordIfUnchanged: vi.fn(),
    } });
    const reload = useTicketRestauranteStore.getState().reloadFromStorage();
    expect(useTicketRestauranteStore.getState().calendars).toEqual([calendar]);
    release({ status: { ready: true, phase: 'active' }, records: [{ id: 'actual', value: JSON.stringify(calendar), updatedAt: '' }] });
    await reload;
    expect(useTicketRestauranteStore.getState().calendars).toHaveLength(1);
  });
  it('no confunde una desconexión SQLite con calendarios vacíos', async () => {
    const calendar = { id: 'previo', nombre: 'Conservado', activo: true, diasSinTicket: [], ticketIsoWeekdays: [1, 2, 3, 4, 5], createdAt: '', updatedAt: '', deletedAt: null } as TicketCalendar;
    useTicketRestauranteStore.setState({ calendars: [calendar] });
    Object.defineProperty(window, 'traccion', { configurable: true, value: {
      loadTicketRestauranteCalendarRecords: vi.fn(async () => ({
        status: { ready: false, phase: 'reconnecting' }, records: [],
      })),
      saveTicketRestauranteCalendarRecordIfUnchanged: vi.fn(),
    } });
    await expect(useTicketRestauranteStore.getState().reloadFromStorage()).rejects.toThrow('calendarios');
    expect(useTicketRestauranteStore.getState().calendars).toEqual([calendar]);
  });

});

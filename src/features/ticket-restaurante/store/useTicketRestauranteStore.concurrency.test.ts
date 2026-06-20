import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTicketRestauranteStore } from './useTicketRestauranteStore';

describe('useTicketRestauranteStore reloadFromStorage (estabilidad multiusuario)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    useTicketRestauranteStore.setState({
      calendars: [],
      absences: [],
      people: [],
      manutenciones: [],
    });
    useTicketRestauranteStore.getState().load();
  });

  it('reloadFromStorage no sustituye el estado si el contenido normalizado no ha cambiado', async () => {
    useTicketRestauranteStore.getState().createCalendar({
      nombre: 'Calendario central',
      activo: true,
      diasSinTicket: [],
    });

    // createCalendar persiste de forma asíncrona (fire-and-forget); hay que
    // esperar a que el calendario esté realmente aplicado antes de capturar
    // el snapshot "antes" del reload.
    await vi.waitFor(() => expect(useTicketRestauranteStore.getState().calendars).toHaveLength(1));

    const calendarsBeforeReload = useTicketRestauranteStore.getState().calendars;
    const debtLedgerBeforeReload = useTicketRestauranteStore.getState().debtLedger;

    // El polling detecta que localStorage tiene contenido (porque lo
    // acabamos de escribir nosotros mismos), pero releer y volver a parsear
    // produce un resultado idéntico al que ya tenemos en memoria.
    useTicketRestauranteStore.getState().reloadFromStorage();

    // Las referencias deben mantenerse intactas: reloadFromStorage no debe
    // haber llamado a set() si el contenido no cambió realmente.
    expect(useTicketRestauranteStore.getState().calendars).toBe(calendarsBeforeReload);
    expect(useTicketRestauranteStore.getState().debtLedger).toBe(debtLedgerBeforeReload);
  });

  it('reloadFromStorage sí actualiza el estado cuando localStorage cambia (otro usuario añade un calendario)', async () => {
    useTicketRestauranteStore.getState().createCalendar({
      nombre: 'Calendario central',
      activo: true,
      diasSinTicket: [],
    });

    await vi.waitFor(() => expect(useTicketRestauranteStore.getState().calendars).toHaveLength(1));

    // Simula que otro proceso (por ejemplo, el polling tras detectar un
    // cambio remoto) ha escrito un calendario adicional directamente en
    // localStorage, como haría applyPersistedRecordsSnapshotToLocalStorage.
    const currentCalendars = useTicketRestauranteStore.getState().calendars;
    const updatedCalendars = [
      ...currentCalendars,
      {
        id: 'calendar-otro-usuario',
        nombre: 'Calendario de otro usuario',
        activo: true,
        diasSinTicket: [],
        ticketIsoWeekdays: [1, 2, 3, 4, 5],
        createdAt: '2026-06-17T09:00:00.000Z',
        updatedAt: '2026-06-17T09:00:00.000Z',
        deletedAt: null,
      },
    ];
    window.localStorage.setItem('traccion.v1.ticketRestaurante.calendars', JSON.stringify(updatedCalendars));

    useTicketRestauranteStore.getState().reloadFromStorage();

    expect(useTicketRestauranteStore.getState().calendars).toHaveLength(2);
    expect(useTicketRestauranteStore.getState().calendars.map((item) => item.id)).toContain(
      'calendar-otro-usuario',
    );
  });
});

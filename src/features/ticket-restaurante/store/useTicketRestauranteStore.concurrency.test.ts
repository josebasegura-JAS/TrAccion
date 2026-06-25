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

describe('useTicketRestauranteStore con repositorio SQLite simulado (OCC)', () => {
  function buildSqliteRecord(value: unknown, updatedAt: string) {
    return {
      id: (value as { id?: string; empleado?: string }).id ?? (value as { empleado: string }).empleado,
      value: JSON.stringify(value),
      createdAt: updatedAt,
      updatedAt,
      deletedAt: null,
    };
  }

  beforeEach(() => {
    window.localStorage.clear();
    useTicketRestauranteStore.setState({
      calendars: [],
      absences: [],
      people: [],
      manutenciones: [],
    });
  });

  it('createCalendar guarda en SQLite y queda disponible para updateCalendar con el token correcto', async () => {
    let storedCalendar: ReturnType<typeof buildSqliteRecord> | null = null;

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadTicketRestauranteCalendarRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: storedCalendar ? [storedCalendar] : [],
        })),
        saveTicketRestauranteCalendarRecordIfUnchanged: vi.fn(async (record: { id: string; value: string; expectedUpdatedAt: string | null }) => {
          const currentUpdatedAt = storedCalendar?.updatedAt ?? null;
          if (currentUpdatedAt !== record.expectedUpdatedAt) {
            return {
              ok: false,
              status: { ready: true, phase: 'active', message: 'SQLite activo' },
              currentUpdatedAt,
              message: 'Calendario de Ticket Restaurante ha sido modificado por otro usuario. Recarga antes de guardar.',
            };
          }
          const nextUpdatedAt = `${Date.now()}`;
          storedCalendar = { id: record.id, value: record.value, createdAt: nextUpdatedAt, updatedAt: nextUpdatedAt, deletedAt: null };
          return {
            ok: true,
            status: { ready: true, phase: 'active', message: 'SQLite activo' },
            currentUpdatedAt: nextUpdatedAt,
            message: 'Registro guardado en SQLite.',
          };
        }),
        loadTicketRestaurantePersonRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [],
        })),
        saveTicketRestaurantePersonRecordIfUnchanged: vi.fn(),
      },
    });

    const id = await useTicketRestauranteStore.getState().createCalendar({
      nombre: 'Calendario central',
      activo: true,
      diasSinTicket: [],
    });

    expect(useTicketRestauranteStore.getState().calendars).toHaveLength(1);
    expect(storedCalendar).not.toBeNull();

    const updateResult = await useTicketRestauranteStore.getState().updateCalendar(id, {
      nombre: 'Calendario central (renombrado)',
      activo: true,
      diasSinTicket: [],
    });

    expect(updateResult.ok).toBe(true);
    expect(useTicketRestauranteStore.getState().calendars[0]?.nombre).toBe('Calendario central (renombrado)');
  });

  it('updateCalendar devuelve ok:false cuando otro usuario modificó el calendario primero (conflicto OCC)', async () => {
    const initialCalendar = {
      id: 'calendar-1',
      nombre: 'Calendario central',
      activo: true,
      diasSinTicket: [],
      ticketIsoWeekdays: [1, 2, 3, 4, 5],
      createdAt: '2026-06-17T09:00:00.000Z',
      updatedAt: '2026-06-17T09:00:00.000Z',
      deletedAt: null,
    };

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadTicketRestauranteCalendarRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [buildSqliteRecord(initialCalendar, '2026-06-17T09:00:00.000Z')],
        })),
        // Simula que, entre la carga y el guardado, otro usuario ya cambió
        // el updatedAt en SQLite: el expectedUpdatedAt que envía el store
        // (basado en su mapa en memoria) ya no coincide con el real.
        saveTicketRestauranteCalendarRecordIfUnchanged: vi.fn(async () => ({
          ok: false,
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          currentUpdatedAt: '2026-06-17T10:00:00.000Z',
          message: 'Calendario de Ticket Restaurante ha sido modificado por otro usuario. Recarga antes de guardar.',
        })),
        loadTicketRestaurantePersonRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [],
        })),
        saveTicketRestaurantePersonRecordIfUnchanged: vi.fn(),
      },
    });

    useTicketRestauranteStore.getState().load();
    await vi.waitFor(() => expect(useTicketRestauranteStore.getState().calendars).toHaveLength(1));

    const result = await useTicketRestauranteStore.getState().updateCalendar('calendar-1', {
      nombre: 'Intento de renombrado',
      activo: true,
      diasSinTicket: [],
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('modificado por otro usuario');
    // El estado local no debe haberse actualizado con el cambio rechazado.
    expect(useTicketRestauranteStore.getState().calendars[0]?.nombre).toBe('Calendario central');
  });

  it('upsertPerson usa el número de empleado como id SQLite y respeta el token de versión', async () => {
    let storedPerson: ReturnType<typeof buildSqliteRecord> | null = null;

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadTicketRestauranteCalendarRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [],
        })),
        saveTicketRestauranteCalendarRecordIfUnchanged: vi.fn(),
        loadTicketRestaurantePersonRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: storedPerson ? [storedPerson] : [],
        })),
        saveTicketRestaurantePersonRecordIfUnchanged: vi.fn(async (record: { id: string; value: string; expectedUpdatedAt: string | null }) => {
          const currentUpdatedAt = storedPerson?.updatedAt ?? null;
          if (currentUpdatedAt !== record.expectedUpdatedAt) {
            return {
              ok: false,
              status: { ready: true, phase: 'active', message: 'SQLite activo' },
              currentUpdatedAt,
              message: 'Persona de Ticket Restaurante ha sido modificada por otro usuario. Recarga antes de guardar.',
            };
          }
          const nextUpdatedAt = `${Date.now()}`;
          storedPerson = { id: record.id, value: record.value, createdAt: nextUpdatedAt, updatedAt: nextUpdatedAt, deletedAt: null };
          return {
            ok: true,
            status: { ready: true, phase: 'active', message: 'SQLite activo' },
            currentUpdatedAt: nextUpdatedAt,
            message: 'Registro guardado en SQLite.',
          };
        }),
      },
    });

    useTicketRestauranteStore.setState({ calendars: [{
      id: 'calendar-1',
      nombre: 'Calendario central',
      activo: true,
      diasSinTicket: [],
      ticketIsoWeekdays: [1, 2, 3, 4, 5],
      createdAt: '2026-06-17T09:00:00.000Z',
      updatedAt: '2026-06-17T09:00:00.000Z',
      deletedAt: null,
    }] });

    const createResult = await useTicketRestauranteStore.getState().upsertPerson({
      empleado: '00001',
      nombre: 'Ana',
      apellido1: 'García',
      apellido2: '',
      dni: '',
      nombreApellidos: '',
      puesto: 'Técnica',
      calendarId: 'calendar-1',
      activo: true,
    });

    expect(createResult.ok).toBe(true);
    expect(storedPerson?.id).toBe('00001');

    const updateResult = await useTicketRestauranteStore.getState().upsertPerson({
      empleado: '00001',
      nombre: 'Ana',
      apellido1: 'García López',
      apellido2: '',
      dni: '',
      nombreApellidos: '',
      puesto: 'Técnica Senior',
      calendarId: 'calendar-1',
      activo: true,
    });

    expect(updateResult.ok).toBe(true);
    expect(useTicketRestauranteStore.getState().people[0]?.puesto).toBe('Técnica Senior');
  });
});

describe('useTicketRestauranteStore — absences y config con repositorio SQLite simulado (OCC)', () => {
  function buildSqliteRecord(value: unknown, updatedAt: string) {
    return {
      id: (value as { id: string }).id,
      value: JSON.stringify(value),
      createdAt: updatedAt,
      updatedAt,
      deletedAt: null,
    };
  }

  beforeEach(() => {
    window.localStorage.clear();
    useTicketRestauranteStore.setState({
      calendars: [],
      absences: [],
      people: [],
      manutenciones: [],
    });
  });

  it('saveAbsences reemplaza el listado completo en un solo batch, marcando deletedAt en las que ya no están presentes', async () => {
    const store: Record<string, ReturnType<typeof buildSqliteRecord>> = {};
    const initialAbsence = {
      id: 'absence-1',
      empleado: '00001',
      nombreApellidos: 'Ana García',
      desde: '2026-06-01',
      hasta: '2026-06-05',
      motivo: 'Vacaciones',
      totalDias: 5,
      afectaTicket: true,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
      deletedAt: null,
    };
    store['absence-1'] = buildSqliteRecord(initialAbsence, '2026-05-01T00:00:00.000Z');

    let batchCallCount = 0;
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadTicketRestauranteCalendarRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [],
        })),
        saveTicketRestauranteCalendarRecordIfUnchanged: vi.fn(),
        loadTicketRestaurantePersonRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [],
        })),
        saveTicketRestaurantePersonRecordIfUnchanged: vi.fn(),
        loadTicketRestauranteAbsenceRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: Object.values(store),
        })),
        saveTicketRestauranteAbsenceRecordIfUnchanged: vi.fn(),
        saveTicketRestauranteAbsenceRecordsIfUnchanged: vi.fn(
          async (records: Array<{ id: string; value: string; expectedUpdatedAt: string | null }>) => {
            batchCallCount += 1;
            for (const record of records) {
              const current = store[record.id];
              const currentUpdatedAt = current?.updatedAt ?? null;
              if (currentUpdatedAt !== record.expectedUpdatedAt) {
                return {
                  ok: false,
                  status: { ready: true, phase: 'active', message: 'SQLite activo' },
                  results: [],
                  failedRecordId: record.id,
                  message: 'Ausencia de Ticket Restaurante ha sido modificada por otro usuario. Recarga antes de guardar.',
                };
              }
            }
            const nextUpdatedAt = `${Date.now()}`;
            for (const record of records) {
              const parsedValue = JSON.parse(record.value) as { deletedAt?: string | null };
              store[record.id] = {
                id: record.id,
                value: record.value,
                createdAt: nextUpdatedAt,
                updatedAt: nextUpdatedAt,
                deletedAt: parsedValue.deletedAt ?? null,
              };
            }
            return {
              ok: true,
              status: { ready: true, phase: 'active', message: 'SQLite activo' },
              results: [],
              message: `${records.length} registros guardados en SQLite.`,
            };
          },
        ),
        loadTicketRestauranteConfigRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [],
        })),
        saveTicketRestauranteConfigRecordIfUnchanged: vi.fn(async () => ({
          ok: true,
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          currentUpdatedAt: `${Date.now()}`,
          message: 'Configuración guardada en SQLite.',
        })),
      },
    });

    useTicketRestauranteStore.getState().load();
    await vi.waitFor(() => expect(useTicketRestauranteStore.getState().absences).toHaveLength(1));

    // Sustituye la única ausencia existente por una nueva (la anterior debe
    // quedar marcada deletedAt en SQLite, no borrada físicamente).
    const newAbsence = {
      ...initialAbsence,
      id: 'absence-2',
      desde: '2026-07-01',
      hasta: '2026-07-03',
      totalDias: 3,
    };

    const result = await useTicketRestauranteStore.getState().saveAbsences([newAbsence]);

    expect(result.ok).toBe(true);
    expect(batchCallCount).toBe(1);
    expect(useTicketRestauranteStore.getState().absences).toEqual([newAbsence]);
    // La ausencia sustituida debe seguir en SQLite pero marcada deletedAt
    // (tombstone), no eliminada de la tabla.
    expect(store['absence-1']?.deletedAt).not.toBeNull();
    expect(JSON.parse(store['absence-1']?.value ?? '{}').deletedAt).not.toBeNull();
  });

  it('removeAbsence devuelve ok:false cuando otro usuario modificó la ausencia primero (conflicto OCC)', async () => {
    const absence = {
      id: 'absence-1',
      empleado: '00001',
      nombreApellidos: 'Ana García',
      desde: '2026-06-01',
      hasta: '2026-06-05',
      motivo: 'Vacaciones',
      totalDias: 5,
      afectaTicket: true,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
      deletedAt: null,
    };

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadTicketRestauranteCalendarRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [],
        })),
        saveTicketRestauranteCalendarRecordIfUnchanged: vi.fn(),
        loadTicketRestaurantePersonRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [],
        })),
        saveTicketRestaurantePersonRecordIfUnchanged: vi.fn(),
        loadTicketRestauranteAbsenceRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [buildSqliteRecord(absence, '2026-05-01T00:00:00.000Z')],
        })),
        // Simula que, entre la carga y el guardado, otro usuario ya cambió
        // el updatedAt en SQLite.
        saveTicketRestauranteAbsenceRecordIfUnchanged: vi.fn(async () => ({
          ok: false,
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          currentUpdatedAt: '2026-06-01T00:00:00.000Z',
          message: 'Ausencia de Ticket Restaurante ha sido modificada por otro usuario. Recarga antes de guardar.',
        })),
        loadTicketRestauranteConfigRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [],
        })),
        saveTicketRestauranteConfigRecordIfUnchanged: vi.fn(async () => ({
          ok: true,
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          currentUpdatedAt: `${Date.now()}`,
          message: 'Configuración guardada en SQLite.',
        })),
      },
    });

    useTicketRestauranteStore.getState().load();
    await vi.waitFor(() => expect(useTicketRestauranteStore.getState().absences).toHaveLength(1));

    const result = await useTicketRestauranteStore.getState().removeAbsence('absence-1');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('modificada por otro usuario');
    expect(useTicketRestauranteStore.getState().absences[0]?.deletedAt).toBeNull();
  });

  it('updateConfig respeta el token de versión del singleton y detecta conflicto OCC', async () => {
    let storedConfig: ReturnType<typeof buildSqliteRecord> | null = null;

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadTicketRestauranteCalendarRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [],
        })),
        saveTicketRestauranteCalendarRecordIfUnchanged: vi.fn(),
        loadTicketRestaurantePersonRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [],
        })),
        saveTicketRestaurantePersonRecordIfUnchanged: vi.fn(),
        loadTicketRestauranteAbsenceRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [],
        })),
        saveTicketRestauranteAbsenceRecordsIfUnchanged: vi.fn(),
        loadTicketRestauranteConfigRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: storedConfig ? [storedConfig] : [],
        })),
        saveTicketRestauranteConfigRecordIfUnchanged: vi.fn(
          async (record: { id: string; value: string; expectedUpdatedAt: string | null }) => {
            const currentUpdatedAt = storedConfig?.updatedAt ?? null;
            if (currentUpdatedAt !== record.expectedUpdatedAt) {
              return {
                ok: false,
                status: { ready: true, phase: 'active', message: 'SQLite activo' },
                currentUpdatedAt,
                message: 'La configuración ha sido modificada por otro usuario. Recarga antes de continuar.',
              };
            }
            const nextUpdatedAt = `${Date.now()}`;
            storedConfig = { id: record.id, value: record.value, createdAt: nextUpdatedAt, updatedAt: nextUpdatedAt, deletedAt: null };
            return {
              ok: true,
              status: { ready: true, phase: 'active', message: 'SQLite activo' },
              currentUpdatedAt: nextUpdatedAt,
              message: 'Configuración guardada en SQLite.',
            };
          },
        ),
      },
    });

    useTicketRestauranteStore.getState().load();
    await vi.waitFor(() => expect(storedConfig).not.toBeNull());

    const firstConfig = {
      importeTicket: 17,
      pedidoMensual: 0,
      priceHistory: [{ amount: 17, effectiveFrom: '2026-06-01' }],
      rules: {
        debtStartDate: '2026-01-01',
        noOrderMonths: [],
        nonDiscountableMotivesByCalendar: {},
        applyDebtAtClosedMonth: false,
      },
    };

    const firstResult = await useTicketRestauranteStore.getState().updateConfig(firstConfig);
    expect(firstResult.ok).toBe(true);
    expect(useTicketRestauranteStore.getState().config.importeTicket).toBe(17);

    // Simula que otro usuario ha actualizado config directamente en SQLite
    // entre medias, invalidando el token que el store tiene en memoria.
    storedConfig = buildSqliteRecord(
      { ...firstConfig, importeTicket: 18 },
      '2026-06-20T00:00:00.000Z',
    );

    const staleUpdateResult = await useTicketRestauranteStore.getState().updateConfig({
      ...firstConfig,
      pedidoMensual: 5,
    });

    expect(staleUpdateResult.ok).toBe(false);
    expect(staleUpdateResult.message).toContain('modificada por otro usuario');
  });
});

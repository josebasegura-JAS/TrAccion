import { create } from 'zustand';
import { readStorageItem, writeJsonStorageAsync } from '../../../services/persistence';
import {
  buildTicketCalendar,
  calculateTicketContribution,
  normalizeTicketIsoWeekdays,
  normalizeTicketRestaurantConfig,
  buildTicketPerson,
  splitTicketPersonFullName,
  DEFAULT_TICKET_RESTAURANT_CONFIG,
  toggleDiaSinTicket,
  type TicketCalendar,
  type TicketCalendarDraft,
  type TicketPerson,
  type TicketPersonDraft,
  type TicketRestaurantAbsence,
  type TicketRestaurantConfig,
} from '../domain/ticketRestaurante';
import { normalizeCalendarName, type TicketPeopleImportDraft } from '../domain/importPeople';
import {
  buildTicketManutencion,
  type TicketManutencion,
  type TicketManutencionDraft,
} from '../domain/importManutenciones';

const CALENDARS_STORAGE_KEY = 'traccion.v1.ticketRestaurante.calendars';
const ABSENCES_STORAGE_KEY = 'traccion.v1.ticketRestaurante.absences';
const PEOPLE_STORAGE_KEY = 'traccion.v1.ticketRestaurante.people';
const CONFIG_STORAGE_KEY = 'traccion.v1.ticketRestaurante.config';
const DEBT_LEDGER_STORAGE_KEY = 'traccion.v1.ticketRestaurante.debtLedger';
const MANUTENCIONES_STORAGE_KEY = 'traccion.v1.ticketRestaurante.manutenciones';

interface TicketRestauranteState {
  calendars: TicketCalendar[];
  absences: TicketRestaurantAbsence[];
  people: TicketPerson[];
  config: TicketRestaurantConfig;
  debtLedger: Record<string, number>;
  manutenciones: TicketManutencion[];
  load: () => void;
  reloadFromStorage: () => void;
  createCalendar: (draft: TicketCalendarDraft) => string;
  updateCalendar: (id: string, draft: TicketCalendarDraft) => void;
  toggleCalendarActive: (id: string) => void;
  removeCalendar: (id: string) => void;
  toggleDay: (calendarId: string, fecha: string) => void;
  saveAbsences: (absences: TicketRestaurantAbsence[]) => void;
  removeAbsence: (id: string) => void;
  upsertPerson: (draft: TicketPersonDraft) => void;
  importPeople: (drafts: TicketPeopleImportDraft[]) => {
    imported: number;
    createdCalendars: number;
  };
  removePerson: (empleado: string) => void;
  updateConfig: (config: TicketRestaurantConfig) => void;
  saveManutenciones: (drafts: TicketManutencionDraft[]) => void;
  removeManutencion: (id: string) => void;
}

function isTicketCalendar(value: unknown): value is TicketCalendar {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TicketCalendar>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.nombre === 'string' &&
    typeof candidate.activo === 'boolean' &&
    Array.isArray(candidate.diasSinTicket) &&
    candidate.diasSinTicket.every((fecha) => typeof fecha === 'string') &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    (typeof candidate.deletedAt === 'string' || candidate.deletedAt === null)
  );
}

function isTicketPerson(value: unknown): value is TicketPerson {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TicketPerson>;
  return (
    typeof candidate.empleado === 'string' &&
    (typeof candidate.nombreApellidos === 'string' || typeof candidate.nombre === 'string') &&
    typeof candidate.puesto === 'string' &&
    typeof candidate.calendarId === 'string' &&
    typeof candidate.activo === 'boolean' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    (typeof candidate.deletedAt === 'string' || candidate.deletedAt === null)
  );
}

function isTicketRestaurantAbsence(value: unknown): value is TicketRestaurantAbsence {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TicketRestaurantAbsence>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.empleado === 'string' &&
    typeof candidate.nombreApellidos === 'string' &&
    typeof candidate.desde === 'string' &&
    typeof candidate.hasta === 'string' &&
    typeof candidate.motivo === 'string' &&
    typeof candidate.totalDias === 'number' &&
    typeof candidate.afectaTicket === 'boolean' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    (typeof candidate.deletedAt === 'string' || candidate.deletedAt === null)
  );
}


function isTicketManutencion(value: unknown): value is TicketManutencion {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TicketManutencion>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.empleado === 'string' &&
    typeof candidate.nombreApellidos === 'string' &&
    typeof candidate.fechaGasto === 'string' &&
    typeof candidate.origen === 'string' &&
    typeof candidate.afectaTicket === 'boolean' &&
    (typeof candidate.imputacionYear === 'number' || typeof candidate.imputacionYear === 'undefined') &&
    (typeof candidate.imputacionMonth === 'number' || typeof candidate.imputacionMonth === 'undefined') &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    (typeof candidate.deletedAt === 'string' || candidate.deletedAt === null)
  );
}

function readJsonArray<T>(storageKey: string, guard: (value: unknown) => value is T): T[] {
  const stored = readStorageItem(storageKey);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(guard);
}

function normalizeStoredTicketCalendar(calendar: TicketCalendar): TicketCalendar {
  return {
    ...calendar,
    ticketIsoWeekdays: normalizeTicketIsoWeekdays(calendar.ticketIsoWeekdays),
  };
}


function normalizeStoredTicketManutencion(row: TicketManutencion): TicketManutencion {
  const now = new Date();
  return {
    ...row,
    imputacionYear:
      typeof row.imputacionYear === 'number' && Number.isInteger(row.imputacionYear)
        ? row.imputacionYear
        : now.getFullYear(),
    imputacionMonth:
      typeof row.imputacionMonth === 'number' && row.imputacionMonth >= 1 && row.imputacionMonth <= 12
        ? row.imputacionMonth
        : now.getMonth() + 1,
  };
}

function normalizeStoredTicketPerson(person: TicketPerson): TicketPerson {
  const nombreApellidos =
    person.nombreApellidos ||
    [person.nombre, person.apellido1, person.apellido2].filter(Boolean).join(' ').trim();
  const splitName = splitTicketPersonFullName(nombreApellidos);

  return {
    ...person,
    nombre: person.nombre || splitName.nombre,
    apellido1: person.apellido1 || splitName.apellido1,
    apellido2: person.apellido2 || splitName.apellido2,
    dni: person.dni || '',
    nombreApellidos,
  };
}

function readConfig(): TicketRestaurantConfig {
  const stored = readStorageItem(CONFIG_STORAGE_KEY);
  if (!stored) {
    return DEFAULT_TICKET_RESTAURANT_CONFIG;
  }

  const parsed: unknown = JSON.parse(stored);
  if (!parsed || typeof parsed !== 'object') {
    return DEFAULT_TICKET_RESTAURANT_CONFIG;
  }

  const candidate = parsed as Partial<TicketRestaurantConfig>;
  const priceHistory = Array.isArray(candidate.priceHistory)
    ? candidate.priceHistory
    : DEFAULT_TICKET_RESTAURANT_CONFIG.priceHistory;
  const hasLegacyDefaultPrice =
    candidate.importeTicket === 16 &&
    (candidate.pedidoMensual === undefined || candidate.pedidoMensual === 0) &&
    priceHistory.length === 1 &&
    priceHistory[0]?.amount === 16 &&
    priceHistory[0]?.effectiveFrom === '2026-03-01';

  return normalizeTicketRestaurantConfig({
    importeTicket: hasLegacyDefaultPrice
      ? DEFAULT_TICKET_RESTAURANT_CONFIG.importeTicket
      : typeof candidate.importeTicket === 'number' && candidate.importeTicket >= 0
        ? candidate.importeTicket
        : DEFAULT_TICKET_RESTAURANT_CONFIG.importeTicket,
    pedidoMensual: hasLegacyDefaultPrice
      ? DEFAULT_TICKET_RESTAURANT_CONFIG.pedidoMensual
      : typeof candidate.pedidoMensual === 'number' && candidate.pedidoMensual >= 0
        ? candidate.pedidoMensual
        : DEFAULT_TICKET_RESTAURANT_CONFIG.pedidoMensual,
    priceHistory: hasLegacyDefaultPrice
      ? DEFAULT_TICKET_RESTAURANT_CONFIG.priceHistory
      : priceHistory,
    rules: candidate.rules ?? DEFAULT_TICKET_RESTAURANT_CONFIG.rules,
  });
}

function readDebtLedger(): Record<string, number> {
  const stored = readStorageItem(DEBT_LEDGER_STORAGE_KEY);
  if (!stored) {
    return {};
  }

  const parsed: unknown = JSON.parse(stored);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] >= 0,
    ),
  );
}

function recalculateDebtLedger(
  people: readonly TicketPerson[],
  calendars: readonly TicketCalendar[],
  absences: readonly TicketRestaurantAbsence[],
  config: TicketRestaurantConfig,
): Record<string, number> {
  const today = new Date();
  const calculation = calculateTicketContribution(
    people,
    calendars,
    absences,
    config,
    today.getFullYear(),
    today.getMonth() + 1,
  );
  return Object.fromEntries(
    calculation.rows
      .filter((row) => row.deudaPendiente > 0)
      .map((row) => [row.empleado, row.deudaPendiente]),
  );
}

async function persist<T>(storageKey: string, value: T): Promise<void> {
  const result = await writeJsonStorageAsync(storageKey, value);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

type TicketStatePatch = Partial<Pick<TicketRestauranteState, 'calendars' | 'absences' | 'people' | 'config' | 'debtLedger' | 'manutenciones'>>;

type TicketWrite = readonly [storageKey: string, value: unknown];

function commitTicketState(
  set: (partial: TicketStatePatch) => void,
  patch: TicketStatePatch,
  writes: TicketWrite[],
): void {
  void (async () => {
    try {
      for (const [storageKey, value] of writes) {
        await persist(storageKey, value);
      }
      set(patch);
    } catch (error) {
      console.warn('Ticket Restaurante no guardado en SQLite.', error);
    }
  })();
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}`;
}

export const useTicketRestauranteStore = create<TicketRestauranteState>((set, get) => ({
  calendars: [],
  absences: [],
  people: [],
  config: DEFAULT_TICKET_RESTAURANT_CONFIG,
  debtLedger: {},
  manutenciones: [],
  load: () => {
    set({
      calendars: readJsonArray(CALENDARS_STORAGE_KEY, isTicketCalendar).map(
        normalizeStoredTicketCalendar,
      ),
      absences: readJsonArray(ABSENCES_STORAGE_KEY, isTicketRestaurantAbsence),
      people: readJsonArray(PEOPLE_STORAGE_KEY, isTicketPerson).map(normalizeStoredTicketPerson),
      config: readConfig(),
      debtLedger: readDebtLedger(),
      manutenciones: readJsonArray(MANUTENCIONES_STORAGE_KEY, isTicketManutencion).map(
        normalizeStoredTicketManutencion,
      ),
    });
  },
  reloadFromStorage: () => {
    set({
      calendars: readJsonArray(CALENDARS_STORAGE_KEY, isTicketCalendar).map(
        normalizeStoredTicketCalendar,
      ),
      absences: readJsonArray(ABSENCES_STORAGE_KEY, isTicketRestaurantAbsence),
      people: readJsonArray(PEOPLE_STORAGE_KEY, isTicketPerson).map(normalizeStoredTicketPerson),
      config: readConfig(),
      debtLedger: readDebtLedger(),
      manutenciones: readJsonArray(MANUTENCIONES_STORAGE_KEY, isTicketManutencion).map(
        normalizeStoredTicketManutencion,
      ),
    });
  },
  createCalendar: (draft) => {
    const id = createId('ticket-calendar');
    const state = get();
    const calendars = [...state.calendars, buildTicketCalendar(draft, nowIso(), id)];
    const debtLedger = recalculateDebtLedger(state.people, calendars, state.absences, state.config);
    commitTicketState(set, { calendars, debtLedger }, [
      [CALENDARS_STORAGE_KEY, calendars],
      [DEBT_LEDGER_STORAGE_KEY, debtLedger],
    ]);
    return id;
  },
  updateCalendar: (id, draft) => {
    const state = get();
    const updatedAt = nowIso();
    const calendars = state.calendars.map((calendar) =>
      calendar.id === id ? buildTicketCalendar(draft, updatedAt, id, calendar) : calendar,
    );
    const debtLedger = recalculateDebtLedger(state.people, calendars, state.absences, state.config);
    commitTicketState(set, { calendars, debtLedger }, [
      [CALENDARS_STORAGE_KEY, calendars],
      [DEBT_LEDGER_STORAGE_KEY, debtLedger],
    ]);
  },
  toggleCalendarActive: (id) => {
    const state = get();
    const updatedAt = nowIso();
    const calendars = state.calendars.map((calendar) =>
      calendar.id === id ? { ...calendar, activo: !calendar.activo, updatedAt } : calendar,
    );
    const debtLedger = recalculateDebtLedger(state.people, calendars, state.absences, state.config);
    commitTicketState(set, { calendars, debtLedger }, [
      [CALENDARS_STORAGE_KEY, calendars],
      [DEBT_LEDGER_STORAGE_KEY, debtLedger],
    ]);
  },
  removeCalendar: (id) => {
    const state = get();
    const updatedAt = nowIso();
    const calendars = state.calendars.map((calendar) =>
      calendar.id === id
        ? { ...calendar, activo: false, updatedAt, deletedAt: updatedAt }
        : calendar,
    );
    const people = state.people.map((person) =>
      person.calendarId === id && !person.deletedAt
        ? { ...person, activo: false, updatedAt, deletedAt: updatedAt }
        : person,
    );
    const debtLedger = recalculateDebtLedger(people, calendars, state.absences, state.config);
    commitTicketState(set, { calendars, people, debtLedger }, [
      [CALENDARS_STORAGE_KEY, calendars],
      [PEOPLE_STORAGE_KEY, people],
      [DEBT_LEDGER_STORAGE_KEY, debtLedger],
    ]);
  },
  toggleDay: (calendarId, fecha) => {
    const state = get();
    const updatedAt = nowIso();
    const calendars = state.calendars.map((calendar) =>
      calendar.id === calendarId
        ? { ...toggleDiaSinTicket(calendar, fecha), updatedAt }
        : calendar,
    );
    const debtLedger = recalculateDebtLedger(state.people, calendars, state.absences, state.config);
    commitTicketState(set, { calendars, debtLedger }, [
      [CALENDARS_STORAGE_KEY, calendars],
      [DEBT_LEDGER_STORAGE_KEY, debtLedger],
    ]);
  },
  saveAbsences: (absences) => {
    const state = get();
    const debtLedger = recalculateDebtLedger(state.people, state.calendars, absences, state.config);
    commitTicketState(set, { absences, debtLedger }, [
      [ABSENCES_STORAGE_KEY, absences],
      [DEBT_LEDGER_STORAGE_KEY, debtLedger],
    ]);
  },
  removeAbsence: (id) => {
    const state = get();
    const updatedAt = nowIso();
    const absences = state.absences.map((absence) =>
      absence.id === id ? { ...absence, updatedAt, deletedAt: updatedAt } : absence,
    );
    const debtLedger = recalculateDebtLedger(state.people, state.calendars, absences, state.config);
    commitTicketState(set, { absences, debtLedger }, [
      [ABSENCES_STORAGE_KEY, absences],
      [DEBT_LEDGER_STORAGE_KEY, debtLedger],
    ]);
  },
  upsertPerson: (draft) => {
    const state = get();
    const now = nowIso();
    const previous = state.people.find((person) => person.empleado === draft.empleado);
    const people = previous
      ? state.people.map((person) =>
          person.empleado === draft.empleado ? buildTicketPerson(draft, now, person) : person,
        )
      : [...state.people, buildTicketPerson(draft, now)];
    const debtLedger = recalculateDebtLedger(people, state.calendars, state.absences, state.config);
    commitTicketState(set, { people, debtLedger }, [
      [PEOPLE_STORAGE_KEY, people],
      [DEBT_LEDGER_STORAGE_KEY, debtLedger],
    ]);
  },
  importPeople: (drafts) => {
    let result = { imported: 0, createdCalendars: 0 };
    const state = get();
    const now = nowIso();
    const calendars = [...state.calendars];
    const calendarIdByName = new Map(
      calendars
        .filter((calendar) => !calendar.deletedAt)
        .map((calendar) => [normalizeCalendarName(calendar.nombre), calendar.id]),
    );
    const peopleByEmployee = new Map(state.people.map((person) => [person.empleado, person]));

    drafts.forEach((draft) => {
      const normalizedCalendarName = normalizeCalendarName(draft.calendarName);
      let calendarId = draft.calendarId || calendarIdByName.get(normalizedCalendarName) || '';

      if (!calendarId) {
        calendarId = createId('ticket-calendar');
        calendars.push(
          buildTicketCalendar(
            { nombre: draft.calendarName, activo: true, diasSinTicket: [] },
            now,
            calendarId,
          ),
        );
        calendarIdByName.set(normalizedCalendarName, calendarId);
        result = { ...result, createdCalendars: result.createdCalendars + 1 };
      }

      const previous = peopleByEmployee.get(draft.empleado);
      peopleByEmployee.set(draft.empleado, buildTicketPerson({ ...draft, calendarId }, now, previous));
      result = { ...result, imported: result.imported + 1 };
    });

    const people = Array.from(peopleByEmployee.values());
    const debtLedger = recalculateDebtLedger(people, calendars, state.absences, state.config);
    commitTicketState(set, { calendars, people, debtLedger }, [
      [CALENDARS_STORAGE_KEY, calendars],
      [PEOPLE_STORAGE_KEY, people],
      [DEBT_LEDGER_STORAGE_KEY, debtLedger],
    ]);
    return result;
  },
  removePerson: (empleado) => {
    const state = get();
    const people = state.people.filter((person) => person.empleado !== empleado);
    const debtLedger = recalculateDebtLedger(people, state.calendars, state.absences, state.config);
    commitTicketState(set, { people, debtLedger }, [
      [PEOPLE_STORAGE_KEY, people],
      [DEBT_LEDGER_STORAGE_KEY, debtLedger],
    ]);
  },
  updateConfig: (config) => {
    const state = get();
    const debtLedger = recalculateDebtLedger(state.people, state.calendars, state.absences, config);
    commitTicketState(set, { config, debtLedger }, [
      [CONFIG_STORAGE_KEY, config],
      [DEBT_LEDGER_STORAGE_KEY, debtLedger],
    ]);
  },
  saveManutenciones: (drafts) => {
    const state = get();
    const now = nowIso();
    const result = state.manutenciones.filter((row) => !row.deletedAt).map((row) => ({ ...row }));
    const existingKeys = new Set(
      result.map((row) => `${row.empleado}|${row.fechaGasto}|${row.imputacionYear}|${row.imputacionMonth}`),
    );

    drafts.forEach((draft) => {
      const key = `${draft.empleado}|${draft.fechaGasto}|${draft.imputacionYear}|${draft.imputacionMonth}`;
      if (existingKeys.has(key)) {
        return;
      }
      existingKeys.add(key);
      result.push(
        buildTicketManutencion(
          draft,
          now,
          `ticket-manutencion-${draft.empleado}-${draft.fechaGasto}-${result.length + 1}`,
        ),
      );
    });

    commitTicketState(set, { manutenciones: result }, [[MANUTENCIONES_STORAGE_KEY, result]]);
  },
  removeManutencion: (id) => {
    const state = get();
    const updatedAt = nowIso();
    const manutenciones = state.manutenciones.map((row) =>
      row.id === id ? { ...row, updatedAt, deletedAt: updatedAt } : row,
    );
    commitTicketState(set, { manutenciones }, [[MANUTENCIONES_STORAGE_KEY, manutenciones]]);
  },
}));

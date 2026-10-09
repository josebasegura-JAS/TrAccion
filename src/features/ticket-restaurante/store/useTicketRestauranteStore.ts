import { create } from 'zustand';
import { readStorageItem, writeJsonStorageAsync } from '../../../services/persistence';
import {
  buildTicketCalendar,
  normalizeTicketRestaurantConfig,
  buildTicketPerson,
  normalizeTicketEmployeeNumber,
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
import {
  hasTicketRestauranteCalendarsSqliteRepository,
  hasTicketRestaurantePeopleSqliteRepository,
  hasTicketRestauranteAbsencesSqliteRepository,
  hasTicketRestauranteConfigSqliteRepository,
  hasTicketRestauranteManutencionesSqliteRepository,
  loadTicketRestauranteCalendarRecordsFromSqlite,
  loadTicketRestaurantePersonRecordsFromSqlite,
  loadTicketRestauranteAbsenceRecordsFromSqlite,
  loadTicketRestauranteConfigRecordFromSqlite,
  loadTicketRestauranteManutencionRecordsFromSqlite,
  saveTicketRestauranteCalendarToSqlite,
  saveTicketRestaurantePersonToSqlite,
  saveTicketRestauranteAbsencesToSqlite,
  saveTicketRestauranteAbsenceToSqlite,
  saveTicketRestauranteConfigToSqlite,
  saveTicketRestauranteManutencionToSqlite,
  saveTicketRestauranteManutencionesToSqlite,
} from './ticketRestauranteSqliteRepository';
import {
  hasAtomicTicketCalendarRemoval,
  removeTicketCalendarWithPeopleAtomically,
} from './ticketRestauranteAtomicRemoval';
import {
  hasAtomicTicketPeopleImport,
  importTicketPeopleAtomically,
} from './ticketRestauranteAtomicImport';
import {
  isTicketCalendar,
  isTicketManutencion,
  isTicketPerson,
  isTicketRestaurantAbsence,
  normalizeStoredTicketCalendar,
  normalizeStoredTicketManutencion,
  normalizeStoredTicketPerson,
  parseTicketAbsenceRecords,
  parseTicketCalendarRecords,
  parseTicketManutencionRecords,
  parseTicketPersonRecords,
} from './ticketRestauranteStorage';

const CALENDARS_STORAGE_KEY = 'traccion.v1.ticketRestaurante.calendars';
const ABSENCES_STORAGE_KEY = 'traccion.v1.ticketRestaurante.absences';
const PEOPLE_STORAGE_KEY = 'traccion.v1.ticketRestaurante.people';
const CONFIG_STORAGE_KEY = 'traccion.v1.ticketRestaurante.config';
const MANUTENCIONES_STORAGE_KEY = 'traccion.v1.ticketRestaurante.manutenciones';

interface TicketRestauranteState {
  calendars: TicketCalendar[];
  absences: TicketRestaurantAbsence[];
  people: TicketPerson[];
  config: TicketRestaurantConfig;
  manutenciones: TicketManutencion[];
  load: () => void;
  reloadFromStorage: () => void;
  createCalendar: (draft: TicketCalendarDraft) => Promise<string>;
  updateCalendar: (
    id: string,
    draft: TicketCalendarDraft,
  ) => Promise<{ ok: boolean; message?: string }>;
  toggleCalendarActive: (id: string) => Promise<{ ok: boolean; message?: string }>;
  removeCalendar: (id: string) => Promise<{ ok: boolean; message?: string }>;
  toggleDay: (calendarId: string, fecha: string) => Promise<{ ok: boolean; message?: string }>;
  saveAbsences: (absences: TicketRestaurantAbsence[]) => Promise<{ ok: boolean; message?: string }>;
  removeAbsence: (id: string) => Promise<{ ok: boolean; message?: string }>;
  upsertPerson: (draft: TicketPersonDraft) => Promise<{ ok: boolean; message?: string }>;
  importPeople: (drafts: TicketPeopleImportDraft[]) => Promise<{
    imported: number;
    created: number;
    updated: number;
    unchanged: number;
    createdCalendars: number;
    ok: boolean;
    message?: string;
  }>;
  removePerson: (empleado: string) => Promise<{ ok: boolean; message?: string }>;
  updateConfig: (config: TicketRestaurantConfig) => Promise<{ ok: boolean; message?: string }>;
  saveManutenciones: (
    drafts: TicketManutencionDraft[],
  ) => Promise<{ ok: boolean; message?: string }>;
  removeManutencion: (id: string) => Promise<{ ok: boolean; message?: string }>;
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
    manualDebts: candidate.manualDebts ?? [],
    debtRegularizations: candidate.debtRegularizations ?? [],
    manualPeople: candidate.manualPeople ?? [],
    workflowReviews: candidate.workflowReviews ?? {},
    monthlySnapshots: candidate.monthlySnapshots ?? {},
    annualClosures: candidate.annualClosures ?? {},
    monthlyOrderExclusions: candidate.monthlyOrderExclusions ?? [],
    monthlyOrderAdjustments: candidate.monthlyOrderAdjustments ?? [],
    monthlyOrders: candidate.monthlyOrders ?? {},
    orderMovements: candidate.orderMovements ?? [],
    absenceTypeRules: candidate.absenceTypeRules ?? DEFAULT_TICKET_RESTAURANT_CONFIG.absenceTypeRules,
  });
}

async function persist<T>(storageKey: string, value: T): Promise<void> {
  const result = await writeJsonStorageAsync(storageKey, value);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

type TicketStatePatch = Partial<
  Pick<TicketRestauranteState, 'calendars' | 'absences' | 'people' | 'config' | 'manutenciones'>
>;

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

type TicketRestauranteSnapshot = Pick<
  TicketRestauranteState,
  'calendars' | 'absences' | 'people' | 'config' | 'manutenciones'
>;

function areTicketSnapshotsEquivalent(
  left: TicketRestauranteSnapshot,
  right: TicketRestauranteSnapshot,
): boolean {
  return (
    JSON.stringify(left.calendars) === JSON.stringify(right.calendars) &&
    JSON.stringify(left.absences) === JSON.stringify(right.absences) &&
    JSON.stringify(left.people) === JSON.stringify(right.people) &&
    JSON.stringify(left.config) === JSON.stringify(right.config) &&
    JSON.stringify(left.manutenciones) === JSON.stringify(right.manutenciones)
  );
}

let calendarSqliteUpdatedAt = new Map<string, string>();
let personSqliteUpdatedAt = new Map<string, string>();
let absenceSqliteUpdatedAt = new Map<string, string>();
let configSqliteUpdatedAt: string | null = null;
let manutencionSqliteUpdatedAt = new Map<string, string>();

function updateCalendarSqliteUpdatedAtMap(calendars: readonly TicketCalendar[]): void {
  calendarSqliteUpdatedAt = new Map(calendars.map((calendar) => [calendar.id, calendar.updatedAt]));
}

function updatePersonSqliteUpdatedAtMap(people: readonly TicketPerson[]): void {
  personSqliteUpdatedAt = new Map(people.map((person) => [person.empleado, person.updatedAt]));
}

function updateAbsenceSqliteUpdatedAtMap(absences: readonly TicketRestaurantAbsence[]): void {
  absenceSqliteUpdatedAt = new Map(absences.map((absence) => [absence.id, absence.updatedAt]));
}

function updateManutencionSqliteUpdatedAtMap(manutenciones: readonly TicketManutencion[]): void {
  manutencionSqliteUpdatedAt = new Map(manutenciones.map((row) => [row.id, row.updatedAt]));
}

async function loadTicketCalendarsPreferringSqlite(): Promise<TicketCalendar[]> {
  if (!hasTicketRestauranteCalendarsSqliteRepository()) {
    return import.meta.env.MODE === 'test'
      ? readJsonArray(CALENDARS_STORAGE_KEY, isTicketCalendar).map(normalizeStoredTicketCalendar)
      : [];
  }

  const sqliteRecords = await loadTicketRestauranteCalendarRecordsFromSqlite();
  if (!sqliteRecords || sqliteRecords.length === 0) return [];
  const calendars = parseTicketCalendarRecords(sqliteRecords);
  updateCalendarSqliteUpdatedAtMap(calendars);
  return calendars;
}

async function loadTicketPeoplePreferringSqlite(): Promise<TicketPerson[]> {
  if (!hasTicketRestaurantePeopleSqliteRepository()) {
    return import.meta.env.MODE === 'test'
      ? readJsonArray(PEOPLE_STORAGE_KEY, isTicketPerson).map(normalizeStoredTicketPerson)
      : [];
  }

  const sqliteRecords = await loadTicketRestaurantePersonRecordsFromSqlite();
  if (!sqliteRecords || sqliteRecords.length === 0) return [];
  const people = parseTicketPersonRecords(sqliteRecords);
  updatePersonSqliteUpdatedAtMap(people);
  return people;
}

async function loadTicketAbsencesPreferringSqlite(): Promise<TicketRestaurantAbsence[]> {
  if (!hasTicketRestauranteAbsencesSqliteRepository()) {
    return import.meta.env.MODE === 'test'
      ? readJsonArray(ABSENCES_STORAGE_KEY, isTicketRestaurantAbsence)
      : [];
  }

  const sqliteRecords = await loadTicketRestauranteAbsenceRecordsFromSqlite();
  if (!sqliteRecords || sqliteRecords.length === 0) return [];
  const absences = parseTicketAbsenceRecords(sqliteRecords);
  updateAbsenceSqliteUpdatedAtMap(absences);
  return absences;
}

async function loadTicketConfigPreferringSqlite(): Promise<TicketRestaurantConfig> {
  if (!hasTicketRestauranteConfigSqliteRepository()) {
    return import.meta.env.MODE === 'test' ? readConfig() : DEFAULT_TICKET_RESTAURANT_CONFIG;
  }

  const sqliteRecord = await loadTicketRestauranteConfigRecordFromSqlite();
  if (sqliteRecord === null) {
    const seedResult = await saveTicketRestauranteConfigToSqlite(
      JSON.stringify(DEFAULT_TICKET_RESTAURANT_CONFIG),
      null,
    );
    if (seedResult?.ok && seedResult.currentUpdatedAt) {
      configSqliteUpdatedAt = seedResult.currentUpdatedAt;
      return DEFAULT_TICKET_RESTAURANT_CONFIG;
    }

    const seededRecord = await loadTicketRestauranteConfigRecordFromSqlite();
    if (seededRecord) {
      configSqliteUpdatedAt = seededRecord.updatedAt;
      try {
        const seededParsed = JSON.parse(seededRecord.value) as TicketRestaurantConfig;
        return normalizeTicketRestaurantConfig(seededParsed);
      } catch {
        return DEFAULT_TICKET_RESTAURANT_CONFIG;
      }
    }

    return DEFAULT_TICKET_RESTAURANT_CONFIG;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(sqliteRecord.value);
  } catch {
    parsed = null;
  }

  configSqliteUpdatedAt = sqliteRecord.updatedAt;
  if (!parsed || typeof parsed !== 'object') return DEFAULT_TICKET_RESTAURANT_CONFIG;
  return normalizeTicketRestaurantConfig(parsed as TicketRestaurantConfig);
}

async function loadTicketManutencionesPreferringSqlite(): Promise<TicketManutencion[]> {
  if (!hasTicketRestauranteManutencionesSqliteRepository()) {
    return import.meta.env.MODE === 'test'
      ? readJsonArray(MANUTENCIONES_STORAGE_KEY, isTicketManutencion).map((row) => normalizeStoredTicketManutencion(row))
      : [];
  }

  const sqliteRecords = await loadTicketRestauranteManutencionRecordsFromSqlite();
  if (!sqliteRecords || sqliteRecords.length === 0) return [];
  const manutenciones = parseTicketManutencionRecords(sqliteRecords);
  updateManutencionSqliteUpdatedAtMap(manutenciones);
  return manutenciones;
}

async function loadTicketRestauranteStateFromSqliteOrStorage(): Promise<TicketRestauranteSnapshot> {
  const [calendars, people, absences, config, manutenciones] = await Promise.all([
    loadTicketCalendarsPreferringSqlite(),
    loadTicketPeoplePreferringSqlite(),
    loadTicketAbsencesPreferringSqlite(),
    loadTicketConfigPreferringSqlite(),
    loadTicketManutencionesPreferringSqlite(),
  ]);
  return { calendars, absences, people, config, manutenciones };
}

function readTicketRestauranteSnapshot(): TicketRestauranteSnapshot {
  return {
    calendars: readJsonArray(CALENDARS_STORAGE_KEY, isTicketCalendar).map(
      normalizeStoredTicketCalendar,
    ),
    absences: readJsonArray(ABSENCES_STORAGE_KEY, isTicketRestaurantAbsence),
    people: readJsonArray(PEOPLE_STORAGE_KEY, isTicketPerson).map(normalizeStoredTicketPerson),
    config: readConfig(),
    manutenciones: readJsonArray(MANUTENCIONES_STORAGE_KEY, isTicketManutencion).map(
      (row) => normalizeStoredTicketManutencion(row),
    ),
  };
}

export const useTicketRestauranteStore = create<TicketRestauranteState>((set, get) => ({
  calendars: [],
  absences: [],
  people: [],
  config: DEFAULT_TICKET_RESTAURANT_CONFIG,
  manutenciones: [],
  load: () => {
    set(readTicketRestauranteSnapshot());
    void loadTicketRestauranteStateFromSqliteOrStorage()
      .then((nextSnapshot) => set(nextSnapshot))
      .catch((error) =>
        console.warn('Ticket Restaurante: no se ha podido cargar desde SQLite.', error),
      );
  },
  reloadFromStorage: () => {
    const syncSnapshot = readTicketRestauranteSnapshot();
    if (!areTicketSnapshotsEquivalent(get(), syncSnapshot)) {
      set(syncSnapshot);
    }
    void loadTicketRestauranteStateFromSqliteOrStorage()
      .then((nextSnapshot) => {
        if (!areTicketSnapshotsEquivalent(get(), nextSnapshot)) {
          set(nextSnapshot);
        }
      })
      .catch((error) =>
        console.warn('Ticket Restaurante: no se ha podido recargar desde SQLite.', error),
      );
  },
  createCalendar: async (draft) => {
    const id = createId('ticket-calendar');
    const state = get();
    const now = nowIso();
    const newCalendar = buildTicketCalendar(draft, now, id);

    if (hasTicketRestauranteCalendarsSqliteRepository()) {
      const saveResult = await saveTicketRestauranteCalendarToSqlite(
        newCalendar,
        JSON.stringify(newCalendar),
        null,
      );
      if (saveResult?.ok) {
        if (saveResult.currentUpdatedAt) {
          calendarSqliteUpdatedAt.set(id, saveResult.currentUpdatedAt);
        }
        const calendars = [...state.calendars, newCalendar];
        set({ calendars });
        return id;
      }
      console.warn(
        'Ticket Restaurante: no se ha podido crear el calendario en SQLite.',
        saveResult?.message,
      );
    }

    const calendars = [...state.calendars, newCalendar];
    commitTicketState(set, { calendars }, [[CALENDARS_STORAGE_KEY, calendars]]);
    return id;
  },
  updateCalendar: async (id, draft) => {
    const state = get();
    const updatedAt = nowIso();
    const previous = state.calendars.find((calendar) => calendar.id === id);
    const updatedCalendar = buildTicketCalendar(draft, updatedAt, id, previous);

    if (hasTicketRestauranteCalendarsSqliteRepository()) {
      const expectedUpdatedAt = calendarSqliteUpdatedAt.get(id) ?? null;
      const saveResult = await saveTicketRestauranteCalendarToSqlite(
        updatedCalendar,
        JSON.stringify(updatedCalendar),
        expectedUpdatedAt,
      );
      if (!saveResult) {
        // Sin repositorio disponible pese al check anterior (caso límite):
        // sigue con el camino localStorage más abajo.
      } else if (!saveResult.ok) {
        return {
          ok: false,
          message:
            saveResult.message ??
            'Este calendario ha sido modificado por otro usuario. Recarga antes de continuar.',
        };
      } else {
        if (saveResult.currentUpdatedAt) {
          calendarSqliteUpdatedAt.set(id, saveResult.currentUpdatedAt);
        }
        const calendars = state.calendars.map((calendar) =>
          calendar.id === id ? updatedCalendar : calendar,
        );
        set({ calendars });
        return { ok: true };
      }
    }

    const calendars = state.calendars.map((calendar) =>
      calendar.id === id ? updatedCalendar : calendar,
    );
    commitTicketState(set, { calendars }, [[CALENDARS_STORAGE_KEY, calendars]]);
    return { ok: true };
  },
  toggleCalendarActive: async (id) => {
    const state = get();
    const updatedAt = nowIso();
    const previous = state.calendars.find((calendar) => calendar.id === id);
    if (!previous) {
      return { ok: false, message: 'No se ha encontrado el calendario.' };
    }
    const updatedCalendar = { ...previous, activo: !previous.activo, updatedAt };

    if (hasTicketRestauranteCalendarsSqliteRepository()) {
      const expectedUpdatedAt = calendarSqliteUpdatedAt.get(id) ?? null;
      const saveResult = await saveTicketRestauranteCalendarToSqlite(
        updatedCalendar,
        JSON.stringify(updatedCalendar),
        expectedUpdatedAt,
      );
      if (saveResult) {
        if (!saveResult.ok) {
          return {
            ok: false,
            message:
              saveResult.message ??
              'Este calendario ha sido modificado por otro usuario. Recarga antes de continuar.',
          };
        }
        if (saveResult.currentUpdatedAt) {
          calendarSqliteUpdatedAt.set(id, saveResult.currentUpdatedAt);
        }
        const calendars = state.calendars.map((calendar) =>
          calendar.id === id ? updatedCalendar : calendar,
        );
        set({ calendars });
        return { ok: true };
      }
    }

    const calendars = state.calendars.map((calendar) =>
      calendar.id === id ? updatedCalendar : calendar,
    );
    commitTicketState(set, { calendars }, [[CALENDARS_STORAGE_KEY, calendars]]);
    return { ok: true };
  },
  removeCalendar: async (id) => {
    const state = get();
    const updatedAt = nowIso();
    const previous = state.calendars.find((calendar) => calendar.id === id);
    if (!previous) {
      return { ok: false, message: 'No se ha encontrado el calendario.' };
    }

    const removedCalendar = { ...previous, activo: false, updatedAt, deletedAt: updatedAt };
    const affectedPeople = state.people.filter(
      (person) => person.calendarId === id && !person.deletedAt,
    );
    const removedPeople = affectedPeople.map((person) => ({
      ...person,
      activo: false,
      updatedAt,
      deletedAt: updatedAt,
    }));

    if (hasTicketRestauranteCalendarsSqliteRepository()) {
      if (!hasTicketRestaurantePeopleSqliteRepository() || !hasAtomicTicketCalendarRemoval()) {
        return {
          ok: false,
          message:
            'La eliminación atómica de Ticket Restaurante no está disponible. Recarga o reinicia TrAcción antes de continuar.',
        };
      }

      const result = await removeTicketCalendarWithPeopleAtomically(
        {
          id,
          serializedValue: JSON.stringify(removedCalendar),
          expectedUpdatedAt: calendarSqliteUpdatedAt.get(id) ?? null,
        },
        removedPeople.map((person) => ({
          id: person.empleado,
          serializedValue: JSON.stringify(person),
          expectedUpdatedAt: personSqliteUpdatedAt.get(person.empleado) ?? null,
        })),
      );

      if (!result?.ok) {
        return {
          ok: false,
          message:
            result?.message ??
            'No se ha podido eliminar el calendario de Ticket Restaurante de forma atómica.',
        };
      }

      calendarSqliteUpdatedAt.delete(id);
      removedPeople.forEach((person) => personSqliteUpdatedAt.delete(person.empleado));
      const removedByEmployee = new Map(removedPeople.map((person) => [person.empleado, person]));
      const calendars = state.calendars.map((calendar) =>
        calendar.id === id ? removedCalendar : calendar,
      );
      const people = state.people.map((person) => removedByEmployee.get(person.empleado) ?? person);
      set({ calendars, people });
      return { ok: true };
    }

    const calendars = state.calendars.map((calendar) =>
      calendar.id === id ? removedCalendar : calendar,
    );
    const removedByEmployee = new Map(removedPeople.map((person) => [person.empleado, person]));
    const people = state.people.map((person) => removedByEmployee.get(person.empleado) ?? person);
    commitTicketState(set, { calendars, people }, [
      [CALENDARS_STORAGE_KEY, calendars],
      [PEOPLE_STORAGE_KEY, people],
    ]);
    return { ok: true };
  },
  toggleDay: async (calendarId, fecha) => {
    const state = get();
    const updatedAt = nowIso();
    const previous = state.calendars.find((calendar) => calendar.id === calendarId);
    if (!previous) {
      return { ok: false, message: 'No se ha encontrado el calendario.' };
    }
    const updatedCalendar = { ...toggleDiaSinTicket(previous, fecha), updatedAt };

    if (hasTicketRestauranteCalendarsSqliteRepository()) {
      const expectedUpdatedAt = calendarSqliteUpdatedAt.get(calendarId) ?? null;
      const saveResult = await saveTicketRestauranteCalendarToSqlite(
        updatedCalendar,
        JSON.stringify(updatedCalendar),
        expectedUpdatedAt,
      );
      if (saveResult) {
        if (!saveResult.ok) {
          return {
            ok: false,
            message:
              saveResult.message ??
              'Este calendario ha sido modificado por otro usuario. Recarga antes de continuar.',
          };
        }
        if (saveResult.currentUpdatedAt) {
          calendarSqliteUpdatedAt.set(calendarId, saveResult.currentUpdatedAt);
        }
        const calendars = state.calendars.map((calendar) =>
          calendar.id === calendarId ? updatedCalendar : calendar,
        );
        set({ calendars });
        return { ok: true };
      }
    }

    const calendars = state.calendars.map((calendar) =>
      calendar.id === calendarId ? updatedCalendar : calendar,
    );
    commitTicketState(set, { calendars }, [[CALENDARS_STORAGE_KEY, calendars]]);
    return { ok: true };
  },
  saveAbsences: async (absences) => {
    const state = get();

    if (hasTicketRestauranteAbsencesSqliteRepository()) {
      const now = nowIso();
      const nextIds = new Set(absences.map((absence) => absence.id));
      const removedAbsences = state.absences.filter(
        (absence) => !absence.deletedAt && !nextIds.has(absence.id),
      );
      const tombstones = removedAbsences.map((absence) => ({
        ...absence,
        updatedAt: now,
        deletedAt: now,
      }));

      const batchSaveResult = await saveTicketRestauranteAbsencesToSqlite(
        [...absences, ...tombstones].map((absence) => ({
          id: absence.id,
          serializedValue: JSON.stringify(absence),
          expectedUpdatedAt: absenceSqliteUpdatedAt.get(absence.id) ?? null,
        })),
      );

      if (batchSaveResult) {
        if (!batchSaveResult.ok) {
          return {
            ok: false,
            message:
              batchSaveResult.message ??
              'Alguna ausencia ha sido modificada por otro usuario. Recarga antes de continuar.',
          };
        }
        updateAbsenceSqliteUpdatedAtMap(absences);
        set({ absences });
        return { ok: true };
      }
    }
    commitTicketState(set, { absences }, [[ABSENCES_STORAGE_KEY, absences]]);
    return { ok: true };
  },
  removeAbsence: async (id) => {
    const state = get();
    const previous = state.absences.find((absence) => absence.id === id);
    if (!previous) {
      return { ok: false, message: 'No se ha encontrado la ausencia.' };
    }
    const updatedAt = nowIso();
    const removedAbsence = { ...previous, updatedAt, deletedAt: updatedAt };

    if (hasTicketRestauranteAbsencesSqliteRepository()) {
      const expectedUpdatedAt = absenceSqliteUpdatedAt.get(id) ?? null;
      const saveResult = await saveTicketRestauranteAbsenceToSqlite(
        removedAbsence,
        JSON.stringify(removedAbsence),
        expectedUpdatedAt,
      );
      if (saveResult) {
        if (!saveResult.ok) {
          return {
            ok: false,
            message:
              saveResult.message ??
              'Esta ausencia ha sido modificada por otro usuario. Recarga antes de continuar.',
          };
        }
        absenceSqliteUpdatedAt.delete(id);
        const absences = state.absences.filter((absence) => absence.id !== id);
        set({ absences });
        return { ok: true };
      }
    }

    const absences = state.absences.filter((absence) => absence.id !== id);
    commitTicketState(set, { absences }, [[ABSENCES_STORAGE_KEY, absences]]);
    return { ok: true };
  },
  upsertPerson: async (draft) => {
    const state = get();
    const now = nowIso();
    const previous = state.people.find(
      (person) =>
        normalizeTicketEmployeeNumber(person.empleado) ===
        normalizeTicketEmployeeNumber(draft.empleado),
    );
    const updatedPerson = buildTicketPerson(draft, now, previous);

    if (hasTicketRestaurantePeopleSqliteRepository()) {
      const expectedUpdatedAt = previous
        ? (personSqliteUpdatedAt.get(updatedPerson.empleado) ?? null)
        : null;
      const saveResult = await saveTicketRestaurantePersonToSqlite(
        { id: updatedPerson.empleado },
        JSON.stringify(updatedPerson),
        expectedUpdatedAt,
      );
      if (saveResult) {
        if (!saveResult.ok) {
          return {
            ok: false,
            message:
              saveResult.message ??
              'Esta persona ha sido modificada por otro usuario. Recarga antes de continuar.',
          };
        }
        if (saveResult.currentUpdatedAt) {
          personSqliteUpdatedAt.set(updatedPerson.empleado, saveResult.currentUpdatedAt);
        }
        const people = previous
          ? state.people.map((person) =>
              normalizeTicketEmployeeNumber(person.empleado) ===
              normalizeTicketEmployeeNumber(draft.empleado)
                ? updatedPerson
                : person,
            )
          : [...state.people, updatedPerson];
        set({ people });
        return { ok: true };
      }
    }

    const people = previous
      ? state.people.map((person) =>
          normalizeTicketEmployeeNumber(person.empleado) ===
          normalizeTicketEmployeeNumber(draft.empleado)
            ? updatedPerson
            : person,
        )
      : [...state.people, updatedPerson];
    commitTicketState(set, { people }, [[PEOPLE_STORAGE_KEY, people]]);
    return { ok: true };
  },
  importPeople: async (drafts) => {
    let result = { imported: 0, created: 0, updated: 0, unchanged: 0, createdCalendars: 0 };
    const state = get();
    const now = nowIso();
    const calendars = [...state.calendars];
    const newCalendars: TicketCalendar[] = [];
    const calendarIdByName = new Map(
      calendars
        .filter((calendar) => !calendar.deletedAt)
        .map((calendar) => [normalizeCalendarName(calendar.nombre), calendar.id]),
    );
    const peopleByEmployee = new Map(
      state.people.map((person) => [normalizeTicketEmployeeNumber(person.empleado), person]),
    );
    const updatedPeople: TicketPerson[] = [];

    const sameImportedPersonData = (first: TicketPerson, second: TicketPerson): boolean =>
      first.empleado === second.empleado &&
      first.nombre === second.nombre &&
      first.apellido1 === second.apellido1 &&
      first.apellido2 === second.apellido2 &&
      first.dni === second.dni &&
      first.nombreApellidos === second.nombreApellidos &&
      first.puesto === second.puesto &&
      first.calendarId === second.calendarId &&
      first.activo === second.activo &&
      first.deletedAt === second.deletedAt;

    drafts.forEach((draft) => {
      const empleado = normalizeTicketEmployeeNumber(draft.empleado);
      const normalizedCalendarName = normalizeCalendarName(draft.calendarName);
      let calendarId = draft.calendarId || calendarIdByName.get(normalizedCalendarName) || '';

      if (!calendarId) {
        calendarId = createId('ticket-calendar');
        const newCalendar = buildTicketCalendar(
          { nombre: draft.calendarName, activo: true, diasSinTicket: [] },
          now,
          calendarId,
        );
        calendars.push(newCalendar);
        newCalendars.push(newCalendar);
        calendarIdByName.set(normalizedCalendarName, calendarId);
        result = { ...result, createdCalendars: result.createdCalendars + 1 };
      }

      const previous = peopleByEmployee.get(empleado);
      const updatedPerson = buildTicketPerson({ ...draft, empleado, calendarId }, now, previous);
      result = { ...result, imported: result.imported + 1 };

      if (previous && sameImportedPersonData(previous, updatedPerson)) {
        result = { ...result, unchanged: result.unchanged + 1 };
        return;
      }

      peopleByEmployee.set(empleado, updatedPerson);
      updatedPeople.push(updatedPerson);
      result = previous
        ? { ...result, updated: result.updated + 1 }
        : { ...result, created: result.created + 1 };
    });

    const people = Array.from(peopleByEmployee.values());

    if (
      hasTicketRestauranteCalendarsSqliteRepository() &&
      hasTicketRestaurantePeopleSqliteRepository()
    ) {
      if (!hasAtomicTicketPeopleImport()) {
        return {
          ...result,
          ok: false,
          message:
            'La importación atómica de Ticket Restaurante no está disponible. Recarga o reinicia TrAcción antes de continuar.',
        };
      }

      const importResult = await importTicketPeopleAtomically(
        newCalendars.map((calendar) => ({
          id: calendar.id,
          serializedValue: JSON.stringify(calendar),
          expectedUpdatedAt: null,
        })),
        updatedPeople.map((person) => ({
          id: person.empleado,
          serializedValue: JSON.stringify(person),
          expectedUpdatedAt: personSqliteUpdatedAt.get(person.empleado) ?? null,
        })),
      );
      if (!importResult?.ok) {
        return {
          ...result,
          ok: false,
          message:
            importResult?.message ?? 'No se han podido importar las personas en SQLite de forma atómica.',
        };
      }

      updateCalendarSqliteUpdatedAtMap(calendars);
      updatePersonSqliteUpdatedAtMap(people);
      set({ calendars, people });
      return { ...result, ok: true };
    }
    commitTicketState(set, { calendars, people }, [
      [CALENDARS_STORAGE_KEY, calendars],
      [PEOPLE_STORAGE_KEY, people],
    ]);
    return { ...result, ok: true };
  },
  removePerson: async (empleado) => {
    const state = get();
    const previous = state.people.find(
      (person) =>
        normalizeTicketEmployeeNumber(person.empleado) === normalizeTicketEmployeeNumber(empleado),
    );
    if (!previous) {
      return { ok: false, message: 'No se ha encontrado la persona.' };
    }

    if (hasTicketRestaurantePeopleSqliteRepository()) {
      const now = nowIso();
      const removedPerson = { ...previous, updatedAt: now, deletedAt: now };
      const expectedUpdatedAt = personSqliteUpdatedAt.get(previous.empleado) ?? null;
      const saveResult = await saveTicketRestaurantePersonToSqlite(
        { id: previous.empleado },
        JSON.stringify(removedPerson),
        expectedUpdatedAt,
      );
      if (saveResult) {
        if (!saveResult.ok) {
          return {
            ok: false,
            message:
              saveResult.message ??
              'Esta persona ha sido modificada por otro usuario. Recarga antes de continuar.',
          };
        }
        personSqliteUpdatedAt.delete(previous.empleado);
        const people = state.people.filter(
          (person) =>
            normalizeTicketEmployeeNumber(person.empleado) !==
            normalizeTicketEmployeeNumber(empleado),
        );
        set({ people });
        return { ok: true };
      }
    }

    const people = state.people.filter(
      (person) =>
        normalizeTicketEmployeeNumber(person.empleado) !== normalizeTicketEmployeeNumber(empleado),
    );
    commitTicketState(set, { people }, [[PEOPLE_STORAGE_KEY, people]]);
    return { ok: true };
  },
  updateConfig: async (config) => {
    if (hasTicketRestauranteConfigSqliteRepository()) {
      const saveResult = await saveTicketRestauranteConfigToSqlite(
        JSON.stringify(config),
        configSqliteUpdatedAt,
      );
      if (saveResult) {
        if (!saveResult.ok) {
          return {
            ok: false,
            message:
              saveResult.message ??
              'La configuración ha sido modificada por otro usuario. Recarga antes de continuar.',
          };
        }
        if (saveResult.currentUpdatedAt) {
          configSqliteUpdatedAt = saveResult.currentUpdatedAt;
        }
        set({ config });
        return { ok: true };
      }
    }
    commitTicketState(set, { config }, [[CONFIG_STORAGE_KEY, config]]);
    return { ok: true };
  },
  saveManutenciones: async (drafts) => {
    const state = get();
    const now = nowIso();
    const result = state.manutenciones.filter((row) => !row.deletedAt).map((row) => ({ ...row }));
    const existingKeys = new Set(
      result.map(
        (row) => `${row.empleado}|${row.fechaGasto}|${row.imputacionYear}|${row.imputacionMonth}`,
      ),
    );
    const newRows: TicketManutencion[] = [];

    drafts.forEach((draft) => {
      const key = `${draft.empleado}|${draft.fechaGasto}|${draft.imputacionYear}|${draft.imputacionMonth}`;
      if (existingKeys.has(key)) {
        return;
      }
      existingKeys.add(key);
      const row = buildTicketManutencion(
        draft,
        now,
        `ticket-manutencion-${draft.empleado}-${draft.fechaGasto}-${result.length + newRows.length + 1}`,
      );
      newRows.push(row);
    });

    const manutenciones = [...result, ...newRows];

    if (hasTicketRestauranteManutencionesSqliteRepository()) {
      const saveResult = await saveTicketRestauranteManutencionesToSqlite(
        newRows.map((row) => ({
          id: row.id,
          serializedValue: JSON.stringify(row),
          expectedUpdatedAt: null,
        })),
      );
      if (!saveResult) {
        // Sin repositorio disponible pese al check anterior (caso límite):
        // sigue con el camino localStorage más abajo.
      } else if (!saveResult.ok) {
        return {
          ok: false,
          message:
            saveResult.message ??
            'No se han podido guardar las manutenciones. Recarga antes de continuar.',
        };
      } else {
        const reloadedRecords = await loadTicketRestauranteManutencionRecordsFromSqlite();
        if (reloadedRecords) {
          const reloadedManutenciones = parseTicketManutencionRecords(reloadedRecords);
          updateManutencionSqliteUpdatedAtMap(reloadedManutenciones);
          set({ manutenciones: reloadedManutenciones });
        } else {
          newRows.forEach((row) => manutencionSqliteUpdatedAt.set(row.id, row.updatedAt));
          set({ manutenciones });
        }
        return { ok: true };
      }
    }

    commitTicketState(set, { manutenciones }, [[MANUTENCIONES_STORAGE_KEY, manutenciones]]);
    return { ok: true };
  },
  removeManutencion: async (id) => {
    const state = get();
    const updatedAt = nowIso();
    const previous = state.manutenciones.find((row) => row.id === id);
    if (!previous) {
      return { ok: false, message: 'No se ha encontrado la manutención.' };
    }
    const manutenciones = state.manutenciones.map((row) =>
      row.id === id ? { ...row, updatedAt, deletedAt: updatedAt } : row,
    );

    if (hasTicketRestauranteManutencionesSqliteRepository()) {
      const removedRow = { ...previous, updatedAt, deletedAt: updatedAt };
      const expectedUpdatedAt = manutencionSqliteUpdatedAt.get(id) ?? null;
      const saveResult = await saveTicketRestauranteManutencionToSqlite(
        { id },
        JSON.stringify(removedRow),
        expectedUpdatedAt,
      );
      if (saveResult) {
        if (!saveResult.ok) {
          return {
            ok: false,
            message:
              saveResult.message ??
              'Esta manutención ha sido modificada por otro usuario. Recarga antes de continuar.',
          };
        }
        if (saveResult.currentUpdatedAt) {
          manutencionSqliteUpdatedAt.set(id, saveResult.currentUpdatedAt);
        }
        set({ manutenciones });
        return { ok: true };
      }
    }

    commitTicketState(set, { manutenciones }, [[MANUTENCIONES_STORAGE_KEY, manutenciones]]);
    return { ok: true };
  },
}));
import { create } from 'zustand';
import {
  buildTicketCalendar,
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

const CALENDARS_STORAGE_KEY = 'traccion.v1.ticketRestaurante.calendars';
const ABSENCES_STORAGE_KEY = 'traccion.v1.ticketRestaurante.absences';
const PEOPLE_STORAGE_KEY = 'traccion.v1.ticketRestaurante.people';
const CONFIG_STORAGE_KEY = 'traccion.v1.ticketRestaurante.config';

interface TicketRestauranteState {
  calendars: TicketCalendar[];
  absences: TicketRestaurantAbsence[];
  people: TicketPerson[];
  config: TicketRestaurantConfig;
  load: () => void;
  createCalendar: (draft: TicketCalendarDraft) => string;
  updateCalendar: (id: string, draft: TicketCalendarDraft) => void;
  toggleCalendarActive: (id: string) => void;
  removeCalendar: (id: string) => void;
  toggleDay: (calendarId: string, fecha: string) => void;
  saveAbsences: (absences: TicketRestaurantAbsence[]) => void;
  removeAbsence: (id: string) => void;
  upsertPerson: (draft: TicketPersonDraft) => void;
  importPeople: (drafts: TicketPeopleImportDraft[]) => { imported: number; createdCalendars: number };
  removePerson: (empleado: string) => void;
  updateConfig: (config: TicketRestaurantConfig) => void;
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

function readJsonArray<T>(storageKey: string, guard: (value: unknown) => value is T): T[] {
  const stored = window.localStorage.getItem(storageKey);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(guard);
}


function normalizeStoredTicketPerson(person: TicketPerson): TicketPerson {
  const nombreApellidos = person.nombreApellidos || [person.nombre, person.apellido1, person.apellido2]
    .filter(Boolean)
    .join(' ')
    .trim();
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
  const stored = window.localStorage.getItem(CONFIG_STORAGE_KEY);
  if (!stored) {
    return DEFAULT_TICKET_RESTAURANT_CONFIG;
  }

  const parsed: unknown = JSON.parse(stored);
  if (!parsed || typeof parsed !== 'object') {
    return DEFAULT_TICKET_RESTAURANT_CONFIG;
  }

  const candidate = parsed as Partial<TicketRestaurantConfig>;
  return {
    importeTicket:
      typeof candidate.importeTicket === 'number' && candidate.importeTicket >= 0
        ? candidate.importeTicket
        : DEFAULT_TICKET_RESTAURANT_CONFIG.importeTicket,
    pedidoMensual:
      typeof candidate.pedidoMensual === 'number' && candidate.pedidoMensual >= 0
        ? candidate.pedidoMensual
        : DEFAULT_TICKET_RESTAURANT_CONFIG.pedidoMensual,
  };
}

function persist<T>(storageKey: string, value: T): void {
  window.localStorage.setItem(storageKey, JSON.stringify(value));
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}`;
}

export const useTicketRestauranteStore = create<TicketRestauranteState>((set) => ({
  calendars: [],
  absences: [],
  people: [],
  config: DEFAULT_TICKET_RESTAURANT_CONFIG,
  load: () => {
    set({
      calendars: readJsonArray(CALENDARS_STORAGE_KEY, isTicketCalendar),
      absences: readJsonArray(ABSENCES_STORAGE_KEY, isTicketRestaurantAbsence),
      people: readJsonArray(PEOPLE_STORAGE_KEY, isTicketPerson).map(normalizeStoredTicketPerson),
      config: readConfig(),
    });
  },
  createCalendar: (draft) => {
    const id = createId('ticket-calendar');
    set((state) => {
      const calendars = [...state.calendars, buildTicketCalendar(draft, nowIso(), id)];
      persist(CALENDARS_STORAGE_KEY, calendars);
      return { calendars };
    });
    return id;
  },
  updateCalendar: (id, draft) => {
    set((state) => {
      const updatedAt = nowIso();
      const calendars = state.calendars.map((calendar) =>
        calendar.id === id ? buildTicketCalendar(draft, updatedAt, id, calendar) : calendar,
      );
      persist(CALENDARS_STORAGE_KEY, calendars);
      return { calendars };
    });
  },
  toggleCalendarActive: (id) => {
    set((state) => {
      const updatedAt = nowIso();
      const calendars = state.calendars.map((calendar) =>
        calendar.id === id ? { ...calendar, activo: !calendar.activo, updatedAt } : calendar,
      );
      persist(CALENDARS_STORAGE_KEY, calendars);
      return { calendars };
    });
  },
  removeCalendar: (id) => {
    set((state) => {
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
      persist(CALENDARS_STORAGE_KEY, calendars);
      persist(PEOPLE_STORAGE_KEY, people);
      return { calendars, people };
    });
  },
  toggleDay: (calendarId, fecha) => {
    set((state) => {
      const updatedAt = nowIso();
      const calendars = state.calendars.map((calendar) =>
        calendar.id === calendarId
          ? { ...toggleDiaSinTicket(calendar, fecha), updatedAt }
          : calendar,
      );
      persist(CALENDARS_STORAGE_KEY, calendars);
      return { calendars };
    });
  },
  saveAbsences: (absences) => {
    persist(ABSENCES_STORAGE_KEY, absences);
    set({ absences });
  },
  removeAbsence: (id) => {
    set((state) => {
      const updatedAt = nowIso();
      const absences = state.absences.map((absence) =>
        absence.id === id ? { ...absence, updatedAt, deletedAt: updatedAt } : absence,
      );
      persist(ABSENCES_STORAGE_KEY, absences);
      return { absences };
    });
  },
  upsertPerson: (draft) => {
    set((state) => {
      const now = nowIso();
      const previous = state.people.find((person) => person.empleado === draft.empleado);
      const people = previous
        ? state.people.map((person) =>
            person.empleado === draft.empleado ? buildTicketPerson(draft, now, person) : person,
          )
        : [...state.people, buildTicketPerson(draft, now)];
      persist(PEOPLE_STORAGE_KEY, people);
      return { people };
    });
  },

  importPeople: (drafts) => {
    let result = { imported: 0, createdCalendars: 0 };
    set((state) => {
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
        peopleByEmployee.set(
          draft.empleado,
          buildTicketPerson({ ...draft, calendarId }, now, previous),
        );
        result = { ...result, imported: result.imported + 1 };
      });

      const people = Array.from(peopleByEmployee.values());
      persist(CALENDARS_STORAGE_KEY, calendars);
      persist(PEOPLE_STORAGE_KEY, people);
      return { calendars, people };
    });
    return result;
  },
  removePerson: (empleado) => {
    set((state) => {
      const people = state.people.filter((person) => person.empleado !== empleado);
      persist(PEOPLE_STORAGE_KEY, people);
      return { people };
    });
  },
  updateConfig: (config) => {
    persist(CONFIG_STORAGE_KEY, config);
    set({ config });
  },
}));

import { create } from 'zustand';
import {
  assignPersonaCalendario,
  buildTicketCalendar,
  removePersonaCalendario,
  type PersonaCalendario,
  type TicketCalendar,
  type TicketCalendarDraft,
} from '../domain/ticketRestaurante';

const CALENDARS_STORAGE_KEY = 'traccion.v1.ticketRestaurante.calendars';
const ASSIGNMENTS_STORAGE_KEY = 'traccion.v1.ticketRestaurante.assignments';

interface TicketRestauranteState {
  calendars: TicketCalendar[];
  assignments: PersonaCalendario[];
  load: () => void;
  createCalendar: (draft: TicketCalendarDraft) => void;
  updateCalendar: (id: string, draft: TicketCalendarDraft) => void;
  deactivateCalendar: (id: string) => void;
  removeCalendar: (id: string) => void;
  assignCalendar: (empleado: string, calendarId: string) => void;
  removeAssignment: (empleado: string) => void;
}

function isDiaTicket(value: unknown): value is TicketCalendar['diasTicket'][number] {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TicketCalendar['diasTicket'][number]>;
  return typeof candidate.fecha === 'string' && typeof candidate.tieneTicket === 'boolean';
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
    Array.isArray(candidate.diasTicket) &&
    candidate.diasTicket.every(isDiaTicket) &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    (typeof candidate.deletedAt === 'string' || candidate.deletedAt === null)
  );
}

function isPersonaCalendario(value: unknown): value is PersonaCalendario {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PersonaCalendario>;
  return (
    typeof candidate.empleado === 'string' &&
    typeof candidate.calendarId === 'string' &&
    typeof candidate.createdAt === 'string'
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

function persist(calendars: TicketCalendar[], assignments: PersonaCalendario[]): void {
  window.localStorage.setItem(CALENDARS_STORAGE_KEY, JSON.stringify(calendars));
  window.localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(assignments));
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `ticket-calendar-${Date.now()}`;
}

export const useTicketRestauranteStore = create<TicketRestauranteState>((set) => ({
  calendars: [],
  assignments: [],
  load: () => {
    set({
      calendars: readJsonArray(CALENDARS_STORAGE_KEY, isTicketCalendar),
      assignments: readJsonArray(ASSIGNMENTS_STORAGE_KEY, isPersonaCalendario),
    });
  },
  createCalendar: (draft) => {
    set((state) => {
      const calendars = [...state.calendars, buildTicketCalendar(draft, nowIso(), createId())];
      persist(calendars, state.assignments);
      return { calendars };
    });
  },
  updateCalendar: (id, draft) => {
    set((state) => {
      const updatedAt = nowIso();
      const calendars = state.calendars.map((calendar) =>
        calendar.id === id ? buildTicketCalendar(draft, updatedAt, id, calendar) : calendar,
      );
      persist(calendars, state.assignments);
      return { calendars };
    });
  },
  deactivateCalendar: (id) => {
    set((state) => {
      const updatedAt = nowIso();
      const calendars = state.calendars.map((calendar) =>
        calendar.id === id ? { ...calendar, activo: false, updatedAt } : calendar,
      );
      persist(calendars, state.assignments);
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
      persist(calendars, state.assignments);
      return { calendars };
    });
  },
  assignCalendar: (empleado, calendarId) => {
    set((state) => {
      const assignments = assignPersonaCalendario(
        state.assignments,
        empleado,
        calendarId,
        nowIso(),
      );
      persist(state.calendars, assignments);
      return { assignments };
    });
  },
  removeAssignment: (empleado) => {
    set((state) => {
      const assignments = removePersonaCalendario(state.assignments, empleado);
      persist(state.calendars, assignments);
      return { assignments };
    });
  },
}));

import { create } from 'zustand';
import {
  buildTicketCalendar,
  toggleDiaSinTicket,
  type TicketCalendar,
  type TicketCalendarDraft,
} from '../domain/ticketRestaurante';

const CALENDARS_STORAGE_KEY = 'traccion.v1.ticketRestaurante.calendars';

interface TicketRestauranteState {
  calendars: TicketCalendar[];
  load: () => void;
  createCalendar: (draft: TicketCalendarDraft) => string;
  updateCalendar: (id: string, draft: TicketCalendarDraft) => void;
  toggleCalendarActive: (id: string) => void;
  removeCalendar: (id: string) => void;
  toggleDay: (calendarId: string, fecha: string) => void;
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

function readCalendars(): TicketCalendar[] {
  const stored = window.localStorage.getItem(CALENDARS_STORAGE_KEY);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isTicketCalendar);
}

function persist(calendars: TicketCalendar[]): void {
  window.localStorage.setItem(CALENDARS_STORAGE_KEY, JSON.stringify(calendars));
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
  load: () => {
    set({ calendars: readCalendars() });
  },
  createCalendar: (draft) => {
    const id = createId('ticket-calendar');
    set((state) => {
      const calendars = [...state.calendars, buildTicketCalendar(draft, nowIso(), id)];
      persist(calendars);
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
      persist(calendars);
      return { calendars };
    });
  },
  toggleCalendarActive: (id) => {
    set((state) => {
      const updatedAt = nowIso();
      const calendars = state.calendars.map((calendar) =>
        calendar.id === id ? { ...calendar, activo: !calendar.activo, updatedAt } : calendar,
      );
      persist(calendars);
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
      persist(calendars);
      return { calendars };
    });
  },
  toggleDay: (calendarId, fecha) => {
    set((state) => {
      const updatedAt = nowIso();
      const calendars = state.calendars.map((calendar) =>
        calendar.id === calendarId ? { ...toggleDiaSinTicket(calendar, fecha), updatedAt } : calendar,
      );
      persist(calendars);
      return { calendars };
    });
  },
}));

import { create } from 'zustand';
import {
  buildEspecialEvent,
  buildEspecialRecipient,
  type EspecialEvent,
  type EspecialEventDraft,
  type EspecialRecipient,
  type EspecialRecipientDraft,
  type EspecialRecipientType,
} from '../domain/especiales';

const EVENTS_STORAGE_KEY = 'traccion.v1.especiales.events';
const RECIPIENTS_STORAGE_KEY = 'traccion.v1.especiales.recipients';

interface EspecialesState {
  events: EspecialEvent[];
  recipients: EspecialRecipient[];
  load: () => void;
  createEvent: (draft: EspecialEventDraft) => string;
  updateEvent: (id: string, draft: EspecialEventDraft) => void;
  removeEvent: (id: string) => void;
  createRecipient: (draft: EspecialRecipientDraft) => void;
  updateRecipient: (id: string, draft: EspecialRecipientDraft) => void;
  removeRecipient: (id: string) => void;
}

function isEspecialRecipientType(value: unknown): value is EspecialRecipientType {
  return value === 'para' || value === 'cc';
}

function isEspecialEvent(value: unknown): value is EspecialEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<EspecialEvent>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.evento === 'string' &&
    typeof candidate.fecha === 'string' &&
    typeof candidate.hora === 'string' &&
    typeof candidate.enlace === 'string' &&
    typeof candidate.ruta === 'string' &&
    typeof candidate.observaciones === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    (typeof candidate.deletedAt === 'string' || candidate.deletedAt === null)
  );
}

function isEspecialRecipient(value: unknown): value is EspecialRecipient {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<EspecialRecipient>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.nombre === 'string' &&
    typeof candidate.email === 'string' &&
    isEspecialRecipientType(candidate.tipo) &&
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

function persist(events: EspecialEvent[], recipients: EspecialRecipient[]): void {
  window.localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(events));
  window.localStorage.setItem(RECIPIENTS_STORAGE_KEY, JSON.stringify(recipients));
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}`;
}

export const useEspecialesStore = create<EspecialesState>((set) => ({
  events: [],
  recipients: [],
  load: () => {
    set({
      events: readJsonArray(EVENTS_STORAGE_KEY, isEspecialEvent),
      recipients: readJsonArray(RECIPIENTS_STORAGE_KEY, isEspecialRecipient),
    });
  },
  createEvent: (draft) => {
    const id = createId('especial-event');
    set((state) => {
      const events = [...state.events, buildEspecialEvent(draft, nowIso(), id)];
      persist(events, state.recipients);
      return { events };
    });
    return id;
  },
  updateEvent: (id, draft) => {
    set((state) => {
      const updatedAt = nowIso();
      const events = state.events.map((event) =>
        event.id === id ? buildEspecialEvent(draft, updatedAt, id, event) : event,
      );
      persist(events, state.recipients);
      return { events };
    });
  },
  removeEvent: (id) => {
    set((state) => {
      const updatedAt = nowIso();
      const events = state.events.map((event) =>
        event.id === id ? { ...event, updatedAt, deletedAt: updatedAt } : event,
      );
      persist(events, state.recipients);
      return { events };
    });
  },
  createRecipient: (draft) => {
    set((state) => {
      const recipients = [
        ...state.recipients,
        buildEspecialRecipient(draft, nowIso(), createId('especial-recipient')),
      ];
      persist(state.events, recipients);
      return { recipients };
    });
  },
  updateRecipient: (id, draft) => {
    set((state) => {
      const updatedAt = nowIso();
      const recipients = state.recipients.map((recipient) =>
        recipient.id === id ? buildEspecialRecipient(draft, updatedAt, id, recipient) : recipient,
      );
      persist(state.events, recipients);
      return { recipients };
    });
  },
  removeRecipient: (id) => {
    set((state) => {
      const updatedAt = nowIso();
      const recipients = state.recipients.map((recipient) =>
        recipient.id === id ? { ...recipient, updatedAt, deletedAt: updatedAt } : recipient,
      );
      persist(state.events, recipients);
      return { recipients };
    });
  },
}));

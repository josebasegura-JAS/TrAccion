import { create } from 'zustand';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import {
  buildEspecialRecipient,
  isValidEmail,
  normalizeEmail,
  normalizeRecipientType,
  type EspecialRecipient,
  type EspecialRecipientDraft,
  type EspecialRecipientType,
} from '../domain/especiales';

const RECIPIENTS_STORAGE_KEY = 'rrll_especiales_destinatarios';

interface EspecialesState {
  recipients: EspecialRecipient[];
  load: () => void;
  reloadFromStorage: () => void;
  createRecipient: (draft: EspecialRecipientDraft) => { ok: boolean; message?: string };
  updateRecipient: (id: string, draft: EspecialRecipientDraft) => { ok: boolean; message?: string };
  removeRecipient: (id: string) => void;
}

function isEspecialRecipientType(value: unknown): value is EspecialRecipientType {
  return value === 'to' || value === 'cc' || value === 'para';
}

function isLegacyRecipient(value: unknown): value is {
  id?: string;
  name?: string;
  nombre?: string;
  email?: string;
  type?: string;
  tipo?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
} {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.email === 'string';
}

function normalizeStoredRecipient(value: unknown): EspecialRecipient | null {
  if (!isLegacyRecipient(value)) {
    return null;
  }

  const now = new Date().toISOString();
  const email = value.email?.trim() ?? '';
  if (!isValidEmail(email)) {
    return null;
  }

  return {
    id: value.id || createId('especial-recipient'),
    name: value.name || value.nombre || '',
    email,
    type: normalizeRecipientType(isEspecialRecipientType(value.type) ? value.type : value.tipo),
    createdAt: value.createdAt || now,
    updatedAt: value.updatedAt || now,
    deletedAt: value.deletedAt ?? null,
  };
}

function readRecipients(): EspecialRecipient[] {
  const stored = readStorageItem(RECIPIENTS_STORAGE_KEY);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map(normalizeStoredRecipient).filter((recipient): recipient is EspecialRecipient => !!recipient);
}

function persist(recipients: EspecialRecipient[]): void {
  writeStorageItem(RECIPIENTS_STORAGE_KEY, JSON.stringify(recipients));
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function duplicatedEmail(
  recipients: EspecialRecipient[],
  email: string,
  editingId?: string,
): EspecialRecipient | undefined {
  const normalized = normalizeEmail(email);
  return recipients.find(
    (recipient) =>
      !recipient.deletedAt && normalizeEmail(recipient.email) === normalized && recipient.id !== editingId,
  );
}

export const useEspecialesStore = create<EspecialesState>((set) => ({
  recipients: [],
  load: () => {
    set({ recipients: readRecipients() });
  },
  reloadFromStorage: () => {
    set({ recipients: readRecipients() });
  },
  createRecipient: (draft) => {
    const name = draft.name.trim();
    const email = draft.email.trim();
    if (!name) {
      return { ok: false, message: 'Debes indicar un nombre.' };
    }
    if (!isValidEmail(email)) {
      return { ok: false, message: 'El email no tiene un formato válido.' };
    }

    let result: { ok: boolean; message?: string } = { ok: true };
    set((state) => {
      const duplicate = duplicatedEmail(state.recipients, email);
      if (duplicate) {
        const duplicateType = duplicate.type === 'to' ? 'Para' : 'CC';
        result = {
          ok: false,
          message: `Este email ya existe en ${duplicateType}. No se permiten duplicados entre Para y CC.`,
        };
        return state;
      }

      const recipients = [
        ...state.recipients,
        buildEspecialRecipient(draft, nowIso(), createId('especial-recipient')),
      ];
      persist(recipients);
      return { recipients };
    });
    return result;
  },
  updateRecipient: (id, draft) => {
    const name = draft.name.trim();
    const email = draft.email.trim();
    if (!name) {
      return { ok: false, message: 'Debes indicar un nombre.' };
    }
    if (!isValidEmail(email)) {
      return { ok: false, message: 'El email no tiene un formato válido.' };
    }

    let result: { ok: boolean; message?: string } = { ok: true };
    set((state) => {
      const duplicate = duplicatedEmail(state.recipients, email, id);
      if (duplicate) {
        const duplicateType = duplicate.type === 'to' ? 'Para' : 'CC';
        result = {
          ok: false,
          message: `Este email ya existe en ${duplicateType}. No se permiten duplicados entre Para y CC.`,
        };
        return state;
      }

      const updatedAt = nowIso();
      const recipients = state.recipients.map((recipient) =>
        recipient.id === id ? buildEspecialRecipient(draft, updatedAt, id, recipient) : recipient,
      );
      persist(recipients);
      return { recipients };
    });
    return result;
  },
  removeRecipient: (id) => {
    set((state) => {
      const updatedAt = nowIso();
      const recipients = state.recipients.map((recipient) =>
        recipient.id === id ? { ...recipient, updatedAt, deletedAt: updatedAt } : recipient,
      );
      persist(recipients);
      return { recipients };
    });
  },
}));

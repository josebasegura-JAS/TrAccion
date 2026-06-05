import { create } from 'zustand';
import { EMPTY_PETICION_FILTERS, type PeticionFilters } from '../domain/filters';
import {
  EMPTY_PETICION_DRAFT,
  PETICION_PRIORITIES,
  PETICION_STATES,
  type Peticion,
  type PeticionDraft,
  type PeticionSeguimientoEntry,
} from '../domain/peticion';

const STORAGE_KEY = 'traccion.v1.peticiones.peticiones';

interface PeticionStateStore {
  peticiones: Peticion[];
  selectedPeticionId: string;
  filters: PeticionFilters;
  load: () => void;
  create: (draft: PeticionDraft, seguimientoText?: string) => void;
  update: (id: string, draft: PeticionDraft, seguimientoText?: string) => void;
  remove: (id: string) => void;
  selectPeticion: (peticionId: string) => void;
  setFilter: <K extends keyof PeticionFilters>(key: K, value: PeticionFilters[K]) => void;
}

function isPeticionSeguimientoEntry(value: unknown): value is PeticionSeguimientoEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof PeticionSeguimientoEntry, unknown>>;
  return typeof candidate.fechaHora === 'string' && typeof candidate.texto === 'string';
}

function isPeticion(value: unknown): value is Peticion {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof Peticion, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.titulo === 'string' &&
    typeof candidate.descripcion === 'string' &&
    typeof candidate.estado === 'string' &&
    (PETICION_STATES as readonly string[]).includes(candidate.estado) &&
    typeof candidate.prioridad === 'string' &&
    (PETICION_PRIORITIES as readonly string[]).includes(candidate.prioridad)
  );
}

function normalizePeticion(peticion: Peticion): Peticion {
  const updatedAt = peticion.updatedAt ?? peticion.createdAt;
  const seguimiento = Array.isArray(peticion.seguimiento)
    ? peticion.seguimiento
        .filter(isPeticionSeguimientoEntry)
        .sort((first, second) => second.fechaHora.localeCompare(first.fechaHora))
    : [];

  return {
    id: peticion.id,
    titulo: peticion.titulo,
    descripcion: peticion.descripcion,
    estado: peticion.estado,
    prioridad: peticion.prioridad,
    fechaLimite: peticion.fechaLimite ?? EMPTY_PETICION_DRAFT.fechaLimite,
    solicitante: peticion.solicitante ?? EMPTY_PETICION_DRAFT.solicitante,
    sindicato: peticion.sindicato ?? EMPTY_PETICION_DRAFT.sindicato,
    observaciones: peticion.observaciones ?? EMPTY_PETICION_DRAFT.observaciones,
    seguimiento,
    createdAt: peticion.createdAt,
    updatedAt,
    deletedAt: peticion.deletedAt ?? null,
    closedAt: peticion.closedAt ?? (peticion.estado === 'cerrada' ? updatedAt : null),
  };
}

function readPeticiones(): Peticion[] {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isPeticion).map(normalizePeticion);
}

function persistPeticiones(peticiones: Peticion[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(peticiones));
}

function firstActivePeticionId(peticiones: Peticion[]): string {
  return (
    peticiones.find((peticion) => !peticion.deletedAt && peticion.estado !== 'cerrada')?.id ?? ''
  );
}

function createPeticionId(): string {
  return `peticion-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSeguimiento(text: string | undefined, fechaHora: string): PeticionSeguimientoEntry[] {
  const trimmedText = text?.trim();
  return trimmedText ? [{ fechaHora, texto: trimmedText }] : [];
}

function resolveClosedAt(
  peticion: Peticion,
  draft: PeticionDraft,
  fechaHora: string,
): string | null {
  if (draft.estado !== 'cerrada') {
    return null;
  }

  return peticion.estado === 'cerrada' ? (peticion.closedAt ?? fechaHora) : fechaHora;
}

export const usePeticionStore = create<PeticionStateStore>((set) => ({
  peticiones: [],
  selectedPeticionId: '',
  filters: EMPTY_PETICION_FILTERS,
  load: () => {
    const peticiones = readPeticiones();
    set({ peticiones, selectedPeticionId: firstActivePeticionId(peticiones) });
  },
  create: (draft, seguimientoText) => {
    set((state) => {
      const now = new Date().toISOString();
      const peticion: Peticion = {
        id: createPeticionId(),
        ...draft,
        seguimiento: buildSeguimiento(seguimientoText, now),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        closedAt: draft.estado === 'cerrada' ? now : null,
      };
      const peticiones = [...state.peticiones, peticion];
      persistPeticiones(peticiones);
      return {
        peticiones,
        selectedPeticionId:
          peticion.estado === 'cerrada' ? firstActivePeticionId(peticiones) : peticion.id,
      };
    });
  },
  update: (id, draft, seguimientoText) => {
    set((state) => {
      const now = new Date().toISOString();
      const peticiones = state.peticiones.map((peticion) => {
        if (peticion.id !== id) {
          return peticion;
        }

        return {
          ...peticion,
          ...draft,
          seguimiento: [...buildSeguimiento(seguimientoText, now), ...peticion.seguimiento],
          updatedAt: now,
          closedAt: resolveClosedAt(peticion, draft, now),
        };
      });
      persistPeticiones(peticiones);
      const updatedPeticion = peticiones.find((peticion) => peticion.id === id);
      return {
        peticiones,
        selectedPeticionId:
          updatedPeticion?.estado === 'cerrada' ? firstActivePeticionId(peticiones) : id,
      };
    });
  },
  remove: (id) => {
    set((state) => {
      const now = new Date().toISOString();
      const peticiones = state.peticiones.map((peticion) =>
        peticion.id === id ? { ...peticion, deletedAt: now, updatedAt: now } : peticion,
      );
      persistPeticiones(peticiones);
      return { peticiones, selectedPeticionId: firstActivePeticionId(peticiones) };
    });
  },
  selectPeticion: (peticionId) => set({ selectedPeticionId: peticionId }),
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
}));

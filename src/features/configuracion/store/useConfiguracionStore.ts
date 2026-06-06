import { create } from 'zustand';
import { normalizeTemplatePath } from '../domain/teletrabajoTemplate';

const STORAGE_KEY = 'traccion.v1.configuracion';

interface ConfiguracionState {
  rutaPlantillaTeletrabajo: string;
}

interface ConfiguracionStore extends ConfiguracionState {
  load: () => void;
  setRutaPlantillaTeletrabajo: (ruta: string) => void;
}

function isConfiguracionState(value: unknown): value is ConfiguracionState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof ConfiguracionState, unknown>>;
  return typeof candidate.rutaPlantillaTeletrabajo === 'string';
}

function readConfiguracion(): ConfiguracionState {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return { rutaPlantillaTeletrabajo: '' };
  }

  const parsed: unknown = JSON.parse(stored);
  if (!isConfiguracionState(parsed)) {
    return { rutaPlantillaTeletrabajo: '' };
  }

  return { rutaPlantillaTeletrabajo: normalizeTemplatePath(parsed.rutaPlantillaTeletrabajo) };
}

function persistConfiguracion(configuracion: ConfiguracionState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(configuracion));
}

export const useConfiguracionStore = create<ConfiguracionStore>((set) => ({
  rutaPlantillaTeletrabajo: readConfiguracion().rutaPlantillaTeletrabajo,
  load: () => set(readConfiguracion()),
  setRutaPlantillaTeletrabajo: (ruta) =>
    set(() => {
      const configuracion = { rutaPlantillaTeletrabajo: normalizeTemplatePath(ruta) };
      persistConfiguracion(configuracion);
      return configuracion;
    }),
}));

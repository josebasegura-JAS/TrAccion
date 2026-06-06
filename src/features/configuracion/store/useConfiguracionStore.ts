import { create } from 'zustand';
import { normalizeTemplatePath } from '../domain/teletrabajoTemplate';
import {
  createTaskPhaseIdFromName,
  DEFAULT_TASK_PHASES,
  normalizeTaskPhaseName,
  type TaskPhaseConfig,
} from '../domain/taskPhases';

const STORAGE_KEY = 'traccion.v1.configuracion';

interface ConfiguracionState {
  rutaPlantillaTeletrabajo: string;
  taskPhases: TaskPhaseConfig[];
}

interface ConfiguracionStore extends ConfiguracionState {
  load: () => void;
  setRutaPlantillaTeletrabajo: (ruta: string) => void;
  addTaskPhase: (nombre: string) => void;
  updateTaskPhase: (id: string, nombre: string) => void;
  toggleTaskPhase: (id: string) => void;
}

function isTaskPhaseConfig(value: unknown): value is TaskPhaseConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof TaskPhaseConfig, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.nombre === 'string' &&
    typeof candidate.active === 'boolean' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

function normalizeTaskPhases(value: unknown): TaskPhaseConfig[] {
  if (!Array.isArray(value)) {
    return DEFAULT_TASK_PHASES;
  }

  const phases = value.filter(isTaskPhaseConfig).map((phase) => ({
    ...phase,
    nombre: normalizeTaskPhaseName(phase.nombre),
  }));

  const missingDefaultPhases = DEFAULT_TASK_PHASES.filter(
    (defaultPhase) => !phases.some((phase) => phase.id === defaultPhase.id),
  );

  return [...phases, ...missingDefaultPhases];
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
    return { rutaPlantillaTeletrabajo: '', taskPhases: DEFAULT_TASK_PHASES };
  }

  const parsed: unknown = JSON.parse(stored);
  if (!isConfiguracionState(parsed)) {
    return { rutaPlantillaTeletrabajo: '', taskPhases: DEFAULT_TASK_PHASES };
  }

  return {
    rutaPlantillaTeletrabajo: normalizeTemplatePath(parsed.rutaPlantillaTeletrabajo),
    taskPhases: normalizeTaskPhases(parsed.taskPhases),
  };
}

function persistConfiguracion(configuracion: ConfiguracionState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(configuracion));
}

const initialConfiguracion = readConfiguracion();

export const useConfiguracionStore = create<ConfiguracionStore>((set) => ({
  rutaPlantillaTeletrabajo: initialConfiguracion.rutaPlantillaTeletrabajo,
  taskPhases: initialConfiguracion.taskPhases,
  load: () => set(readConfiguracion()),
  setRutaPlantillaTeletrabajo: (ruta) =>
    set((state) => {
      const configuracion = {
        ...state,
        rutaPlantillaTeletrabajo: normalizeTemplatePath(ruta),
      };
      persistConfiguracion(configuracion);
      return configuracion;
    }),
  addTaskPhase: (nombre) =>
    set((state) => {
      const normalizedName = normalizeTaskPhaseName(nombre);
      if (!normalizedName) {
        return state;
      }

      const now = new Date().toISOString();
      const phase: TaskPhaseConfig = {
        id: `${createTaskPhaseIdFromName(normalizedName)}-${Date.now().toString(36)}`,
        nombre: normalizedName,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      const configuracion = { ...state, taskPhases: [...state.taskPhases, phase] };
      persistConfiguracion(configuracion);
      return configuracion;
    }),
  updateTaskPhase: (id, nombre) =>
    set((state) => {
      const normalizedName = normalizeTaskPhaseName(nombre);
      if (!normalizedName) {
        return state;
      }

      const now = new Date().toISOString();
      const configuracion = {
        ...state,
        taskPhases: state.taskPhases.map((phase) =>
          phase.id === id ? { ...phase, nombre: normalizedName, updatedAt: now } : phase,
        ),
      };
      persistConfiguracion(configuracion);
      return configuracion;
    }),
  toggleTaskPhase: (id) =>
    set((state) => {
      const now = new Date().toISOString();
      const configuracion = {
        ...state,
        taskPhases: state.taskPhases.map((phase) =>
          phase.id === id ? { ...phase, active: !phase.active, updatedAt: now } : phase,
        ),
      };
      persistConfiguracion(configuracion);
      return configuracion;
    }),
}));

import { create } from 'zustand';
import { normalizeTemplatePath } from '../domain/teletrabajoTemplate';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import {
  createTaskPhaseIdFromName,
  DEFAULT_TASK_PHASES,
  normalizeTaskPhaseName,
  type TaskPhaseConfig,
} from '../domain/taskPhases';
import {
  createTaskOriginIdFromName,
  DEFAULT_TASK_ORIGINS,
  normalizeTaskOriginName,
  type TaskOriginConfig,
} from '../domain/taskOrigins';

const STORAGE_KEY = 'traccion.v1.configuracion';

interface ConfiguracionState {
  rutaPlantillaTeletrabajo: string;
  rutaPlantillaLicenciaSinSueldo: string;
  taskPhases: TaskPhaseConfig[];
  taskOrigins: TaskOriginConfig[];
}

interface ConfiguracionStore extends ConfiguracionState {
  load: () => void;
  reloadFromStorage: () => void;
  setRutaPlantillaTeletrabajo: (ruta: string) => void;
  setRutaPlantillaLicenciaSinSueldo: (ruta: string) => void;
  addTaskPhase: (nombre: string) => void;
  updateTaskPhase: (id: string, nombre: string) => void;
  toggleTaskPhase: (id: string) => void;
  addTaskOrigin: (nombre: string, tipo: TaskOriginConfig['tipo']) => void;
  updateTaskOrigin: (id: string, nombre: string, tipo: TaskOriginConfig['tipo']) => void;
  toggleTaskOrigin: (id: string) => void;
  deleteTaskOrigin: (id: string) => void;
}

function isTaskOriginConfig(value: unknown): value is TaskOriginConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof TaskOriginConfig, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.nombre === 'string' &&
    (candidate.tipo === 'sindicato' || candidate.tipo === 'empresa' || candidate.tipo === 'otro') &&
    typeof candidate.active === 'boolean' &&
    (candidate.deletedAt === undefined || typeof candidate.deletedAt === 'string') &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
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

function normalizeTaskOrigins(value: unknown): TaskOriginConfig[] {
  if (!Array.isArray(value)) {
    return DEFAULT_TASK_ORIGINS;
  }

  const origins = value.filter(isTaskOriginConfig).map((origin) => ({
    ...origin,
    nombre: normalizeTaskOriginName(origin.nombre),
  }));

  const missingDefaultOrigins = DEFAULT_TASK_ORIGINS.filter(
    (defaultOrigin) => !origins.some((origin) => origin.id === defaultOrigin.id),
  );

  return [...origins, ...missingDefaultOrigins];
}

function isConfiguracionState(value: unknown): value is ConfiguracionState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof ConfiguracionState, unknown>>;
  return typeof candidate.rutaPlantillaTeletrabajo === 'string';
}

function readConfiguracion(): ConfiguracionState {
  const stored = readStorageItem(STORAGE_KEY);
  if (!stored) {
    return { rutaPlantillaTeletrabajo: '', rutaPlantillaLicenciaSinSueldo: '', taskPhases: DEFAULT_TASK_PHASES, taskOrigins: DEFAULT_TASK_ORIGINS };
  }

  const parsed: unknown = JSON.parse(stored);
  if (!isConfiguracionState(parsed)) {
    return { rutaPlantillaTeletrabajo: '', rutaPlantillaLicenciaSinSueldo: '', taskPhases: DEFAULT_TASK_PHASES, taskOrigins: DEFAULT_TASK_ORIGINS };
  }

  return {
    rutaPlantillaTeletrabajo: normalizeTemplatePath(parsed.rutaPlantillaTeletrabajo),
    rutaPlantillaLicenciaSinSueldo: normalizeTemplatePath(
      typeof (parsed as { rutaPlantillaLicenciaSinSueldo?: unknown }).rutaPlantillaLicenciaSinSueldo === 'string'
        ? (parsed as { rutaPlantillaLicenciaSinSueldo: string }).rutaPlantillaLicenciaSinSueldo
        : '',
    ),
    taskPhases: normalizeTaskPhases(parsed.taskPhases),
    taskOrigins: normalizeTaskOrigins(parsed.taskOrigins),
  };
}

function persistConfiguracion(configuracion: ConfiguracionState): void {
  writeStorageItem(STORAGE_KEY, JSON.stringify(configuracion));
}

const initialConfiguracion = readConfiguracion();

export const useConfiguracionStore = create<ConfiguracionStore>((set) => ({
  rutaPlantillaTeletrabajo: initialConfiguracion.rutaPlantillaTeletrabajo,
  rutaPlantillaLicenciaSinSueldo: initialConfiguracion.rutaPlantillaLicenciaSinSueldo,
  taskPhases: initialConfiguracion.taskPhases,
  taskOrigins: initialConfiguracion.taskOrigins,
  load: () => set(readConfiguracion()),
  reloadFromStorage: () => set(readConfiguracion()),
  setRutaPlantillaTeletrabajo: (ruta) =>
    set((state) => {
      const configuracion = {
        ...state,
        rutaPlantillaTeletrabajo: normalizeTemplatePath(ruta),
      };
      persistConfiguracion(configuracion);
      return configuracion;
    }),
  setRutaPlantillaLicenciaSinSueldo: (ruta) =>
    set((state) => {
      const configuracion = {
        ...state,
        rutaPlantillaLicenciaSinSueldo: normalizeTemplatePath(ruta),
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
  addTaskOrigin: (nombre, tipo) =>
    set((state) => {
      const normalizedName = normalizeTaskOriginName(nombre);
      if (!normalizedName) {
        return state;
      }

      const now = new Date().toISOString();
      const origin: TaskOriginConfig = {
        id: `${createTaskOriginIdFromName(normalizedName)}-${Date.now().toString(36)}`,
        nombre: normalizedName,
        tipo,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      const configuracion = { ...state, taskOrigins: [...state.taskOrigins, origin] };
      persistConfiguracion(configuracion);
      return configuracion;
    }),
  updateTaskOrigin: (id, nombre, tipo) =>
    set((state) => {
      const normalizedName = normalizeTaskOriginName(nombre);
      if (!normalizedName) {
        return state;
      }

      const now = new Date().toISOString();
      const configuracion = {
        ...state,
        taskOrigins: state.taskOrigins.map((origin) =>
          origin.id === id ? { ...origin, nombre: normalizedName, tipo, updatedAt: now } : origin,
        ),
      };
      persistConfiguracion(configuracion);
      return configuracion;
    }),
  toggleTaskOrigin: (id) =>
    set((state) => {
      const now = new Date().toISOString();
      const configuracion = {
        ...state,
        taskOrigins: state.taskOrigins.map((origin) =>
          origin.id === id ? { ...origin, active: !origin.active, updatedAt: now } : origin,
        ),
      };
      persistConfiguracion(configuracion);
      return configuracion;
    }),
  deleteTaskOrigin: (id) =>
    set((state) => {
      const now = new Date().toISOString();
      const configuracion = {
        ...state,
        taskOrigins: state.taskOrigins.map((origin) =>
          origin.id === id
            ? { ...origin, active: false, deletedAt: now, updatedAt: now }
            : origin,
        ),
      };
      persistConfiguracion(configuracion);
      return configuracion;
    }),
}));

import { create } from 'zustand';
import { normalizeTemplatePath } from '../domain/teletrabajoTemplate';
import { readStorageItem, writeJsonStorageAsync } from '../../../services/persistence';
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

let latestConfiguracionUpdatedAt: string | null = null;

interface ConfiguracionState {
  rutaPlantillaTeletrabajo: string;
  rutaPlantillaLicenciaSinSueldo: string;
  rutaPlantillaVinculograma: string;
  taskPhases: TaskPhaseConfig[];
  taskOrigins: TaskOriginConfig[];
}

interface ConfiguracionStore extends ConfiguracionState {
  load: () => void;
  reloadFromStorage: () => void;
  setRutaPlantillaTeletrabajo: (ruta: string) => Promise<{ ok: boolean; message: string }>;
  setRutaPlantillaLicenciaSinSueldo: (ruta: string) => Promise<{ ok: boolean; message: string }>;
  setRutaPlantillaVinculograma: (ruta: string) => Promise<{ ok: boolean; message: string }>;
  addTaskPhase: (nombre: string) => void;
  updateTaskPhase: (id: string, nombre: string) => void;
  toggleTaskPhase: (id: string) => void;
  addTaskOrigin: (nombre: string, tipo: TaskOriginConfig['tipo']) => void;
  updateTaskOrigin: (id: string, nombre: string, tipo: TaskOriginConfig['tipo']) => void;
  toggleTaskOrigin: (id: string) => void;
  deleteTaskOrigin: (id: string) => void;
}


function selectConfiguracionState(state: ConfiguracionStore): ConfiguracionState {
  return {
    rutaPlantillaTeletrabajo: state.rutaPlantillaTeletrabajo,
    rutaPlantillaLicenciaSinSueldo: state.rutaPlantillaLicenciaSinSueldo,
    rutaPlantillaVinculograma: state.rutaPlantillaVinculograma,
    taskPhases: state.taskPhases,
    taskOrigins: state.taskOrigins,
  };
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

function defaultConfiguracion(): ConfiguracionState {
  return {
    rutaPlantillaTeletrabajo: '',
    rutaPlantillaLicenciaSinSueldo: '',
    rutaPlantillaVinculograma: '',
    taskPhases: DEFAULT_TASK_PHASES,
    taskOrigins: DEFAULT_TASK_ORIGINS,
  };
}

function parseConfiguracionValue(stored: string | null): ConfiguracionState {
  if (!stored) {
    return defaultConfiguracion();
  }

  const parsed: unknown = JSON.parse(stored);
  if (!isConfiguracionState(parsed)) {
    return defaultConfiguracion();
  }

  return {
    rutaPlantillaTeletrabajo: normalizeTemplatePath(parsed.rutaPlantillaTeletrabajo),
    rutaPlantillaLicenciaSinSueldo: normalizeTemplatePath(
      typeof (parsed as { rutaPlantillaLicenciaSinSueldo?: unknown }).rutaPlantillaLicenciaSinSueldo === 'string'
        ? (parsed as { rutaPlantillaLicenciaSinSueldo: string }).rutaPlantillaLicenciaSinSueldo
        : '',
    ),
    rutaPlantillaVinculograma: normalizeTemplatePath(
      typeof (parsed as { rutaPlantillaVinculograma?: unknown }).rutaPlantillaVinculograma === 'string'
        ? (parsed as { rutaPlantillaVinculograma: string }).rutaPlantillaVinculograma
        : '',
    ),
    taskPhases: normalizeTaskPhases(parsed.taskPhases),
    taskOrigins: normalizeTaskOrigins(parsed.taskOrigins),
  };
}

function readConfiguracion(): ConfiguracionState {
  return parseConfiguracionValue(readStorageItem(STORAGE_KEY));
}

async function readConfiguracionFromSqlite(): Promise<ConfiguracionState | null> {
  const loader = window.traccion?.loadConfiguracion;
  if (!loader) {
    return null;
  }

  const snapshot = await loader();
  if (!snapshot.status.ready || snapshot.status.phase !== 'active' || !snapshot.value) {
    return null;
  }

  latestConfiguracionUpdatedAt = snapshot.updatedAt;
  window.localStorage.setItem(STORAGE_KEY, snapshot.value);
  return parseConfiguracionValue(snapshot.value);
}

async function persistConfiguracionConfirmed(configuracion: ConfiguracionState): Promise<void> {
  const sqliteSaver = window.traccion?.saveConfiguracionIfUnchanged;
  if (sqliteSaver && latestConfiguracionUpdatedAt === null) {
    await readConfiguracionFromSqlite();
  }

  const value = JSON.stringify(configuracion);
  if (sqliteSaver) {
    const result = await sqliteSaver({ value, expectedUpdatedAt: latestConfiguracionUpdatedAt });
    if (!result.ok) {
      throw new Error(result.message);
    }
    latestConfiguracionUpdatedAt = result.currentUpdatedAt;
    window.localStorage.setItem(STORAGE_KEY, value);
    return;
  }

  const result = await writeJsonStorageAsync(STORAGE_KEY, configuracion);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

async function commitConfiguracion(
  set: (partial: ConfiguracionState) => void,
  configuracion: ConfiguracionState,
): Promise<{ ok: boolean; message: string }> {
  try {
    await persistConfiguracionConfirmed(configuracion);
    set(configuracion);
    return { ok: true, message: 'Configuración guardada.' };
  } catch (error) {
    console.warn('Configuración no guardada en SQLite.', error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No se ha podido guardar la configuración.',
    };
  }
}

function areConfiguracionesEquivalent(left: ConfiguracionState, right: ConfiguracionState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

const initialConfiguracion = readConfiguracion();

export const useConfiguracionStore = create<ConfiguracionStore>((set, get) => ({
  rutaPlantillaTeletrabajo: initialConfiguracion.rutaPlantillaTeletrabajo,
  rutaPlantillaLicenciaSinSueldo: initialConfiguracion.rutaPlantillaLicenciaSinSueldo,
  rutaPlantillaVinculograma: initialConfiguracion.rutaPlantillaVinculograma,
  taskPhases: initialConfiguracion.taskPhases,
  taskOrigins: initialConfiguracion.taskOrigins,
  load: () => {
    set(readConfiguracion());
    void readConfiguracionFromSqlite()
      .then((configuracion) => {
        if (configuracion) {
          set(configuracion);
        }
      })
      .catch((error) => console.warn('Configuración no cargada desde SQLite.', error));
  },
  reloadFromStorage: () => {
    // Compara contenido antes de actualizar el estado: evita el re-render
    // (y el parpadeo asociado) cuando el poll detecta cambio de updatedAt
    // pero el contenido normalizado ya coincide con el que tenemos en memoria.
    const applyIfChanged = (configuracion: ConfiguracionState) => {
      const {
        rutaPlantillaTeletrabajo,
        rutaPlantillaLicenciaSinSueldo,
        rutaPlantillaVinculograma,
        taskPhases,
        taskOrigins,
      } = get();
      const current: ConfiguracionState = {
        rutaPlantillaTeletrabajo,
        rutaPlantillaLicenciaSinSueldo,
        rutaPlantillaVinculograma,
        taskPhases,
        taskOrigins,
      };
      if (!areConfiguracionesEquivalent(current, configuracion)) {
        set(configuracion);
      }
    };

    // Si hay repositorio SQLite disponible, es la única fuente de verdad: no
    // se aplica primero la lectura legacy de localStorage (que podría no
    // reflejar aún el último valor SQLite) para no pisar momentáneamente el
    // estado correcto con uno desactualizado.
    if (window.traccion?.loadConfiguracion) {
      void readConfiguracionFromSqlite()
        .then((configuracion) => {
          if (configuracion) {
            applyIfChanged(configuracion);
          }
        })
        .catch((error) => console.warn('Configuración no recargada desde SQLite.', error));
      return;
    }

    applyIfChanged(readConfiguracion());
  },
  setRutaPlantillaTeletrabajo: async (ruta: string): Promise<{ ok: boolean; message: string }> => {
    const configuracion: ConfiguracionState = {
      ...selectConfiguracionState(get()),
      rutaPlantillaTeletrabajo: normalizeTemplatePath(ruta),
    };
    return commitConfiguracion(set, configuracion);
  },
  setRutaPlantillaLicenciaSinSueldo: async (ruta: string): Promise<{ ok: boolean; message: string }> => {
    const configuracion: ConfiguracionState = {
      ...selectConfiguracionState(get()),
      rutaPlantillaLicenciaSinSueldo: normalizeTemplatePath(ruta),
    };
    return commitConfiguracion(set, configuracion);
  },
  setRutaPlantillaVinculograma: async (ruta: string): Promise<{ ok: boolean; message: string }> => {
    const configuracion: ConfiguracionState = {
      ...selectConfiguracionState(get()),
      rutaPlantillaVinculograma: normalizeTemplatePath(ruta),
    };
    return commitConfiguracion(set, configuracion);
  },
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
      void commitConfiguracion(set, configuracion);
      return state;
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
      void commitConfiguracion(set, configuracion);
      return state;
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
      void commitConfiguracion(set, configuracion);
      return state;
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
      void commitConfiguracion(set, configuracion);
      return state;
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
      void commitConfiguracion(set, configuracion);
      return state;
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
      void commitConfiguracion(set, configuracion);
      return state;
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
      void commitConfiguracion(set, configuracion);
      return state;
    }),
}));

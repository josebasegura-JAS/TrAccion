import { create } from 'zustand';
import { normalizeTemplatePath } from '../domain/teletrabajoTemplate';
import { readStorageItem, writeJsonStorageAsync, writeRendererStorageCache } from '../../../services/persistence';
import { clearPersistenceBusy, emitPersistenceFeedback, publishPersistenceBusy } from '../../../services/persistenceFeedback';
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
import {
  createTaskStateIdFromName,
  DEFAULT_TASK_STATES,
  normalizeTaskStateName,
  type TaskStateConfig,
} from '../domain/taskStates';
import {
  createTaskResponsibleIdFromName,
  DEFAULT_TASK_RESPONSIBLES,
  normalizeTaskResponsibleName,
  normalizeWindowsUser,
  type TaskResponsibleConfig,
} from '../domain/taskResponsibles';

const STORAGE_KEY = 'traccion.v1.configuracion';

let latestConfiguracionUpdatedAt: string | null = null;
let configuracionWriteQueue: Promise<void> = Promise.resolve();
let configuracionPendingWrites = 0;

const CONFIGURACION_FEEDBACK_KEY = 'configuracion';

interface ConfiguracionState {
  rutaPlantillaTeletrabajo: string;
  rutaPlantillaLicenciaSinSueldo: string;
  rutaPlantillaExcedencia: string;
  rutaPlantillaProrrogaExcedencia: string;
  rutaPlantillaVinculograma: string;
  rutaExportacionTareas: string;
  rutaExportacionLoteria: string;
  rutaExportacionLicencias: string;
  rutaExportacionVinculograma: string;
  rutaExportacionCoordinacion: string;
  rutaResumenComites: string;
  rutaAyudaEscolar: string;
  taskPhases: TaskPhaseConfig[];
  taskStates: TaskStateConfig[];
  taskOrigins: TaskOriginConfig[];
  taskResponsibles: TaskResponsibleConfig[];
}

type SharedRouteSettings = Pick<
  ConfiguracionState,
  | 'rutaPlantillaTeletrabajo'
  | 'rutaPlantillaLicenciaSinSueldo'
  | 'rutaPlantillaExcedencia'
  | 'rutaPlantillaProrrogaExcedencia'
  | 'rutaPlantillaVinculograma'
  | 'rutaExportacionTareas'
  | 'rutaExportacionLoteria'
  | 'rutaExportacionLicencias'
  | 'rutaExportacionVinculograma'
  | 'rutaExportacionCoordinacion'
  | 'rutaResumenComites'
  | 'rutaAyudaEscolar'
>;

interface ConfiguracionStore extends ConfiguracionState {
  load: () => void;
  reloadFromStorage: () => void;
  setRutaPlantillaTeletrabajo: (ruta: string) => Promise<{ ok: boolean; message: string }>;
  setRutaPlantillaLicenciaSinSueldo: (ruta: string) => Promise<{ ok: boolean; message: string }>;
  setRutaPlantillaExcedencia: (ruta: string) => Promise<{ ok: boolean; message: string }>;
  setRutaPlantillaProrrogaExcedencia: (ruta: string) => Promise<{ ok: boolean; message: string }>;
  setRutaPlantillaVinculograma: (ruta: string) => Promise<{ ok: boolean; message: string }>;
  setRutaExportacionTareas: (ruta: string) => Promise<{ ok: boolean; message: string }>;
  setRutaExportacionLoteria: (ruta: string) => Promise<{ ok: boolean; message: string }>;
  setRutaExportacionLicencias: (ruta: string) => Promise<{ ok: boolean; message: string }>;
  setRutaExportacionVinculograma: (ruta: string) => Promise<{ ok: boolean; message: string }>;
  setRutaExportacionCoordinacion: (ruta: string) => Promise<{ ok: boolean; message: string }>;
  setRutaResumenComites: (ruta: string) => Promise<{ ok: boolean; message: string }>;
  setRutaAyudaEscolar: (ruta: string) => Promise<{ ok: boolean; message: string }>;
  saveRutasCompartidas: (rutas: SharedRouteSettings) => Promise<{ ok: boolean; message: string }>;
  addTaskState: (nombre: string) => void;
  updateTaskState: (id: string, nombre: string) => void;
  toggleTaskState: (id: string) => void;
  moveTaskState: (id: string, direction: 'up' | 'down') => void;
  addTaskPhase: (nombre: string) => void;
  updateTaskPhase: (id: string, nombre: string) => void;
  toggleTaskPhase: (id: string) => void;
  addTaskOrigin: (nombre: string, tipo: TaskOriginConfig['tipo']) => void;
  updateTaskOrigin: (id: string, nombre: string, tipo: TaskOriginConfig['tipo']) => void;
  toggleTaskOrigin: (id: string) => void;
  deleteTaskOrigin: (id: string) => void;
  addTaskResponsible: (nombre: string, windowsUser: string) => void;
  updateTaskResponsible: (id: string, nombre: string, windowsUser: string) => void;
  toggleTaskResponsible: (id: string) => void;
}

function selectConfiguracionState(state: ConfiguracionStore): ConfiguracionState {
  return {
    rutaPlantillaTeletrabajo: state.rutaPlantillaTeletrabajo,
    rutaPlantillaLicenciaSinSueldo: state.rutaPlantillaLicenciaSinSueldo,
    rutaPlantillaExcedencia: state.rutaPlantillaExcedencia,
    rutaPlantillaProrrogaExcedencia: state.rutaPlantillaProrrogaExcedencia,
    rutaPlantillaVinculograma: state.rutaPlantillaVinculograma,
    rutaExportacionTareas: state.rutaExportacionTareas,
    rutaExportacionLoteria: state.rutaExportacionLoteria,
    rutaExportacionLicencias: state.rutaExportacionLicencias,
    rutaExportacionVinculograma: state.rutaExportacionVinculograma,
    rutaExportacionCoordinacion: state.rutaExportacionCoordinacion,
    rutaResumenComites: state.rutaResumenComites,
    rutaAyudaEscolar: state.rutaAyudaEscolar,
    taskPhases: state.taskPhases,
    taskStates: state.taskStates,
    taskOrigins: state.taskOrigins,
    taskResponsibles: state.taskResponsibles,
  };
}

function isTaskResponsibleConfig(value: unknown): value is TaskResponsibleConfig {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<keyof TaskResponsibleConfig, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.nombre === 'string' &&
    typeof candidate.windowsUser === 'string' &&
    typeof candidate.active === 'boolean' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

function normalizeTaskResponsibles(value: unknown): TaskResponsibleConfig[] {
  if (!Array.isArray(value)) return DEFAULT_TASK_RESPONSIBLES;
  const responsibles = value.filter(isTaskResponsibleConfig).map((responsible) => ({
    ...responsible,
    nombre: normalizeTaskResponsibleName(responsible.nombre),
    windowsUser: normalizeWindowsUser(responsible.windowsUser),
  }));
  const missingDefaults = DEFAULT_TASK_RESPONSIBLES.filter((defaultResponsible) =>
    !responsibles.some((responsible) => responsible.id === defaultResponsible.id));
  return [...responsibles, ...missingDefaults];
}

function isTaskStateConfig(value: unknown): value is TaskStateConfig {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<keyof TaskStateConfig, unknown>>;
  return typeof candidate.id === 'string' && typeof candidate.nombre === 'string' &&
    typeof candidate.active === 'boolean' &&
    (candidate.protectedRole === undefined || candidate.protectedRole === 'initial' || candidate.protectedRole === 'closed') &&
    typeof candidate.createdAt === 'string' && typeof candidate.updatedAt === 'string';
}

function normalizeTaskStates(value: unknown): TaskStateConfig[] {
  if (!Array.isArray(value)) return DEFAULT_TASK_STATES;
  const states = value.filter(isTaskStateConfig).map((state) => {
    const protectedDefault = DEFAULT_TASK_STATES.find((defaultState) => defaultState.id === state.id && defaultState.protectedRole);
    return {
      ...state,
      nombre: normalizeTaskStateName(state.nombre),
      active: protectedDefault ? true : state.active,
      protectedRole: protectedDefault?.protectedRole ?? state.protectedRole,
    };
  });
  const missingDefaults = DEFAULT_TASK_STATES.filter((defaultState) => !states.some((state) => state.id === defaultState.id));
  return [...states, ...missingDefaults];
}

function isTaskOriginConfig(value: unknown): value is TaskOriginConfig {
  if (!value || typeof value !== 'object') return false;
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
  if (!value || typeof value !== 'object') return false;
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
  if (!Array.isArray(value)) return DEFAULT_TASK_PHASES;
  const phases = value.filter(isTaskPhaseConfig).map((phase) => ({ ...phase, nombre: normalizeTaskPhaseName(phase.nombre) }));
  const missingDefaultPhases = DEFAULT_TASK_PHASES.filter((defaultPhase) => !phases.some((phase) => phase.id === defaultPhase.id));
  return [...phases, ...missingDefaultPhases];
}

function normalizeTaskOrigins(value: unknown): TaskOriginConfig[] {
  if (!Array.isArray(value)) return DEFAULT_TASK_ORIGINS;
  const origins = value.filter(isTaskOriginConfig).map((origin) => ({ ...origin, nombre: normalizeTaskOriginName(origin.nombre) }));
  const missingDefaultOrigins = DEFAULT_TASK_ORIGINS.filter((defaultOrigin) => !origins.some((origin) => origin.id === defaultOrigin.id));
  return [...origins, ...missingDefaultOrigins];
}

function isConfiguracionState(value: unknown): value is ConfiguracionState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<keyof ConfiguracionState, unknown>>;
  return typeof candidate.rutaPlantillaTeletrabajo === 'string';
}

function getDefaultAyudaEscolarPath(): string {
  const year = new Date().getFullYear();
  return `G:\\Capital Humano\\Relaciones Laborales\\RRLL\\Jefatura RRLL\\Ayuda Escolar\\${year}\\Documentación`;
}

function normalizeAyudaEscolarPath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return getDefaultAyudaEscolarPath();
  const trimmed = value.trim();
  const canonicalDefaultPattern = /^G:\\Capital Humano\\Relaciones Laborales\\RRLL\\Jefatura RRLL\\Ayuda Escolar\\\d{4}\\Documentación$/i;
  return canonicalDefaultPattern.test(trimmed) ? getDefaultAyudaEscolarPath() : trimmed;
}

function defaultConfiguracion(): ConfiguracionState {
  return {
    rutaPlantillaTeletrabajo: '',
    rutaPlantillaLicenciaSinSueldo: '',
    rutaPlantillaExcedencia: '',
    rutaPlantillaProrrogaExcedencia: '',
    rutaPlantillaVinculograma: '',
    rutaExportacionTareas: '',
    rutaExportacionLoteria: 'G:\\Capital Humano\\Relaciones Laborales\\RRLL\\Jefatura RRLL\\Lotería\\Año {year}',
    rutaExportacionLicencias: 'G:\\Capital Humano\\Relaciones Laborales\\RRLL\\Jefatura RRLL\\Licencias sin sueldo y Excedencias',
    rutaExportacionVinculograma: 'G:\\Capital Humano\\Relaciones Laborales\\RRLL\\Jefatura RRLL\\Vinculograma',
    rutaExportacionCoordinacion: '',
    rutaResumenComites: '',
    rutaAyudaEscolar: getDefaultAyudaEscolarPath(),
    taskPhases: DEFAULT_TASK_PHASES,
    taskStates: DEFAULT_TASK_STATES,
    taskOrigins: DEFAULT_TASK_ORIGINS,
    taskResponsibles: DEFAULT_TASK_RESPONSIBLES,
  };
}

function parseConfiguracionValue(stored: string | null): ConfiguracionState {
  if (!stored) return defaultConfiguracion();
  const parsed: unknown = JSON.parse(stored);
  if (!isConfiguracionState(parsed)) return defaultConfiguracion();

  return {
    rutaPlantillaTeletrabajo: normalizeTemplatePath(parsed.rutaPlantillaTeletrabajo),
    rutaPlantillaLicenciaSinSueldo: normalizeTemplatePath(typeof (parsed as { rutaPlantillaLicenciaSinSueldo?: unknown }).rutaPlantillaLicenciaSinSueldo === 'string' ? (parsed as { rutaPlantillaLicenciaSinSueldo: string }).rutaPlantillaLicenciaSinSueldo : ''),
    rutaPlantillaExcedencia: normalizeTemplatePath(typeof (parsed as { rutaPlantillaExcedencia?: unknown }).rutaPlantillaExcedencia === 'string' ? (parsed as { rutaPlantillaExcedencia: string }).rutaPlantillaExcedencia : ''),
    rutaPlantillaProrrogaExcedencia: normalizeTemplatePath(typeof (parsed as { rutaPlantillaProrrogaExcedencia?: unknown }).rutaPlantillaProrrogaExcedencia === 'string' ? (parsed as { rutaPlantillaProrrogaExcedencia: string }).rutaPlantillaProrrogaExcedencia : ''),
    rutaPlantillaVinculograma: normalizeTemplatePath(typeof (parsed as { rutaPlantillaVinculograma?: unknown }).rutaPlantillaVinculograma === 'string' ? (parsed as { rutaPlantillaVinculograma: string }).rutaPlantillaVinculograma : ''),
    rutaExportacionTareas: typeof (parsed as { rutaExportacionTareas?: unknown }).rutaExportacionTareas === 'string' ? (parsed as { rutaExportacionTareas: string }).rutaExportacionTareas.trim() : '',
    rutaExportacionLoteria: typeof (parsed as { rutaExportacionLoteria?: unknown }).rutaExportacionLoteria === 'string' ? (parsed as { rutaExportacionLoteria: string }).rutaExportacionLoteria.trim() : 'G:\\Capital Humano\\Relaciones Laborales\\RRLL\\Jefatura RRLL\\Lotería\\Año {year}',
    rutaExportacionLicencias: typeof (parsed as { rutaExportacionLicencias?: unknown }).rutaExportacionLicencias === 'string' ? (parsed as { rutaExportacionLicencias: string }).rutaExportacionLicencias.trim() : 'G:\\Capital Humano\\Relaciones Laborales\\RRLL\\Jefatura RRLL\\Licencias sin sueldo y Excedencias',
    rutaExportacionVinculograma: typeof (parsed as { rutaExportacionVinculograma?: unknown }).rutaExportacionVinculograma === 'string' ? (parsed as { rutaExportacionVinculograma: string }).rutaExportacionVinculograma.trim() : 'G:\\Capital Humano\\Relaciones Laborales\\RRLL\\Jefatura RRLL\\Vinculograma',
    rutaExportacionCoordinacion: typeof (parsed as { rutaExportacionCoordinacion?: unknown }).rutaExportacionCoordinacion === 'string' ? (parsed as { rutaExportacionCoordinacion: string }).rutaExportacionCoordinacion.trim() : '',
    rutaResumenComites: typeof (parsed as { rutaResumenComites?: unknown }).rutaResumenComites === 'string' ? (parsed as { rutaResumenComites: string }).rutaResumenComites.trim() : '',
    rutaAyudaEscolar: normalizeAyudaEscolarPath((parsed as { rutaAyudaEscolar?: unknown }).rutaAyudaEscolar),
    taskPhases: normalizeTaskPhases(parsed.taskPhases),
    taskStates: normalizeTaskStates((parsed as { taskStates?: unknown }).taskStates),
    taskOrigins: normalizeTaskOrigins(parsed.taskOrigins),
    taskResponsibles: normalizeTaskResponsibles((parsed as { taskResponsibles?: unknown }).taskResponsibles),
  };
}

function readConfiguracion(): ConfiguracionState {
  return parseConfiguracionValue(readStorageItem(STORAGE_KEY));
}

async function readConfiguracionFromSqlite(): Promise<ConfiguracionState | null> {
  const loader = window.traccion?.loadConfiguracion;
  if (!loader) return null;
  const snapshot = await loader();
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') return null;

  // El token de concurrencia pertenece a la SQLite activa. Debe actualizarse
  // incluso cuando una base recién seleccionada todavía no tiene registro de
  // configuración; de lo contrario se reutilizaría el updatedAt de la base
  // anterior y el primer guardado compartido fallaría por falso conflicto.
  latestConfiguracionUpdatedAt = snapshot.updatedAt;
  if (!snapshot.value) return null;

  writeRendererStorageCache(STORAGE_KEY, snapshot.value, 'sqlite');
  return parseConfiguracionValue(snapshot.value);
}

async function persistConfiguracionConfirmed(configuracion: ConfiguracionState): Promise<void> {
  const sqliteSaver = window.traccion?.saveConfiguracionIfUnchanged;
  if (sqliteSaver && latestConfiguracionUpdatedAt === null) await readConfiguracionFromSqlite();
  const value = JSON.stringify(configuracion);
  if (sqliteSaver) {
    const result = await sqliteSaver({ value, expectedUpdatedAt: latestConfiguracionUpdatedAt });
    if (!result.ok) throw new Error(result.message);
    latestConfiguracionUpdatedAt = result.currentUpdatedAt;
    writeRendererStorageCache(STORAGE_KEY, value, 'sqlite');
    return;
  }
  const result = await writeJsonStorageAsync(STORAGE_KEY, configuracion);
  if (!result.ok) throw new Error(result.message);
}

async function commitConfiguracion(
  set: (partial: ConfiguracionState) => void,
  configuracion: ConfiguracionState,
  options: { applyOnSuccess?: boolean; revertOnError?: boolean } = {},
): Promise<{ ok: boolean; message: string }> {
  const applyOnSuccess = options.applyOnSuccess ?? true;
  const revertOnError = options.revertOnError ?? false;
  configuracionPendingWrites += 1;
  publishPersistenceBusy(CONFIGURACION_FEEDBACK_KEY, 'Guardando cambios…');

  let result: { ok: boolean; message: string } = { ok: false, message: 'No se ha podido guardar la configuración.' };
  const queuedWrite = configuracionWriteQueue.then(async () => {
    try {
      await persistConfiguracionConfirmed(configuracion);
      if (applyOnSuccess) set(configuracion);
      result = { ok: true, message: 'Configuración guardada.' };
    } catch (error) {
      console.warn('Configuración no guardada en SQLite.', error);
      const message = error instanceof Error ? error.message : 'No se ha podido guardar la configuración.';
      result = { ok: false, message };
      emitPersistenceFeedback({
        kind: 'error',
        updatedAt: new Date().toISOString(),
        key: CONFIGURACION_FEEDBACK_KEY,
        message,
      });

      if (revertOnError) {
        try {
          const persisted = await readConfiguracionFromSqlite();
          if (persisted) set(persisted);
        } catch (reloadError) {
          console.warn('No se ha podido restaurar la configuración tras un error de guardado.', reloadError);
        }
      }
    } finally {
      configuracionPendingWrites = Math.max(0, configuracionPendingWrites - 1);
      if (result.ok && configuracionPendingWrites === 0) {
        clearPersistenceBusy(CONFIGURACION_FEEDBACK_KEY, 'Cambios guardados');
      }
    }
  });

  // La cola sigue viva aunque una escritura falle: el siguiente cambio debe poder
  // persistirse con el updatedAt confirmado más reciente.
  configuracionWriteQueue = queuedWrite.catch(() => undefined);
  await queuedWrite;
  return result;
}

function commitTaskCatalogConfiguracion(
  set: (partial: ConfiguracionState) => void,
  configuracion: ConfiguracionState,
): void {
  // El callback de Zustand devuelve esta configuración de forma optimista para
  // que los inputs controlados respondan al instante. La persistencia queda
  // serializada para no provocar conflictos OCC contra escrituras anteriores
  // realizadas por este mismo equipo.
  void commitConfiguracion(set, configuracion, { applyOnSuccess: false, revertOnError: true });
}

function areConfiguracionesEquivalent(left: ConfiguracionState, right: ConfiguracionState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

const initialConfiguracion = readConfiguracion();

export const useConfiguracionStore = create<ConfiguracionStore>((set, get) => ({
  rutaPlantillaTeletrabajo: initialConfiguracion.rutaPlantillaTeletrabajo,
  rutaPlantillaLicenciaSinSueldo: initialConfiguracion.rutaPlantillaLicenciaSinSueldo,
  rutaPlantillaExcedencia: initialConfiguracion.rutaPlantillaExcedencia,
  rutaPlantillaProrrogaExcedencia: initialConfiguracion.rutaPlantillaProrrogaExcedencia,
  rutaPlantillaVinculograma: initialConfiguracion.rutaPlantillaVinculograma,
  rutaExportacionTareas: initialConfiguracion.rutaExportacionTareas,
  rutaExportacionLoteria: initialConfiguracion.rutaExportacionLoteria,
  rutaExportacionLicencias: initialConfiguracion.rutaExportacionLicencias,
  rutaExportacionVinculograma: initialConfiguracion.rutaExportacionVinculograma,
  rutaExportacionCoordinacion: initialConfiguracion.rutaExportacionCoordinacion,
  rutaResumenComites: initialConfiguracion.rutaResumenComites,
  rutaAyudaEscolar: initialConfiguracion.rutaAyudaEscolar,
  taskPhases: initialConfiguracion.taskPhases,
  taskStates: initialConfiguracion.taskStates,
  taskOrigins: initialConfiguracion.taskOrigins,
  taskResponsibles: initialConfiguracion.taskResponsibles,
  load: () => {
    set(readConfiguracion());
    void readConfiguracionFromSqlite().then((configuracion) => { if (configuracion) set(configuracion); }).catch((error) => console.warn('Configuración no cargada desde SQLite.', error));
  },
  reloadFromStorage: () => {
    const applyIfChanged = (configuracion: ConfiguracionState) => {
      const { rutaPlantillaTeletrabajo, rutaPlantillaLicenciaSinSueldo, rutaPlantillaExcedencia, rutaPlantillaProrrogaExcedencia, rutaPlantillaVinculograma, rutaExportacionTareas, rutaExportacionLoteria, rutaExportacionLicencias, rutaExportacionVinculograma, rutaExportacionCoordinacion, rutaResumenComites, rutaAyudaEscolar, taskPhases, taskStates, taskOrigins, taskResponsibles } = get();
      const current: ConfiguracionState = { rutaPlantillaTeletrabajo, rutaPlantillaLicenciaSinSueldo, rutaPlantillaExcedencia, rutaPlantillaProrrogaExcedencia, rutaPlantillaVinculograma, rutaExportacionTareas, rutaExportacionLoteria, rutaExportacionLicencias, rutaExportacionVinculograma, rutaExportacionCoordinacion, rutaResumenComites, rutaAyudaEscolar, taskPhases, taskStates, taskOrigins, taskResponsibles };
      if (!areConfiguracionesEquivalent(current, configuracion)) set(configuracion);
    };
    if (window.traccion?.loadConfiguracion) {
      void readConfiguracionFromSqlite().then((configuracion) => { if (configuracion) applyIfChanged(configuracion); }).catch((error) => console.warn('Configuración no recargada desde SQLite.', error));
      return;
    }
    applyIfChanged(readConfiguracion());
  },
  setRutaPlantillaTeletrabajo: async (ruta) => commitConfiguracion(set, { ...selectConfiguracionState(get()), rutaPlantillaTeletrabajo: normalizeTemplatePath(ruta) }),
  setRutaPlantillaLicenciaSinSueldo: async (ruta) => commitConfiguracion(set, { ...selectConfiguracionState(get()), rutaPlantillaLicenciaSinSueldo: normalizeTemplatePath(ruta) }),
  setRutaPlantillaExcedencia: async (ruta) => commitConfiguracion(set, { ...selectConfiguracionState(get()), rutaPlantillaExcedencia: normalizeTemplatePath(ruta) }),
  setRutaPlantillaProrrogaExcedencia: async (ruta) => commitConfiguracion(set, { ...selectConfiguracionState(get()), rutaPlantillaProrrogaExcedencia: normalizeTemplatePath(ruta) }),
  setRutaPlantillaVinculograma: async (ruta) => commitConfiguracion(set, { ...selectConfiguracionState(get()), rutaPlantillaVinculograma: normalizeTemplatePath(ruta) }),
  setRutaExportacionTareas: async (ruta) => commitConfiguracion(set, { ...selectConfiguracionState(get()), rutaExportacionTareas: ruta.trim() }),
  setRutaExportacionLoteria: async (ruta) => commitConfiguracion(set, { ...selectConfiguracionState(get()), rutaExportacionLoteria: ruta.trim() }),
  setRutaExportacionLicencias: async (ruta) => commitConfiguracion(set, { ...selectConfiguracionState(get()), rutaExportacionLicencias: ruta.trim() }),
  setRutaExportacionVinculograma: async (ruta) => commitConfiguracion(set, { ...selectConfiguracionState(get()), rutaExportacionVinculograma: ruta.trim() }),
  setRutaExportacionCoordinacion: async (ruta) => commitConfiguracion(set, { ...selectConfiguracionState(get()), rutaExportacionCoordinacion: ruta.trim() }),
  setRutaResumenComites: async (ruta) => commitConfiguracion(set, { ...selectConfiguracionState(get()), rutaResumenComites: ruta.trim() }),
  setRutaAyudaEscolar: async (ruta) => commitConfiguracion(set, { ...selectConfiguracionState(get()), rutaAyudaEscolar: ruta.trim() }),
  saveRutasCompartidas: async (rutas) => commitConfiguracion(set, {
    ...selectConfiguracionState(get()),
    rutaPlantillaTeletrabajo: normalizeTemplatePath(rutas.rutaPlantillaTeletrabajo),
    rutaPlantillaLicenciaSinSueldo: normalizeTemplatePath(rutas.rutaPlantillaLicenciaSinSueldo),
    rutaPlantillaExcedencia: normalizeTemplatePath(rutas.rutaPlantillaExcedencia),
    rutaPlantillaProrrogaExcedencia: normalizeTemplatePath(rutas.rutaPlantillaProrrogaExcedencia),
    rutaPlantillaVinculograma: normalizeTemplatePath(rutas.rutaPlantillaVinculograma),
    rutaExportacionTareas: rutas.rutaExportacionTareas.trim(),
    rutaExportacionLoteria: rutas.rutaExportacionLoteria.trim(),
    rutaExportacionLicencias: rutas.rutaExportacionLicencias.trim(),
    rutaExportacionVinculograma: rutas.rutaExportacionVinculograma.trim(),
    rutaExportacionCoordinacion: rutas.rutaExportacionCoordinacion.trim(),
    rutaResumenComites: rutas.rutaResumenComites.trim(),
    rutaAyudaEscolar: rutas.rutaAyudaEscolar.trim(),
  }),
  addTaskState: (nombre) => set((state) => {
    const normalizedName = normalizeTaskStateName(nombre); if (!normalizedName) return state;
    const now = new Date().toISOString();
    const baseId = createTaskStateIdFromName(normalizedName);
    const id = state.taskStates.some((item) => item.id === baseId) ? `${baseId}-${Date.now().toString(36)}` : baseId;
    const taskState: TaskStateConfig = { id, nombre: normalizedName, active: true, createdAt: now, updatedAt: now };
    const configuracion = { ...selectConfiguracionState(state), taskStates: [...state.taskStates, taskState] };
    commitTaskCatalogConfiguracion(set, configuracion); return configuracion;
  }),
  updateTaskState: (id, nombre) => set((state) => {
    const normalizedName = normalizeTaskStateName(nombre); if (!normalizedName) return state;
    const now = new Date().toISOString();
    const configuracion = { ...selectConfiguracionState(state), taskStates: state.taskStates.map((item) => item.id === id ? { ...item, nombre: normalizedName, updatedAt: now } : item) };
    commitTaskCatalogConfiguracion(set, configuracion); return configuracion;
  }),
  toggleTaskState: (id) => set((state) => {
    const target = state.taskStates.find((item) => item.id === id); if (!target || target.protectedRole) return state;
    const now = new Date().toISOString();
    const configuracion = { ...selectConfiguracionState(state), taskStates: state.taskStates.map((item) => item.id === id ? { ...item, active: !item.active, updatedAt: now } : item) };
    commitTaskCatalogConfiguracion(set, configuracion); return configuracion;
  }),
  moveTaskState: (id, direction) => set((state) => {
    const index = state.taskStates.findIndex((item) => item.id === id); if (index < 0) return state;
    const nextIndex = direction === 'up' ? index - 1 : index + 1; if (nextIndex < 0 || nextIndex >= state.taskStates.length) return state;
    const next = [...state.taskStates]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    const configuracion = { ...selectConfiguracionState(state), taskStates: next };
    commitTaskCatalogConfiguracion(set, configuracion); return configuracion;
  }),
  addTaskPhase: (nombre) => set((state) => {
    const normalizedName = normalizeTaskPhaseName(nombre); if (!normalizedName) return state;
    const now = new Date().toISOString();
    const phase: TaskPhaseConfig = { id: `${createTaskPhaseIdFromName(normalizedName)}-${Date.now().toString(36)}`, nombre: normalizedName, active: true, createdAt: now, updatedAt: now };
    const configuracion = { ...selectConfiguracionState(state), taskPhases: [...state.taskPhases, phase] }; commitTaskCatalogConfiguracion(set, configuracion); return configuracion;
  }),
  updateTaskPhase: (id, nombre) => set((state) => {
    const normalizedName = normalizeTaskPhaseName(nombre); if (!normalizedName) return state;
    const now = new Date().toISOString(); const configuracion = { ...selectConfiguracionState(state), taskPhases: state.taskPhases.map((phase) => phase.id === id ? { ...phase, nombre: normalizedName, updatedAt: now } : phase) };
    commitTaskCatalogConfiguracion(set, configuracion); return configuracion;
  }),
  toggleTaskPhase: (id) => set((state) => {
    const now = new Date().toISOString(); const configuracion = { ...selectConfiguracionState(state), taskPhases: state.taskPhases.map((phase) => phase.id === id ? { ...phase, active: !phase.active, updatedAt: now } : phase) };
    commitTaskCatalogConfiguracion(set, configuracion); return configuracion;
  }),
  addTaskOrigin: (nombre, tipo) => set((state) => {
    const normalizedName = normalizeTaskOriginName(nombre); if (!normalizedName) return state;
    const now = new Date().toISOString(); const origin: TaskOriginConfig = { id: `${createTaskOriginIdFromName(normalizedName)}-${Date.now().toString(36)}`, nombre: normalizedName, tipo, active: true, createdAt: now, updatedAt: now };
    const configuracion = { ...selectConfiguracionState(state), taskOrigins: [...state.taskOrigins, origin] }; commitTaskCatalogConfiguracion(set, configuracion); return configuracion;
  }),
  updateTaskOrigin: (id, nombre, tipo) => set((state) => {
    const normalizedName = normalizeTaskOriginName(nombre); if (!normalizedName) return state;
    const now = new Date().toISOString(); const configuracion = { ...selectConfiguracionState(state), taskOrigins: state.taskOrigins.map((origin) => origin.id === id ? { ...origin, nombre: normalizedName, tipo, updatedAt: now } : origin) };
    commitTaskCatalogConfiguracion(set, configuracion); return configuracion;
  }),
  toggleTaskOrigin: (id) => set((state) => {
    const now = new Date().toISOString(); const configuracion = { ...selectConfiguracionState(state), taskOrigins: state.taskOrigins.map((origin) => origin.id === id ? { ...origin, active: !origin.active, updatedAt: now } : origin) };
    commitTaskCatalogConfiguracion(set, configuracion); return configuracion;
  }),
  deleteTaskOrigin: (id) => set((state) => {
    const now = new Date().toISOString(); const configuracion = { ...selectConfiguracionState(state), taskOrigins: state.taskOrigins.map((origin) => origin.id === id ? { ...origin, active: false, deletedAt: now, updatedAt: now } : origin) };
    commitTaskCatalogConfiguracion(set, configuracion); return configuracion;
  }),
  addTaskResponsible: (nombre, windowsUser) => set((state) => {
    const normalizedName = normalizeTaskResponsibleName(nombre); if (!normalizedName) return state;
    const now = new Date().toISOString();
    const responsible: TaskResponsibleConfig = {
      id: `${createTaskResponsibleIdFromName(normalizedName)}-${Date.now().toString(36)}`,
      nombre: normalizedName,
      windowsUser: normalizeWindowsUser(windowsUser),
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    const configuracion = { ...selectConfiguracionState(state), taskResponsibles: [...state.taskResponsibles, responsible] };
    commitTaskCatalogConfiguracion(set, configuracion); return configuracion;
  }),
  updateTaskResponsible: (id, nombre, windowsUser) => set((state) => {
    const normalizedName = normalizeTaskResponsibleName(nombre); if (!normalizedName) return state;
    const now = new Date().toISOString();
    const configuracion = {
      ...selectConfiguracionState(state),
      taskResponsibles: state.taskResponsibles.map((responsible) => responsible.id === id ? {
        ...responsible,
        nombre: normalizedName,
        windowsUser: normalizeWindowsUser(windowsUser),
        updatedAt: now,
      } : responsible),
    };
    commitTaskCatalogConfiguracion(set, configuracion); return configuracion;
  }),
  toggleTaskResponsible: (id) => set((state) => {
    const now = new Date().toISOString();
    const configuracion = {
      ...selectConfiguracionState(state),
      taskResponsibles: state.taskResponsibles.map((responsible) => responsible.id === id ? { ...responsible, active: !responsible.active, updatedAt: now } : responsible),
    };
    commitTaskCatalogConfiguracion(set, configuracion); return configuracion;
  }),
}));

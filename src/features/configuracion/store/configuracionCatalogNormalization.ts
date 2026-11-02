import {
  DEFAULT_TASK_PHASES, normalizeTaskPhaseName, type TaskPhaseConfig,
} from '../domain/taskPhases';
import {
  DEFAULT_TASK_ORIGINS, normalizeTaskOriginName, type TaskOriginConfig,
} from '../domain/taskOrigins';
import {
  DEFAULT_TASK_STATES, normalizeTaskStateName, type TaskStateConfig,
} from '../domain/taskStates';
import {
  DEFAULT_TASK_RESPONSIBLES, normalizeTaskResponsibleName, normalizeWindowsUser, type TaskResponsibleConfig,
} from '../domain/taskResponsibles';

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

export function normalizeTaskResponsibles(value: unknown): TaskResponsibleConfig[] {
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

export function normalizeTaskStates(value: unknown): TaskStateConfig[] {
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

export function normalizeTaskPhases(value: unknown): TaskPhaseConfig[] {
  if (!Array.isArray(value)) return DEFAULT_TASK_PHASES;
  const phases = value.filter(isTaskPhaseConfig).map((phase) => ({ ...phase, nombre: normalizeTaskPhaseName(phase.nombre) }));
  const missingDefaultPhases = DEFAULT_TASK_PHASES.filter((defaultPhase) => !phases.some((phase) => phase.id === defaultPhase.id));
  return [...phases, ...missingDefaultPhases];
}

export function normalizeTaskOrigins(value: unknown): TaskOriginConfig[] {
  if (!Array.isArray(value)) return DEFAULT_TASK_ORIGINS;
  const origins = value.filter(isTaskOriginConfig).map((origin) => ({ ...origin, nombre: normalizeTaskOriginName(origin.nombre) }));
  const missingDefaultOrigins = DEFAULT_TASK_ORIGINS.filter((defaultOrigin) => !origins.some((origin) => origin.id === defaultOrigin.id));
  return [...origins, ...missingDefaultOrigins];
}


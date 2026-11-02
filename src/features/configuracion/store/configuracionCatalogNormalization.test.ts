import { describe, expect, it } from 'vitest';
import { DEFAULT_TASK_STATES } from '../domain/taskStates';
import { DEFAULT_TASK_PHASES } from '../domain/taskPhases';
import { DEFAULT_TASK_ORIGINS } from '../domain/taskOrigins';
import { DEFAULT_TASK_RESPONSIBLES } from '../domain/taskResponsibles';
import {
  normalizeTaskStates, normalizeTaskPhases, normalizeTaskOrigins, normalizeTaskResponsibles,
} from './configuracionCatalogNormalization';

describe('normalización de catálogos de Configuración extraída del store', () => {
  it('mantiene los catálogos predefinidos cuando faltan datos', () => {
    expect(normalizeTaskStates(null)).toEqual(DEFAULT_TASK_STATES);
    expect(normalizeTaskPhases(undefined)).toEqual(DEFAULT_TASK_PHASES);
    expect(normalizeTaskOrigins('incorrecto')).toEqual(DEFAULT_TASK_ORIGINS);
    expect(normalizeTaskResponsibles({})).toEqual(DEFAULT_TASK_RESPONSIBLES);
  });
  it('descarta entradas malformadas sin eliminar elementos predefinidos', () => {
    expect(normalizeTaskStates([null, 3])).toEqual(DEFAULT_TASK_STATES);
    expect(normalizeTaskPhases([{}, null])).toEqual(DEFAULT_TASK_PHASES);
    expect(normalizeTaskOrigins([1, {}])).toEqual(DEFAULT_TASK_ORIGINS);
    expect(normalizeTaskResponsibles([undefined, false])).toEqual(DEFAULT_TASK_RESPONSIBLES);
  });
});

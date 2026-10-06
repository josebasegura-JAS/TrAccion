import { describe, expect, it } from 'vitest';
import type { CoordinationState } from '../domain/coordinacion';
import {
  coordinationTargetsEqual,
  updateAreaTarget,
  updateDirectionTarget,
  updateTaskTargets,
  updateUnionTarget,
} from './coordinationTaskTargets';

const baseState: CoordinationState = {
  meetings: [],
  directionTaskIds: ['task-a'],
  unionTaskIds: {
    LAB: ['task-a', 'task-b'],
    ELA: ['task-c'],
  },
  areaTaskIds: {
    Operaciones: ['task-a', 'task-d'],
    Finanzas: ['task-e'],
  },
};

describe('coordinationTaskTargets', () => {
  it('añade y elimina una tarea de Dirección sin duplicarla', () => {
    const added = updateDirectionTarget(baseState, 'task-b', true);
    expect(added.directionTaskIds).toEqual(['task-a', 'task-b']);

    const deduplicated = updateDirectionTarget(added, 'task-b', true);
    expect(deduplicated.directionTaskIds).toEqual(['task-a', 'task-b']);

    const removed = updateDirectionTarget(deduplicated, 'task-a', false);
    expect(removed.directionTaskIds).toEqual(['task-b']);
  });

  it('mueve una tarea entre sindicatos eliminando asignaciones anteriores', () => {
    const next = updateUnionTarget(baseState, 'task-a', ' ELA ');
    expect(next.unionTaskIds.LAB).toEqual(['task-b']);
    expect(next.unionTaskIds.ELA).toEqual(['task-c', 'task-a']);
  });

  it('permite dejar una tarea sin sindicato', () => {
    const next = updateUnionTarget(baseState, 'task-a', null);
    expect(next.unionTaskIds.LAB).toEqual(['task-b']);
    expect(next.unionTaskIds.ELA).toEqual(['task-c']);
  });

  it('mueve una tarea entre áreas eliminando asignaciones anteriores', () => {
    const next = updateAreaTarget(baseState, 'task-a', ' Finanzas ');
    expect(next.areaTaskIds.Operaciones).toEqual(['task-d']);
    expect(next.areaTaskIds.Finanzas).toEqual(['task-e', 'task-a']);
  });

  it('actualiza Dirección, sindicato y área como una única transformación', () => {
    const next = updateTaskTargets(baseState, 'task-a', {
      direction: false,
      unionName: 'ELA',
      areaName: 'Finanzas',
    });

    expect(next.directionTaskIds).toEqual([]);
    expect(next.unionTaskIds.LAB).toEqual(['task-b']);
    expect(next.unionTaskIds.ELA).toEqual(['task-c', 'task-a']);
    expect(next.areaTaskIds.Operaciones).toEqual(['task-d']);
    expect(next.areaTaskIds.Finanzas).toEqual(['task-e', 'task-a']);
  });

  it('compara únicamente los destinos y no las reuniones', () => {
    expect(coordinationTargetsEqual(baseState, { ...baseState, meetings: [] })).toBe(true);
    expect(coordinationTargetsEqual(baseState, updateDirectionTarget(baseState, 'task-z', true))).toBe(false);
  });
});

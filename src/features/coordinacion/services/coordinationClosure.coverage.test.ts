import { describe, expect, it } from 'vitest';
import type { CoordinationState } from '../domain/coordinacion';
import { buildClosedCoordinationState } from './coordinationClosure';

const NOW = '2026-10-27T12:00:00.000Z';

function state(
  area: 'direccion' | 'sindicatos' | 'otras-areas',
  points: Array<{ taskId?: string; status: string }>,
  options: { status?: 'open' | 'closed'; unionName?: string; areaName?: string } = {},
): CoordinationState {
  return {
    directionTaskIds: ['existing'],
    unionTaskIds: { LAB: ['existing', 'done'] },
    areaTaskIds: { Operaciones: ['existing', 'done'] },
    meetings: [{
      id: 'meeting-1',
      area,
      status: options.status ?? 'open',
      unionName: options.unionName,
      areaName: options.areaName,
      points: points.map((point, index) => ({ id: `p-${index}`, ...point })),
    }],
  } as unknown as CoordinationState;
}

describe('buildClosedCoordinationState: cierre de reuniones y continuidad de tareas', () => {
  it('no modifica el estado cuando la reunión no existe', () => {
    const original = state('direccion', []);
    expect(buildClosedCoordinationState(original, 'missing', NOW)).toBeNull();
  });

  it('devuelve la misma referencia cuando ya estaba cerrada', () => {
    const original = state('direccion', [], { status: 'closed' });
    expect(buildClosedCoordinationState(original, 'meeting-1', NOW)).toBe(original);
  });

  it('cierra la reunión con fecha y no muta el original', () => {
    const original = state('direccion', []);
    const next = buildClosedCoordinationState(original, 'meeting-1', NOW);
    expect(next?.meetings[0]).toMatchObject({ status: 'closed', closedAt: NOW, updatedAt: NOW });
    expect(original.meetings[0].status).toBe('open');
    expect(next).not.toBe(original);
  });

  it('en Dirección retira tareas tratadas y en seguimiento, conservando las pendientes', () => {
    const original = state('direccion', [
      { taskId: 'existing', status: 'tratado' },
      { taskId: 'new', status: 'pendiente' },
      { taskId: 'later', status: 'volver' },
      { taskId: 'unseen', status: 'no-tratado' },
      { status: 'pendiente' },
    ]);
    const next = buildClosedCoordinationState(original, 'meeting-1', NOW);
    expect(next?.directionTaskIds).toEqual(['new', 'later', 'unseen']);
    expect(original.directionTaskIds).toEqual(['existing']);
  });

  it('en Sindicatos modifica solo las tareas del sindicato de la reunión', () => {
    const original = state('sindicatos', [
      { taskId: 'done', status: 'seguimiento' },
      { taskId: 'new', status: 'pendiente' },
    ], { unionName: 'LAB' });
    const next = buildClosedCoordinationState(original, 'meeting-1', NOW);
    expect(next?.unionTaskIds.LAB).toEqual(['existing', 'new']);
    expect(original.unionTaskIds.LAB).toEqual(['existing', 'done']);
  });

  it('en Otras áreas mantiene las tareas sin tratar y retira las tratadas', () => {
    const original = state('otras-areas', [
      { taskId: 'done', status: 'tratado' },
      { taskId: 'new', status: 'no-tratado' },
    ], { areaName: 'Operaciones' });
    const next = buildClosedCoordinationState(original, 'meeting-1', NOW);
    expect(next?.areaTaskIds.Operaciones).toEqual(['existing', 'new']);
  });

  it('no crea asignaciones a sindicatos o áreas cuando falta su nombre', () => {
    const union = state('sindicatos', [{ taskId: 'new', status: 'pendiente' }]);
    const area = state('otras-areas', [{ taskId: 'new', status: 'pendiente' }]);
    expect(buildClosedCoordinationState(union, 'meeting-1', NOW)?.unionTaskIds).toEqual(union.unionTaskIds);
    expect(buildClosedCoordinationState(area, 'meeting-1', NOW)?.areaTaskIds).toEqual(area.areaTaskIds);
  });
});

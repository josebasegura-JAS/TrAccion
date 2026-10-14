import { describe, expect, it } from 'vitest';
import type { ManagedSession } from './session';
import { applySessionTaskOrder } from './sessionTaskOrder';

const session: ManagedSession = {
  id: 'session-1',
  title: 'Comité de Empresa',
  date: '2026-10-30',
  code: 'Definitiva',
  notes: '',
  observations: '',
  status: 'open',
  items: ['task-1', 'task-2', 'task-3'],
  treatedTaskIds: [],
  untreatedTaskIds: [],
  createdAt: '2026-10-14T08:00:00.000Z',
  updatedAt: '2026-10-14T08:00:00.000Z',
  closedAt: null,
};

describe('applySessionTaskOrder', () => {
  it('aplica de una vez el orden completo sin perder puntos', () => {
    const updated = applySessionTaskOrder(
      session,
      ['task-3', 'task-1', 'task-2'],
      '2026-10-14T09:00:00.000Z',
    );

    expect(updated.items).toEqual(['task-3', 'task-1', 'task-2']);
    expect(updated.updatedAt).toBe('2026-10-14T09:00:00.000Z');
  });

  it('rechaza un orden que ya no contiene exactamente los mismos puntos', () => {
    expect(() => applySessionTaskOrder(session, ['task-1', 'task-3'])).toThrow(
      'Los puntos de la sesión han cambiado',
    );
  });

  it('rechaza ordenar una sesión cerrada', () => {
    expect(() =>
      applySessionTaskOrder({ ...session, status: 'closed' }, ['task-1', 'task-2', 'task-3']),
    ).toThrow('La sesión ya no está abierta');
  });
});

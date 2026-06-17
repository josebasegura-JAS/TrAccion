import { describe, expect, it } from 'vitest';
import type { Task } from '../../features/tareas/domain/task';
import {
  formatManagedSessionDate,
  isManagedSession,
  isTaskInSessionPhase,
  managedSessionLabel,
  normalizeManagedSession,
  type ManagedSession,
} from './session';

const timestamp = '2026-06-17T08:00:00.000Z';

function task(overrides: Partial<Pick<Task, 'fase' | 'estado' | 'deletedAt'>> = {}): Pick<Task, 'fase' | 'estado' | 'deletedAt'> {
  return {
    fase: 'comite',
    estado: 'pendiente',
    deletedAt: null,
    ...overrides,
  };
}

function session(overrides: Partial<ManagedSession> = {}): ManagedSession {
  return {
    id: 'session-1',
    date: '2026-06-17',
    code: 'CE-2026-06',
    title: 'Comité junio',
    notes: '',
    status: 'open',
    items: ['task-1', 'task-2'],
    treatedTaskIds: [],
    untreatedTaskIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    closedAt: null,
    ...overrides,
  };
}

describe('managed session domain', () => {
  it('considera seleccionables solo tareas abiertas, no borradas y en la fase de la sesión', () => {
    expect(isTaskInSessionPhase(task(), 'comite')).toBe(true);
    expect(isTaskInSessionPhase(task({ fase: ' COMITE ' }), 'comite')).toBe(true);
    expect(isTaskInSessionPhase(task({ estado: 'cerrada' }), 'comite')).toBe(false);
    expect(isTaskInSessionPhase(task({ deletedAt: timestamp }), 'comite')).toBe(false);
    expect(isTaskInSessionPhase(task({ fase: 'paritaria' }), 'comite')).toBe(false);
  });

  it('formatea fechas y etiquetas sin romper valores vacíos o inválidos', () => {
    expect(formatManagedSessionDate('2026-06-17')).toBe('17/6/2026');
    expect(formatManagedSessionDate('')).toBe('Sin fecha');
    expect(formatManagedSessionDate('fecha-libre')).toBe('fecha-libre');
    expect(managedSessionLabel({ code: 'CE-2026-06', date: '2026-06-17' })).toBe('CE-2026-06 · 17/6/2026');
    expect(managedSessionLabel({ code: '', date: '' })).toBe('Sin código · Sin fecha');
  });

  it('normaliza sesiones históricas anteriores a 2026 como cerradas y tratadas', () => {
    const normalized = normalizeManagedSession(
      session({ date: '2025-05-21', status: 'open', closedAt: null, treatedTaskIds: [], untreatedTaskIds: ['task-1'] }),
      'Comité',
    );

    expect(normalized.status).toBe('closed');
    expect(normalized.closedAt).toBe('2025-05-21T00:00:00.000Z');
    expect(normalized.treatedTaskIds).toEqual(['task-1', 'task-2']);
    expect(normalized.untreatedTaskIds).toEqual([]);
  });

  it('identifica sesiones mínimas válidas frente a objetos incompletos', () => {
    expect(isManagedSession(session())).toBe(true);
    expect(isManagedSession({ id: 'x', date: '2026-06-17', code: 'CE', title: 'CE', status: 'open' })).toBe(true);
    expect(isManagedSession({ id: 'x', date: '2026-06-17', code: 'CE', status: 'open' })).toBe(false);
    expect(isManagedSession(null)).toBe(false);
  });
});

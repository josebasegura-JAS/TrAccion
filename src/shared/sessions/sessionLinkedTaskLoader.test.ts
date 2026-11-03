import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ManagedSession } from './session';
import { loadSessionLinkedTasks, missingSessionTaskIds } from './sessionLinkedTaskLoader';

const exampleSession = (id: string, items: string[]): ManagedSession => ({
  id, code: id, date: '2026-11-03', title: id, notes: '', observations: '',
  status: 'closed', items, treatedTaskIds: items, untreatedTaskIds: [],
  createdAt: '2026-11-03', updatedAt: '2026-11-03', closedAt: '2026-11-03',
});

afterEach(() => {
  Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
});

describe('consulta selectiva de puntos históricos de Comité y Paritaria', () => {
  it('solo solicita IDs no disponibles y elimina duplicados entre sesiones', () => {
    const sessions = [
      exampleSession('comite-1', ['task-a', 'task-b']),
      exampleSession('paritaria-1', ['task-b', 'task-c']),
    ];
    expect(missingSessionTaskIds(sessions, new Set(['task-a']))).toEqual(['task-b', 'task-c']);
  });

  it('divide lotes grandes sin descargar el histórico completo', async () => {
    const loader = vi.fn(async (_filter?: { ids?: string[] }) => {
      void _filter;
      return {
        status: { ready: true, phase: 'active' },
        records: [],
      };
    });
    Object.defineProperty(window, 'traccion', {
      configurable: true, value: { loadTaskRecords: loader },
    });

    const ids = Array.from({ length: 601 }, (_, index) => `task-${index}`);
    await expect(loadSessionLinkedTasks(ids)).resolves.toEqual([]);
    expect(loader).toHaveBeenCalledTimes(3);
    expect(loader.mock.calls[0]?.[0]).toEqual({ ids: ids.slice(0, 300) });
    expect(loader.mock.calls[1]?.[0]).toEqual({ ids: ids.slice(300, 600) });
    expect(loader.mock.calls[2]?.[0]).toEqual({ ids: ids.slice(600) });
  });

  it('una desconexión no se interpreta como histórico vacío', async () => {
    const loader = vi.fn(async () => ({
      status: { ready: false, phase: 'locked' },
      records: [],
    }));
    Object.defineProperty(window, 'traccion', {
      configurable: true, value: { loadTaskRecords: loader },
    });
    await expect(loadSessionLinkedTasks(['task-1'])).rejects.toThrow('SQLite no está disponible');
  });

  it('no consulta SQLite si no hay puntos pendientes', async () => {
    const loader = vi.fn();
    Object.defineProperty(window, 'traccion', {
      configurable: true, value: { loadTaskRecords: loader },
    });
    await expect(loadSessionLinkedTasks([])).resolves.toEqual([]);
    expect(loader).not.toHaveBeenCalled();
  });
});

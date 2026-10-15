import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasTaskSqliteRepository: vi.fn(),
  loadTasksFromSqlite: vi.fn(),
}));

vi.mock('../../features/tareas/store/taskSqliteRepository', () => ({
  hasTaskSqliteRepository: mocks.hasTaskSqliteRepository,
  loadTasksFromSqlite: mocks.loadTasksFromSqlite,
}));

vi.mock('../../features/tareas/store/taskNormalization', () => ({
  parseTasksSnapshot: vi.fn(),
}));

import { loadTasksForCatalogIntegrityCheck } from './taskCatalogIntegrityCheck';

describe('TaskCatalogSettings - integridad de renombrados', () => {
  beforeEach(() => {
    mocks.hasTaskSqliteRepository.mockReset();
    mocks.loadTasksFromSqlite.mockReset();
  });

  it('no usa un snapshot local si el repositorio SQLite no está disponible', async () => {
    mocks.hasTaskSqliteRepository.mockReturnValue(false);

    await expect(loadTasksForCatalogIntegrityCheck()).rejects.toThrow(
      'Repositorio SQLite de tareas no disponible',
    );
    expect(mocks.loadTasksFromSqlite).not.toHaveBeenCalled();
  });

  it('consulta todas las tareas en SQLite cuando el repositorio está disponible', async () => {
    mocks.hasTaskSqliteRepository.mockReturnValue(true);
    mocks.loadTasksFromSqlite.mockResolvedValue([]);

    await expect(loadTasksForCatalogIntegrityCheck()).resolves.toEqual([]);
    expect(mocks.loadTasksFromSqlite).toHaveBeenCalledTimes(1);
    expect(mocks.loadTasksFromSqlite.mock.calls[0]?.[1]).toBe('all');
  });

  it('rechaza el renombrado si SQLite no devuelve un snapshot válido', async () => {
    mocks.hasTaskSqliteRepository.mockReturnValue(true);
    mocks.loadTasksFromSqlite.mockResolvedValue(null);

    await expect(loadTasksForCatalogIntegrityCheck()).rejects.toThrow(
      'SQLite de tareas no está disponible',
    );
  });
});

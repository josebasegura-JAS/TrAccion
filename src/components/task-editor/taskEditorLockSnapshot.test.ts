import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../features/tareas/domain/task';
import { loadFreshTaskAfterLock, hasUnsavedTaskEditorChanges } from './taskEditorLockSnapshot';
import { readTasksForStore } from '../../features/tareas/store/taskPersistence';

vi.mock('../../features/tareas/store/taskPersistence', () => ({
  readTasksForStore: vi.fn(),
}));

const readMock = vi.mocked(readTasksForStore);

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    titulo: 'Versión nueva',
    updatedAt: '2026-11-09T13:50:00.000Z',
    deletedAt: null,
    ...overrides,
  } as Task;
}

beforeEach(() => vi.clearAllMocks());

describe('edición después de recuperar la reserva multiusuario', () => {
  it('obtiene la versión vigente por identificador en SQLite, no la abierta previamente en consulta', async () => {
    readMock.mockResolvedValue([task()]);

    const latest = await loadFreshTaskAfterLock('task-1');

    expect(readMock).toHaveBeenCalledWith('all', 'task-1');
    expect(latest.updatedAt).toBe('2026-11-09T13:50:00.000Z');
  });

  it('no permite activar la edición si el registro ya no existe', async () => {
    readMock.mockResolvedValue([]);
    await expect(loadFreshTaskAfterLock('task-1')).rejects.toThrow('No se ha podido recuperar');
  });

  it('no permite activar la edición de una tarea eliminada', async () => {
    readMock.mockResolvedValue([task({ deletedAt: '2026-11-09T13:51:00.000Z' })]);
    await expect(loadFreshTaskAfterLock('task-1')).rejects.toThrow('No se ha podido recuperar');
  });

  it('detecta borradores con cambios y evita reemplazarlos por el snapshot remoto', () => {
    const baseline = { draft: { titulo: 'Antes' }, trackingText: '', selectedAreaTarget: '' };
    expect(hasUnsavedTaskEditorChanges(baseline, baseline)).toBe(false);
    expect(hasUnsavedTaskEditorChanges({
      ...baseline,
      draft: { titulo: 'Modificación pendiente' },
    }, baseline)).toBe(true);
  });

  it('si SQLite rechaza la lectura, no inventa una versión ni desbloquea la edición', async () => {
    readMock.mockRejectedValue(new Error('SQLite no disponible'));
    await expect(loadFreshTaskAfterLock('task-1')).rejects.toThrow('SQLite no disponible');
  });
});

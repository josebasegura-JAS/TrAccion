import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../tareas/domain/task';
import { readFreshCoordinationTasks } from './coordinationTaskSnapshot';

const mocks = vi.hoisted(() => ({
  loadTasksFromSqlite: vi.fn(),
  hasTaskSqliteRepository: vi.fn(),
}));

vi.mock('../../tareas/store/taskSqliteRepository', () => ({
  hasTaskSqliteRepository: () => mocks.hasTaskSqliteRepository(),
  loadTasksFromSqlite: (...args: unknown[]) => mocks.loadTasksFromSqlite(...args),
}));

vi.mock('../../tareas/store/taskSessionReconciliation', () => ({
  reconcileTasksWithClosedSessions: (tasks: Task[]) => tasks,
}));

function task(id: string): Task {
  const now = '2026-10-14T08:00:00.000Z';
  return {
    id,
    titulo: `Tarea ${id}`,
    descripcion: '',
    tipo: 'tarea',
    fase: 'tarea',
    estado: 'pendiente',
    prioridad: 'media',
    fechaLimite: '',
    responsable: '',
    origen: '',
    sindicato: '',
    observaciones: '',
    mail: '',
    documentLinks: [],
    sessionDocumentCode: '',
    sessionModule: '',
    sessionDate: '',
    seguimiento: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    closedAt: null,
  };
}

describe('readFreshCoordinationTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasTaskSqliteRepository.mockReturnValue(true);
  });

  it('devuelve una lista vacía cuando SQLite confirma que no existen tareas', async () => {
    mocks.loadTasksFromSqlite.mockResolvedValue([]);
    await expect(readFreshCoordinationTasks()).resolves.toEqual([]);
  });

  it('no confunde un fallo de disponibilidad con una base sin tareas', async () => {
    mocks.loadTasksFromSqlite.mockResolvedValue(null);
    await expect(readFreshCoordinationTasks()).rejects.toThrow('No se pudieron recuperar las tareas desde SQLite');
  });

  it('propaga como error una lectura SQLite fallida', async () => {
    mocks.loadTasksFromSqlite.mockRejectedValue(new Error('database is locked'));
    await expect(readFreshCoordinationTasks()).rejects.toThrow('database is locked');
  });

  it('devuelve las tareas persistidas actuales', async () => {
    mocks.loadTasksFromSqlite.mockResolvedValue([task('a'), task('b')]);
    const result = await readFreshCoordinationTasks();
    expect(result.map((item) => item.id)).toEqual(['a', 'b']);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_TASK_DRAFT, type Task } from '../domain/task';
import { normalizeTask } from './taskNormalization';
import { useTaskStore } from './useTaskStore';

const status = { ready: true, phase: 'active' } as const;

function task(id: string, title: string, updatedAt: string): Task {
  return normalizeTask({
    ...EMPTY_TASK_DRAFT,
    id,
    titulo: title,
    sessionDocumentCode: '',
    sessionModule: '',
    sessionDate: '',
    seguimiento: [],
    createdAt: '2026-11-09T08:00:00.000Z',
    updatedAt,
    deletedAt: null,
    closedAt: null,
  });
}

function snapshot(...tasks: Task[]) {
  return {
    status,
    records: tasks.map((entry) => ({
      id: entry.id,
      value: JSON.stringify(entry),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      deletedAt: entry.deletedAt,
    })),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const native = {
  loadTaskRecords: vi.fn(),
  saveTaskRecordIfUnchanged: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  Object.defineProperty(window, 'traccion', { configurable: true, value: native });
  useTaskStore.setState({
    tasks: [],
    selectedTaskId: '',
    historicalTasksLoaded: false,
    isLoadingHistoricalTasks: false,
  });
});

afterEach(() => {
  Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
});

describe('sincronización ligera de listados de Tareas', () => {
  it('mantiene el mismo estado y referencias si el resultado de SQLite no ha cambiado', async () => {
    const initial = task('a', 'Primera tarea', '2026-11-09T08:01:00.000Z');
    native.loadTaskRecords.mockResolvedValue(snapshot(initial));
    await useTaskStore.getState().reloadFromStorage();
    const previous = useTaskStore.getState();
    let notifications = 0;
    const unsubscribe = useTaskStore.subscribe(() => { notifications += 1; });

    await useTaskStore.getState().reloadFromStorage();

    expect(useTaskStore.getState()).toBe(previous);
    expect(useTaskStore.getState().tasks).toBe(previous.tasks);
    expect(notifications).toBe(0);
    unsubscribe();
  });

  it('conserva la identidad de las filas no modificadas al llegar una edición externa', async () => {
    const first = task('a', 'Sin cambios', '2026-11-09T08:01:00.000Z');
    const second = task('b', 'Anterior', '2026-11-09T08:02:00.000Z');
    native.loadTaskRecords.mockResolvedValueOnce(snapshot(first, second))
      .mockResolvedValueOnce(snapshot(first, task('b', 'Actualizada', '2026-11-09T08:03:00.000Z')));

    await useTaskStore.getState().reloadFromStorage();
    const before = useTaskStore.getState().tasks;
    await useTaskStore.getState().reloadFromStorage();
    const after = useTaskStore.getState().tasks;

    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[1].titulo).toBe('Actualizada');
  });

  it('descarta una lectura anterior que termina después de la más reciente', async () => {
    const previous = deferred<ReturnType<typeof snapshot>>();
    const current = deferred<ReturnType<typeof snapshot>>();
    native.loadTaskRecords.mockImplementationOnce(() => previous.promise)
      .mockImplementationOnce(() => current.promise);

    const oldRequest = useTaskStore.getState().reloadFromStorage();
    const newRequest = useTaskStore.getState().reloadFromStorage();

    current.resolve(snapshot(task('a', 'Nueva', '2026-11-09T08:05:00.000Z')));
    await newRequest;
    previous.resolve(snapshot(task('a', 'Antigua', '2026-11-09T08:01:00.000Z')));
    await oldRequest;

    expect(useTaskStore.getState().tasks[0].titulo).toBe('Nueva');
  });

  it('mantiene y refresca el histórico cuando ya está cargado', async () => {
    const active = task('a', 'Activa', '2026-11-09T08:01:00.000Z');
    const closed = normalizeTask({
      ...task('h', 'Histórica', '2026-11-09T08:01:00.000Z'),
      estado: 'cerrada',
      fase: 'cerrada',
      closedAt: '2026-11-09T08:01:00.000Z',
    });
    const updatedHistorical = { ...closed, titulo: 'Histórica actualizada' };
    const deleted = { ...task('deleted', 'Eliminada', '2026-11-09T08:01:00.000Z'), deletedAt: '2026-11-09T08:04:00.000Z' };
    native.loadTaskRecords.mockResolvedValueOnce(snapshot(active))
      .mockResolvedValueOnce(snapshot(closed))
      .mockResolvedValueOnce(snapshot(active, updatedHistorical, deleted));

    await useTaskStore.getState().reloadFromStorage();
    await useTaskStore.getState().loadHistoricalTasks();
    expect(useTaskStore.getState().historicalTasksLoaded).toBe(true);
    expect(useTaskStore.getState().tasks).toHaveLength(2);

    await useTaskStore.getState().reloadFromStorage();

    const state = useTaskStore.getState();
    expect(state.historicalTasksLoaded).toBe(true);
    expect(state.tasks.find((entry) => entry.id === 'h')?.titulo).toBe('Histórica actualizada');
    expect(state.tasks.some((entry) => entry.id === 'deleted')).toBe(false);
    expect(native.loadTaskRecords).toHaveBeenLastCalledWith({ mode: 'all', id: undefined });
  });

  it('no oculta el histórico si una lectura de activas termina tras abrirlo', async () => {
    const active = task('a', 'Activa', '2026-11-09T08:01:00.000Z');
    const closed = normalizeTask({
      ...task('h', 'Histórica', '2026-11-09T08:01:00.000Z'),
      estado: 'cerrada',
      fase: 'cerrada',
      closedAt: '2026-11-09T08:01:00.000Z',
    });
    const delayedActive = deferred<ReturnType<typeof snapshot>>();
    native.loadTaskRecords.mockImplementationOnce(() => delayedActive.promise)
      .mockResolvedValueOnce(snapshot(closed));

    const pending = useTaskStore.getState().reloadFromStorage();
    await useTaskStore.getState().loadHistoricalTasks();
    expect(useTaskStore.getState().historicalTasksLoaded).toBe(true);

    delayedActive.resolve(snapshot(active));
    await pending;

    expect(useTaskStore.getState().historicalTasksLoaded).toBe(true);
    expect(useTaskStore.getState().tasks.some((entry) => entry.id === 'h')).toBe(true);
  });

  it('preserva la selección de tarea al actualizar el listado', async () => {
    native.loadTaskRecords.mockResolvedValueOnce(snapshot(
      task('a', 'A', '2026-11-09T08:01:00.000Z'),
      task('b', 'B', '2026-11-09T08:01:00.000Z'),
    )).mockResolvedValueOnce(snapshot(
      task('a', 'A', '2026-11-09T08:01:00.000Z'),
      task('b', 'B editada', '2026-11-09T08:02:00.000Z'),
    ));

    await useTaskStore.getState().reloadFromStorage();
    useTaskStore.getState().selectTask('b');
    await useTaskStore.getState().reloadFromStorage();
    expect(useTaskStore.getState().selectedTaskId).toBe('b');
  });
});

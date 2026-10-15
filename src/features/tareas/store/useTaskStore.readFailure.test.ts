import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_TASK_FILTERS } from '../domain/filters';
import type { Task } from '../domain/task';
import { readTasksForStore } from './taskPersistence';
import { useTaskStore } from './useTaskStore';

const timestamp = '2026-10-15T06:00:00.000Z';

function task(id = 'task-1'): Task {
  return {
    id,
    titulo: 'Tarea existente',
    descripcion: '',
    tipo: 'interna',
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
    createdAt: timestamp,
    updatedAt: timestamp,
    closedAt: null,
    deletedAt: null,
  };
}

function installFailingTaskRepository(): void {
  Object.defineProperty(window, 'traccion', {
    configurable: true,
    value: {
      loadTaskRecords: vi.fn().mockRejectedValue(new Error('SMB no disponible')),
      saveTaskRecordIfUnchanged: vi.fn(),
    },
  });
}

describe('Tareas - fallos de lectura SQLite', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    useTaskStore.setState({
      tasks: [],
      selectedTaskId: '',
      historicalTasksLoaded: false,
      isLoadingHistoricalTasks: false,
      filters: EMPTY_TASK_FILTERS,
    });
    installFailingTaskRepository();
  });

  it('readTasksForStore propaga el error en vez de convertirlo en lista vacía', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(readTasksForStore('active')).rejects.toThrow('SMB no disponible');

    errorSpy.mockRestore();
  });

  it('reloadFromStorage conserva el snapshot anterior si falla la lectura', async () => {
    const existing = task();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useTaskStore.setState({ tasks: [existing], selectedTaskId: existing.id });

    await expect(useTaskStore.getState().reloadFromStorage()).rejects.toThrow('SMB no disponible');

    expect(useTaskStore.getState().tasks).toEqual([existing]);
    expect(useTaskStore.getState().selectedTaskId).toBe(existing.id);
    errorSpy.mockRestore();
  });

  it('una carga histórica fallida conserva tareas y permite reintentar después', async () => {
    const existing = task();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    useTaskStore.setState({
      tasks: [existing],
      selectedTaskId: existing.id,
      historicalTasksLoaded: false,
      isLoadingHistoricalTasks: false,
    });

    await useTaskStore.getState().loadHistoricalTasks();

    expect(useTaskStore.getState().tasks).toEqual([existing]);
    expect(useTaskStore.getState().historicalTasksLoaded).toBe(false);
    expect(useTaskStore.getState().isLoadingHistoricalTasks).toBe(false);
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

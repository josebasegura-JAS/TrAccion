import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../domain/task';
import { hasTaskSqliteRepository, loadTasksFromSqlite, saveTaskToSqlite } from './taskSqliteRepository';

const timestamp = '2026-06-17T08:00:00.000Z';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    titulo: 'Tarea SQLite',
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
    seguimiento: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    closedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function parseTasks(storageValue: string | null): Task[] {
  return storageValue ? (JSON.parse(storageValue) as Task[]) : [];
}

describe('taskSqliteRepository', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0),
    });
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
  });

  it('detecta si el repositorio SQLite de tareas está disponible', () => {
    expect(hasTaskSqliteRepository()).toBe(false);

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadTaskRecords: vi.fn(), saveTaskRecordIfUnchanged: vi.fn() },
    });

    expect(hasTaskSqliteRepository()).toBe(true);
  });

  it('devuelve null si SQLite no está activo para lectura', async () => {
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadTaskRecords: vi.fn(async () => ({
          status: { ready: false, phase: 'initializing', message: 'Inicializando' },
          records: [],
        })),
      },
    });

    await expect(loadTasksFromSqlite(parseTasks)).resolves.toBeNull();
  });

  it('carga registros de tareas desde snapshot SQLite activo', async () => {
    const storedTask = task({ id: 'task-2', titulo: 'Persistida' });
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadTaskRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [{ id: storedTask.id, value: JSON.stringify(storedTask), updatedAt: timestamp }],
        })),
      },
    });

    await expect(loadTasksFromSqlite(parseTasks)).resolves.toEqual([storedTask]);
  });

  it('guarda tarea con expectedUpdatedAt y devuelve el resultado normalizado', async () => {
    const saver = vi.fn(async () => ({ ok: true, message: 'Tarea guardada.', currentUpdatedAt: timestamp }));
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveTaskRecordIfUnchanged: saver },
    });

    const result = await saveTaskToSqlite(task(), 'previous-token');

    expect(saver).toHaveBeenCalledWith({ id: 'task-1', value: JSON.stringify(task()), expectedUpdatedAt: 'previous-token' });
    expect(result).toEqual({ ok: true, message: 'Tarea guardada.', currentUpdatedAt: timestamp });
  });

  it('devuelve null si no existe saver SQLite para escritura', async () => {
    await expect(saveTaskToSqlite(task(), null)).resolves.toBeNull();
  });
});

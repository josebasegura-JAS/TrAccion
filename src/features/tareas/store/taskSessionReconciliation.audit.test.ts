import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_TASK_DRAFT, type Task } from '../domain/task';
import { normalizeTask } from './taskNormalization';
import { reconcileTasksWithClosedSessions } from './taskSessionReconciliation';
import { readTasksForStore } from './taskPersistence';
import { readStorageItem } from '../../../services/persistence';
import { loadTasksFromSqlite, saveTaskToSqlite } from './taskSqliteRepository';

// Pruebas de caracterización: registran el comportamiento ACTUAL de la
// reconciliación legacy. No equivalen a aprobar el cierre automático: sus
// casos sirven para decidir una corrección posterior sin tocar producción.
vi.mock('../../../services/persistence', () => ({
  readStorageItem: vi.fn(),
  writeStorageItem: vi.fn(),
}));
vi.mock('./taskSqliteRepository', () => ({
  hasTaskSqliteRepository: () => true,
  loadTasksFromSqlite: vi.fn(),
  saveTaskToSqlite: vi.fn(),
}));

const stored = new Map<string, string>();
const readMock = vi.mocked(readStorageItem);
const loadMock = vi.mocked(loadTasksFromSqlite);
const saveMock = vi.mocked(saveTaskToSqlite);

function task(overrides: Partial<Task> = {}): Task {
  return normalizeTask({
    ...EMPTY_TASK_DRAFT,
    id: 'reopened-task',
    titulo: 'Tarea reabierta',
    fase: 'tarea',
    estado: 'pendiente',
    sessionDocumentCode: '',
    sessionModule: '',
    sessionDate: '',
    seguimiento: [],
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-09T08:00:00.000Z',
    closedAt: null,
    deletedAt: null,
    ...overrides,
  });
}

function legacySession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'legacy-session',
    date: '2026-10-01',
    code: 'COM-2026-10',
    title: 'Comité de octubre',
    status: 'closed',
    items: ['reopened-task'],
    treatedTaskIds: ['reopened-task'],
    untreatedTaskIds: [],
    taskResults: { 'reopened-task': 'resolved' },
    closedAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  };
}

function setLegacySession(session: ReturnType<typeof legacySession>, key = 'traccion.v1.comite.sessions') {
  stored.set(key, JSON.stringify([session]));
}

beforeEach(() => {
  vi.clearAllMocks();
  stored.clear();
  readMock.mockImplementation((key) => stored.get(key) ?? null);
  loadMock.mockImplementation(async () => [task()]);
  saveMock.mockResolvedValue({ ok: true, message: 'Guardado.', currentUpdatedAt: null });
});

describe('auditoría de integridad: reconciliación legacy Comité/Paritaria', () => {
  it('sin blob legacy no altera tareas activas ni introduce escrituras durante la lectura', async () => {
    const original = task();
    loadMock.mockResolvedValue([original]);

    const result = await readTasksForStore('active');

    expect(result).toHaveLength(1);
    expect(result[0].estado).toBe('pendiente');
    expect(result[0].updatedAt).toBe(original.updatedAt);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('REGRESIÓN: un blob legacy cerrado no vuelve a cerrar una tarea reabierta durante lecturas SQLite', async () => {
    const original = task();
    setLegacySession(legacySession());
    loadMock.mockResolvedValue([original]);

    const result = await readTasksForStore('active');

    expect(result[0]).toEqual(original);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('COMPATIBILIDAD: el helper legacy conserva su antigua regla para migraciones explícitas', () => {
    setLegacySession(legacySession({
      date: '2025-09-10',
      status: 'open',
      closedAt: null,
      taskResults: {},
    }));

    const result = reconcileTasksWithClosedSessions([task()]);

    expect(result[0].estado).toBe('cerrada');
  });

  it('si una sesión moderna está abierta, no cierra las tareas durante la lectura', async () => {
    setLegacySession(legacySession({ status: 'open', closedAt: null }));
    const result = await readTasksForStore('active');

    expect(result[0].estado).toBe('pendiente');
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('una tarea ya reconciliada no genera una nueva escritura cuando se vuelve a leer', async () => {
    setLegacySession(legacySession());
    const initial = reconcileTasksWithClosedSessions([task()]);
    loadMock.mockResolvedValue(initial);

    const result = await readTasksForStore('active');

    expect(result[0].estado).toBe('cerrada');
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('una sesión legacy cerrada en Paritaria sigue aplicando la misma reconciliación', async () => {
    setLegacySession(legacySession({ code: 'PAR-2026-10' }), 'traccion.v1.paritaria.sessions');

    const result = await readTasksForStore('active');

    expect(result[0].estado).toBe('pendiente');
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('no modifica una tarea eliminada aunque aparezca vinculada a una sesión cerrada', async () => {
    const deleted = task({ deletedAt: '2026-11-09T09:00:00.000Z' });
    setLegacySession(legacySession());
    loadMock.mockResolvedValue([deleted]);

    const result = await readTasksForStore('all');

    expect(result[0].estado).toBe('pendiente');
    expect(saveMock).not.toHaveBeenCalled();
  });
  it('preserva cambios de una tarea activa aunque el blob legacy esté cerrado y se consulte por id', async () => {
    const original = task({
      titulo: 'Reabierta y editada',
      estado: 'en curso',
      updatedAt: '2026-11-09T09:00:00.000Z',
    });
    setLegacySession(legacySession());
    loadMock.mockResolvedValue([original]);

    const result = await readTasksForStore('all', original.id);

    expect(result).toEqual([original]);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('no guarda cambios por mera normalización de una tarea ya existente', async () => {
    const original = task({ sessionDocumentCode: 'CE-2026-10' });
    loadMock.mockResolvedValue([original]);
    const result = await readTasksForStore('all');

    expect(result[0].sessionDocumentCode).toBe('CE-2026-10');
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('una tarea histórica reabierta después de 2025 conserva fase y estado', async () => {
    const original = task({
      createdAt: '2025-09-10T09:00:00.000Z',
      updatedAt: '2026-11-09T10:00:00.000Z',
      origen: 'Comité de Empresa',
      fase: 'tarea',
      estado: 'en curso',
      closedAt: null,
    });
    setLegacySession(legacySession({ date: '2025-09-10', status: 'closed' }));
    loadMock.mockResolvedValue([original]);

    const result = await readTasksForStore('active');

    expect(result[0]).toMatchObject({
      fase: 'tarea',
      estado: 'en curso',
      closedAt: null,
      updatedAt: original.updatedAt,
    });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('mantiene el cierre histórico en registros sin edición posterior', () => {
    const historical = normalizeTask({
      ...task(),
      createdAt: '2025-09-10T09:00:00.000Z',
      updatedAt: '2025-09-10T09:00:00.000Z',
      origen: 'Comité de Empresa',
      fase: 'comite',
      closedAt: null,
    });

    expect(historical.estado).toBe('cerrada');
    expect(historical.fase).toBe('cerrada');
  });

});

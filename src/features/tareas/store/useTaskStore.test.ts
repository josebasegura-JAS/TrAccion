import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_TASK_FILTERS } from '../domain/filters';
import { CLOSED_TASK_PHASE, type Task, type TaskDraft } from '../domain/task';
import { useTaskStore } from './useTaskStore';

const TASKS_KEY = 'traccion.v1.tareas.tasks';
const LEGACY_PETICIONES_KEY = 'traccion.v1.peticiones.peticiones';
const PETICIONES_MIGRATION_FLAG_KEY = 'traccion.v1.tareas.peticionesMigrated';
const COMITE_SESSIONS_KEY = 'traccion.v1.comite.sessions';

function draft(overrides: Partial<TaskDraft> = {}): TaskDraft {
  return {
    titulo: 'Tarea de prueba',
    descripcion: 'Descripción',
    tipo: 'interna',
    fase: 'tarea',
    estado: 'pendiente',
    prioridad: 'media',
    fechaLimite: '2026-06-30',
    responsable: 'RRLL',
    origen: 'Interno',
    sindicato: '',
    observaciones: '',
    mail: '',
    documentLinks: [],
    ...overrides,
  };
}

function readPersistedTasks(): Task[] {
  return JSON.parse(window.localStorage.getItem(TASKS_KEY) ?? '[]') as Task[];
}

/**
 * createWithConcurrencyCheck (y las demás *WithConcurrencyCheck) no caen a un modo
 * "solo localStorage" cuando no hay SQLite directo de tareas: pasan por
 * saveNewSharedArrayRecord/saveSharedArrayRecord, que requieren
 * window.traccion.getPersistedRecord / saveLocalStorageRecordIfUnchanged (el
 * key-value genérico de SQLite con control de concurrencia). Este fake
 * reproduce ese backend en memoria para poder probar los métodos reales sin
 * depender de Electron.
 */
function installFakePersistedRecordsBackend(): void {
  const store = new Map<string, { value: string; updatedAt: string }>();
  const status = { ready: true, phase: 'active' as const };

  Object.defineProperty(window, 'traccion', {
    configurable: true,
    value: {
      getPersistedRecord: vi.fn(async (key: string) => {
        const entry = store.get(key);
        return {
          status,
          record: entry ? { key, value: entry.value, updatedAt: entry.updatedAt } : null,
        };
      }),
      saveLocalStorageRecordIfUnchanged: vi.fn(
        async ({
          key,
          value,
          expectedUpdatedAt,
        }: {
          key: string;
          value: string;
          expectedUpdatedAt: string | null;
        }) => {
          const entry = store.get(key);
          const currentUpdatedAt = entry?.updatedAt ?? null;
          if (currentUpdatedAt !== expectedUpdatedAt) {
            return { ok: false, status, currentUpdatedAt, message: 'Conflicto de concurrencia.' };
          }
          const updatedAt = new Date().toISOString();
          store.set(key, { value, updatedAt });
          return { ok: true, status, currentUpdatedAt: updatedAt, message: 'Guardado.' };
        },
      ),
    },
  });
}

describe('useTaskStore', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-08T10:00:00.000Z'));
    window.localStorage.clear();
    useTaskStore.setState({ tasks: [], selectedTaskId: '', filters: EMPTY_TASK_FILTERS });
    installFakePersistedRecordsBackend();
  });

  it('create guarda la tarea con seguimiento inicial y la persiste', async () => {
    await useTaskStore.getState().createWithConcurrencyCheck(draft({ titulo: 'Seguimiento crítico' }), 'Primer seguimiento');

    const { tasks, selectedTaskId } = useTaskStore.getState();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ titulo: 'Seguimiento crítico', estado: 'pendiente' });
    expect(tasks[0].seguimiento).toEqual([
      { fechaHora: '2026-06-08T10:00:00.000Z', texto: 'Primer seguimiento' },
    ]);
    expect(selectedTaskId).toBe(tasks[0].id);
    expect(readPersistedTasks()[0].id).toBe(tasks[0].id);
  });

  it('createManyFromImport deduplica por ImportKey y devuelve el id ya existente', () => {
    const firstIds = useTaskStore
      .getState()
      .createManyFromImport([
        { externalKey: 'comite:2025-01-01:1', draft: draft({ titulo: 'Punto importado' }) },
      ]);
    const firstTaskId = firstIds['comite:2025-01-01:1'];

    const secondIds = useTaskStore
      .getState()
      .createManyFromImport([
        { externalKey: 'comite:2025-01-01:1', draft: draft({ titulo: 'Duplicado' }) },
      ]);

    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(secondIds['comite:2025-01-01:1']).toBe(firstTaskId);
    expect(readPersistedTasks()).toHaveLength(1);
  });

  it('createManyFromImport normaliza importaciones históricas anteriores a 2026 como cerradas', () => {
    useTaskStore.getState().createManyFromImport([
      {
        externalKey: 'comite:2025-05-21:1',
        closedAt: '2025-05-21T00:00:00.000Z',
        draft: draft({
          titulo: 'Histórico CE',
          fase: 'comite',
          origen: 'Comité de Empresa',
          observaciones: 'Importado de sesión antigua',
        }),
      },
    ]);

    const [task] = useTaskStore.getState().tasks;
    expect(task).toMatchObject({ estado: 'cerrada', fase: CLOSED_TASK_PHASE });
    expect(task.closedAt).toBe('2025-05-21T00:00:00.000Z');
  });

  it('load reconcilia tareas abiertas vinculadas a sesiones cerradas de comité', async () => {
    await useTaskStore.getState().createWithConcurrencyCheck(draft({ titulo: 'Punto CE pendiente', fase: 'comite' }));
    const [task] = useTaskStore.getState().tasks;

    window.localStorage.setItem(
      COMITE_SESSIONS_KEY,
      JSON.stringify([
        {
          id: 'ce-session-1',
          date: '2025-05-21',
          code: 'CE-2025-05',
          title: 'Comité de Empresa CE-2025-05',
          notes: '',
          status: 'closed',
          items: [task.id],
          treatedTaskIds: [task.id],
          untreatedTaskIds: [],
          createdAt: '2025-05-21T00:00:00.000Z',
          updatedAt: '2026-06-08T10:00:00.000Z',
          closedAt: '2025-05-21T00:00:00.000Z',
        },
      ]),
    );

    useTaskStore.getState().load();

    const [reconciledTask] = useTaskStore.getState().tasks;
    expect(reconciledTask).toMatchObject({
      estado: 'cerrada',
      fase: CLOSED_TASK_PHASE,
      closedAt: '2025-05-21T00:00:00.000Z',
      sessionDocumentCode: 'CE-2025-05',
      sessionModule: 'comite',
      sessionDate: '2025-05-21',
    });
    expect(reconciledTask.seguimiento[0].texto).toBe(
      'Tratada en Comité de Empresa (CE-2025-05 · 21/5/2025).',
    );
  });

  it('closeTasksFromSession cierra solo tareas abiertas y añade seguimiento de sesión', async () => {
    await useTaskStore.getState().createWithConcurrencyCheck(draft({ titulo: 'Abierta' }));
    await useTaskStore
      .getState()
      .createWithConcurrencyCheck(draft({ titulo: 'Ya cerrada', estado: 'cerrada', fase: CLOSED_TASK_PHASE }));
    const [openTask, closedTask] = useTaskStore.getState().tasks;

    useTaskStore
      .getState()
      .closeTasksFromSession([openTask.id, closedTask.id], 'Comité de Empresa', 'CE 08/06/2026');

    const tasks = useTaskStore.getState().tasks;
    const updatedOpenTask = tasks.find((task) => task.id === openTask.id);
    const updatedClosedTask = tasks.find((task) => task.id === closedTask.id);
    expect(updatedOpenTask).toMatchObject({ estado: 'cerrada', fase: CLOSED_TASK_PHASE });
    expect(updatedOpenTask?.seguimiento[0].texto).toBe(
      'Tratada en Comité de Empresa (CE 08/06/2026).',
    );
    expect(updatedClosedTask?.seguimiento).toHaveLength(0);
  });

  it('load migra peticiones legacy una sola vez', () => {
    window.localStorage.setItem(
      LEGACY_PETICIONES_KEY,
      JSON.stringify([
        {
          id: 'pet-1',
          titulo: 'Petición antigua',
          descripcion: 'Texto',
          estado: 'pendiente',
          prioridad: 'alta',
          solicitante: 'Sindicato',
          sindicato: 'ELA',
          createdAt: '2025-12-01T08:00:00.000Z',
        },
      ]),
    );

    useTaskStore.getState().load();
    useTaskStore.getState().load();

    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(useTaskStore.getState().tasks[0]).toMatchObject({
      id: 'migrada-pet-1',
      titulo: 'Petición antigua',
      tipo: 'sindical',
      fase: 'peticion',
    });
    expect(window.localStorage.getItem(PETICIONES_MIGRATION_FLAG_KEY)).toBe('true');
  });
});

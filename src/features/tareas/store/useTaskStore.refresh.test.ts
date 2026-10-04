import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_TASK_FILTERS } from '../domain/filters';
import type { TaskDraft } from '../domain/task';
import { useTaskStore } from './useTaskStore';

function draft(title: string): TaskDraft {
  return {
    titulo: title,
    descripcion: 'Descripción',
    tipo: 'interna',
    fase: 'tarea',
    estado: 'pendiente',
    prioridad: 'media',
    fechaLimite: '2026-12-31',
    responsable: 'RRLL',
    origen: 'Interno',
    sindicato: '',
    observaciones: '',
    mail: '',
    documentLinks: [],
  };
}

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

describe('useTaskStore refresh selection', () => {
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
    installFakePersistedRecordsBackend();
  });

  it('conserva la tarea seleccionada al ejecutar load de nuevo', async () => {
    await useTaskStore.getState().createWithConcurrencyCheck(draft('Primera tarea'));
    await useTaskStore.getState().createWithConcurrencyCheck(draft('Segunda tarea'));

    const selectedBeforeRefresh = useTaskStore.getState().selectedTaskId;
    const secondTaskId = useTaskStore.getState().tasks[1]?.id;
    expect(selectedBeforeRefresh).toBe(secondTaskId);

    useTaskStore.getState().load();

    expect(useTaskStore.getState().selectedTaskId).toBe(selectedBeforeRefresh);
  });
});

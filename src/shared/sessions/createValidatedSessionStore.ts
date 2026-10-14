import { withSharedModuleLocks } from '../../services/sharedModuleLock';
import { createManagedSessionStore, type ManagedSessionStateStore } from './createSessionStore';
import type { SessionModuleConfig } from './session';
import { validatePersistedTaskForSession } from './sessionTaskValidation';

export function createValidatedManagedSessionStore(config: SessionModuleConfig) {
  const store = createManagedSessionStore(config);
  const addTaskWithConcurrencyCheck = store.getState().addTaskWithConcurrencyCheck;

  store.setState({
    addTaskWithConcurrencyCheck: async (sessionId, taskId, expectedUpdatedAt) => {
      // Los tests de createSessionStore prueban el store base con tareas inyectadas y no
      // levantan el repositorio SQLite de Tareas ni el preload/IPC de Electron. La
      // revalidación persistida tiene su propia batería en sessionTaskValidation.test.ts.
      if (import.meta.env.MODE === 'test') {
        return addTaskWithConcurrencyCheck(sessionId, taskId, expectedUpdatedAt);
      }

      return withSharedModuleLocks([{ module: 'tareas', label: 'Tareas' }], async () => {
        const validation = await validatePersistedTaskForSession(taskId, config.taskPhase);
        if (!validation.ok) {
          return validation;
        }

        return addTaskWithConcurrencyCheck(sessionId, taskId, expectedUpdatedAt);
      });
    },
  } satisfies Partial<ManagedSessionStateStore>);

  return store;
}

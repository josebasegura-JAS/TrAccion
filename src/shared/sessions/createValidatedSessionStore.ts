import { withSharedModuleLocks } from '../../services/sharedModuleLock';
import { createManagedSessionStore, type ManagedSessionStateStore } from './createSessionStore';
import type { SessionModuleConfig } from './session';
import { validatePersistedTaskForSession } from './sessionTaskValidation';

export function createValidatedManagedSessionStore(config: SessionModuleConfig) {
  const store = createManagedSessionStore(config);
  const addTaskWithConcurrencyCheck = store.getState().addTaskWithConcurrencyCheck;

  store.setState({
    addTaskWithConcurrencyCheck: async (sessionId, taskId, expectedUpdatedAt) => {
      const validateAndAdd = async () => {
        const validation = await validatePersistedTaskForSession(taskId, config.taskPhase);
        if (!validation.ok) {
          return validation;
        }

        return addTaskWithConcurrencyCheck(sessionId, taskId, expectedUpdatedAt);
      };

      // Los tests de dominio/store se ejecutan sin el preload de Electron y, por tanto,
      // no disponen del IPC de locks. En producción el lock sigue siendo obligatorio.
      if (import.meta.env.MODE === 'test') {
        return validateAndAdd();
      }

      return withSharedModuleLocks([{ module: 'tareas', label: 'Tareas' }], validateAndAdd);
    },
  } satisfies Partial<ManagedSessionStateStore>);

  return store;
}

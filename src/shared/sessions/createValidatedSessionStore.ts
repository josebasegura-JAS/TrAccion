import { withSharedModuleLocks } from '../../services/sharedModuleLock';
import { createManagedSessionStore, type ManagedSessionStateStore } from './createSessionStore';
import type { SessionModuleConfig } from './session';
import { validatePersistedTaskForSession } from './sessionTaskValidation';

export function createValidatedManagedSessionStore(config: SessionModuleConfig) {
  const store = createManagedSessionStore(config);
  const addTaskWithConcurrencyCheck = store.getState().addTaskWithConcurrencyCheck;

  store.setState({
    addTaskWithConcurrencyCheck: async (sessionId, taskId, expectedUpdatedAt) =>
      withSharedModuleLocks([{ module: 'tareas', label: 'Tareas' }], async () => {
        const validation = await validatePersistedTaskForSession(taskId, config.taskPhase);
        if (!validation.ok) {
          return validation;
        }

        return addTaskWithConcurrencyCheck(sessionId, taskId, expectedUpdatedAt);
      }),
  } satisfies Partial<ManagedSessionStateStore>);

  return store;
}

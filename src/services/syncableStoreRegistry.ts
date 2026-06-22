import { runSyncWithSilentPersistenceFeedback } from './persistence';
export type SyncableStoreRegistration = {
  id: string;
  reloadFromStorage: () => void;
};

const syncableStores = new Map<string, SyncableStoreRegistration>();

export function registerSyncableStore(registration: SyncableStoreRegistration): void {
  syncableStores.set(registration.id, registration);
}

export function getRegisteredSyncableStores(): SyncableStoreRegistration[] {
  return Array.from(syncableStores.values());
}

// Timers de debounce por store — evita recargar el mismo store varias veces
// cuando el polling detecta cambios en múltiples claves del mismo módulo.
const pendingReloadTimers = new Map<string, ReturnType<typeof setTimeout>>();
const RELOAD_DEBOUNCE_MS = 50;

export function reloadRegisteredSyncableStores(
  storeIds?: string[],
  options: { silentPersistenceFeedback?: boolean } = {},
): void {
  const requestedStoreIds = storeIds ? new Set(storeIds) : null;

  getRegisteredSyncableStores().forEach((store) => {
    if (requestedStoreIds && !requestedStoreIds.has(store.id)) {
      return;
    }

    // Cancelar recarga previa pendiente del mismo store
    const existingTimer = pendingReloadTimers.get(store.id);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      pendingReloadTimers.delete(store.id);
      if (options.silentPersistenceFeedback) {
        runSyncWithSilentPersistenceFeedback(store.reloadFromStorage);
      } else {
        store.reloadFromStorage();
      }
    }, RELOAD_DEBOUNCE_MS);

    pendingReloadTimers.set(store.id, timer);
  });
}

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

export function reloadRegisteredSyncableStores(storeIds?: string[]): void {
  const requestedStoreIds = storeIds ? new Set(storeIds) : null;

  getRegisteredSyncableStores().forEach((store) => {
    if (requestedStoreIds && !requestedStoreIds.has(store.id)) {
      return;
    }

    store.reloadFromStorage();
  });
}

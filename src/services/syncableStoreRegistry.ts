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

export function reloadRegisteredSyncableStores(): void {
  getRegisteredSyncableStores().forEach((store) => {
    store.reloadFromStorage();
  });
}

import { runWithSilentPersistenceFeedback } from './persistence';

export type SyncableStoreRegistration = {
  id: string;
  reloadFromStorage: () => void | Promise<void>;
};

const syncableStores = new Map<string, SyncableStoreRegistration>();

export function registerSyncableStore(registration: SyncableStoreRegistration): void {
  syncableStores.set(registration.id, registration);
}

export function getRegisteredSyncableStores(): SyncableStoreRegistration[] {
  return Array.from(syncableStores.values());
}

type PendingReload = {
  timer: ReturnType<typeof setTimeout>;
  store: SyncableStoreRegistration;
  silentPersistenceFeedback: boolean;
  waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }>;
};

const pendingReloads = new Map<string, PendingReload>();
const RELOAD_DEBOUNCE_MS = 50;

function scheduleStoreReload(
  store: SyncableStoreRegistration,
  silentPersistenceFeedback: boolean,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const existing = pendingReloads.get(store.id);
    if (existing) {
      clearTimeout(existing.timer);
      existing.store = store;
      existing.silentPersistenceFeedback = silentPersistenceFeedback;
      existing.waiters.push({ resolve, reject });
    }

    const pending = existing ?? {
      timer: 0 as unknown as ReturnType<typeof setTimeout>,
      store,
      silentPersistenceFeedback,
      waiters: [{ resolve, reject }],
    };

    pending.timer = setTimeout(() => {
      pendingReloads.delete(store.id);
      void (async () => {
        try {
          if (pending.silentPersistenceFeedback) {
            await runWithSilentPersistenceFeedback(async () => {
              await pending.store.reloadFromStorage();
            });
          } else {
            await pending.store.reloadFromStorage();
          }
          pending.waiters.forEach((waiter) => waiter.resolve());
        } catch (error) {
          pending.waiters.forEach((waiter) => waiter.reject(error));
        }
      })();
    }, RELOAD_DEBOUNCE_MS);

    pendingReloads.set(store.id, pending);
  });
}

export async function reloadRegisteredSyncableStores(
  storeIds?: string[],
  options: { silentPersistenceFeedback?: boolean } = {},
): Promise<void> {
  const requestedStoreIds = storeIds ? new Set(storeIds) : null;
  const stores = getRegisteredSyncableStores().filter(
    (store) => !requestedStoreIds || requestedStoreIds.has(store.id),
  );

  await Promise.all(
    stores.map((store) =>
      scheduleStoreReload(store, options.silentPersistenceFeedback === true),
    ),
  );
}

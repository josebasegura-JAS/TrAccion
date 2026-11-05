import { runWithSilentPersistenceFeedback } from './persistence';
import type { AppView } from '../navigation/navigation';

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
// Una recarga nueva no debe solaparse con otra del mismo store.
// Se ejecuta después: podría representar un token SQLite posterior.
const activeReloads = new Map<string, Promise<void>>();
const RELOAD_DEBOUNCE_MS = 50;

/**
 * Los datos utilizados por el Dashboard o en flujos transversales se mantienen
 * activos; el resto puede invalidarse sin leer SQLite hasta entrar en su módulo.
 * Nunca se pospone una escritura ni una validación de concurrencia (OCC).
 */
const VIEW_STORE_IDS: Partial<Record<AppView, readonly string[]>> = {
  dashboard: ['tareas', 'comite-sesiones', 'paritaria-sesiones', 'actas', 'teletrabajo', 'licencias-sin-sueldo', 'loteria', 'configuracion'],
  tareas: ['tareas', 'configuracion'],
  coordinacion: ['coordinacion', 'tareas', 'configuracion'],
  comite: ['comite-sesiones', 'paritaria-sesiones', 'actas', 'tareas', 'configuracion'],
  paritaria: ['comite-sesiones', 'paritaria-sesiones', 'actas', 'tareas', 'configuracion'],
  actas: ['actas', 'comite-sesiones', 'paritaria-sesiones', 'configuracion'],
  plantilla: ['plantilla', 'configuracion'],
  'ayuda-escolar': ['ayuda-escolar', 'plantilla', 'configuracion'],
  teletrabajo: ['teletrabajo', 'plantilla', 'configuracion'],
  'licencias-sin-sueldo': ['licencias-sin-sueldo', 'plantilla', 'configuracion'],
  'ticket-restaurante': ['ticket-restaurante', 'plantilla', 'configuracion'],
  presupuestos: ['presupuestos', 'configuracion'],
  sorteos: ['sorteos', 'plantilla', 'configuracion'],
  loteria: ['loteria', 'plantilla', 'configuracion'],
  vinculograma: ['vinculograma', 'plantilla', 'configuracion'],
  'criterios-rrll': ['criterios-rrll', 'tareas', 'configuracion'],
  'actividades-externas': ['actividades-externas', 'plantilla', 'configuracion'],
  especiales: ['especiales', 'plantilla', 'configuracion'],
  ajustes: ['configuracion'],
};
const ALWAYS_ACTIVE_STORE_IDS = new Set(['tareas', 'configuracion']);
const deferredStoreIds = new Set<string>();
let activeView: AppView = 'dashboard';

export function setActiveSyncView(view: AppView): void {
  activeView = view;
}

function isStoreNeeded(storeId: string, view: AppView): boolean {
  return ALWAYS_ACTIVE_STORE_IDS.has(storeId) || (VIEW_STORE_IDS[view] ?? []).includes(storeId);
}

export function getDeferredSyncStoreIds(): string[] {
  return Array.from(deferredStoreIds);
}

export async function flushDeferredSyncStoresForView(view: AppView): Promise<void> {
  const ids = Array.from(deferredStoreIds).filter((id) => isStoreNeeded(id, view));
  if (!ids.length) return;
  // Los ID permanecen pendientes hasta que se haya aplicado la última lectura.
  await reloadRegisteredSyncableStores(ids, { silentPersistenceFeedback: true });
}


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
      const previous = activeReloads.get(pending.store.id);
      const execution = (async () => {
        // Esperar a la lectura anterior, aunque fallara; el nuevo token
        // necesita una oportunidad propia de actualizar el store.
        if (previous) await previous.catch(() => undefined);
        if (pending.silentPersistenceFeedback) {
          await runWithSilentPersistenceFeedback(async () => {
            await pending.store.reloadFromStorage();
          });
        } else {
          await pending.store.reloadFromStorage();
        }
      })();
      activeReloads.set(pending.store.id, execution);
      void execution.then(
        () => pending.waiters.forEach((waiter) => waiter.resolve()),
        (error: unknown) => pending.waiters.forEach((waiter) => waiter.reject(error)),
      ).finally(() => {
        if (activeReloads.get(pending.store.id) === execution) {
          activeReloads.delete(pending.store.id);
        }
      });
    }, RELOAD_DEBOUNCE_MS);

    pendingReloads.set(store.id, pending);
  });
}

export async function reloadRegisteredSyncableStores(
  storeIds?: string[],
  options: { silentPersistenceFeedback?: boolean; deferInactive?: boolean } = {},
): Promise<void> {
  const requestedStoreIds = storeIds ? new Set(storeIds) : null;
  const stores = getRegisteredSyncableStores().filter(
    (store) => !requestedStoreIds || requestedStoreIds.has(store.id),
  );

  await Promise.all(
    stores.map(async (store) => {
      if (options.deferInactive && !isStoreNeeded(store.id, activeView)) {
        deferredStoreIds.add(store.id);
        return;
      }
      try {
        await scheduleStoreReload(store, options.silentPersistenceFeedback === true);
        deferredStoreIds.delete(store.id);
      } catch (error) {
        deferredStoreIds.add(store.id);
        throw error;
      }
    }),
  );
}

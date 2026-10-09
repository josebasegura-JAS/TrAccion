from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:160]!r}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


Path('src/services/syncableStoreRegistry.ts').write_text("""import { runWithSilentPersistenceFeedback } from './persistence';

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
""", encoding='utf-8')

replace_once(
    'src/services/externalDataSync.ts',
    "function reloadIntegratedStores(storeIds?: string[]): void {\n  reloadRegisteredSyncableStores(storeIds, { silentPersistenceFeedback: true });\n}",
    "async function reloadIntegratedStores(storeIds?: string[]): Promise<void> {\n  await reloadRegisteredSyncableStores(storeIds, { silentPersistenceFeedback: true });\n}",
)
replace_once(
    'src/services/externalDataSync.ts',
    '      reloadIntegratedStores(changedDirectStoreIds);',
    '      await reloadIntegratedStores(changedDirectStoreIds);',
)
replace_once(
    'src/services/externalDataSync.ts',
    '    reloadIntegratedStores(changedLegacyStoreIds ?? undefined);',
    '    await reloadIntegratedStores(changedLegacyStoreIds ?? undefined);',
)
replace_once(
    'src/services/externalDataSync.ts',
    '  reloadIntegratedStores();',
    '  await reloadIntegratedStores();',
)

replace_once(
    'src/features/tareas/store/useTaskStore.ts',
    '  reloadFromStorage: () => void;',
    '  reloadFromStorage: () => Promise<void>;',
)
replace_once(
    'src/features/tareas/store/useTaskStore.ts',
    """  reloadFromStorage: () => {
    if (!hasTaskSqliteRepository()) {
      const tasks = import.meta.env.MODE === 'test' ? readTasks() : [];
      set((state) => ({
        tasks,
        selectedTaskId: selectedTaskIdAfterRefresh(tasks, state.selectedTaskId),
      }));
      return;
    }

    void readTasksForStore('active').then((tasks) => {
      set((state) => ({
        tasks,
        selectedTaskId: selectedTaskIdAfterRefresh(tasks, state.selectedTaskId),
        historicalTasksLoaded: false,
      }));
    });
  },""",
    """  reloadFromStorage: async () => {
    if (!hasTaskSqliteRepository()) {
      const tasks = import.meta.env.MODE === 'test' ? readTasks() : [];
      set((state) => ({
        tasks,
        selectedTaskId: selectedTaskIdAfterRefresh(tasks, state.selectedTaskId),
      }));
      return;
    }

    const tasks = await readTasksForStore('active');
    set((state) => ({
      tasks,
      selectedTaskId: selectedTaskIdAfterRefresh(tasks, state.selectedTaskId),
      historicalTasksLoaded: false,
    }));
  },""",
)

replace_once(
    'src/features/plantilla/store/useEmployeeStore.ts',
    '  reloadFromStorage: () => void;',
    '  reloadFromStorage: () => Promise<void>;',
)
replace_once(
    'src/features/plantilla/store/useEmployeeStore.ts',
    """  reloadFromStorage: () => {
    void (async () => {
      const employees = await readEmployeesShared();
      const jobPositionTranslations = readJobPositionTranslations();
      set((state) => {
        const hasEmployeesChanged = !areEmployeesEquivalent(state.employees, employees);
        const hasTranslationsChanged = !areJobPositionTranslationsEquivalent(
          state.jobPositionTranslations,
          jobPositionTranslations,
        );

        if (!hasEmployeesChanged && !hasTranslationsChanged && !state.isLoading) {
          return { ...state, lastLoadedAt: Date.now() };
        }

        return {
          employees,
          jobPositionTranslations,
          selectedEmployeeId: employees.some((employee) => employee.empleado === state.selectedEmployeeId)
            ? state.selectedEmployeeId
            : firstVisibleEmployeeId(employees),
          isLoading: false,
          lastLoadedAt: Date.now(),
        };
      });
    })().catch(() => set({ isLoading: false }));
  },""",
    """  reloadFromStorage: async () => {
    try {
      const employees = await readEmployeesShared();
      const jobPositionTranslations = readJobPositionTranslations();
      set((state) => {
        const hasEmployeesChanged = !areEmployeesEquivalent(state.employees, employees);
        const hasTranslationsChanged = !areJobPositionTranslationsEquivalent(
          state.jobPositionTranslations,
          jobPositionTranslations,
        );

        if (!hasEmployeesChanged && !hasTranslationsChanged && !state.isLoading) {
          return { ...state, lastLoadedAt: Date.now() };
        }

        return {
          employees,
          jobPositionTranslations,
          selectedEmployeeId: employees.some((employee) => employee.empleado === state.selectedEmployeeId)
            ? state.selectedEmployeeId
            : firstVisibleEmployeeId(employees),
          isLoading: false,
          lastLoadedAt: Date.now(),
        };
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },""",
)

replace_once(
    'src/features/ticket-restaurante/store/useTicketRestauranteStore.ts',
    '  reloadFromStorage: () => void;',
    '  reloadFromStorage: () => Promise<void>;',
)
replace_once(
    'src/features/ticket-restaurante/store/useTicketRestauranteStore.ts',
    """  reloadFromStorage: () => {
    const syncSnapshot = readTicketRestauranteSnapshot();
    if (!areTicketSnapshotsEquivalent(get(), syncSnapshot)) {
      set(syncSnapshot);
    }
    void loadTicketRestauranteStateFromSqliteOrStorage()
      .then((nextSnapshot) => {
        if (!areTicketSnapshotsEquivalent(get(), nextSnapshot)) {
          set(nextSnapshot);
        }
      })
      .catch((error) =>
        console.warn('Ticket Restaurante: no se ha podido recargar desde SQLite.', error),
      );
  },""",
    """  reloadFromStorage: async () => {
    const syncSnapshot = readTicketRestauranteSnapshot();
    if (!areTicketSnapshotsEquivalent(get(), syncSnapshot)) {
      set(syncSnapshot);
    }
    try {
      const nextSnapshot = await loadTicketRestauranteStateFromSqliteOrStorage();
      if (!areTicketSnapshotsEquivalent(get(), nextSnapshot)) {
        set(nextSnapshot);
      }
    } catch (error) {
      console.warn('Ticket Restaurante: no se ha podido recargar desde SQLite.', error);
      throw error;
    }
  },""",
)

replace_once(
    'src/features/sorteos/store/useSorteosStore.ts',
    '  reloadFromStorage: () => void;',
    '  reloadFromStorage: () => Promise<void>;',
)
replace_once(
    'src/features/sorteos/store/useSorteosStore.ts',
    '  reloadFromStorage: () => {',
    '  reloadFromStorage: async () => {',
)
replace_once(
    'src/features/sorteos/store/useSorteosStore.ts',
    """    if (hasSorteosSqliteRepository()) {
      void loadDirectSorteosSnapshot()
        .then((snapshot) => {
          if (snapshot) {
            applySnapshot(snapshot.draws, snapshot.exclusions);
          }
        })
        .catch(() => {
          applySnapshot(
            sortDraws(readArray(DRAWS_STORAGE_KEY, isDraw)),
            readArray(EXCLUSIONS_STORAGE_KEY, isExclusion),
          );
        });
      return;
    }
""",
    """    if (hasSorteosSqliteRepository()) {
      try {
        const snapshot = await loadDirectSorteosSnapshot();
        if (snapshot) {
          applySnapshot(snapshot.draws, snapshot.exclusions);
        }
      } catch (error) {
        applySnapshot(
          sortDraws(readArray(DRAWS_STORAGE_KEY, isDraw)),
          readArray(EXCLUSIONS_STORAGE_KEY, isExclusion),
        );
        throw error;
      }
      return;
    }
""",
)

Path('.github/workflows/pr13-apply.yml').unlink(missing_ok=True)
Path('scripts/pr13_patch.py').unlink(missing_ok=True)

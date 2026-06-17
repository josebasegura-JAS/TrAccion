import { useSyncExternalStore } from 'react';
import './syncableStoreRegistrations';
import { reloadRegisteredSyncableStores } from './syncableStoreRegistry';
import { hasActiveSharedEditing, subscribeSharedEditingActivity } from './sharedEditingActivity';
import {
  applyPersistedRecordsSnapshotToLocalStorage,
  flushPendingSqliteWrites,
  readHydrationMetadata,
  subscribeToPersistenceFeedback,
} from './persistence';

const POLLING_INTERVAL_MS = 30_000;
const DATABASE_CONNECTIVITY_RECOVERED_EVENT = 'traccion:database-connectivity-recovered';

type ExternalDataSyncState = {
  status: 'idle' | 'checking' | 'synced' | 'applied' | 'error' | 'disabled';
  message: string;
  lastCheckedAt: string | null;
  lastAppliedAt: string | null;
  lastError: string | null;
};

type ExternalDataSyncListener = () => void;

type SqliteSyncTokens = {
  persistedRecordsToken: string | null;
  taskRecordsToken: string | null;
  sorteosRecordsToken: string | null;
};

const listeners = new Set<ExternalDataSyncListener>();
let state: ExternalDataSyncState = {
  status: 'idle',
  message: 'Sincronización pendiente.',
  lastCheckedAt: null,
  lastAppliedAt: null,
  lastError: null,
};
let timerId: number | null = null;
let isPolling = false;
let lastSeenRefreshToken: string | null = null;
let lastSeenSqliteSyncTokens: SqliteSyncTokens | null = null;
let unsubscribeSharedEditingActivity: (() => void) | null = null;
let unsubscribePersistenceFeedback: (() => void) | null = null;
let persistenceWriteInProgress = false;
let postponePollingUntil = 0;

function postponePolling(ms = 1_500): void {
  postponePollingUntil = Math.max(postponePollingUntil, Date.now() + ms);
}

function shouldPostponePollingForInteractiveWork(): boolean {
  return hasActiveSharedEditing() || persistenceWriteInProgress || Date.now() < postponePollingUntil;
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

function setState(nextState: Partial<ExternalDataSyncState>): void {
  state = { ...state, ...nextState };
  emit();
}

function getSnapshot(): ExternalDataSyncState {
  return state;
}

function subscribe(listener: ExternalDataSyncListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function reloadIntegratedStores(): void {
  reloadRegisteredSyncableStores();
}

function canPollStatus(status: TraccionDatabaseStatus): boolean {
  return status.ready && status.phase !== 'fallback' && status.phase !== 'error' && status.phase !== 'locked';
}

function hasTokenChanged(remoteToken: string | null, localToken: string | null): boolean {
  return Boolean(remoteToken && remoteToken !== localToken);
}

function readInitialPersistedRecordsToken(): string | null {
  return lastSeenRefreshToken ?? readHydrationMetadata()?.refreshToken ?? null;
}

function syncTokensFromSnapshot(snapshot: TraccionSqliteSyncTokensSnapshot): SqliteSyncTokens {
  return {
    persistedRecordsToken: snapshot.persistedRecordsToken,
    taskRecordsToken: snapshot.taskRecordsToken,
    sorteosRecordsToken: snapshot.sorteosRecordsToken,
  };
}

function directSqliteTokensChanged(nextTokens: SqliteSyncTokens, previousTokens: SqliteSyncTokens): boolean {
  return (
    hasTokenChanged(nextTokens.taskRecordsToken, previousTokens.taskRecordsToken) ||
    hasTokenChanged(nextTokens.sorteosRecordsToken, previousTokens.sorteosRecordsToken)
  );
}

async function pollOnce(): Promise<void> {
  if (isPolling) {
    return;
  }

  if (!window.traccion?.getPersistedRecordsToken || !window.traccion.loadPersistedRecords) {
    setState({
      status: 'disabled',
      message: 'Sincronización SQLite no disponible; usando localStorage.',
      lastError: null,
    });
    stopExternalDataSyncPolling();
    return;
  }

  const checkedAt = new Date().toISOString();
  if (shouldPostponePollingForInteractiveWork()) {
    setState({
      status: 'synced',
      message: 'Sincronización aplazada mientras hay edición o guardado activo.',
      lastCheckedAt: checkedAt,
      lastError: null,
    });
    return;
  }

  isPolling = true;
  setState({ status: 'checking', message: 'Comprobando cambios compartidos…', lastCheckedAt: checkedAt });

  try {
    if (window.traccion.getSqliteSyncTokens) {
      const tokenSnapshot = await window.traccion.getSqliteSyncTokens();
      if (!canPollStatus(tokenSnapshot.status)) {
        setState({
          status: tokenSnapshot.status.phase === 'locked' ? 'disabled' : 'error',
          message: tokenSnapshot.status.message ?? 'SQLite no disponible; se mantiene localStorage.',
          lastError: tokenSnapshot.status.message ?? null,
        });
        stopExternalDataSyncPolling();
        return;
      }

      const nextTokens = syncTokensFromSnapshot(tokenSnapshot);
      const previousTokens = lastSeenSqliteSyncTokens ?? {
        persistedRecordsToken: readInitialPersistedRecordsToken(),
        taskRecordsToken: null,
        sorteosRecordsToken: null,
      };
      const persistedRecordsChanged = hasTokenChanged(
        nextTokens.persistedRecordsToken,
        previousTokens.persistedRecordsToken,
      );
      const directTablesChanged = directSqliteTokensChanged(nextTokens, previousTokens);

      if (!persistedRecordsChanged && !directTablesChanged) {
        const flushedCount = await flushPendingSqliteWrites();
        lastSeenSqliteSyncTokens = nextTokens;
        lastSeenRefreshToken = nextTokens.persistedRecordsToken;
        if (flushedCount > 0) {
          setState({
            status: 'applied',
            message: `Cambios locales pendientes sincronizados (${flushedCount}).`,
            lastCheckedAt: checkedAt,
            lastAppliedAt: new Date().toISOString(),
            lastError: null,
          });
          return;
        }

        setState({
          status: 'synced',
          message: 'Datos actualizados.',
          lastCheckedAt: checkedAt,
          lastError: null,
        });
        return;
      }

      if (hasActiveSharedEditing()) {
        setState({
          status: 'synced',
          message: 'Cambios compartidos detectados; refresco aplazado mientras hay una edición abierta.',
          lastCheckedAt: checkedAt,
          lastError: null,
        });
        return;
      }

      if (!persistedRecordsChanged && directTablesChanged) {
        await flushPendingSqliteWrites();
        lastSeenSqliteSyncTokens = nextTokens;
        lastSeenRefreshToken = nextTokens.persistedRecordsToken;
        reloadIntegratedStores();
        const appliedAt = new Date().toISOString();
        setState({
          status: 'applied',
          message: 'Cambios SQLite directos aplicados.',
          lastCheckedAt: checkedAt,
          lastAppliedAt: appliedAt,
          lastError: null,
        });
        return;
      }
    }

    const tokenSnapshot = await window.traccion.getPersistedRecordsToken();
    if (!canPollStatus(tokenSnapshot.status)) {
      setState({
        status: tokenSnapshot.status.phase === 'locked' ? 'disabled' : 'error',
        message: tokenSnapshot.status.message ?? 'SQLite no disponible; se mantiene localStorage.',
        lastError: tokenSnapshot.status.message ?? null,
      });
      stopExternalDataSyncPolling();
      return;
    }

    if (!hasTokenChanged(tokenSnapshot.refreshToken, readInitialPersistedRecordsToken())) {
      const flushedCount = await flushPendingSqliteWrites();
      lastSeenRefreshToken = tokenSnapshot.refreshToken;
      if (lastSeenSqliteSyncTokens) {
        lastSeenSqliteSyncTokens = {
          ...lastSeenSqliteSyncTokens,
          persistedRecordsToken: tokenSnapshot.refreshToken,
        };
      }
      if (flushedCount > 0) {
        setState({
          status: 'applied',
          message: `Cambios locales pendientes sincronizados (${flushedCount}).`,
          lastCheckedAt: checkedAt,
          lastAppliedAt: new Date().toISOString(),
          lastError: null,
        });
        return;
      }

      setState({
        status: 'synced',
        message: 'Datos actualizados.',
        lastCheckedAt: checkedAt,
        lastError: null,
      });
      return;
    }

    if (hasActiveSharedEditing()) {
      setState({
        status: 'synced',
        message: 'Cambios compartidos detectados; refresco aplazado mientras hay una edición abierta.',
        lastCheckedAt: checkedAt,
        lastError: null,
      });
      return;
    }

    const snapshot = await window.traccion.loadPersistedRecords();
    if (!canPollStatus(snapshot.status)) {
      setState({
        status: snapshot.status.phase === 'locked' ? 'disabled' : 'error',
        message: snapshot.status.message ?? 'SQLite no disponible; se mantiene localStorage.',
        lastError: snapshot.status.message ?? null,
      });
      stopExternalDataSyncPolling();
      return;
    }

    applyPersistedRecordsSnapshotToLocalStorage(snapshot);
    await flushPendingSqliteWrites();
    lastSeenRefreshToken = snapshot.refreshToken;
    if (lastSeenSqliteSyncTokens) {
      lastSeenSqliteSyncTokens = {
        ...lastSeenSqliteSyncTokens,
        persistedRecordsToken: snapshot.refreshToken,
      };
    }
    reloadIntegratedStores();
    const appliedAt = new Date().toISOString();
    setState({
      status: 'applied',
      message: 'Cambios externos aplicados.',
      lastCheckedAt: checkedAt,
      lastAppliedAt: appliedAt,
      lastError: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error sincronizando cambios externos.';
    setState({
      status: 'error',
      message,
      lastCheckedAt: checkedAt,
      lastError: message,
    });
  } finally {
    isPolling = false;
  }
}

function handleDatabaseConnectivityRecovered(): void {
  void pollOnce();
}

function handleSharedEditingActivityChanged(): void {
  if (!hasActiveSharedEditing()) {
    postponePolling(750);
    void pollOnce();
  }
}

export function startExternalDataSyncPolling(): void {
  if (typeof window === 'undefined' || timerId !== null) {
    return;
  }

  const metadata = readHydrationMetadata();
  lastSeenRefreshToken = metadata?.refreshToken ?? null;
  void pollOnce();
  timerId = window.setInterval(() => {
    void pollOnce();
  }, POLLING_INTERVAL_MS);
  window.addEventListener(DATABASE_CONNECTIVITY_RECOVERED_EVENT, handleDatabaseConnectivityRecovered);
  unsubscribeSharedEditingActivity = subscribeSharedEditingActivity(handleSharedEditingActivityChanged);
  unsubscribePersistenceFeedback = subscribeToPersistenceFeedback((feedback) => {
    if (feedback.kind === 'saving') {
      persistenceWriteInProgress = true;
      postponePolling(3_000);
      return;
    }

    persistenceWriteInProgress = false;
    postponePolling(1_500);
  });
}

export function stopExternalDataSyncPolling(): void {
  if (typeof window === 'undefined' || timerId === null) {
    return;
  }

  window.clearInterval(timerId);
  timerId = null;
  window.removeEventListener(DATABASE_CONNECTIVITY_RECOVERED_EVENT, handleDatabaseConnectivityRecovered);
  unsubscribeSharedEditingActivity?.();
  unsubscribeSharedEditingActivity = null;
  unsubscribePersistenceFeedback?.();
  unsubscribePersistenceFeedback = null;
  persistenceWriteInProgress = false;
  postponePollingUntil = 0;
  lastSeenSqliteSyncTokens = null;
}

export function useExternalDataSyncStatus(): ExternalDataSyncState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

import { useSyncExternalStore } from 'react';
import { useActasStore } from '../features/actas/store/useActasStore';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import { useCriteriosRrllStore } from '../features/criterios-rrll/store/useCriteriosRrllStore';
import { useEspecialesStore } from '../features/especiales/store/useEspecialesStore';
import { useLicenciasSinSueldoStore } from '../features/licencias-sin-sueldo/store/useLicenciasSinSueldoStore';
import { useParitariaSessionStore } from '../features/paritaria/store/useParitariaSessionStore';
import { useSorteosStore } from '../features/sorteos/store/useSorteosStore';
import { useTicketRestauranteStore } from '../features/ticket-restaurante/store/useTicketRestauranteStore';
import { useVinculogramaStore } from '../features/vinculograma/store/useVinculogramaStore';
import { useCommitteeSessionStore } from '../features/comite/store/useCommitteeSessionStore';
import { useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import { useTaskStore } from '../features/tareas/store/useTaskStore';
import { useTeletrabajoStore } from '../features/teletrabajo/store/useTeletrabajoStore';
import {
  applyPersistedRecordsSnapshotToLocalStorage,
  flushPendingSqliteWrites,
  readHydrationMetadata,
} from './persistence';

const POLLING_INTERVAL_MS = 12_000;

type ExternalDataSyncState = {
  status: 'idle' | 'checking' | 'synced' | 'applied' | 'error' | 'disabled';
  message: string;
  lastCheckedAt: string | null;
  lastAppliedAt: string | null;
  lastError: string | null;
};

type ExternalDataSyncListener = () => void;

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
  useTaskStore.getState().reloadFromStorage();
  useTeletrabajoStore.getState().reloadFromStorage();
  useCommitteeSessionStore.getState().reloadFromStorage();
  useParitariaSessionStore.getState().reloadFromStorage();
  useEmployeeStore.getState().reloadFromStorage();
  useActasStore.getState().reloadFromStorage();
  useLicenciasSinSueldoStore.getState().reloadFromStorage();
  useTicketRestauranteStore.getState().reloadFromStorage();
  useSorteosStore.getState().reloadFromStorage();
  useEspecialesStore.getState().reloadFromStorage();
  useCriteriosRrllStore.getState().reloadFromStorage();
  useVinculogramaStore.getState().reloadFromStorage();
  useConfiguracionStore.getState().reloadFromStorage();
}

function canPollStatus(status: TraccionDatabaseStatus): boolean {
  return status.ready && status.phase !== 'fallback' && status.phase !== 'error' && status.phase !== 'locked';
}

function tokenChanged(remoteToken: string | null): boolean {
  if (!remoteToken) {
    return false;
  }

  const localToken = lastSeenRefreshToken ?? readHydrationMetadata()?.refreshToken ?? null;
  return remoteToken !== localToken;
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

  isPolling = true;
  const checkedAt = new Date().toISOString();
  setState({ status: 'checking', message: 'Comprobando cambios compartidos…', lastCheckedAt: checkedAt });

  try {
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

    if (!tokenChanged(tokenSnapshot.refreshToken)) {
      const flushedCount = await flushPendingSqliteWrites();
      lastSeenRefreshToken = tokenSnapshot.refreshToken;
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
}

export function stopExternalDataSyncPolling(): void {
  if (typeof window === 'undefined' || timerId === null) {
    return;
  }

  window.clearInterval(timerId);
  timerId = null;
}

export function useExternalDataSyncStatus(): ExternalDataSyncState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

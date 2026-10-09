import { useSyncExternalStore } from 'react';
import { reloadRegisteredSyncableStores } from './syncableStoreRegistry';
import { hasActiveSharedEditing, subscribeSharedEditingActivity } from './sharedEditingActivity';
import {
  applyPersistedRecordsSnapshotToLocalStorage,
  isPersistenceFeedbackSilent,
  readHydrationMetadata,
  readStorageItem,
  subscribeToPersistenceFeedback,
} from './persistence';

const POLLING_INTERVAL_MS = 12_000;

const DATABASE_CONNECTIVITY_RECOVERED_EVENT = 'traccion:database-connectivity-recovered';

const LEGACY_STORAGE_STORE_IDS: Record<string, string> = {
  'traccion.v1.teletrabajo.solicitudes': 'teletrabajo',
  'traccion.v1.teletrabajo.puestos': 'teletrabajo',
  'traccion.v1.teletrabajo.puestos.translationAliases': 'teletrabajo',
  'traccion.v1.actas.records': 'actas',
  'traccion.v1.actas.types': 'actas',
  'traccion.v1.actas.outlookTemplate': 'actas',
  'traccion.v1.actas.table': 'actas',
  'traccion.v1.ayuda-escolar.records': 'ayuda-escolar',
  'traccion.v1.comite.sessions': 'comite-sesiones',
  'traccion.v1.paritaria.sessions': 'paritaria-sesiones',
  'traccion.v1.licenciasSinSueldo.records': 'licencias-sin-sueldo',
  'traccion.v1.presupuestos.scenarios': 'presupuestos',
  'traccion.v1.presupuestos.manualItems': 'presupuestos',
  'traccion.v1.presupuestos.ticketGroups': 'presupuestos',
  'traccion.v1.presupuestos.actuals': 'presupuestos',
  'traccion.v1.ticketRestaurante.calendars': 'ticket-restaurante',
  'traccion.v1.ticketRestaurante.absences': 'ticket-restaurante',
  'traccion.v1.ticketRestaurante.people': 'ticket-restaurante',
  'traccion.v1.ticketRestaurante.config': 'ticket-restaurante',
  'traccion.v1.ticketRestaurante.manutenciones': 'ticket-restaurante',
  'traccion.v1.criterios-rrll.criterios': 'criterios-rrll',
  'traccion.v1.vinculograma.records': 'vinculograma',
  'traccion.v1.configuracion': 'configuracion',
  'traccion.v1.loteria.campaign': 'loteria',
  'rrll_especiales_destinatarios': 'especiales',
  // plantilla y tareas tienen tabla propia (collectChangedDirectStores las gestiona)
  // auditTrail no tiene store sincronizable registrado
  'traccion.v1.plantilla.jobPositionTranslations': 'plantilla',
  'traccion.v1.plantilla.employees': 'plantilla',
  'traccion.v1.peticiones.peticiones': 'tareas',
};

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
let syncableStoreRegistrationsPromise: Promise<unknown> | null = null;
let isPolling = false;
let lastSeenRefreshToken: string | null = null;
let lastSeenPersistedRecordsUpdatedAt: string | null = null;
let lastSeenTaskRecordsUpdatedAt: string | null = null;
let lastSeenSorteosDrawsUpdatedAt: string | null = null;
let lastSeenSorteosExclusionsUpdatedAt: string | null = null;
let lastSeenDirectStoreUpdatedAt: Record<string, string | null> = {};
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

function ensureSyncableStoresRegistered(): Promise<unknown> {
  syncableStoreRegistrationsPromise ??= import('./syncableStoreRegistrations');
  return syncableStoreRegistrationsPromise;
}

async function reloadIntegratedStores(storeIds?: string[]): Promise<void> {
  await reloadRegisteredSyncableStores(storeIds, { silentPersistenceFeedback: true });
}

function canPollStatus(status: TraccionDatabaseStatus): boolean {
  return status.ready && status.phase === 'active' && status.isDefaultPath === false;
}

export function hasSyncTokenChanged(
  lastSeenValue: string | null | undefined,
  nextValue: string | null | undefined,
): boolean {
  return (lastSeenValue ?? null) !== (nextValue ?? null);
}

function collectChangedDirectStores(tokenSnapshot: TraccionPersistedRecordsTokenSnapshot): string[] {
  const changedStoreIds = new Set<string>();

  if (hasSyncTokenChanged(lastSeenTaskRecordsUpdatedAt, tokenSnapshot.taskRecordsUpdatedAt)) {
    changedStoreIds.add('tareas');
  }

  if (
    hasSyncTokenChanged(lastSeenSorteosDrawsUpdatedAt, tokenSnapshot.sorteosDrawsUpdatedAt) ||
    hasSyncTokenChanged(lastSeenSorteosExclusionsUpdatedAt, tokenSnapshot.sorteosExclusionsUpdatedAt)
  ) {
    changedStoreIds.add('sorteos');
  }

  Object.entries(tokenSnapshot.directStoreUpdatedAt ?? {}).forEach(([storeId, updatedAt]) => {
    if (hasSyncTokenChanged(lastSeenDirectStoreUpdatedAt[storeId] ?? null, updatedAt)) {
      changedStoreIds.add(storeId);
    }
  });

  return Array.from(changedStoreIds);
}

function collectChangedLegacyStores(snapshot: TraccionPersistedRecordsSnapshot): string[] | null {
  const changedStoreIds = new Set<string>();

  for (const record of snapshot.records) {
    const storeId = LEGACY_STORAGE_STORE_IDS[record.key];
    const localValue = readStorageItem(record.key);

    if (localValue === record.value) {
      continue;
    }

    if (!storeId) {
      return null;
    }

    changedStoreIds.add(storeId);
  }

  return Array.from(changedStoreIds);
}

function updateSeenTokens(tokenSnapshot: TraccionPersistedRecordsTokenSnapshot): void {
  lastSeenRefreshToken = tokenSnapshot.refreshToken;
  lastSeenPersistedRecordsUpdatedAt = tokenSnapshot.latestUpdatedAt ?? null;
  lastSeenTaskRecordsUpdatedAt = tokenSnapshot.taskRecordsUpdatedAt ?? null;
  lastSeenSorteosDrawsUpdatedAt = tokenSnapshot.sorteosDrawsUpdatedAt ?? null;
  lastSeenSorteosExclusionsUpdatedAt = tokenSnapshot.sorteosExclusionsUpdatedAt ?? null;
  lastSeenDirectStoreUpdatedAt = { ...(tokenSnapshot.directStoreUpdatedAt ?? {}) };
}

function persistedRecordsChanged(tokenSnapshot: TraccionPersistedRecordsTokenSnapshot): boolean {
  return hasSyncTokenChanged(lastSeenPersistedRecordsUpdatedAt, tokenSnapshot.latestUpdatedAt);
}

function refreshTokenChangedWithoutKnownStoreChange(tokenSnapshot: TraccionPersistedRecordsTokenSnapshot): boolean {
  const localToken = lastSeenRefreshToken ?? readHydrationMetadata()?.refreshToken ?? null;
  return Boolean(localToken && tokenSnapshot.refreshToken && tokenSnapshot.refreshToken !== localToken);
}

async function pollOnce(): Promise<void> {
  if (isPolling) {
    return;
  }

  if (!window.traccion?.getPersistedRecordsToken || !window.traccion.loadPersistedRecords) {
    setState({
      status: 'disabled',
      message: 'SQLite compartida no disponible; edición bloqueada.',
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
    const tokenSnapshot = await window.traccion.getPersistedRecordsToken();
    if (!canPollStatus(tokenSnapshot.status)) {
      setState({
        status: tokenSnapshot.status.phase === 'locked' ? 'disabled' : 'error',
        message: tokenSnapshot.status.message ?? 'SQLite no disponible; edición bloqueada.',
        lastError: tokenSnapshot.status.message ?? null,
      });
      stopExternalDataSyncPolling();
      return;
    }

    const changedDirectStoreIds = collectChangedDirectStores(tokenSnapshot);
    const hasPersistedRecordsChanged = persistedRecordsChanged(tokenSnapshot);
    const hasOnlyRefreshTokenChanged = refreshTokenChangedWithoutKnownStoreChange(tokenSnapshot);

    if (!hasPersistedRecordsChanged && changedDirectStoreIds.length === 0) {
      updateSeenTokens(tokenSnapshot);
      setState({
        status: 'synced',
        message: hasOnlyRefreshTokenChanged ? 'Marcador compartido actualizado sin recarga necesaria.' : 'Datos actualizados.',
        lastCheckedAt: checkedAt,
        lastError: null,
      });
      return;
    }

    if (changedDirectStoreIds.length > 0 && !hasPersistedRecordsChanged) {
      updateSeenTokens(tokenSnapshot);
      await reloadIntegratedStores(changedDirectStoreIds);
      const appliedAt = new Date().toISOString();
      setState({
        status: 'applied',
        message: `Cambios externos aplicados en ${changedDirectStoreIds.join(', ')}.`,
        lastCheckedAt: checkedAt,
        lastAppliedAt: appliedAt,
        lastError: null,
      });
      return;
    }

    const snapshot = await window.traccion.loadPersistedRecords();
    if (!canPollStatus(snapshot.status)) {
      setState({
        status: snapshot.status.phase === 'locked' ? 'disabled' : 'error',
        message: snapshot.status.message ?? 'SQLite no disponible; edición bloqueada.',
        lastError: snapshot.status.message ?? null,
      });
      stopExternalDataSyncPolling();
      return;
    }

    const changedLegacyStoreIds = collectChangedLegacyStores(snapshot);
    applyPersistedRecordsSnapshotToLocalStorage(snapshot);
    updateSeenTokens(snapshot);
    await reloadIntegratedStores(changedLegacyStoreIds ?? undefined);
    const appliedAt = new Date().toISOString();
    setState({
      status: 'applied',
      message:
        changedLegacyStoreIds && changedLegacyStoreIds.length > 0
          ? `Cambios externos aplicados en ${changedLegacyStoreIds.join(', ')}.`
          : 'Cambios externos aplicados.',
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

export async function forceExternalDataRefreshAfterRecovery(): Promise<void> {
  if (!window.traccion?.loadPersistedRecords || !window.traccion?.getPersistedRecordsToken) {
    throw new Error('IPC de persistencia no disponible para refrescar datos tras la reconexión.');
  }

  await ensureSyncableStoresRegistered();

  const snapshot = await window.traccion.loadPersistedRecords();
  if (!canPollStatus(snapshot.status)) {
    throw new Error(snapshot.status.message ?? 'SQLite no está operativa tras recuperar la conexión.');
  }

  applyPersistedRecordsSnapshotToLocalStorage(snapshot);
  updateSeenTokens(snapshot);

  // Todos los stores se fuerzan a releer su fuente SQLite. Algunos módulos
  // mantienen una copia efímera de representación en sessionStorage, pero nunca se usa
  // como fuente autoritativa para recuperar una caída.
  await reloadIntegratedStores();

  const tokenSnapshot = await window.traccion.getPersistedRecordsToken();
  if (!canPollStatus(tokenSnapshot.status)) {
    throw new Error(tokenSnapshot.status.message ?? 'SQLite dejó de estar disponible durante el refresco.');
  }
  updateSeenTokens(tokenSnapshot);

  const now = new Date().toISOString();
  setState({
    status: 'applied',
    message: 'Conexión recuperada; datos compartidos refrescados.',
    lastCheckedAt: now,
    lastAppliedAt: now,
    lastError: null,
  });
}

function handleDatabaseConnectivityRecovered(): void {
  void pollOnce();
}

function handleSharedEditingActivityChanged(): void {
  if (!hasActiveSharedEditing()) {
    void pollOnce();
  }
}

export function startExternalDataSyncPolling(): void {
  if (typeof window === 'undefined' || timerId !== null) {
    return;
  }

  void ensureSyncableStoresRegistered().catch((error) => {
    console.error('No se han podido registrar los stores sincronizables.', error);
  });

  const metadata = readHydrationMetadata();
  lastSeenRefreshToken = metadata?.refreshToken ?? null;
  // Los stores con tabla directa no forman parte del snapshot genérico de hidratación.
  // Sus tokens arrancan a null deliberadamente: el primer poll los compara contra
  // SQLite y recarga solo los stores que ya tienen datos, cerrando la ventana entre
  // hidratación y primer polling sin añadir un segundo temporizador por módulo.
  const hasValidCache = Boolean(metadata?.refreshToken && metadata.strategy === 'sqlite');
  lastSeenPersistedRecordsUpdatedAt = hasValidCache ? (metadata?.lastUpdatedAt ?? null) : null;
  lastSeenTaskRecordsUpdatedAt = null;
  lastSeenSorteosDrawsUpdatedAt = null;
  lastSeenSorteosExclusionsUpdatedAt = null;
  lastSeenDirectStoreUpdatedAt = {};
  void pollOnce();
  timerId = window.setInterval(() => {
    void pollOnce();
  }, POLLING_INTERVAL_MS);
  window.addEventListener(DATABASE_CONNECTIVITY_RECOVERED_EVENT, handleDatabaseConnectivityRecovered);
  unsubscribeSharedEditingActivity = subscribeSharedEditingActivity(handleSharedEditingActivityChanged);
  unsubscribePersistenceFeedback = subscribeToPersistenceFeedback((feedback) => {
    if (isPersistenceFeedbackSilent(feedback)) {
      return;
    }

    if (feedback.kind === 'saving') {
      persistenceWriteInProgress = true;
      postponePolling(2_000);
      return;
    }

    persistenceWriteInProgress = false;
    postponePolling(1_000);
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
  lastSeenRefreshToken = null;
  lastSeenPersistedRecordsUpdatedAt = null;
  lastSeenTaskRecordsUpdatedAt = null;
  lastSeenSorteosDrawsUpdatedAt = null;
  lastSeenSorteosExclusionsUpdatedAt = null;
  lastSeenDirectStoreUpdatedAt = {};
}

export function useExternalDataSyncStatus(): ExternalDataSyncState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

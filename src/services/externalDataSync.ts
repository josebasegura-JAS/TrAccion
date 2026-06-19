import { useSyncExternalStore } from 'react';
import { reloadRegisteredSyncableStores } from './syncableStoreRegistry';
import { hasActiveSharedEditing, subscribeSharedEditingActivity } from './sharedEditingActivity';
import {
  applyPersistedRecordsSnapshotToLocalStorage,
  flushPendingSqliteWrites,
  readHydrationMetadata,
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
  'traccion.v1.ticketRestaurante.debtLedger': 'ticket-restaurante',
  'traccion.v1.ticketRestaurante.manutenciones': 'ticket-restaurante',
  'traccion.v1.criterios-rrll.criterios': 'criterios-rrll',
  'traccion.v1.vinculograma.records': 'vinculograma',
  'traccion.v1.vinculograma.showExpired': 'vinculograma',
  'traccion.v1.configuracion': 'configuracion',
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
let lastSeenActaRecordsUpdatedAt: string | null = null;
let lastSeenComiteSessionRecordsUpdatedAt: string | null = null;
let lastSeenParitariaSessionRecordsUpdatedAt: string | null = null;
let lastSeenCriteriosRrllRecordsUpdatedAt: string | null = null;
let lastSeenEspecialesRecipientRecordsUpdatedAt: string | null = null;
let lastSeenLicenciaSinSueldoRecordsUpdatedAt: string | null = null;
let lastSeenPresupuestoScenarioRecordsUpdatedAt: string | null = null;
let lastSeenPresupuestoManualItemRecordsUpdatedAt: string | null = null;
let lastSeenPresupuestoTicketGroupRecordsUpdatedAt: string | null = null;
let lastSeenPresupuestoActualRecordsUpdatedAt: string | null = null;
let lastSeenTeletrabajoSolicitudRecordsUpdatedAt: string | null = null;
let lastSeenTeletrabajoPuestoRecordsUpdatedAt: string | null = null;
let lastSeenVinculogramaRecordsUpdatedAt: string | null = null;
let lastSeenPlantillaJobPositionTranslationRecordsUpdatedAt: string | null = null;
let lastSeenEmployeeRecordsUpdatedAt: string | null = null;
let lastSeenConfiguracionStateUpdatedAt: string | null = null;
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

function reloadIntegratedStores(storeIds?: string[]): void {
  reloadRegisteredSyncableStores(storeIds);
}

function canPollStatus(status: TraccionDatabaseStatus): boolean {
  return status.ready && status.phase !== 'fallback' && status.phase !== 'error' && status.phase !== 'locked';
}

function valueChanged(lastSeenValue: string | null, nextValue: string | null | undefined): boolean {
  if (!lastSeenValue || !nextValue) {
    return false;
  }

  return nextValue !== lastSeenValue;
}

function collectChangedDirectStores(tokenSnapshot: TraccionPersistedRecordsTokenSnapshot): string[] {
  const changedStoreIds = new Set<string>();

  if (valueChanged(lastSeenTaskRecordsUpdatedAt, tokenSnapshot.taskRecordsUpdatedAt)) {
    changedStoreIds.add('tareas');
  }

  if (
    valueChanged(lastSeenSorteosDrawsUpdatedAt, tokenSnapshot.sorteosDrawsUpdatedAt) ||
    valueChanged(lastSeenSorteosExclusionsUpdatedAt, tokenSnapshot.sorteosExclusionsUpdatedAt)
  ) {
    changedStoreIds.add('sorteos');
  }

  if (valueChanged(lastSeenActaRecordsUpdatedAt, tokenSnapshot.actaRecordsUpdatedAt)) {
    changedStoreIds.add('actas');
  }

  if (valueChanged(lastSeenComiteSessionRecordsUpdatedAt, tokenSnapshot.comiteSessionRecordsUpdatedAt)) {
    changedStoreIds.add('comite-sesiones');
  }

  if (valueChanged(lastSeenParitariaSessionRecordsUpdatedAt, tokenSnapshot.paritariaSessionRecordsUpdatedAt)) {
    changedStoreIds.add('paritaria-sesiones');
  }

  if (valueChanged(lastSeenCriteriosRrllRecordsUpdatedAt, tokenSnapshot.criteriosRrllRecordsUpdatedAt)) {
    changedStoreIds.add('criterios-rrll');
  }

  if (
    valueChanged(lastSeenEspecialesRecipientRecordsUpdatedAt, tokenSnapshot.especialesRecipientRecordsUpdatedAt)
  ) {
    changedStoreIds.add('especiales');
  }

  if (
    valueChanged(lastSeenLicenciaSinSueldoRecordsUpdatedAt, tokenSnapshot.licenciaSinSueldoRecordsUpdatedAt)
  ) {
    changedStoreIds.add('licencias-sin-sueldo');
  }

  if (
    valueChanged(lastSeenPresupuestoScenarioRecordsUpdatedAt, tokenSnapshot.presupuestoScenarioRecordsUpdatedAt) ||
    valueChanged(
      lastSeenPresupuestoManualItemRecordsUpdatedAt,
      tokenSnapshot.presupuestoManualItemRecordsUpdatedAt,
    ) ||
    valueChanged(
      lastSeenPresupuestoTicketGroupRecordsUpdatedAt,
      tokenSnapshot.presupuestoTicketGroupRecordsUpdatedAt,
    ) ||
    valueChanged(lastSeenPresupuestoActualRecordsUpdatedAt, tokenSnapshot.presupuestoActualRecordsUpdatedAt)
  ) {
    changedStoreIds.add('presupuestos');
  }

  if (
    valueChanged(
      lastSeenTeletrabajoSolicitudRecordsUpdatedAt,
      tokenSnapshot.teletrabajoSolicitudRecordsUpdatedAt,
    ) ||
    valueChanged(lastSeenTeletrabajoPuestoRecordsUpdatedAt, tokenSnapshot.teletrabajoPuestoRecordsUpdatedAt)
  ) {
    changedStoreIds.add('teletrabajo');
  }

  if (valueChanged(lastSeenVinculogramaRecordsUpdatedAt, tokenSnapshot.vinculogramaRecordsUpdatedAt)) {
    changedStoreIds.add('vinculograma');
  }

  if (
    valueChanged(
      lastSeenPlantillaJobPositionTranslationRecordsUpdatedAt,
      tokenSnapshot.plantillaJobPositionTranslationRecordsUpdatedAt,
    ) ||
    valueChanged(lastSeenEmployeeRecordsUpdatedAt, tokenSnapshot.employeeRecordsUpdatedAt)
  ) {
    changedStoreIds.add('plantilla');
  }

  if (valueChanged(lastSeenConfiguracionStateUpdatedAt, tokenSnapshot.configuracionStateUpdatedAt)) {
    changedStoreIds.add('configuracion');
  }

  return Array.from(changedStoreIds);
}

function collectChangedLegacyStores(snapshot: TraccionPersistedRecordsSnapshot): string[] | null {
  const changedStoreIds = new Set<string>();

  for (const record of snapshot.records) {
    const storeId = LEGACY_STORAGE_STORE_IDS[record.key];
    const localValue = window.localStorage.getItem(record.key);

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
  lastSeenActaRecordsUpdatedAt = tokenSnapshot.actaRecordsUpdatedAt ?? null;
  lastSeenComiteSessionRecordsUpdatedAt = tokenSnapshot.comiteSessionRecordsUpdatedAt ?? null;
  lastSeenParitariaSessionRecordsUpdatedAt = tokenSnapshot.paritariaSessionRecordsUpdatedAt ?? null;
  lastSeenCriteriosRrllRecordsUpdatedAt = tokenSnapshot.criteriosRrllRecordsUpdatedAt ?? null;
  lastSeenEspecialesRecipientRecordsUpdatedAt = tokenSnapshot.especialesRecipientRecordsUpdatedAt ?? null;
  lastSeenLicenciaSinSueldoRecordsUpdatedAt = tokenSnapshot.licenciaSinSueldoRecordsUpdatedAt ?? null;
  lastSeenPresupuestoScenarioRecordsUpdatedAt = tokenSnapshot.presupuestoScenarioRecordsUpdatedAt ?? null;
  lastSeenPresupuestoManualItemRecordsUpdatedAt = tokenSnapshot.presupuestoManualItemRecordsUpdatedAt ?? null;
  lastSeenPresupuestoTicketGroupRecordsUpdatedAt = tokenSnapshot.presupuestoTicketGroupRecordsUpdatedAt ?? null;
  lastSeenPresupuestoActualRecordsUpdatedAt = tokenSnapshot.presupuestoActualRecordsUpdatedAt ?? null;
  lastSeenTeletrabajoSolicitudRecordsUpdatedAt = tokenSnapshot.teletrabajoSolicitudRecordsUpdatedAt ?? null;
  lastSeenTeletrabajoPuestoRecordsUpdatedAt = tokenSnapshot.teletrabajoPuestoRecordsUpdatedAt ?? null;
  lastSeenVinculogramaRecordsUpdatedAt = tokenSnapshot.vinculogramaRecordsUpdatedAt ?? null;
  lastSeenPlantillaJobPositionTranslationRecordsUpdatedAt =
    tokenSnapshot.plantillaJobPositionTranslationRecordsUpdatedAt ?? null;
  lastSeenEmployeeRecordsUpdatedAt = tokenSnapshot.employeeRecordsUpdatedAt ?? null;
  lastSeenConfiguracionStateUpdatedAt = tokenSnapshot.configuracionStateUpdatedAt ?? null;
}

function persistedRecordsChanged(tokenSnapshot: TraccionPersistedRecordsTokenSnapshot): boolean {
  return valueChanged(lastSeenPersistedRecordsUpdatedAt, tokenSnapshot.latestUpdatedAt);
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

    const changedDirectStoreIds = collectChangedDirectStores(tokenSnapshot);
    const hasPersistedRecordsChanged = persistedRecordsChanged(tokenSnapshot);
    const hasOnlyRefreshTokenChanged = refreshTokenChangedWithoutKnownStoreChange(tokenSnapshot);

    if (!hasPersistedRecordsChanged && changedDirectStoreIds.length === 0) {
      const flushedCount = await flushPendingSqliteWrites();
      updateSeenTokens(tokenSnapshot);
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
        message: hasOnlyRefreshTokenChanged ? 'Marcador compartido actualizado sin recarga necesaria.' : 'Datos actualizados.',
        lastCheckedAt: checkedAt,
        lastError: null,
      });
      return;
    }

    if (changedDirectStoreIds.length > 0 && !hasPersistedRecordsChanged) {
      await flushPendingSqliteWrites();
      updateSeenTokens(tokenSnapshot);
      reloadIntegratedStores(changedDirectStoreIds);
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
        message: snapshot.status.message ?? 'SQLite no disponible; se mantiene localStorage.',
        lastError: snapshot.status.message ?? null,
      });
      stopExternalDataSyncPolling();
      return;
    }

    const changedLegacyStoreIds = collectChangedLegacyStores(snapshot);
    applyPersistedRecordsSnapshotToLocalStorage(snapshot);
    await flushPendingSqliteWrites();
    updateSeenTokens(snapshot);
    reloadIntegratedStores(changedLegacyStoreIds ?? undefined);
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
  // Si la hidratación fue satisfactoria (refreshToken presente), el localStorage
  // ya está al día. Inicializar los tokens de tareas/sorteos a un valor centinela
  // distinto de null para que el primer poll no los recargue si no han cambiado.
  // El valor real se actualiza en el primer updateSeenTokens.
  const hasValidCache = Boolean(metadata?.refreshToken && metadata.strategy === 'sqlite');
  lastSeenPersistedRecordsUpdatedAt = hasValidCache ? (metadata?.lastUpdatedAt ?? null) : null;
  lastSeenTaskRecordsUpdatedAt = null;
  lastSeenSorteosDrawsUpdatedAt = null;
  lastSeenSorteosExclusionsUpdatedAt = null;
  lastSeenActaRecordsUpdatedAt = null;
  lastSeenComiteSessionRecordsUpdatedAt = null;
  lastSeenParitariaSessionRecordsUpdatedAt = null;
  lastSeenCriteriosRrllRecordsUpdatedAt = null;
  lastSeenEspecialesRecipientRecordsUpdatedAt = null;
  lastSeenLicenciaSinSueldoRecordsUpdatedAt = null;
  lastSeenPresupuestoScenarioRecordsUpdatedAt = null;
  lastSeenPresupuestoManualItemRecordsUpdatedAt = null;
  lastSeenPresupuestoTicketGroupRecordsUpdatedAt = null;
  lastSeenPresupuestoActualRecordsUpdatedAt = null;
  lastSeenTeletrabajoSolicitudRecordsUpdatedAt = null;
  lastSeenTeletrabajoPuestoRecordsUpdatedAt = null;
  lastSeenVinculogramaRecordsUpdatedAt = null;
  lastSeenPlantillaJobPositionTranslationRecordsUpdatedAt = null;
  lastSeenEmployeeRecordsUpdatedAt = null;
  lastSeenConfiguracionStateUpdatedAt = null;
  void pollOnce();
  timerId = window.setInterval(() => {
    void pollOnce();
  }, POLLING_INTERVAL_MS);
  window.addEventListener(DATABASE_CONNECTIVITY_RECOVERED_EVENT, handleDatabaseConnectivityRecovered);
  unsubscribeSharedEditingActivity = subscribeSharedEditingActivity(handleSharedEditingActivityChanged);
  unsubscribePersistenceFeedback = subscribeToPersistenceFeedback((feedback) => {
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
  lastSeenPersistedRecordsUpdatedAt = null;
  lastSeenTaskRecordsUpdatedAt = null;
  lastSeenSorteosDrawsUpdatedAt = null;
  lastSeenSorteosExclusionsUpdatedAt = null;
  lastSeenActaRecordsUpdatedAt = null;
  lastSeenComiteSessionRecordsUpdatedAt = null;
  lastSeenParitariaSessionRecordsUpdatedAt = null;
  lastSeenCriteriosRrllRecordsUpdatedAt = null;
  lastSeenEspecialesRecipientRecordsUpdatedAt = null;
  lastSeenLicenciaSinSueldoRecordsUpdatedAt = null;
  lastSeenPresupuestoScenarioRecordsUpdatedAt = null;
  lastSeenPresupuestoManualItemRecordsUpdatedAt = null;
  lastSeenPresupuestoTicketGroupRecordsUpdatedAt = null;
  lastSeenPresupuestoActualRecordsUpdatedAt = null;
  lastSeenTeletrabajoSolicitudRecordsUpdatedAt = null;
  lastSeenTeletrabajoPuestoRecordsUpdatedAt = null;
  lastSeenVinculogramaRecordsUpdatedAt = null;
  lastSeenPlantillaJobPositionTranslationRecordsUpdatedAt = null;
  lastSeenEmployeeRecordsUpdatedAt = null;
  lastSeenConfiguracionStateUpdatedAt = null;
}

export function useExternalDataSyncStatus(): ExternalDataSyncState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

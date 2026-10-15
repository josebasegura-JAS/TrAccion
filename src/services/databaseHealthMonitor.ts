import { publishDatabaseStatus, refreshDatabaseStatus } from './databaseStatus';
import { publishDatabaseConnectivityBlock } from './editingAvailability';
import {
  forceExternalDataRefreshAfterRecovery,
  startExternalDataSyncPolling,
  stopExternalDataSyncPolling,
} from './externalDataSync';
import { publishDatabaseConnectivityState } from './databaseConnectivityState';

const HEALTHY_CHECK_INTERVAL_MS = 5_000;
const RECONNECT_FAST_INTERVAL_MS = 2_000;
const RECONNECT_SLOW_INTERVAL_MS = 5_000;
const RECONNECT_FAST_ATTEMPTS = 5;
const HEALTH_CHECK_TIMEOUT_MS = 6_000;
const CONNECTIVITY_MESSAGE =
  'Se ha perdido la conexión con la base SQLite compartida. La edición permanece bloqueada mientras TrAcción intenta reconectar.';

type NetworkInformationLike = {
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
};

let timerId: number | null = null;
let checkInProgress = false;
let consecutiveFailures = 0;
let blockedByHealthMonitor = false;
let monitorStarted = false;
let browserOnlineHandler: (() => void) | null = null;
let browserOfflineHandler: (() => void) | null = null;
let networkConnection: NetworkInformationLike | null = null;
let networkConnectionChangeHandler: (() => void) | null = null;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new Error(`La comprobación SQLite superó ${ms / 1_000} s.`)),
      ms,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function clearScheduledCheck(): void {
  if (timerId !== null) {
    window.clearTimeout(timerId);
    timerId = null;
  }
}

function scheduleNextCheck(delayMs?: number): void {
  if (!monitorStarted) return;
  clearScheduledCheck();
  const reconnectDelay = consecutiveFailures <= RECONNECT_FAST_ATTEMPTS
    ? RECONNECT_FAST_INTERVAL_MS
    : RECONNECT_SLOW_INTERVAL_MS;
  const nextDelay = delayMs ?? (blockedByHealthMonitor ? reconnectDelay : HEALTHY_CHECK_INTERVAL_MS);
  timerId = window.setTimeout(() => {
    timerId = null;
    void runHealthCheck();
  }, nextDelay);
}

function blockEditing(message = CONNECTIVITY_MESSAGE): void {
  stopExternalDataSyncPolling();
  blockedByHealthMonitor = true;
  const attempt = Math.max(1, consecutiveFailures);
  publishDatabaseConnectivityBlock(true, message, 'health-monitor');
  publishDatabaseConnectivityState(
    'reconnecting',
    attempt === 1
      ? 'Conexión interrumpida. Reconectando con la base compartida…'
      : `Reconectando con la base compartida… intento ${attempt}`,
    attempt,
  );
}

function markPotentialNetworkTransition(message: string): void {
  consecutiveFailures = Math.max(1, consecutiveFailures);
  blockEditing(message);
  requestDatabaseReconnectCheck();
}

function getNetworkInformation(): NetworkInformationLike | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection ?? null;
}

async function completeRecovery(): Promise<void> {
  publishDatabaseConnectivityBlock(
    true,
    'Conexión recuperada. Actualizando los datos compartidos antes de reactivar la edición…',
    'health-monitor',
  );
  publishDatabaseConnectivityState(
    'syncing',
    'Conexión recuperada. Actualizando los datos compartidos…',
  );

  const status = await refreshDatabaseStatus();
  if (!status?.ready || status.phase !== 'active' || status.isDefaultPath !== false) {
    throw new Error(status?.message ?? 'SQLite todavía no está operativa como base compartida.');
  }

  await forceExternalDataRefreshAfterRecovery();
  startExternalDataSyncPolling();
  blockedByHealthMonitor = false;
  consecutiveFailures = 0;
  publishDatabaseConnectivityBlock(false, 'Conexión SQLite recuperada y datos compartidos actualizados.', 'health-monitor');
  publishDatabaseConnectivityState(
    'recovered',
    'Conexión restablecida · datos compartidos actualizados.',
  );
}

async function runHealthCheck(): Promise<void> {
  if (!monitorStarted || checkInProgress || !window.traccion?.databaseHealthCheck) {
    scheduleNextCheck();
    return;
  }

  checkInProgress = true;
  try {
    const result = await withTimeout(window.traccion.databaseHealthCheck(), HEALTH_CHECK_TIMEOUT_MS);
    publishDatabaseStatus(result.status);

    if (!result.ok) {
      consecutiveFailures += 1;
      blockEditing(`${CONNECTIVITY_MESSAGE} ${result.message}`);
      return;
    }

    if (!blockedByHealthMonitor) {
      consecutiveFailures = 0;
      publishDatabaseConnectivityState('connected', result.message);
      return;
    }

    await completeRecovery();
  } catch (error) {
    consecutiveFailures += 1;
    const message = error instanceof Error ? error.message : 'Error verificando SQLite.';
    blockEditing(`${CONNECTIVITY_MESSAGE} ${message}`);
  } finally {
    checkInProgress = false;
    scheduleNextCheck();
  }
}

export function requestDatabaseReconnectCheck(): void {
  if (!monitorStarted) return;
  clearScheduledCheck();
  scheduleNextCheck(0);
}

export function startDatabaseHealthMonitor(): void {
  if (typeof window === 'undefined' || monitorStarted || !window.traccion?.databaseHealthCheck) {
    return;
  }

  monitorStarted = true;
  browserOnlineHandler = () => {
    markPotentialNetworkTransition(
      'La red ha cambiado o acaba de recuperarse. Verificando de nuevo la base compartida…',
    );
  };
  browserOfflineHandler = () => {
    markPotentialNetworkTransition(
      'Windows ha informado de una pérdida de red. Reconectando con la base compartida…',
    );
  };
  window.addEventListener('online', browserOnlineHandler);
  window.addEventListener('offline', browserOfflineHandler);

  networkConnection = getNetworkInformation();
  networkConnectionChangeHandler = () => {
    markPotentialNetworkTransition(
      'Se ha detectado un cambio de conexión de red. Verificando la base compartida antes de continuar…',
    );
  };
  networkConnection?.addEventListener?.('change', networkConnectionChangeHandler);

  requestDatabaseReconnectCheck();
}

export function stopDatabaseHealthMonitor(): void {
  if (typeof window === 'undefined') {
    return;
  }
  monitorStarted = false;
  clearScheduledCheck();
  if (browserOnlineHandler) window.removeEventListener('online', browserOnlineHandler);
  if (browserOfflineHandler) window.removeEventListener('offline', browserOfflineHandler);
  if (networkConnectionChangeHandler) {
    networkConnection?.removeEventListener?.('change', networkConnectionChangeHandler);
  }
  browserOnlineHandler = null;
  browserOfflineHandler = null;
  networkConnection = null;
  networkConnectionChangeHandler = null;
  checkInProgress = false;
  consecutiveFailures = 0;
  blockedByHealthMonitor = false;
  publishDatabaseConnectivityBlock(false, undefined, 'health-monitor');
  publishDatabaseConnectivityState('connected');
}

import { publishDatabaseStatus, refreshDatabaseStatus } from './databaseStatus';
import { publishDatabaseConnectivityBlock } from './editingAvailability';
import { forceExternalDataRefreshAfterRecovery } from './externalDataSync';

const HEALTH_CHECK_INTERVAL_MS = 12_000;
const FAILURE_THRESHOLD = 3;
const RECOVERY_SUCCESS_THRESHOLD = 2;
const HEALTH_CHECK_TIMEOUT_MS = 8_000;
const CONNECTIVITY_MESSAGE =
  'Se ha perdido la conexión con la base SQLite compartida. La edición permanece bloqueada hasta verificar la recuperación y refrescar los datos.';

let timerId: number | null = null;
let checkInProgress = false;
let consecutiveFailures = 0;
let consecutiveRecoverySuccesses = 0;
let blockedByHealthMonitor = false;

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

function blockEditing(message = CONNECTIVITY_MESSAGE): void {
  blockedByHealthMonitor = true;
  consecutiveRecoverySuccesses = 0;
  publishDatabaseConnectivityBlock(true, message, 'health-monitor');
}

async function completeRecovery(): Promise<void> {
  // Se mantiene el bloqueo durante toda la validación y el refresco. El usuario
  // nunca vuelve a editar usando el estado previo a una caída de red.
  publishDatabaseConnectivityBlock(
    true,
    'Conexión SQLite recuperada. Actualizando los datos compartidos antes de reactivar la edición…',
    'health-monitor',
  );

  const status = await refreshDatabaseStatus();
  if (!status?.ready || status.phase !== 'active' || status.isDefaultPath !== false) {
    throw new Error(status?.message ?? 'SQLite todavía no está operativa como base compartida.');
  }

  await forceExternalDataRefreshAfterRecovery();
  blockedByHealthMonitor = false;
  consecutiveFailures = 0;
  consecutiveRecoverySuccesses = 0;
  publishDatabaseConnectivityBlock(false, 'Conexión SQLite recuperada y datos compartidos actualizados.', 'health-monitor');
}

async function runHealthCheck(): Promise<void> {
  if (checkInProgress || !window.traccion?.databaseHealthCheck) {
    return;
  }

  checkInProgress = true;
  try {
    const result = await withTimeout(window.traccion.databaseHealthCheck(), HEALTH_CHECK_TIMEOUT_MS);
    publishDatabaseStatus(result.status);

    if (!result.ok) {
      consecutiveFailures += 1;
      consecutiveRecoverySuccesses = 0;
      if (consecutiveFailures >= FAILURE_THRESHOLD) {
        blockEditing(`${CONNECTIVITY_MESSAGE} ${result.message}`);
      }
      return;
    }

    consecutiveFailures = 0;
    if (!blockedByHealthMonitor) {
      return;
    }

    consecutiveRecoverySuccesses += 1;
    if (consecutiveRecoverySuccesses < RECOVERY_SUCCESS_THRESHOLD) {
      return;
    }

    await completeRecovery();
  } catch (error) {
    consecutiveFailures += 1;
    consecutiveRecoverySuccesses = 0;
    const message = error instanceof Error ? error.message : 'Error verificando SQLite.';
    if (blockedByHealthMonitor || consecutiveFailures >= FAILURE_THRESHOLD) {
      blockEditing(`${CONNECTIVITY_MESSAGE} ${message}`);
    }
  } finally {
    checkInProgress = false;
  }
}

export function startDatabaseHealthMonitor(): void {
  if (typeof window === 'undefined' || timerId !== null || !window.traccion?.databaseHealthCheck) {
    return;
  }

  void runHealthCheck();
  timerId = window.setInterval(() => {
    void runHealthCheck();
  }, HEALTH_CHECK_INTERVAL_MS);
}

export function stopDatabaseHealthMonitor(): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
  checkInProgress = false;
  consecutiveFailures = 0;
  consecutiveRecoverySuccesses = 0;
  blockedByHealthMonitor = false;
  publishDatabaseConnectivityBlock(false, undefined, 'health-monitor');
}

import { publishDatabaseStatus, refreshDatabaseStatus } from './databaseStatus';
import { publishDatabaseConnectivityBlock } from './editingAvailability';
import {
  forceExternalDataRefreshAfterRecovery,
  startExternalDataSyncPolling,
  stopExternalDataSyncPolling,
} from './externalDataSync';
import { publishDatabaseConnectivityState } from './databaseConnectivityState';
import { isAutomaticRestartDue } from './safeRestartPolicy';

const HEALTHY_CHECK_INTERVAL_MS = 5_000;
const RECONNECT_FAST_INTERVAL_MS = 2_000;
const RECONNECT_SLOW_INTERVAL_MS = 5_000;
const RECONNECT_FAST_ATTEMPTS = 5;
const HEALTH_CHECK_TIMEOUT_MS = 6_000;
const RECOVERY_TIMEOUT_MS = 60_000;
// Un único timeout de respuesta NO demuestra una desconexión SMB. El IPC
// puede estar esperando detrás de una operación válida en la cola SQLite.
const TRANSIENT_TIMEOUTS_BEFORE_BLOCK = 2;
// Un SQLITE_BUSY puede ser contención temporal, no una caída de red.
// Limitar el número de comprobaciones síncronas que mantienen ocupado Electron.
const BUSY_BACKOFF_AFTER = 3;
const BUSY_BACKOFF_MS = 20_000;
const CONNECTIVITY_MESSAGE =
  'Se ha perdido la conexión con la base SQLite compartida. La edición permanece bloqueada mientras TrAcción intenta reconectar.';

type NetworkInformationLike = {
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
};

export interface ConnectionDiagnostics {
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  lastCheckDurationMs: number | null;
  checking: boolean;
  consecutiveBusy: number;
  busySinceAt: string | null;
  unavailableSinceAt: string | null;
  autoRestartMessage: string | null;
}
let diagnostics: ConnectionDiagnostics = { lastSuccessAt: null, lastFailureAt: null, lastError: null, consecutiveFailures: 0, lastCheckDurationMs: null, checking: false, consecutiveBusy: 0, busySinceAt: null, unavailableSinceAt: null, autoRestartMessage: null };
const diagnosticsListeners = new Set<() => void>();
function updateDiagnostics(patch: Partial<ConnectionDiagnostics>): void {
  diagnostics = { ...diagnostics, ...patch };
  diagnosticsListeners.forEach((listener) => listener());
}
export function getConnectionDiagnostics(): ConnectionDiagnostics { return diagnostics; }
export function subscribeConnectionDiagnostics(listener: () => void): () => void {
  diagnosticsListeners.add(listener);
  return () => diagnosticsListeners.delete(listener);
}

let timerId: number | null = null;
let checkInProgress = false;
let consecutiveFailures = 0;
let consecutiveHealthCheckTimeouts = 0;
let consecutiveBusy = 0;
let busySinceAt: string | null = null;
let unavailableSinceAt: string | null = null;
let automaticRestartAttempted = false;
let blockedByHealthMonitor = false;
// Cada cambio de conexión confirmado invalida recuperaciones antiguas.
let recoveryGeneration = 0;
// No se ejecutan dos recargas completas a la vez, ni siquiera tras timeout.
let recoveryWorkInFlight: Promise<void> | null = null;
let monitorStarted = false;
let browserOnlineHandler: (() => void) | null = null;
let browserOfflineHandler: (() => void) | null = null;
let networkConnection: NetworkInformationLike | null = null;
let networkConnectionChangeHandler: (() => void) | null = null;

async function withTimeout<T>(promise: Promise<T>, ms: number, label = 'La comprobación SQLite'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new Error(`${label} superó ${ms / 1_000} s.`)),
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
  const nextDelay = delayMs ?? (consecutiveBusy >= BUSY_BACKOFF_AFTER
    ? BUSY_BACKOFF_MS
    : blockedByHealthMonitor ? reconnectDelay : HEALTHY_CHECK_INTERVAL_MS);
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

function markPotentialNetworkTransition(message: string, confirmedOffline = false): void {
  // Los eventos 'online' y 'connection.change' indican transición de red,
  // NO que el recurso SQLite/SMB sea inaccesible. Verificar sin interrumpir
  // la edición que aún está confirmada como disponible.
  if (confirmedOffline) {
    recoveryGeneration += 1;
    consecutiveFailures = Math.max(1, consecutiveFailures);
    blockEditing(message);
  }
  requestDatabaseReconnectCheck();
}

/** Solo tratar como contención cuando la conexión sigue activa y la respuesta
 * identifica explícitamente SQLITE_BUSY/SQLITE_LOCKED. No confundir con I/O. */
function isActiveSqliteBusyResult(result: { ok: boolean; status: { ready: boolean; phase: string }; message: string }): boolean {
  return !result.ok && result.status.ready && result.status.phase === 'active'
    && /\bSQLITE_(?:BUSY|LOCKED)\b/i.test(result.message);
}

function markUnavailable(): void {
  if (unavailableSinceAt !== null) return;
  unavailableSinceAt = new Date().toISOString();
  automaticRestartAttempted = false;
  updateDiagnostics({ unavailableSinceAt, autoRestartMessage: null });
}

function resetUnavailableEpisode(): void {
  unavailableSinceAt = null;
  automaticRestartAttempted = false;
  updateDiagnostics({ unavailableSinceAt: null, autoRestartMessage: null });
}

function maybeRequestAutomaticRestart(): void {
  if (!monitorStarted || automaticRestartAttempted ||
      !isAutomaticRestartDue(unavailableSinceAt, Date.now())) return;
  const requestRestart = window.traccion?.requestSafeRestart;
  if (!requestRestart) return;
  automaticRestartAttempted = true; // Una sola solicitud por episodio.
  updateDiagnostics({ autoRestartMessage: 'Comprobando si es seguro reiniciar automáticamente…' });
  void requestRestart({ automatic: true }).then(
    (response) => {
      if (!response.ok && monitorStarted && unavailableSinceAt) {
        updateDiagnostics({ autoRestartMessage: response.message ?? 'No se ha autorizado el reinicio automático.' });
      }
    },
    () => {
      if (monitorStarted && unavailableSinceAt) {
        updateDiagnostics({ autoRestartMessage: 'No se ha podido solicitar el reinicio automático. Puedes usar el botón manual.' });
      }
    },
  );
}

function resetBusyEpisode(): void {
  if (consecutiveBusy === 0 && busySinceAt === null) return;
  consecutiveBusy = 0;
  busySinceAt = null;
  updateDiagnostics({ consecutiveBusy: 0, busySinceAt: null });
}

function isHealthCheckResponseTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === `La comprobación SQLite superó ${HEALTH_CHECK_TIMEOUT_MS / 1_000} s.`;
}

function getNetworkInformation(): NetworkInformationLike | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection ?? null;
}

async function completeRecovery(): Promise<void> {
  // Una llamada SMB puede seguir ejecutándose después de que el timeout
  // haya rechazado su espera. No se permite solapar recargas de todos los
  // stores ni dar por recuperada la base basándose en un resultado antiguo.
  if (recoveryWorkInFlight) {
    throw new Error('Recuperación SQLite anterior todavía en ejecución. Se conserva la edición bloqueada.');
  }
  const generation = ++recoveryGeneration;
  publishDatabaseConnectivityBlock(
    true,
    'Conexión recuperada. Actualizando los datos compartidos antes de reactivar la edición…',
    'health-monitor',
  );
  publishDatabaseConnectivityState(
    'syncing',
    'Conexión recuperada. Actualizando los datos compartidos…',
  );

  const work = (async (): Promise<void> => {
    const status = await refreshDatabaseStatus();
    if (!status?.ready || status.phase !== 'active' || status.isDefaultPath !== false) {
      throw new Error(status?.message ?? 'SQLite todavía no está operativa como base compartida.');
    }
    // La sincronización debe finalizar antes de liberar la edición.
    await forceExternalDataRefreshAfterRecovery();
  })();
  recoveryWorkInFlight = work;
  const onWorkSettled = (): void => {
    if (recoveryWorkInFlight === work) {
      recoveryWorkInFlight = null;
      // Tras un timeout o corte, un chequeo nuevo debe verificar el estado
      // que realmente haya dejado el trabajo anterior. Nunca desbloqueamos
      // desde este callback, aunque ese trabajo termine correctamente.
      if (monitorStarted && generation !== recoveryGeneration) requestDatabaseReconnectCheck();
    }
  };
  void work.then(onWorkSettled, onWorkSettled);

  try {
    await withTimeout(work, RECOVERY_TIMEOUT_MS, 'La recuperación completa de SQLite');
  } catch (error) {
    // Timeout o error: invalida esta ejecución. Su trabajo subyacente puede
    // continuar, pero no podrá publicar estado "recovered" al completarse.
    if (generation === recoveryGeneration) recoveryGeneration += 1;
    throw error;
  }

  if (!monitorStarted || generation !== recoveryGeneration) {
    throw new Error('La recuperación quedó invalidada por un cambio de conexión o reinicio del monitor.');
  }
  startExternalDataSyncPolling({ preserveSeenTokens: true, runImmediately: false });
  blockedByHealthMonitor = false;
  consecutiveFailures = 0;
  publishDatabaseConnectivityBlock(false, 'Conexión SQLite recuperada y datos compartidos actualizados.', 'health-monitor');
  updateDiagnostics({ lastSuccessAt: new Date().toISOString(), lastError: null, consecutiveFailures: 0 });
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
  const checkStartedAt = performance.now();
  updateDiagnostics({ checking: true });
  try {
    const result = await withTimeout(window.traccion.databaseHealthCheck(), HEALTH_CHECK_TIMEOUT_MS);
    consecutiveHealthCheckTimeouts = 0;
    if (isActiveSqliteBusyResult(result)) {
      consecutiveBusy += 1;
      busySinceAt ??= new Date().toISOString();
      updateDiagnostics({
        lastFailureAt: new Date().toISOString(),
        lastError: result.message,
        consecutiveBusy,
        busySinceAt,
      });
      markUnavailable();
      // Una base ocupada no es por sí sola una desconexión. No desbloquear
      // una desconexión anterior, ni iniciar una recarga de stores.
      return;
    }

    resetBusyEpisode();
    publishDatabaseStatus(result.status);

    if (!result.ok) {
      markUnavailable();
      consecutiveFailures += 1;
      updateDiagnostics({ lastFailureAt: new Date().toISOString(), lastError: result.message, consecutiveFailures });
      blockEditing(`${CONNECTIVITY_MESSAGE} ${result.message}`);
      return;
    }

    updateDiagnostics({ lastSuccessAt: new Date().toISOString(), lastError: null, consecutiveFailures: 0 });
    if (!blockedByHealthMonitor) {
      consecutiveFailures = 0;
      resetUnavailableEpisode();
      publishDatabaseConnectivityState('connected', result.message);
      return;
    }

    await completeRecovery();
    resetUnavailableEpisode();
  } catch (error) {
    resetBusyEpisode();
    consecutiveFailures += 1;
    const message = error instanceof Error ? error.message : 'Error verificando SQLite.';
    const timedOut = isHealthCheckResponseTimeout(error);
    consecutiveHealthCheckTimeouts = timedOut ? consecutiveHealthCheckTimeouts + 1 : 0;
    updateDiagnostics({ lastFailureAt: new Date().toISOString(), lastError: message, consecutiveFailures });
    if (timedOut && !blockedByHealthMonitor &&
        consecutiveHealthCheckTimeouts < TRANSIENT_TIMEOUTS_BEFORE_BLOCK) {
      // La primera espera lenta es solo una señal de latencia: no hay un
      // fallo real demostrado. La siguiente comprobación decidirá.
      console.warn('[sqlite-health] Comprobación lenta: se conserva la edición hasta confirmar una segunda espera.', message);
    } else {
      markUnavailable();
      blockEditing(`${CONNECTIVITY_MESSAGE} ${message}`);
    }
  } finally {
    updateDiagnostics({ checking: false, lastCheckDurationMs: Math.round(performance.now() - checkStartedAt) });
    checkInProgress = false;
    maybeRequestAutomaticRestart();
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
      true,
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
  recoveryGeneration += 1;
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
  consecutiveHealthCheckTimeouts = 0;
  resetBusyEpisode();
  resetUnavailableEpisode();
  blockedByHealthMonitor = false;
  publishDatabaseConnectivityBlock(false, undefined, 'health-monitor');
  publishDatabaseConnectivityState('connected');
}

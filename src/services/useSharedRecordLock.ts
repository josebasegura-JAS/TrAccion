import { useEffect, useMemo, useState } from 'react';
import { clearPersistenceBusy, publishPersistenceBusy, waitForNextPaint } from './persistence';
import { markSharedEditingActive, markSharedEditingInactive } from './sharedEditingActivity';

type SharedRecordLockStatus = 'idle' | 'acquired' | 'locked' | 'error';

interface SharedRecordLockParams {
  module: string;
  recordId: string | null;
  enabled: boolean;
}

interface SharedRecordLockState {
  status: SharedRecordLockStatus;
  lockedBy: TraccionRecordLockOwnerInfo | null;
  message: string;
  isReadOnly: boolean;
}

// El lease SQLite dura 75s; renovamos cada 20s para tolerar cortes breves.
const HEARTBEAT_MS = 20 * 1000;
const RETRY_AFTER_TEMPORARY_LOCK_MS = 300;
const MAX_CONSECUTIVE_TEMPORARY_HEARTBEAT_FAILURES = 2;
const TEMPORARY_LOCK_NOTICE_DELAY_MS = 1_000;
const LOCK_BUSY_MESSAGE = 'Abriendo registro…';

// Las nuevas adquisiciones de una misma tarea esperan a que termine cualquier
// liberación anterior del mismo proceso. Evita que una respuesta IPC tardía
// libere accidentalmente la nueva reserva del mismo ownerId.
const pendingLockCleanup = new Map<string, Promise<void>>();
const TEMPORARY_LOCK_BUSY_MESSAGE = 'Base ocupada, reintentando…';

const idleState: SharedRecordLockState = {
  status: 'idle',
  lockedBy: null,
  message: '',
  isReadOnly: false,
};

function getLockMessage(lock: TraccionRecordLockOwnerInfo | null, fallback: string): string {
  if (!lock) {
    return fallback;
  }

  return `Modo consulta — registro bloqueado por ${lock.ownerName}@${lock.machineName}. No se permite editar ni guardar hasta que cierre la otra ventana.`;
}

function isTemporarySqliteLockMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('base ocupada temporalmente') || normalized.includes('bloqueo temporal de operación sqlite');
}

function cleanTemporarySqliteLockMessage(): string {
  return 'Esperando base compartida. Reintentando automáticamente…';
}

function hiddenWaitingForSharedDatabaseState(): SharedRecordLockState {
  return {
    status: 'idle',
    lockedBy: null,
    message: '',
    isReadOnly: true,
  };
}

function visibleWaitingForSharedDatabaseState(): SharedRecordLockState {
  return {
    status: 'idle',
    lockedBy: null,
    message: cleanTemporarySqliteLockMessage(),
    isReadOnly: true,
  };
}

function stateFromResult(result: TraccionRecordLockResult): SharedRecordLockState {
  if (result.status === 'locked') {
    return {
      status: 'locked',
      lockedBy: result.lock,
      message: getLockMessage(result.lock, result.message),
      isReadOnly: true,
    };
  }

  if (result.status === 'acquired') {
    return {
      status: 'acquired',
      lockedBy: result.lock,
      message: 'Edición bloqueada para otros usuarios mientras esta ventana esté abierta.',
      isReadOnly: false,
    };
  }

  if (result.status === 'error') {
    if (isTemporarySqliteLockMessage(result.message)) {
      return hiddenWaitingForSharedDatabaseState();
    }

    return {
      status: 'error',
      lockedBy: null,
      message: `Modo consulta — ${result.message} Edición bloqueada para evitar conflictos multiusuario.`,
      isReadOnly: true,
    };
  }

  return idleState;
}

export function useSharedRecordLock({
  module,
  recordId,
  enabled,
}: SharedRecordLockParams): SharedRecordLockState {
  const [state, setState] = useState<SharedRecordLockState>(idleState);
  const lockPayload = useMemo(
    () => (recordId ? { module, recordId } : null),
    [module, recordId],
  );

  useEffect(() => {
    if (!enabled || !lockPayload) {
      setState(idleState);
      return undefined;
    }

    let cancelled = false;
    let acquired = false;
    const activeLockKey = `${lockPayload.module}:${lockPayload.recordId}`;
    const precedingCleanup = pendingLockCleanup.get(activeLockKey) ?? Promise.resolve();
    const pendingAcquisitions = new Set<Promise<void>>();

    const setAcquired = (nextAcquired: boolean): void => {
      if (acquired === nextAcquired) {
        return;
      }

      acquired = nextAcquired;
      if (nextAcquired) {
        markSharedEditingActive(activeLockPayload.module, activeLockPayload.recordId);
      } else {
        markSharedEditingInactive(activeLockPayload.module, activeLockPayload.recordId);
      }
    };
    let retryTimeoutId: number | null = null;
    let noticeTimeoutId: number | null = null;
    let consecutiveTemporaryHeartbeatFailures = 0;
    const traccionApi = window.traccion;
    const activeLockPayload: TraccionRecordLockPayload = lockPayload;
    const lockBusyKey = `record-lock:${activeLockPayload.module}:${activeLockPayload.recordId}`;

    const clearRetry = (): void => {
      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId);
        retryTimeoutId = null;
      }
    };

    const clearNotice = (): void => {
      if (noticeTimeoutId !== null) {
        window.clearTimeout(noticeTimeoutId);
        noticeTimeoutId = null;
      }
    };

    const clearTemporaryLockTimers = (): void => {
      clearRetry();
      clearNotice();
    };

    if (!traccionApi?.acquireRecordLock) {
      clearPersistenceBusy(lockBusyKey);
      setState({
        status: 'error',
        lockedBy: null,
        message: 'Modo consulta — IPC de bloqueo compartido no disponible. Edición bloqueada para evitar conflictos multiusuario.',
        isReadOnly: true,
      });
      return undefined;
    }

    const scheduleAcquireRetry = (): void => {
      if (cancelled || retryTimeoutId !== null) {
        return;
      }

      retryTimeoutId = window.setTimeout(() => {
        retryTimeoutId = null;
        acquireLock();
      }, RETRY_AFTER_TEMPORARY_LOCK_MS);
    };

    const scheduleTemporaryLockNotice = (): void => {
      if (cancelled || noticeTimeoutId !== null) {
        return;
      }

      noticeTimeoutId = window.setTimeout(() => {
        noticeTimeoutId = null;
        if (!cancelled) {
          setState(visibleWaitingForSharedDatabaseState());
        }
      }, TEMPORARY_LOCK_NOTICE_DELAY_MS);
    };

    const waitForTemporarySqliteLock = (visibility: 'visible' | 'silent' = 'visible'): void => {
      publishPersistenceBusy(lockBusyKey, TEMPORARY_LOCK_BUSY_MESSAGE, visibility);
      setState((current) => (current.message ? current : hiddenWaitingForSharedDatabaseState()));
      scheduleTemporaryLockNotice();
      scheduleAcquireRetry();
    };

    const applyResult = (
      result: TraccionRecordLockResult,
      feedbackVisibility: 'visible' | 'silent' = 'visible',
    ): void => {
      if (cancelled) {
        return;
      }

      if (result.status === 'error' && isTemporarySqliteLockMessage(result.message)) {
        waitForTemporarySqliteLock(feedbackVisibility);
        return;
      }

      clearTemporaryLockTimers();
      clearPersistenceBusy(lockBusyKey, 'Operación de bloqueo finalizada.', feedbackVisibility);
      setAcquired(result.status === 'acquired');
      setState(stateFromResult(result));
    };

    const handleAcquireError = (error: unknown): void => {
      if (cancelled) {
        return;
      }

      const message = error instanceof Error ? error.message : 'No se ha podido bloquear el registro.';
      if (isTemporarySqliteLockMessage(message)) {
        waitForTemporarySqliteLock();
        return;
      }

      clearPersistenceBusy(lockBusyKey);
      setState({
        status: 'error',
        lockedBy: null,
        message: `Modo consulta — ${message} Edición bloqueada para evitar conflictos multiusuario.`,
        isReadOnly: true,
      });
    };

    function acquireLock(): void {
      if (!traccionApi?.acquireRecordLock) {
        handleAcquireError(new Error('IPC de bloqueo compartido no disponible.'));
        return;
      }

      publishPersistenceBusy(lockBusyKey, LOCK_BUSY_MESSAGE);
      const attempt = precedingCleanup
        .catch(() => undefined)
        .then(async () => {
          if (cancelled) return;
          await waitForNextPaint();
          if (cancelled) return;
          const result = await traccionApi.acquireRecordLock?.(activeLockPayload);
          if (!result) {
            handleAcquireError(new Error('IPC de bloqueo compartido no disponible.'));
            return;
          }

          if (cancelled) {
            // La ventana ya se cerró mientras Electron adquiría el bloqueo:
            // liberarlo ANTES de permitir una nueva adquisición del mismo owner.
            if (result.status === 'acquired') {
              await traccionApi.releaseRecordLock?.(activeLockPayload);
            }
            return;
          }
          applyResult(result);
        })
        .catch((error: unknown) => {
          if (cancelled) {
            console.warn('No se pudo completar la liberación de una adquisición cancelada.', error);
          } else {
            handleAcquireError(error);
          }
        });
      pendingAcquisitions.add(attempt);
      void attempt.finally(() => pendingAcquisitions.delete(attempt));
    }

    acquireLock();

    const heartbeatId = window.setInterval(() => {
      if (!acquired || !window.traccion?.heartbeatRecordLock) {
        return;
      }

      window.traccion
        .heartbeatRecordLock(activeLockPayload)
        .then((result) => {
          if (cancelled) {
            return;
          }

          if (result.status === 'error' && isTemporarySqliteLockMessage(result.message)) {
            consecutiveTemporaryHeartbeatFailures += 1;
            if (consecutiveTemporaryHeartbeatFailures >= MAX_CONSECUTIVE_TEMPORARY_HEARTBEAT_FAILURES) {
              setAcquired(false);
              setState({
                status: 'error',
                lockedBy: null,
                message: 'Modo consulta — La base compartida lleva inaccesible más de un ciclo. El bloqueo puede haber expirado. Edición desactivada para evitar conflictos.',
                isReadOnly: true,
              });
            } else {
              setState((current) => ({ ...current, message: current.message || '' }));
            }
            return;
          }

          consecutiveTemporaryHeartbeatFailures = 0;
          applyResult(result, 'silent');
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }

          const message = error instanceof Error ? error.message : 'No se ha podido renovar el bloqueo.';
          if (isTemporarySqliteLockMessage(message)) {
            consecutiveTemporaryHeartbeatFailures += 1;
            if (consecutiveTemporaryHeartbeatFailures >= MAX_CONSECUTIVE_TEMPORARY_HEARTBEAT_FAILURES) {
              setAcquired(false);
              setState({
                status: 'error',
                lockedBy: null,
                message: 'Modo consulta — La base compartida lleva inaccesible más de un ciclo. El bloqueo puede haber expirado. Edición desactivada para evitar conflictos.',
                isReadOnly: true,
              });
            } else {
              setState((current) => ({ ...current, message: current.message || '' }));
            }
            return;
          }

          consecutiveTemporaryHeartbeatFailures = 0;
          setAcquired(false);
          setState({
            status: 'error',
            lockedBy: null,
            message: `Modo consulta — ${message} Edición bloqueada para evitar conflictos multiusuario.`,
            isReadOnly: true,
          });
        });
    }, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      clearTemporaryLockTimers();
      clearPersistenceBusy(lockBusyKey);
      window.clearInterval(heartbeatId);
      // La limpieza espera a cualquier acquire IPC aún en vuelo. Al terminar,
      // libera la reserva y desbloquea la apertura siguiente del mismo registro.
      const olderCleanup = pendingLockCleanup.get(activeLockKey);
      const cleanup = (async () => {
        if (olderCleanup) await olderCleanup.catch(() => undefined);
        await Promise.allSettled([...pendingAcquisitions]);
        if (acquired) {
          setAcquired(false);
          try {
            await traccionApi.releaseRecordLock?.(activeLockPayload);
          } catch (error) {
            console.warn('No se ha podido liberar el bloqueo compartido del registro.', error);
          }
        }
      })();
      pendingLockCleanup.set(activeLockKey, cleanup);
      void cleanup.finally(() => {
        if (pendingLockCleanup.get(activeLockKey) === cleanup) {
          pendingLockCleanup.delete(activeLockKey);
        }
      });
    };
  }, [enabled, lockPayload]);

  return state;
}

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

const HEARTBEAT_MS = 10 * 1000;
const RETRY_AFTER_TEMPORARY_LOCK_MS = 300;
const TEMPORARY_LOCK_NOTICE_DELAY_MS = 1_000;
const LOCK_BUSY_MESSAGE = 'Abriendo registro…';
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

    const waitForTemporarySqliteLock = (): void => {
      publishPersistenceBusy(lockBusyKey, TEMPORARY_LOCK_BUSY_MESSAGE);
      setState((current) => (current.message ? current : hiddenWaitingForSharedDatabaseState()));
      scheduleTemporaryLockNotice();
      scheduleAcquireRetry();
    };

    const applyResult = (result: TraccionRecordLockResult): void => {
      if (cancelled) {
        return;
      }

      if (result.status === 'error' && isTemporarySqliteLockMessage(result.message)) {
        waitForTemporarySqliteLock();
        return;
      }

      clearTemporaryLockTimers();
      clearPersistenceBusy(lockBusyKey);
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
      void waitForNextPaint()
        .then(() => traccionApi.acquireRecordLock?.(activeLockPayload))
        .then((result) => {
          if (!result) {
            handleAcquireError(new Error('IPC de bloqueo compartido no disponible.'));
            return;
          }

          applyResult(result);
        })
        .catch(handleAcquireError);
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
            // La base estaba ocupada durante la renovación. No degradamos a modo consulta:
            // el lock de edición aún tiene TTL y se intentará renovar en el siguiente ciclo.
            setState((current) => ({
              ...current,
              message: current.message || '',
            }));
            return;
          }

          applyResult(result);
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }

          const message = error instanceof Error ? error.message : 'No se ha podido renovar el bloqueo.';
          if (isTemporarySqliteLockMessage(message)) {
            setState((current) => ({
              ...current,
              message: current.message || '',
            }));
            return;
          }

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
      if (acquired) {
        setAcquired(false);
        window.traccion?.releaseRecordLock?.(activeLockPayload).catch((error: unknown) => {
          console.warn('No se ha podido liberar el bloqueo compartido del registro.', error);
        });
      }
    };
  }, [enabled, lockPayload]);

  return state;
}

import { useEffect, useMemo, useState } from 'react';

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

  return `Registro bloqueado por ${lock.ownerName}@${lock.machineName}.`;
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
    return {
      status: 'error',
      lockedBy: null,
      message: `${result.message} Edición bloqueada para evitar conflictos multiusuario.`,
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
    const traccionApi = window.traccion;

    if (!traccionApi?.acquireRecordLock) {
      setState({
        status: 'error',
        lockedBy: null,
        message: 'IPC de bloqueo compartido no disponible. Edición bloqueada para evitar conflictos multiusuario.',
        isReadOnly: true,
      });
      return undefined;
    }

    const applyResult = (result: TraccionRecordLockResult): void => {
      if (cancelled) {
        return;
      }

      acquired = result.status === 'acquired';
      setState(stateFromResult(result));
    };

    traccionApi
      .acquireRecordLock(lockPayload)
      .then(applyResult)
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : 'No se ha podido bloquear el registro.';
        setState({
          status: 'error',
          lockedBy: null,
          message: `${message} Edición bloqueada para evitar conflictos multiusuario.`,
          isReadOnly: true,
        });
      });

    const heartbeatId = window.setInterval(() => {
      if (!acquired || !window.traccion?.heartbeatRecordLock) {
        return;
      }

      window.traccion
        .heartbeatRecordLock(lockPayload)
        .then(applyResult)
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }

          const message = error instanceof Error ? error.message : 'No se ha podido renovar el bloqueo.';
          acquired = false;
          setState({
            status: 'error',
            lockedBy: null,
            message: `${message} Edición bloqueada para evitar conflictos multiusuario.`,
            isReadOnly: true,
          });
        });
    }, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatId);
      if (acquired) {
        window.traccion?.releaseRecordLock?.(lockPayload).catch((error: unknown) => {
          console.warn('No se ha podido liberar el bloqueo compartido del registro.', error);
        });
      }
    };
  }, [enabled, lockPayload]);

  return state;
}

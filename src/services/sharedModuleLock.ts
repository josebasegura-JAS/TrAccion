import { markSharedEditingActive, markSharedEditingInactive } from './sharedEditingActivity';

export const SHARED_MODULE_LOCK_RECORD_ID = '__module__';

const MODULE_LOCK_HEARTBEAT_MS = 10 * 1000;

export interface SharedModuleLockTarget {
  module: string;
  label: string;
}

function formatLockOwner(lock: TraccionRecordLockOwnerInfo | null): string {
  return lock ? `${lock.ownerName}@${lock.machineName}` : 'otro usuario';
}

async function acquireModuleLock(target: SharedModuleLockTarget): Promise<TraccionRecordLockPayload> {
  const acquireRecordLock = window.traccion?.acquireRecordLock;
  if (!acquireRecordLock) {
    throw new Error(
      `No se puede bloquear ${target.label}: IPC de bloqueo compartido no disponible.`,
    );
  }

  const payload: TraccionRecordLockPayload = {
    module: target.module,
    recordId: SHARED_MODULE_LOCK_RECORD_ID,
  };
  const result = await acquireRecordLock(payload);

  if (result.status !== 'acquired') {
    throw new Error(
      result.status === 'locked'
        ? `${target.label} está siendo usado por ${formatLockOwner(result.lock)}. Reintenta cuando termine la operación.`
        : result.message || `No se ha podido bloquear ${target.label}.`,
    );
  }

  return payload;
}

async function releaseModuleLock(payload: TraccionRecordLockPayload): Promise<void> {
  await window.traccion?.releaseRecordLock?.(payload).catch((error: unknown) => {
    console.warn('No se ha podido liberar el bloqueo global de módulo.', error);
  });
}

export async function withSharedModuleLocks<TResult>(
  targets: SharedModuleLockTarget[],
  operation: () => TResult | Promise<TResult>,
): Promise<TResult> {
  const acquiredPayloads: TraccionRecordLockPayload[] = [];
  const heartbeatId = window.setInterval(() => {
    acquiredPayloads.forEach((payload) => {
      window.traccion?.heartbeatRecordLock?.(payload).catch((error: unknown) => {
        console.warn('No se ha podido renovar el bloqueo global de módulo.', error);
      });
    });
  }, MODULE_LOCK_HEARTBEAT_MS);

  try {
    for (const target of targets) {
      const payload = await acquireModuleLock(target);
      acquiredPayloads.push(payload);
      markSharedEditingActive(payload.module, payload.recordId);
    }

    return await operation();
  } finally {
    window.clearInterval(heartbeatId);
    acquiredPayloads.forEach((payload) => markSharedEditingInactive(payload.module, payload.recordId));
    await Promise.all(acquiredPayloads.reverse().map(releaseModuleLock));
  }
}

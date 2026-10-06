import { rmdir, unlink } from 'node:fs/promises';
import type { DatabaseLockInfo } from './sqliteLockLifecycle.js';

export interface DatabaseLockRecoveryStatus {
  lockPath: string;
  lock?: DatabaseLockInfo;
  message?: string;
}

export interface DatabaseLockRecoveryDependencies<TStatus extends DatabaseLockRecoveryStatus> {
  getStatus: () => TStatus;
  readLock: (lockPath: string) => Promise<DatabaseLockInfo | null>;
  getLockInfoPath: (lockPath: string) => string;
  isDatabaseActive: () => boolean;
  getConfiguredDirectory: () => Promise<{
    directoryPath: string;
    isDefaultPath: boolean;
  }>;
  activateDatabase: (
    directoryPath: string,
    isDefaultPath: boolean,
    sourceDatabasePath: string | null,
  ) => Promise<TStatus>;
  setStatus: (status: TStatus) => void;
  errorMessage: (error: unknown) => string;
}

export interface DatabaseLockRecoveryResult<TStatus> {
  ok: boolean;
  status: TStatus;
  message: string;
}

export async function forceReleaseDatabaseLockWithRecovery<
  TStatus extends DatabaseLockRecoveryStatus,
>(
  deps: DatabaseLockRecoveryDependencies<TStatus>,
): Promise<DatabaseLockRecoveryResult<TStatus>> {
  const currentStatus = deps.getStatus();
  const lockPath = currentStatus.lockPath;
  const previousLock = await deps.readLock(lockPath);

  if (previousLock) {
    const lockInfoPath = deps.getLockInfoPath(lockPath);
    await unlink(lockInfoPath).catch((error: unknown) => {
      console.warn(
        `No se ha podido borrar manualmente el fichero del lock SQLite (${lockInfoPath}).`,
        error,
      );
    });
    await rmdir(lockPath).catch((error: unknown) => {
      console.warn(
        `No se ha podido borrar manualmente el directorio del lock SQLite (${lockPath}).`,
        error,
      );
    });
  }

  const lockDescription = previousLock
    ? `${previousLock.username}@${previousLock.hostname} (PID ${previousLock.pid})`
    : null;

  if (deps.isDatabaseActive()) {
    const activeStatus = deps.getStatus();
    return {
      ok: true,
      status: activeStatus,
      message: lockDescription
        ? `Lock de ${lockDescription} liberado manualmente. Tu conexión a SQLite no se ha visto afectada.`
        : 'No había ningún bloqueo activo que liberar. Tu conexión a SQLite no se ha visto afectada.',
    };
  }

  try {
    const configured = await deps.getConfiguredDirectory();
    const nextStatus = await deps.activateDatabase(
      configured.directoryPath,
      configured.isDefaultPath,
      null,
    );
    return {
      ok: true,
      status: nextStatus,
      message: lockDescription
        ? `Lock de ${lockDescription} liberado manualmente. Conexión a SQLite restablecida.`
        : 'No había ningún bloqueo activo que liberar; se ha reintentado la conexión y se ha restablecido correctamente.',
    };
  } catch (error) {
    const refreshedLock = await deps.readLock(lockPath);
    const nextStatus = {
      ...currentStatus,
      lock: refreshedLock ?? undefined,
      message: deps.errorMessage(error),
    };
    deps.setStatus(nextStatus);

    return {
      ok: false,
      status: nextStatus,
      message: lockDescription
        ? `Lock de ${lockDescription} liberado manualmente, pero no se ha podido reconectar: ${deps.errorMessage(error)}`
        : `No se ha podido reconectar con SQLite: ${deps.errorMessage(error)}`,
    };
  }
}

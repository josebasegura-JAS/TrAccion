import { readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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
  isLockStale: (lock: DatabaseLockInfo) => boolean;
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

function sameLock(a: DatabaseLockInfo, b: DatabaseLockInfo): boolean {
  return a.ownerId === b.ownerId &&
    a.pid === b.pid &&
    a.hostname === b.hostname &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt;
}

function isValidExpiredLock(lock: DatabaseLockInfo, stale: (lock: DatabaseLockInfo) => boolean): boolean {
  const timestamp = Date.parse(lock.updatedAt);
  // No asumir que la fecha del propietario es fiable si está en el futuro.
  // Un heartbeat vivo, o una marca inválida, no permite borrado administrativo.
  return Number.isFinite(timestamp) &&
    timestamp <= Date.now() &&
    stale(lock);
}

async function restoreCapturedOwner(ownerPath: string, quarantinePath: string, payload: string): Promise<void> {
  // 'wx' nunca pisa un propietario/heartbeat nuevo. En caso de fallo se
  // conserva el archivo apartado y el directorio para una revisión segura.
  await writeFile(ownerPath, payload, { encoding: 'utf8', flag: 'wx' });
  await unlink(quarantinePath);
}

/**
 * El borrado administrativo exige un lock caducado y propietario estable.
 * Renombrar owner.json dentro del propio .lockdir mantiene la exclusión SMB
 * hasta terminar la verificación. Todos los errores son fail-closed.
 */
export async function releaseExpiredDatabaseLockSafely(
  lockPath: string,
  initial: DatabaseLockInfo,
  readLock: (lockPath: string) => Promise<DatabaseLockInfo | null>,
  getLockInfoPath: (lockPath: string) => string,
  isLockStale: (lock: DatabaseLockInfo) => boolean,
): Promise<{ released: boolean; reason: string }> {
  if (!isValidExpiredLock(initial, isLockStale)) {
    return { released: false, reason: 'El bloqueo no está caducado o su reloj no es fiable.' };
  }
  const current = await readLock(lockPath);
  if (!current || !sameLock(initial, current) || !isValidExpiredLock(current, isLockStale)) {
    return { released: false, reason: 'El propietario o su heartbeat ha cambiado antes del borrado.' };
  }
  const ownerPath = getLockInfoPath(lockPath);
  const quarantinePath = path.join(lockPath, `owner.json.manual-reclaim-${randomUUID()}`);
  try {
    await rename(ownerPath, quarantinePath);
  } catch {
    return { released: false, reason: 'No se pudo reservar de forma segura el archivo del propietario.' };
  }

  // Si se renueva el propietario mientras se efectúa el rename, el contenido
  // capturado no coincidirá. Nunca borrarlo por parecer caducado en la primera
  // lectura. La cuarentena previene la adquisición por mkdir().
  try {
    const payload = await readFile(quarantinePath, 'utf8');
    const captured = JSON.parse(payload) as DatabaseLockInfo;
    if (!captured || !sameLock(captured, current) || !isValidExpiredLock(captured, isLockStale)) {
      try {
        await restoreCapturedOwner(ownerPath, quarantinePath, payload);
      } catch {
        return {
          released: false,
          reason: 'El bloqueo cambió y no se pudo restaurar con seguridad: se conserva la cuarentena.',
        };
      }
      return { released: false, reason: 'El propietario o el heartbeat cambió; no se ha liberado el bloqueo.' };
    }

    // Un heartbeat que cree un owner.json nuevo impide rmdir del lockdir.
    // No tocar nunca los metadatos que aparezcan después de la captura.
    await unlink(quarantinePath);
    await rmdir(lockPath);
    return { released: true, reason: 'Bloqueo caducado eliminado tras verificar propietario y heartbeat.' };
  } catch {
    // Si el borrado ya ha eliminado la cuarentena pero rmdir falla, el
    // directorio todavía existe y no se informa de éxito.
    return { released: false, reason: 'No se pudo confirmar la liberación; el directorio permanece bloqueado.' };
  }
}

export async function forceReleaseDatabaseLockWithRecovery<
  TStatus extends DatabaseLockRecoveryStatus,
>(
  deps: DatabaseLockRecoveryDependencies<TStatus>,
): Promise<DatabaseLockRecoveryResult<TStatus>> {
  const currentStatus = deps.getStatus();
  const lockPath = currentStatus.lockPath;
  let previousLock: DatabaseLockInfo | null;
  try {
    previousLock = await deps.readLock(lockPath);
  } catch (error) {
    return {
      ok: false, status: currentStatus,
      message: `No se libera el bloqueo SQLite: no se puede comprobar su propietario (${deps.errorMessage(error)}).`,
    };
  }

  if (previousLock) {
    if (!isValidExpiredLock(previousLock, deps.isLockStale)) {
      return {
        ok: false,
        status: currentStatus,
        message: 'No se libera el bloqueo SQLite: sigue vigente, la fecha es inválida o los relojes podrían estar desincronizados. Comprueba que el otro equipo no está trabajando y espera a que caduque.',
      };
    }
    let result: { released: boolean; reason: string };
    try {
      result = await releaseExpiredDatabaseLockSafely(
        lockPath, previousLock, deps.readLock, deps.getLockInfoPath, deps.isLockStale,
      );
    } catch (error) {
      return {
        ok: false, status: currentStatus,
        message: `No se libera el bloqueo SQLite: error al comprobar el propietario (${deps.errorMessage(error)}).`,
      };
    }
    if (!result.released) {
      return { ok: false, status: currentStatus, message: `No se libera el bloqueo SQLite: ${result.reason}` };
    }
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
    let refreshedLock: DatabaseLockInfo | null = null;
    try { refreshedLock = await deps.readLock(lockPath); } catch { /* Conservar estado anterior. */ }
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

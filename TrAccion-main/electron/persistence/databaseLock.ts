import { mkdir, readFile, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { hostname, userInfo } from 'node:os';
import path from 'node:path';
import type { DatabaseConnectivityIssuePayload, DatabaseLockInfo } from '../sqlitePersistence.js';

/**
 * Lock de sesión SQLite sobre la carpeta compartida (un directorio
 * `.lockdir` con un fichero owner.json dentro) y el heartbeat que lo
 * renueva cada 10s mientras la app sigue abierta. No incluye
 * forceReleaseDatabaseLock ni nada que toque la conexión activa
 * (`database`/`status`) o reactive la base: eso sigue en
 * sqlitePersistence.ts porque es parte de la orquestación central de
 * arranque/activación, que no se ha tocado en este troceo (alto
 * acoplamiento, mismo motivo por el que VACUUM tampoco se movió).
 *
 * El único estado mutable que sigue fuera de este módulo es `ownerId`
 * (se resuelve una vez de forma asíncrona al arrancar y puede cambiar), así
 * que se recibe como un getter inyectado en vez de copiarlo aquí.
 */

export const LOCK_TTL_MS = 30 * 1000;
export const LOCK_HEARTBEAT_MS = 10 * 1000;
export const STARTUP_LOCK_WAIT_MS = 15 * 1000;
export const STARTUP_LOCK_RETRY_MS = 250;
export const SQLITE_ASYNC_OPERATION_LOCK_WAIT_MS = 15 * 1000;
export const SQLITE_OPERATION_LOCK_RETRY_MS = 50;

export const DATABASE_HEARTBEAT_BLOCKED_MESSAGE =
  'La conexión con la carpeta compartida de SQLite puede estar interrumpida. Se bloquean nuevas escrituras hasta recuperar el heartbeat.';

export interface DatabaseHeartbeatLockHandle {
  lockPath: string;
  lock: DatabaseLockInfo;
  heartbeat: ReturnType<typeof setInterval>;
}

export function getLockPath(databasePath: string): string {
  return `${databasePath}.lockdir`;
}

export function getLockInfoPath(lockPath: string): string {
  return path.join(lockPath, 'owner.json');
}

function isDatabaseLockInfo(value: unknown): value is DatabaseLockInfo {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof DatabaseLockInfo, unknown>>;
  return (
    typeof candidate.ownerId === 'string' &&
    typeof candidate.username === 'string' &&
    typeof candidate.hostname === 'string' &&
    typeof candidate.pid === 'number' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

function isLockStale(lock: DatabaseLockInfo): boolean {
  const updatedAt = Date.parse(lock.updatedAt);
  return Number.isNaN(updatedAt) || Date.now() - updatedAt > LOCK_TTL_MS;
}

export async function readLock(lockPath: string): Promise<DatabaseLockInfo | null> {
  try {
    const raw = await readFile(getLockInfoPath(lockPath), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return isDatabaseLockInfo(parsed) ? parsed : null;
  } catch {
    try {
      const raw = await readFile(lockPath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return isDatabaseLockInfo(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

export async function releaseLock(lockPath: string, lock: DatabaseLockInfo): Promise<void> {
  const currentLock = await readLock(lockPath);
  if (currentLock?.ownerId !== lock.ownerId) {
    return;
  }

  await unlink(getLockInfoPath(lockPath)).catch(() => undefined);
  await rmdir(lockPath).catch(() => undefined);
}

async function writeLock(lockPath: string, lock: DatabaseLockInfo): Promise<void> {
  await mkdir(lockPath);
  await writeFile(getLockInfoPath(lockPath), JSON.stringify(lock, null, 2), 'utf8');

  const confirmedLock = await readLock(lockPath);
  if (confirmedLock?.ownerId !== lock.ownerId) {
    await releaseLock(lockPath, lock);
    throw new Error('Otro proceso ganó la carrera de lock SQLite en SMB.');
  }
}

async function removeStaleLock(lockPath: string, staleLock: DatabaseLockInfo): Promise<void> {
  const currentLock = await readLock(lockPath);
  if (currentLock?.ownerId !== staleLock.ownerId || !isLockStale(currentLock)) {
    return;
  }

  let unlinkFailed = false;
  let rmdirFailed = false;

  await unlink(getLockInfoPath(lockPath)).catch((error: unknown) => {
    unlinkFailed = true;
    console.warn(
      `No se ha podido borrar el fichero del lock SQLite caducado (${getLockInfoPath(lockPath)}). Propietario anterior: ${staleLock.username}@${staleLock.hostname} (PID ${staleLock.pid}).`,
      error,
    );
  });
  await rmdir(lockPath).catch((error: unknown) => {
    rmdirFailed = true;
    console.warn(
      `No se ha podido borrar el directorio del lock SQLite caducado (${lockPath}). Propietario anterior: ${staleLock.username}@${staleLock.hostname} (PID ${staleLock.pid}).`,
      error,
    );
  });

  if (unlinkFailed || rmdirFailed) {
    console.warn(
      `El lock SQLite de ${staleLock.username}@${staleLock.hostname} (PID ${staleLock.pid}) está caducado pero no se ha podido limpiar automáticamente. ` +
        'Puede requerir liberación manual desde Ajustes o borrado manual del directorio .lockdir en la carpeta compartida.',
    );
  }
}

async function removeCorruptStaleLock(lockPath: string): Promise<void> {
  try {
    const metadata = await stat(lockPath);
    if (Date.now() - metadata.mtimeMs <= LOCK_TTL_MS) {
      return;
    }

    let cleanupFailed = false;
    await unlink(getLockInfoPath(lockPath)).catch((error: unknown) => {
      cleanupFailed = true;
      console.warn(
        `No se ha podido borrar el fichero de un lock SQLite corrupto/caducado (${getLockInfoPath(lockPath)}).`,
        error,
      );
    });
    await rmdir(lockPath).catch((error: unknown) => {
      cleanupFailed = true;
      console.warn(
        `No se ha podido borrar el directorio de un lock SQLite corrupto/caducado (${lockPath}).`,
        error,
      );
    });

    if (cleanupFailed) {
      console.warn(
        `El directorio de lock ${lockPath} parece corrupto o caducado pero no se ha podido limpiar automáticamente. ` +
          'Puede requerir liberación manual desde Ajustes o borrado manual en la carpeta compartida.',
      );
    }
  } catch {
    // Si no existe o no se puede leer, dejamos que el bucle normal reintente.
  }
}

export interface CreateDatabaseLockManagerOptions {
  getOwnerId: () => string;
  /** Intervalo del heartbeat de renovación del lock de sesión. Por defecto LOCK_HEARTBEAT_MS (10s); configurable para que los tests no tengan que esperar minutos para ver 5 fallos consecutivos. */
  heartbeatIntervalMs?: number;
}

export interface DatabaseLockManager {
  createLockInfo: () => DatabaseLockInfo;
  readLock: typeof readLock;
  releaseLock: typeof releaseLock;
  isLockStale: typeof isLockStale;
  removeStaleLock: typeof removeStaleLock;
  removeCorruptStaleLock: typeof removeCorruptStaleLock;
  acquireLock: (databasePath: string, waitMs?: number) => Promise<DatabaseLockInfo>;
  acquireStartupLock: (databasePath: string) => Promise<DatabaseLockInfo>;
  withDatabaseOperationLock: <T>(databasePath: string, operation: () => Promise<T>, waitMs?: number) => Promise<T>;
  startDatabaseLockHeartbeat: (lockPath: string, lock: DatabaseLockInfo) => ReturnType<typeof setInterval>;
  isDatabaseWriteBlockedByHeartbeat: () => boolean;
  assertDatabaseWritesAllowed: () => void;
  setDatabaseConnectivityIssueNotifier: (notifier: ((payload: DatabaseConnectivityIssuePayload) => void) | null) => void;
}

/**
 * Construye el gestor de lock/heartbeat con su propio estado encapsulado
 * (antes 3 variables sueltas a nivel de módulo en sqlitePersistence.ts:
 * databaseWriteBlockedByHeartbeat, heartbeatConsecutiveFailureCount,
 * notifyDatabaseConnectivityIssue). sqlitePersistence.ts instancia esto una
 * sola vez al cargar el módulo y usa el objeto devuelto en todo lo demás.
 */
export function createDatabaseLockManager(options: CreateDatabaseLockManagerOptions): DatabaseLockManager {
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? LOCK_HEARTBEAT_MS;
  let databaseWriteBlockedByHeartbeat = false;
  let heartbeatConsecutiveFailureCount = 0;
  let notifyDatabaseConnectivityIssue: ((payload: DatabaseConnectivityIssuePayload) => void) | null = null;

  function publishDatabaseConnectivityIssue(payload: DatabaseConnectivityIssuePayload): void {
    notifyDatabaseConnectivityIssue?.(payload);
  }

  function markHeartbeatFailure(error: unknown): void {
    heartbeatConsecutiveFailureCount += 1;
    console.warn('No se ha podido renovar el bloqueo SQLite de sesión.', error);

    if (heartbeatConsecutiveFailureCount < 5) {
      return;
    }

    databaseWriteBlockedByHeartbeat = true;
    publishDatabaseConnectivityIssue({
      blocked: true,
      failedHeartbeatCount: heartbeatConsecutiveFailureCount,
      updatedAt: new Date().toISOString(),
      message: DATABASE_HEARTBEAT_BLOCKED_MESSAGE,
    });
  }

  function markHeartbeatRecovered(): void {
    if (heartbeatConsecutiveFailureCount === 0 && !databaseWriteBlockedByHeartbeat) {
      return;
    }

    heartbeatConsecutiveFailureCount = 0;

    if (databaseWriteBlockedByHeartbeat) {
      databaseWriteBlockedByHeartbeat = false;
      publishDatabaseConnectivityIssue({
        blocked: false,
        failedHeartbeatCount: 0,
        updatedAt: new Date().toISOString(),
        message: 'La conexión con la carpeta compartida de SQLite se ha recuperado. Escrituras reactivadas.',
      });
    }
  }

  async function heartbeatDatabaseLock(lockPath: string, lock: DatabaseLockInfo): Promise<void> {
    const currentLock = await readLock(lockPath);
    if (currentLock?.ownerId !== lock.ownerId) {
      throw new Error('El bloqueo SQLite de sesión ya no pertenece a esta instancia.');
    }

    await writeFile(
      getLockInfoPath(lockPath),
      JSON.stringify({ ...currentLock, updatedAt: new Date().toISOString() }, null, 2),
      'utf8',
    );
  }

  function createLockInfo(): DatabaseLockInfo {
    let username = 'desconocido';
    try {
      username = userInfo().username;
    } catch {
      username = 'desconocido';
    }

    const now = new Date().toISOString();
    return {
      ownerId: options.getOwnerId(),
      username,
      hostname: hostname(),
      pid: process.pid,
      createdAt: now,
      updatedAt: now,
    };
  }

  async function acquireLock(
    databasePath: string,
    waitMs = SQLITE_ASYNC_OPERATION_LOCK_WAIT_MS,
  ): Promise<DatabaseLockInfo> {
    const lockPath = getLockPath(databasePath);
    await mkdir(path.dirname(lockPath), { recursive: true });
    const startedAt = Date.now();
    let lastLock: DatabaseLockInfo | null = null;

    while (Date.now() - startedAt <= waitMs) {
      const existingLock = await readLock(lockPath);
      lastLock = existingLock;

      if (existingLock && isLockStale(existingLock)) {
        await removeStaleLock(lockPath, existingLock);
      }

      if (!existingLock) {
        await removeCorruptStaleLock(lockPath);
      }

      if (!existingLock || isLockStale(existingLock)) {
        const lock = createLockInfo();
        try {
          await writeLock(lockPath, lock);
          return lock;
        } catch {
          lastLock = await readLock(lockPath);
        }
      }

      await new Promise((resolve) => {
        setTimeout(resolve, SQLITE_OPERATION_LOCK_RETRY_MS);
      });
    }

    if (lastLock) {
      throw new Error(
        `Base ocupada temporalmente por ${lastLock.username}@${lastLock.hostname} (PID ${lastLock.pid}). Inténtalo de nuevo en unos segundos.`,
      );
    }

    throw new Error('No se ha podido adquirir el bloqueo temporal de operación SQLite.');
  }

  async function acquireStartupLock(databasePath: string): Promise<DatabaseLockInfo> {
    const startedAt = Date.now();
    let lastError: unknown = null;

    while (Date.now() - startedAt <= STARTUP_LOCK_WAIT_MS) {
      try {
        return await acquireLock(databasePath);
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => {
          setTimeout(resolve, STARTUP_LOCK_RETRY_MS);
        });
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('No se ha podido adquirir el bloqueo temporal de arranque SQLite.');
  }

  async function withDatabaseOperationLock<T>(
    databasePath: string,
    operation: () => Promise<T>,
    waitMs = SQLITE_ASYNC_OPERATION_LOCK_WAIT_MS,
  ): Promise<T> {
    const lockPath = getLockPath(databasePath);
    const operationLock = await acquireLock(databasePath, waitMs);
    try {
      return await operation();
    } finally {
      await releaseLock(lockPath, operationLock).catch((error: unknown) => {
        console.warn('No se ha podido liberar el bloqueo temporal de operación SQLite.', error);
      });
    }
  }

  function startDatabaseLockHeartbeat(
    lockPath: string,
    lock: DatabaseLockInfo,
  ): ReturnType<typeof setInterval> {
    return setInterval(() => {
      heartbeatDatabaseLock(lockPath, lock)
        .then(() => markHeartbeatRecovered())
        .catch((error: unknown) => markHeartbeatFailure(error));
    }, heartbeatIntervalMs);
  }

  function isDatabaseWriteBlockedByHeartbeat(): boolean {
    return databaseWriteBlockedByHeartbeat;
  }

  function assertDatabaseWritesAllowed(): void {
    if (!databaseWriteBlockedByHeartbeat) {
      return;
    }

    throw new Error(`Escritura bloqueada: ${DATABASE_HEARTBEAT_BLOCKED_MESSAGE}`);
  }

  function setDatabaseConnectivityIssueNotifier(
    notifier: ((payload: DatabaseConnectivityIssuePayload) => void) | null,
  ): void {
    notifyDatabaseConnectivityIssue = notifier;
  }

  return {
    createLockInfo,
    readLock,
    releaseLock,
    isLockStale,
    removeStaleLock,
    removeCorruptStaleLock,
    acquireLock,
    acquireStartupLock,
    withDatabaseOperationLock,
    startDatabaseLockHeartbeat,
    isDatabaseWriteBlockedByHeartbeat,
    assertDatabaseWritesAllowed,
    setDatabaseConnectivityIssueNotifier,
  };
}

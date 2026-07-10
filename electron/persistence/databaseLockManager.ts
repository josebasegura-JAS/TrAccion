import { mkdir, readFile, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { hostname, userInfo } from 'node:os';
import path from 'node:path';

/**
 * Protocolo de bloqueo de la base SQLite compartida por red (SMB): un
 * directorio `.lockdir` con un fichero `owner.json` dentro, más un heartbeat
 * periódico mientras dura la operación. Lo usan tanto el arranque de la base
 * como las operaciones puntuales (guardado, VACUUM, copias de respaldo
 * locales), a través de `withDatabaseOperationLock`.
 *
 * Este módulo solo conoce el mecanismo del lock (ficheros, caducidad,
 * heartbeat, aviso de conectividad). No sabe nada de la conexión SQLite en
 * sí: eso sigue siendo responsabilidad de `sqlitePersistence.ts`, que lo usa
 * para decidir cuándo abrir, cerrar o reactivar la base.
 */

const LOCK_TTL_MS = 30 * 1000;
const LOCK_HEARTBEAT_MS = 10 * 1000;
const STARTUP_LOCK_WAIT_MS = 15 * 1000;
const STARTUP_LOCK_RETRY_MS = 250;
const DEFAULT_OPERATION_LOCK_WAIT_MS = 15 * 1000;
const OPERATION_LOCK_RETRY_MS = 50;
export const DATABASE_HEARTBEAT_BLOCKED_MESSAGE =
  'La conexión con la carpeta compartida de SQLite puede estar interrumpida. Se bloquean nuevas escrituras hasta recuperar el heartbeat.';

export interface DatabaseLockInfo {
  ownerId: string;
  username: string;
  hostname: string;
  pid: number;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseConnectivityIssuePayload {
  blocked: boolean;
  message: string;
  failedHeartbeatCount: number;
  updatedAt: string;
}

export interface DatabaseLockManagerDependencies {
  /** Id estable del propietario (ver `resolveStableOwnerId` en sqlitePersistence.ts). */
  getOwnerId: () => string;
}

export interface DatabaseLockManager {
  getLockPath(databasePath: string): string;
  getLockInfoPath(lockPath: string): string;
  readLock(lockPath: string): Promise<DatabaseLockInfo | null>;
  isLockStale(lock: DatabaseLockInfo): boolean;
  acquireLock(databasePath: string, waitMs?: number): Promise<DatabaseLockInfo>;
  acquireStartupLock(databasePath: string): Promise<DatabaseLockInfo>;
  releaseLock(lockPath: string, lock: DatabaseLockInfo): Promise<void>;
  withDatabaseOperationLock<T>(
    databasePath: string,
    operation: () => Promise<T>,
    waitMs?: number,
  ): Promise<T>;
  startDatabaseLockHeartbeat(lockPath: string, lock: DatabaseLockInfo): ReturnType<typeof setInterval>;
  setConnectivityIssueNotifier(
    notifier: ((payload: DatabaseConnectivityIssuePayload) => void) | null,
  ): void;
  isDatabaseWriteBlockedByHeartbeat(): boolean;
  assertDatabaseWritesAllowed(): void;
}

export function createDatabaseLockManager(dependencies: DatabaseLockManagerDependencies): DatabaseLockManager {
  let notifyConnectivityIssue: ((payload: DatabaseConnectivityIssuePayload) => void) | null = null;
  let databaseWriteBlockedByHeartbeat = false;
  let heartbeatConsecutiveFailureCount = 0;

  function getLockPath(databasePath: string): string {
    return `${databasePath}.lockdir`;
  }

  function getLockInfoPath(lockPath: string): string {
    return path.join(lockPath, 'owner.json');
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
      ownerId: dependencies.getOwnerId(),
      username,
      hostname: hostname(),
      pid: process.pid,
      createdAt: now,
      updatedAt: now,
    };
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

  async function readLock(lockPath: string): Promise<DatabaseLockInfo | null> {
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

  async function acquireLock(
    databasePath: string,
    waitMs = DEFAULT_OPERATION_LOCK_WAIT_MS,
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
        setTimeout(resolve, OPERATION_LOCK_RETRY_MS);
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

  async function releaseLock(lockPath: string, lock: DatabaseLockInfo): Promise<void> {
    const currentLock = await readLock(lockPath);
    if (currentLock?.ownerId !== lock.ownerId) {
      return;
    }

    await unlink(getLockInfoPath(lockPath)).catch(() => undefined);
    await rmdir(lockPath).catch(() => undefined);
  }

  async function withDatabaseOperationLock<T>(
    databasePath: string,
    operation: () => Promise<T>,
    waitMs = DEFAULT_OPERATION_LOCK_WAIT_MS,
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

  function publishConnectivityIssue(payload: DatabaseConnectivityIssuePayload): void {
    notifyConnectivityIssue?.(payload);
  }

  function markHeartbeatFailure(error: unknown): void {
    heartbeatConsecutiveFailureCount += 1;
    console.warn('No se ha podido renovar el bloqueo SQLite de sesión.', error);

    if (heartbeatConsecutiveFailureCount < 5) {
      return;
    }

    databaseWriteBlockedByHeartbeat = true;
    publishConnectivityIssue({
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
      publishConnectivityIssue({
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

  function startDatabaseLockHeartbeat(
    lockPath: string,
    lock: DatabaseLockInfo,
  ): ReturnType<typeof setInterval> {
    return setInterval(() => {
      heartbeatDatabaseLock(lockPath, lock)
        .then(() => markHeartbeatRecovered())
        .catch((error: unknown) => markHeartbeatFailure(error));
    }, LOCK_HEARTBEAT_MS);
  }

  function setConnectivityIssueNotifier(
    notifier: ((payload: DatabaseConnectivityIssuePayload) => void) | null,
  ): void {
    notifyConnectivityIssue = notifier;
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

  return {
    getLockPath,
    getLockInfoPath,
    readLock,
    isLockStale,
    acquireLock,
    acquireStartupLock,
    releaseLock,
    withDatabaseOperationLock,
    startDatabaseLockHeartbeat,
    setConnectivityIssueNotifier,
    isDatabaseWriteBlockedByHeartbeat,
    assertDatabaseWritesAllowed,
  };
}

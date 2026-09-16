import { mkdir, readFile, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { hostname, userInfo } from 'node:os';
import path from 'node:path';
import {
  getCurrentSqliteIpcOperationName,
  isCurrentSqliteIpcReadOnly,
} from '../sqliteIpcQueue.js';

/**
 * Protocolo de bloqueo de la base SQLite compartida por red (SMB): un
 * directorio `.lockdir` con un fichero `owner.json` dentro, más un heartbeat
 * periódico mientras dura una operación EXCLUSIVA.
 *
 * Las lecturas IPC no adquieren este lock externo. SQLite permite lectores
 * concurrentes y obligarles a competir por `.lockdir` generaba falsos
 * bloqueos especialmente con SMB/Wi-Fi lento.
 *
 * Escrituras, migraciones, VACUUM, backups y cualquier operación no marcada
 * explícitamente como solo lectura siguen usando el lock exclusivo.
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
  /** Id estable del propietario (ver `resolveStableOwnerId` en stableOwnerIdentity.ts). */
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
  startDatabaseLockHeartbeat(
    lockPath: string,
    lock: DatabaseLockInfo,
  ): ReturnType<typeof setInterval>;
  setConnectivityIssueNotifier(
    notifier: ((payload: DatabaseConnectivityIssuePayload) => void) | null,
  ): void;
  isDatabaseWriteBlockedByHeartbeat(): boolean;
  assertDatabaseWritesAllowed(): void;
}

function getFsErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return '';
  }
  return String((error as { code?: unknown }).code ?? '');
}

function isMissingOwnerMetadataError(error: unknown): boolean {
  const code = getFsErrorCode(error);
  // ENOTDIR cubre el formato antiguo donde `.lockdir` podía ser un fichero.
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function isMissingPathError(error: unknown): boolean {
  return getFsErrorCode(error) === 'ENOENT';
}

function formatFsError(error: unknown): string {
  const code = getFsErrorCode(error);
  const message = error instanceof Error ? error.message : String(error);
  return code ? `${code}: ${message}` : message;
}

export function createDatabaseLockManager(
  dependencies: DatabaseLockManagerDependencies,
): DatabaseLockManager {
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

  function parseLockPayload(raw: string, sourcePath: string): DatabaseLockInfo {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `El bloqueo SQLite existe pero ${sourcePath} contiene JSON incompleto o ilegible. ` +
          'Se reintentará sin asumir que el lock está libre.',
        { cause: error },
      );
    }

    if (!isDatabaseLockInfo(parsed)) {
      throw new Error(
        `El bloqueo SQLite existe pero ${sourcePath} no contiene metadatos válidos. ` +
          'Se reintentará sin asumir que el lock está libre.',
      );
    }

    return parsed;
  }

  function isLockStale(lock: DatabaseLockInfo): boolean {
    const updatedAt = Date.parse(lock.updatedAt);
    return Number.isNaN(updatedAt) || Date.now() - updatedAt > LOCK_TTL_MS;
  }

  /**
   * Lee el lock sin confundir "no existe" con "la red no me ha dejado leer".
   *
   * Antes cualquier error SMB acababa convertido en null, haciendo que el
   * proceso intentase crear un lock nuevo sobre uno que quizá sí existía.
   */
  async function readLock(lockPath: string): Promise<DatabaseLockInfo | null> {
    const infoPath = getLockInfoPath(lockPath);

    try {
      const raw = await readFile(infoPath, 'utf8');
      return parseLockPayload(raw, infoPath);
    } catch (ownerError) {
      if (!isMissingOwnerMetadataError(ownerError)) {
        throw new Error(
          `No se ha podido leer de forma fiable el bloqueo SQLite en ${infoPath}: ${formatFsError(ownerError)}`,
          { cause: ownerError },
        );
      }
    }

    // Compatibilidad con el formato antiguo: `.lockdir` como fichero JSON.
    try {
      const raw = await readFile(lockPath, 'utf8');
      return parseLockPayload(raw, lockPath);
    } catch (legacyError) {
      if (isMissingPathError(legacyError)) {
        return null;
      }

      // Si lockPath es un directorio pero owner.json aún no existe (otra
      // instancia está justo creándolo), no es un lock libre. Se trata como
      // lectura transitoria y acquireLock reintentará.
      throw new Error(
        `El directorio de bloqueo SQLite existe, pero sus metadatos no se han podido leer todavía: ${formatFsError(legacyError)}`,
        { cause: legacyError },
      );
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
        if (!isMissingPathError(error)) {
          cleanupFailed = true;
          console.warn(
            `No se ha podido borrar el fichero de un lock SQLite corrupto/caducado (${getLockInfoPath(lockPath)}).`,
            error,
          );
        }
      });
      await rmdir(lockPath).catch((error: unknown) => {
        if (!isMissingPathError(error)) {
          cleanupFailed = true;
          console.warn(
            `No se ha podido borrar el directorio de un lock SQLite corrupto/caducado (${lockPath}).`,
            error,
          );
        }
      });

      if (cleanupFailed) {
        console.warn(
          `El directorio de lock ${lockPath} parece corrupto o caducado pero no se ha podido limpiar automáticamente. ` +
            'Puede requerir liberación manual desde Ajustes o borrado manual en la carpeta compartida.',
        );
      }
    } catch (error) {
      if (!isMissingPathError(error)) {
        console.warn(
          `No se ha podido comprobar si el lock SQLite incompleto está caducado (${lockPath}).`,
          error,
        );
      }
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
    let lastReadError: unknown = null;

    while (Date.now() - startedAt <= waitMs) {
      let existingLock: DatabaseLockInfo | null;

      try {
        existingLock = await readLock(lockPath);
        lastLock = existingLock;
        lastReadError = null;
      } catch (error) {
        lastReadError = error;
        // Puede ser un owner.json a medio escribir o un problema SMB
        // transitorio. Nunca lo interpretamos como "lock libre".
        await removeCorruptStaleLock(lockPath);
        await new Promise((resolve) => {
          setTimeout(resolve, OPERATION_LOCK_RETRY_MS);
        });
        continue;
      }

      // Si acabamos de crear este lock pero la confirmación anterior falló
      // por red, reutilizarlo evita que la propia instancia se bloquee a sí misma.
      if (
        existingLock?.ownerId === dependencies.getOwnerId() &&
        existingLock.pid === process.pid
      ) {
        return existingLock;
      }

      if (existingLock && isLockStale(existingLock)) {
        try {
          await removeStaleLock(lockPath, existingLock);
        } catch (error) {
          lastReadError = error;
        }
      }

      if (!existingLock) {
        await removeCorruptStaleLock(lockPath);
      }

      if (!existingLock || isLockStale(existingLock)) {
        const lock = createLockInfo();
        try {
          await writeLock(lockPath, lock);
          return lock;
        } catch (error) {
          lastReadError = error;
          try {
            lastLock = await readLock(lockPath);
          } catch (readError) {
            lastReadError = readError;
          }
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

    if (lastReadError) {
      throw new Error(
        'No se ha podido comprobar de forma fiable el bloqueo SQLite en la carpeta compartida. ' +
          `Posible problema temporal de red/SMB: ${lastReadError instanceof Error ? lastReadError.message : String(lastReadError)}`,
        { cause: lastReadError },
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
    let currentLock: DatabaseLockInfo | null;

    try {
      currentLock = await readLock(lockPath);
    } catch (error) {
      // Si la red no permite confirmar quién es el propietario, es más seguro
      // NO borrar nada. No propagamos el error porque convertir una incidencia
      // al liberar el lock en un fallo de toda la operación sería peor.
      console.warn(
        `No se ha podido confirmar la propiedad del lock SQLite antes de liberarlo (${lockPath}). Se conserva el lock y caducará por TTL.`,
        error,
      );
      return;
    }

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
    if (isCurrentSqliteIpcReadOnly()) {
      const operationName = getCurrentSqliteIpcOperationName() ?? 'lectura SQLite';
      if (process.env.NODE_ENV !== 'production') {
        console.info(
          `[sqlite-lock] ${operationName}: lectura concurrente, sin lock externo .lockdir.`,
        );
      }
      return operation();
    }

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
        message:
          'La conexión con la carpeta compartida de SQLite se ha recuperado. Escrituras reactivadas.',
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

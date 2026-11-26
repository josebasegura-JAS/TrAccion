import { mkdir, open, readFile, readdir, rename, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { hostname, userInfo } from 'node:os';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { recordMultiuserMetric } from '../multiuserPerformanceDiagnostics.js';
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
/** Observación monotónica mínima antes de intentar retirar un .lockdir vacío. */
export const EMPTY_LOCK_OBSERVATION_MS = 5_000;
const MISSING_LOCK_OWNER_CODE = 'TRACCION_LOCK_OWNER_MISSING';
const LOCK_HEARTBEAT_MS = 10 * 1000;
const STARTUP_LOCK_WAIT_MS = 15 * 1000;
const STARTUP_LOCK_RETRY_MS = 250;
const DEFAULT_OPERATION_LOCK_WAIT_MS = 15 * 1000;
const OPERATION_LOCK_RETRY_MS = 50;
const OPERATION_LOCK_MAX_RETRY_MS = 180;

/** Desincroniza los reintentos de varios equipos sobre el mismo SMB.
 * Los primeros intentos siguen siendo rápidos; el intervalo se limita
 * para no elevar sin control el tiempo de reacción.
 */
export function computeOperationLockRetryDelayMs(attempt: number, randomness = Math.random()): number {
  const boundedAttempt = Math.max(0, Math.min(8, Math.trunc(attempt)));
  const base = Math.min(OPERATION_LOCK_RETRY_MS + boundedAttempt * 15, 140);
  const fraction = Number.isFinite(randomness) ? Math.max(0, Math.min(randomness, 0.999999)) : 0;
  return Math.min(OPERATION_LOCK_MAX_RETRY_MS, base + Math.floor(fraction * 40));
}

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
  /** Reloj monotónico inyectable para ensayar desfases sin tocar la hora de Windows. */
  monotonicNowMs?: () => number;
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
  /** Solo tras una verificación completa de SQLite, serializada por la cola. */
  clearHeartbeatBlock(): boolean;
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

function createErrorWithCause(message: string, cause: unknown): Error {
  const error = new Error(message) as Error & { cause?: unknown };
  error.cause = cause;
  return error;
}

// El registro vive en el proceso Electron, no en cada instancia del gestor:
// dos adaptadores con la misma identidad y PID comparten las adquisiciones.
const activeLocalLeases = new Map<string, {
  ownerId: string;
  pid: number;
  createdAt: string;
  count: number;
}>();
const leasePaths = new WeakMap<DatabaseLockInfo, string>();
const completedLeases = new WeakSet<DatabaseLockInfo>();
// Arranque conserva la API histórica de timer; asociar su scope al lease
// permite esperar la renovación pendiente incluso tras clearInterval.
const startupHeartbeatStops = new WeakMap<DatabaseLockInfo, () => Promise<void>>();
// Un release físico en curso no puede solaparse con una nueva reentrada local.
const localReleasesInFlight = new Map<string, Promise<void>>();
/**
 * Exclusión por ruta de operaciones completas, compartida por gestores del
 * mismo proceso. El contador de leases solo impide liberaciones prematuras;
 * no impide que dos callbacks de escritura se solapen.
 */
const localOperationTails = new Map<string, Promise<void>>();

function registerLocalLease(lockPath: string, lock: DatabaseLockInfo): DatabaseLockInfo {
  const existing = activeLocalLeases.get(lockPath);
  if (existing &&
      existing.ownerId === lock.ownerId &&
      existing.pid === lock.pid &&
      existing.createdAt === lock.createdAt) {
    existing.count += 1;
  } else {
    activeLocalLeases.set(lockPath, {
      ownerId: lock.ownerId,
      pid: lock.pid,
      createdAt: lock.createdAt,
      count: 1,
    });
  }
  // Cada adquisición recibe un objeto distinto: su liberación es idempotente.
  const lease = { ...lock };
  leasePaths.set(lease, lockPath);
  return lease;
}

export function createDatabaseLockManager(
  dependencies: DatabaseLockManagerDependencies,
): DatabaseLockManager {
  let notifyConnectivityIssue: ((payload: DatabaseConnectivityIssuePayload) => void) | null = null;
  let databaseWriteBlockedByHeartbeat = false;
  let heartbeatConsecutiveFailureCount = 0;
  let heartbeatOperationsInFlight = 0;
  // PR8A: observar inmovilidad del heartbeat con un reloj monotónico LOCAL.
  // No usar Date.now() para decidir cuándo puede recuperarse un lock remoto:
  // un Windows adelantado podría considerar caducada una escritura viva.
  // El mapa se limita para evitar crecimiento sin límite en sesiones largas.
  const staleObservations = new Map<string, { updatedAt: string; firstSeenMs: number }>();
  const emptyLockObservations = new Map<string, number>();
  const monotonicNowMs = dependencies.monotonicNowMs ?? (() => performance.now());


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
      throw createErrorWithCause(
        `El bloqueo SQLite existe pero ${sourcePath} contiene JSON incompleto o ilegible. ` +
          'Se reintentará sin asumir que el lock está libre.',
        error,
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
    // Un timestamp inválido no autoriza a borrar una reserva ajena.
    if (!Number.isFinite(Date.parse(lock.updatedAt))) return false;
    const key = `${lock.ownerId}|\u0000|${lock.hostname}|\u0000|${lock.pid}|\u0000|${lock.createdAt}`;
    const now = monotonicNowMs();
    if (!Number.isFinite(now)) return false;
    const previous = staleObservations.get(key);
    if (!previous || previous.updatedAt !== lock.updatedAt || now < previous.firstSeenMs) {
      // Una primera lectura o un heartbeat renovado reinicia la observación.
      staleObservations.delete(key);
      if (staleObservations.size >= 256) {
        staleObservations.delete(staleObservations.keys().next().value!);
      }
      staleObservations.set(key, { updatedAt: lock.updatedAt, firstSeenMs: now });
      return false;
    }
    return now - previous.firstSeenMs > LOCK_TTL_MS;
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
        throw createErrorWithCause(
          `No se ha podido leer de forma fiable el bloqueo SQLite en ${infoPath}: ${formatFsError(ownerError)}`,
          ownerError,
        );
      }
    }

    // Distinguir el formato antiguo (archivo JSON) del actual (directorio).
    // Intentar readFile(.lockdir) cuando es un directorio produce EISDIR,
    // especialmente visible en Windows/SMB. Ese error no demuestra caída de red.
    let lockPathType: Awaited<ReturnType<typeof stat>>;
    try {
      lockPathType = await stat(lockPath);
    } catch (statError) {
      if (isMissingPathError(statError)) return null;
      throw createErrorWithCause(
        `No se puede consultar el directorio de bloqueo SQLite: ${formatFsError(statError)}`,
        statError,
      );
    }
    if (lockPathType.isDirectory()) {
      // No convertir en 'libre': otro equipo puede estar escribiendo owner.json
      // o la caché SMB puede retrasar su visibilidad.
      const error = new Error(
        'El directorio de bloqueo SQLite existe, pero falta owner.json. ' +
        'Se comprobará si está vacío antes de recuperarlo sin eliminar bloqueos ajenos.',
      ) as Error & { code: string };
      error.code = MISSING_LOCK_OWNER_CODE;
      throw error;
    }
    if (!lockPathType.isFile()) {
      throw new Error('La ruta de bloqueo SQLite no es ni un archivo antiguo ni un directorio válido.');
    }
    // Compatibilidad con el formato anterior: .lockdir era un archivo JSON.
    try {
      const raw = await readFile(lockPath, 'utf8');
      return parseLockPayload(raw, lockPath);
    } catch (legacyError) {
      if (isMissingPathError(legacyError)) return null;
      throw createErrorWithCause(
        `No se han podido leer los metadatos del bloqueo SQLite antiguo: ${formatFsError(legacyError)}`,
        legacyError,
      );
    }
  }

  /**
   * Un lock sin owner.json NO es automáticamente abandonado. Solo intentamos
   * retirar el directorio tras dos observaciones vacías separadas por reloj
   * monotónico. rmdir es atómico y falla si cualquier otro cliente ya creó
   * owner.json o cualquier fichero (incluidas cuarentenas).
   *
   * No borra NINGÚN archivo y tampoco libera un lock con propietario válido.
   */
  async function reclaimEmptyOwnerlessLockDirectory(lockPath: string): Promise<boolean> {
    // No retirar jamás un lock que este proceso aún considera adquirido.
    if (activeLocalLeases.has(lockPath) || localReleasesInFlight.has(lockPath)) return false;
    const now = monotonicNowMs();
    let entries: string[];
    try {
      entries = await readdir(lockPath);
    } catch {
      emptyLockObservations.delete(lockPath);
      return false;
    }
    if (entries.length !== 0) {
      emptyLockObservations.delete(lockPath);
      return false;
    }
    const firstSeen = emptyLockObservations.get(lockPath);
    if (firstSeen === undefined || now < firstSeen) {
      emptyLockObservations.set(lockPath, now);
      return false;
    }
    if (now - firstSeen < EMPTY_LOCK_OBSERVATION_MS) return false;
    try {
      // Repetir la lectura inmediatamente antes del rmdir, sin inferir que la
      // ausencia del archivo en una comprobación anterior sigue vigente.
      if ((await readdir(lockPath)).length !== 0) {
        emptyLockObservations.delete(lockPath);
        return false;
      }
      await rmdir(lockPath);
      emptyLockObservations.delete(lockPath);
      console.info('[sqlite-lock] Directorio de bloqueo vacío recuperado sin eliminar metadatos.');
      return true;
    } catch {
      // ENOTEMPTY, ENOENT, EACCES o pérdida de SMB: conservar / reintentar.
      emptyLockObservations.delete(lockPath);
      return false;
    }
  }

  async function writeLock(lockPath: string, lock: DatabaseLockInfo): Promise<void> {
    await mkdir(lockPath);
    try {
      // Nunca truncar el propietario de una adquisición posterior. En SMB un
      // writeFile retrasado puede continuar después de que otro equipo haya
      // recuperado y recreado el directorio vacío.
      await writeFile(getLockInfoPath(lockPath), JSON.stringify(lock, null, 2), {
        encoding: 'utf8',
        flag: 'wx',
      });
    } catch (error) {
      // No hacer rmdir aquí: después de una pausa de red el directorio puede
      // haber sido recreado por otro proceso. La recuperación conservadora de
      // directorios vacíos se encarga de los restos verificables.
      console.warn('[sqlite-lock] No se ha podido publicar owner.json de forma exclusiva.', error);
      throw error;
    }

    const confirmedLock = await readLock(lockPath);
    if (!confirmedLock ||
        confirmedLock.ownerId !== lock.ownerId ||
        confirmedLock.pid !== lock.pid ||
        confirmedLock.createdAt !== lock.createdAt) {
      // releaseLock solo es aplicable a leases ya registrados; nunca intentar
      // limpiar una identidad que no podemos demostrar que sigue siendo propia.
      throw new Error('No se ha podido confirmar la identidad exacta del bloqueo SQLite en SMB.');
    }
  }

  /**
   * Limpieza de locks caducados sin borrar a ciegas el owner.json actual.
   *
   * Mover únicamente owner.json dentro del MISMO lockdir mantiene ocupado
   * el directorio exclusivo. Mientras el fichero está apartado, nadie puede
   * adquirir ese lock mediante mkdir(lockPath). Tras el rename se verifica
   * de nuevo el propietario y su heartbeat antes de eliminar nada.
   *
   * Ante dudas de red se deja el directorio bloqueado (fail closed).
   */
  async function removeStaleLock(lockPath: string, staleLock: DatabaseLockInfo): Promise<void> {
    const ownerPath = getLockInfoPath(lockPath);
    const currentLock = await readLock(lockPath);
    if (!currentLock || currentLock.ownerId !== staleLock.ownerId || !isLockStale(currentLock)) {
      return;
    }

    const quarantinePath = path.join(lockPath, `owner.json.reclaim-${randomUUID()}`);
    try {
      await rename(ownerPath, quarantinePath);
    } catch (error) {
      // Otro proceso puede haber renovado o retirado el lock. Nunca borrar
      // metadatos sin haber conseguido apartar el fichero de forma atómica.
      if (!isMissingPathError(error)) {
        console.warn('No se ha podido apartar el lock SQLite caducado para comprobar su titularidad.', error);
      }
      return;
    }

    let canDelete = false;
    try {
      const payload = await readFile(quarantinePath, 'utf8');
      const captured = parseLockPayload(payload, quarantinePath);
      const unchanged =
        captured.ownerId === currentLock.ownerId &&
        captured.pid === currentLock.pid &&
        captured.createdAt === currentLock.createdAt &&
        captured.updatedAt === currentLock.updatedAt;
      canDelete = unchanged && isLockStale(captured);

      if (!canDelete) {
        // Preservar un propietario nuevo o un heartbeat renovado. 'wx' impide
        // sobrescribir otro owner.json aparecido mientras se restauraba.
        try {
          await writeFile(ownerPath, payload, { encoding: 'utf8', flag: 'wx' });
          await unlink(quarantinePath);
        } catch (error) {
          // Si falla una restauración o hay metadatos nuevos, conservar la
          // cuarentena y el directorio. No asumir nunca que el lock está libre.
          console.warn('No se ha podido restaurar con seguridad el propietario del lock SQLite.', error);
        }
        return;
      }

      // Un heartbeat que reaparezca crea owner.json; en tal caso rmdir fallará
      // por directorio no vacío. No se elimina jamás el fichero nuevo.
      await unlink(quarantinePath);
      await rmdir(lockPath);
    } catch (error) {
      console.warn(
        `No se ha podido completar la recuperación segura del lock SQLite caducado de ${staleLock.username}@${staleLock.hostname}. Se conserva el directorio si sigue ocupado.`,
        error,
      );
    }
  }

  async function removeCorruptStaleLock(lockPath: string): Promise<void> {
    // Un mtime antiguo del directorio no demuestra que owner.json siga
    // corrupto: otro equipo podría haberlo renovado justo después del stat.
    // Nunca borrar metadatos sin poder demostrar identidad y caducidad.
    // Los locks con propietario válido se recuperan por removeStaleLock.
    try {
      const metadata = await stat(lockPath);
      if (Date.now() - metadata.mtimeMs > LOCK_TTL_MS) {
        console.warn(
          `El directorio de lock SQLite ${lockPath} parece antiguo, pero sus metadatos no son verificables. ` +
          'Se conserva el directorio para evitar borrar el bloqueo de otro equipo. ' +
          'Comprueba la conexión y solicita revisión administrativa si persiste.',
        );
      }
    } catch (error) {
      if (!isMissingPathError(error)) {
        console.warn(`No se ha podido comprobar el lock SQLite incompleto (${lockPath}).`, error);
      }
    }
  }

  async function acquireLock(
    databasePath: string,
    waitMs = DEFAULT_OPERATION_LOCK_WAIT_MS,
  ): Promise<DatabaseLockInfo> {
    const lockPath = getLockPath(databasePath);
    // La activación ya ha comprobado el directorio. No recrear ancestros UNC
    // ni recursos compartidos durante una adquisición de lock.
    const parent = await stat(path.dirname(lockPath));
    if (!parent.isDirectory()) throw new Error('La carpeta de SQLite no es un directorio.');
    const startedAt = monotonicNowMs();
    let lastLock: DatabaseLockInfo | null = null;
    let lastReadError: unknown = null;
    let retryAttempt = 0;
    const retryAfterContention = async (): Promise<void> => {
      const retryMs = computeOperationLockRetryDelayMs(retryAttempt);
      retryAttempt += 1;
      await new Promise<void>((resolve) => { setTimeout(resolve, retryMs); });
    };

    while (monotonicNowMs() - startedAt <= waitMs) {
      // La liberación final puede seguir comprobando/retirando el archivo
      // mientras otra petición del mismo proceso intenta reentrar.
      const releasePending = localReleasesInFlight.get(lockPath);
      if (releasePending) {
        await releasePending;
        continue;
      }
      let existingLock: DatabaseLockInfo | null;

      try {
        existingLock = await readLock(lockPath);
        lastLock = existingLock;
        lastReadError = null;
        emptyLockObservations.delete(lockPath);
      } catch (error) {
        lastReadError = error;
        if (getFsErrorCode(error) === MISSING_LOCK_OWNER_CODE) {
          // Solo el rmdir de un directorio realmente vacío puede liberar un
          // lock huérfano. Si SMB niega la operación, no se fuerza nada.
          if (await reclaimEmptyOwnerlessLockDirectory(lockPath)) {
            lastReadError = null;
            continue;
          }
        } else {
          emptyLockObservations.delete(lockPath);
        }
        // Un owner.json corrupto, un bloqueo de otro equipo o un error de
        // red son casos distintos: nunca se retira contenido no verificable.
        if (retryAttempt === 0 || retryAttempt % 25 === 0) {
          await removeCorruptStaleLock(lockPath);
        }
        await retryAfterContention();
        continue;
      }

      // Si acabamos de crear este lock pero la confirmación anterior falló
      // por red, reutilizarlo evita que la propia instancia se bloquee a sí misma.
      if (
        existingLock?.ownerId === dependencies.getOwnerId() &&
        existingLock.pid === process.pid
      ) {
        return registerLocalLease(lockPath, existingLock);
      }

      if (existingLock && isLockStale(existingLock)) {
        try {
          await removeStaleLock(lockPath, existingLock);
        } catch (error) {
          lastReadError = error;
        }
      }

      // readLock devuelve null únicamente cuando el directorio del lock no
      // existe. Si existe con owner.json ausente/corrupto, readLock lanza
      // error y se comprueba/recupera arriba. No hacer stat SMB adicional
      // en cada adquisición normal sin propietario.
      if (!existingLock || isLockStale(existingLock)) {
        const lock = createLockInfo();
        try {
          await writeLock(lockPath, lock);
          return registerLocalLease(lockPath, lock);
        } catch (error) {
          lastReadError = error;
          try {
            lastLock = await readLock(lockPath);
          } catch (readError) {
            lastReadError = readError;
          }
        }
      }

      await retryAfterContention();
    }

    if (lastLock) {
      throw Object.assign(new Error(
        `Base ocupada temporalmente por ${lastLock.username}@${lastLock.hostname} (PID ${lastLock.pid}). Inténtalo de nuevo en unos segundos.`,
      ), { code: 'TRACCION_LOCK_BUSY' });
    }

    if (lastReadError) {
      throw createErrorWithCause(
        'No se ha podido comprobar de forma fiable el bloqueo SQLite en la carpeta compartida. ' +
          `Posible problema temporal de red/SMB: ${lastReadError instanceof Error ? lastReadError.message : String(lastReadError)}`,
        lastReadError,
      );
    }

    throw new Error('No se ha podido adquirir el bloqueo temporal de operación SQLite.');
  }

  async function acquireStartupLock(databasePath: string): Promise<DatabaseLockInfo> {
    const startedAt = monotonicNowMs();
    let lastError: unknown = null;

    while (monotonicNowMs() - startedAt <= STARTUP_LOCK_WAIT_MS) {
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
    // Las adquisiciones se liberan una sola vez. La última conserva una
    // barrera local hasta finalizar el borrado físico en SMB.
    if (leasePaths.get(lock) !== lockPath || completedLeases.has(lock)) return;
    completedLeases.add(lock);
    const active = activeLocalLeases.get(lockPath);
    if (!active ||
        active.ownerId !== lock.ownerId ||
        active.pid !== lock.pid ||
        active.createdAt !== lock.createdAt) return;
    active.count -= 1;
    if (active.count > 0) return;
    activeLocalLeases.delete(lockPath);

    const physicalRelease = (async (): Promise<void> => {
      // El arranque cancela el timer, pero una renovación iniciada puede
      // seguir usando owner.json. Mantener la barrera local hasta su fin.
      const stopStartupHeartbeat = startupHeartbeatStops.get(lock);
      startupHeartbeatStops.delete(lock);
      if (stopStartupHeartbeat) await stopStartupHeartbeat();
      const ownerPath = getLockInfoPath(lockPath);
      let current: DatabaseLockInfo | null;
      try {
        current = await readLock(lockPath);
      } catch (error) {
        console.warn(`No se puede comprobar el propietario para liberar ${lockPath}; se conserva hasta TTL.`, error);
        return;
      }
      if (!current || current.ownerId !== lock.ownerId ||
          current.pid !== lock.pid || current.createdAt !== lock.createdAt) return;

      // El rename es atómico dentro del directorio exclusivo. Leer DESPUÉS
      // impide borrar un owner.json sustituido entre la primera lectura y
      // la operación sobre el archivo (carrera TOCTOU).
      const quarantinePath = path.join(lockPath, `owner.json.release-${randomUUID()}`);
      try {
        await rename(ownerPath, quarantinePath);
      } catch (error) {
        console.warn('No se ha podido apartar de forma segura el propietario antes de liberar.', error);
        return;
      }
      try {
        const payload = await readFile(quarantinePath, 'utf8');
        const captured = parseLockPayload(payload, quarantinePath);
        const same =
          captured.ownerId === current.ownerId &&
          captured.pid === current.pid &&
          captured.createdAt === current.createdAt &&
          captured.updatedAt === current.updatedAt;
        if (!same) {
          // El archivo puede haberse actualizado mientras se estaba
          // renombrando; no eliminar ni sobrescribir la nueva identidad.
          try {
            await writeFile(ownerPath, payload, { encoding: 'utf8', flag: 'wx' });
            await unlink(quarantinePath);
          } catch (error) {
            console.warn('El lock cambió durante la liberación; se conserva el directorio.', error);
          }
          return;
        }

        await unlink(quarantinePath);
        // Si otro heartbeat creó owner.json entretanto, rmdir falla con
        // ENOTEMPTY y preserva los metadatos nuevos.
        await rmdir(lockPath);
      } catch (error) {
        console.warn('No se ha podido completar la liberación del lock SQLite; no se presume libre.', error);
      }
    })();
    localReleasesInFlight.set(lockPath, physicalRelease);
    try {
      await physicalRelease;
    } finally {
      if (localReleasesInFlight.get(lockPath) === physicalRelease) {
        localReleasesInFlight.delete(lockPath);
      }
    }
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

    // No cambiar el lock de lectores: solo serializar callbacks exclusivos.
    // La cola IPC cubre las llamadas ordinarias, pero hay caminos de
    // mantenimiento/arranque que pueden invocar directamente este gestor.
    const lockPath = getLockPath(databasePath);
    async function runExclusiveOperation(): Promise<T> {
      // Solo registrar la operación IPC (nombre fijo), nunca la ruta SMB.
      const operationName = getCurrentSqliteIpcOperationName() ?? 'background:exclusive';
      const waitStartedAt = Date.now();
      let operationLock: DatabaseLockInfo;
      try {
        operationLock = await acquireLock(databasePath, waitMs);
        recordMultiuserMetric('smb-lock-wait', operationName, Date.now() - waitStartedAt);
      } catch (error) {
        recordMultiuserMetric('smb-lock-wait', operationName, Date.now() - waitStartedAt, true);
        throw error;
      }
      const heldStartedAt = Date.now();
      const heartbeat = createHeartbeatScope(lockPath, operationLock);
      let operationFailed = false;
      try {
        return await operation();
      } catch (error) {
        operationFailed = true;
        throw error;
      } finally {
        // No liberar mientras una renovación propia sigue usando owner.json.
        await heartbeat.stop();
        await releaseLock(lockPath, operationLock).catch((error: unknown) => {
          operationFailed = true;
          console.warn('No se ha podido liberar el bloqueo temporal de operación SQLite.', error);
        });
        recordMultiuserMetric('smb-lock-held', operationName, Date.now() - heldStartedAt, operationFailed);
      }
    }
    const predecessor = localOperationTails.get(lockPath);
    let finishLocal!: () => void;
    const localGate = new Promise<void>((resolve) => { finishLocal = resolve; });
    localOperationTails.set(lockPath, localGate);
    try {
      if (predecessor) await predecessor;
      return await runExclusiveOperation();
    } finally {
      finishLocal();
      if (localOperationTails.get(lockPath) === localGate) {
        localOperationTails.delete(lockPath);
      }
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
    // Un heartbeat vigente ha comprobado la propiedad del lock y escrito
    // correctamente en SMB. También puede restablecer el bloqueo.
    clearHeartbeatBlock(true);
  }

  function clearHeartbeatBlock(fromHeartbeat = false): boolean {
    // Una comprobación de salud no puede rehabilitar escrituras mientras
    // otro heartbeat sigue pendiente de resultado. El heartbeat que acaba
    // de superar la comprobación puede resolver su propio estado.
    if (!fromHeartbeat && heartbeatOperationsInFlight > 0) return false;
    if (heartbeatConsecutiveFailureCount === 0 && !databaseWriteBlockedByHeartbeat) return true;
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
    return true;
  }

  async function heartbeatDatabaseLock(lockPath: string, lock: DatabaseLockInfo): Promise<void> {
    // El handle sigue ligado al mismo objeto de archivo aunque otro proceso
    // renombre owner.json durante una recuperación. No abrir una segunda vez
    // por ruta para escribir: esa ruta podría pertenecer ya a otro propietario.
    const ownerPath = getLockInfoPath(lockPath);
    const handle = await open(ownerPath, 'r+');
    try {
      const currentLock = parseLockPayload(await handle.readFile('utf8'), ownerPath);
      if (currentLock.ownerId !== lock.ownerId ||
          currentLock.pid !== lock.pid ||
          currentLock.createdAt !== lock.createdAt) {
        throw new Error('El bloqueo SQLite de sesión ya no pertenece a esta adquisición.');
      }

      const payload = Buffer.from(JSON.stringify({
        ...currentLock,
        updatedAt: new Date().toISOString(),
      }, null, 2), 'utf8');
      // Posición explícita: readFile ha avanzado el cursor del handle.
      // A diferencia de writeFile(ownerPath), no abre ni trunca una ruta que
      // otro proceso pueda haber recreado mientras la E/S estaba retenida.
      await handle.write(payload, 0, payload.length, 0);
      await handle.truncate(payload.length);
    } finally {
      await handle.close();
    }

    // Detecta una sustitución durante la renovación. Esta comprobación NO
    // garantiza exclusión absoluta ante pausas >TTL; SQLite sigue siendo
    // la protección transaccional.
    const confirmed = await readLock(lockPath);
    if (confirmed?.ownerId !== lock.ownerId ||
        confirmed.pid !== lock.pid ||
        confirmed.createdAt !== lock.createdAt) {
      throw new Error('El bloqueo SQLite cambió de propietario durante el heartbeat.');
    }
  }

  function createHeartbeatScope(lockPath: string, lock: DatabaseLockInfo) {
    let pending: Promise<void> | null = null;
    const timer = setInterval(() => {
      if (pending) return;
      heartbeatOperationsInFlight += 1;
      pending = heartbeatDatabaseLock(lockPath, lock)
        .then(() => markHeartbeatRecovered())
        .catch((error: unknown) => markHeartbeatFailure(error))
        .finally(() => {
          heartbeatOperationsInFlight -= 1;
          pending = null;
        });
    }, LOCK_HEARTBEAT_MS);
    return {
      timer,
      async stop(): Promise<void> {
        clearInterval(timer);
        await pending;
      },
    };
  }

  function startDatabaseLockHeartbeat(
    lockPath: string,
    lock: DatabaseLockInfo,
  ): ReturnType<typeof setInterval> {
    const scope = createHeartbeatScope(lockPath, lock);
    startupHeartbeatStops.set(lock, () => scope.stop());
    return scope.timer;
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
    clearHeartbeatBlock,
    assertDatabaseWritesAllowed,
  };
}

import { app } from 'electron';
import { constants, copyFile, mkdir, readFile, readdir, rmdir, stat, unlink, writeFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { hostname, userInfo } from 'node:os';
import path from 'node:path';
import type { Database, DatabaseConstructor } from 'better-sqlite3';
import { maybeMigrateJsonArrayRecordsFromPersistedRecord, readActiveJsonRecords } from './persistence/jsonRecordRepository.js';
import {
  createSimpleJsonModuleRepository,
  type SimpleJsonSaveResult,
} from './persistence/simpleJsonModuleRepository.js';
import {
  computeHeaviestTables,
  getDailyLocalBackupWeekdayName,
  pruneLocalStorageBackups,
  type TableSizeBreakdownEntry,
} from './persistence/maintenanceQueries.js';
import {
  applyMigrations,
  CONFIGURACION_STATE_ID,
  CURRENT_SCHEMA_VERSION,
  isConfiguracionStateRow,
  readCurrentSchemaVersion,
} from './persistence/schemaMigrations.js';
import {
  acquireRecordLockInTransaction,
  getRecordLockInTransaction,
  heartbeatRecordLockInTransaction,
  releaseRecordLockInTransaction,
  recordLockError as buildRecordLockError,
  validateRecordLockPayload,
  type OwnerContext,
  type RecordLockOwnerInfo as RecordLockModuleOwnerInfo,
  type RecordLockPayload as RecordLockModulePayload,
  type RecordLockResult as RecordLockModuleResult,
} from './persistence/recordLocks.js';
import {
  isLocalBackupFileName,
  isShutdownBackupFileName,
  localBackupKindFromFileName,
  LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME,
  resolveLocalBackupReference as resolveLocalBackupReferenceFromModule,
} from './persistence/backupReference.js';
import {
  getConfiguredDatabaseDirectory,
  getDatabasePathForDirectory,
  getDefaultDatabaseDirectory,
  readDatabasePreferences,
  writeDatabasePreferences,
  DAILY_LOCAL_BACKUP_MAX_RETENTION_DAYS,
  DAILY_LOCAL_BACKUP_MIN_RETENTION_DAYS,
} from './persistence/databasePreferences.js';
import {
  backupTimestampForFileName,
  getLocalBackupDatabasePath,
  getLocalBackupDirectory,
  getLocalBackupJsonPath,
  getLocalShutdownBackupDirectory,
  getRotatedLocalBackupDatabasePath,
  getRotatedLocalBackupJsonPath,
  getShutdownLocalBackupDatabasePath,
  getShutdownLocalBackupJsonPath,
  LOCAL_BACKUP_DATABASE_FILE_NAME,
  LOCAL_BACKUP_JSON_FILE_NAME,
  pruneRotatedLocalBackups,
  pruneShutdownLocalBackups,
  shouldCreateRotatedLocalBackup,
  writeDailyLocalBackup as writeDailyLocalBackupFromModule,
  writeSharedSqliteBackup,
} from './persistence/localBackups.js';
import { createSorteosRepository, getSorteosCollectionUpdatedAt } from './persistence/sorteosRepository.js';
import { createVinculogramaRepository } from './persistence/vinculogramaRepository.js';
import { createLicenciaSinSueldoRepository } from './persistence/licenciaSinSueldoRepository.js';
import { createTicketRestauranteConfigRepository } from './persistence/ticketRestauranteConfigRepository.js';
import { createEspecialesRecipientRepository } from './persistence/especialesRecipientRepository.js';
import { createTeletrabajoPuestosRepository } from './persistence/teletrabajoPuestosRepository.js';
import { createTeletrabajoGruposCoberturaRepository } from './persistence/teletrabajoGruposCoberturaRepository.js';
import { createJobPositionTranslationsRepository } from './persistence/jobPositionTranslationsRepository.js';
import { createCriteriosRrllRepository } from './persistence/criteriosRrllRepository.js';
import { createActaTypesRepository } from './persistence/actaTypesRepository.js';
import { createTicketRestauranteCalendarsRepository } from './persistence/ticketRestauranteCalendarsRepository.js';
import { createTicketRestaurantePeopleRepository } from './persistence/ticketRestaurantePeopleRepository.js';
import { createTicketRestauranteAbsencesRepository } from './persistence/ticketRestauranteAbsencesRepository.js';
import { createTicketRestauranteManutencionesRepository } from './persistence/ticketRestauranteManutencionesRepository.js';
import { createPresupuestosRepository } from './persistence/presupuestosRepository.js';

const LOCAL_LIVE_BACKUP_DEBOUNCE_MS = 5000;
const LOCK_TTL_MS = 30 * 1000;
const LOCK_HEARTBEAT_MS = 10 * 1000;
const STARTUP_LOCK_WAIT_MS = 15 * 1000;
const STARTUP_LOCK_RETRY_MS = 250;
const SQLITE_BUSY_TIMEOUT_MS = 15_000;
const SQLITE_ASYNC_OPERATION_LOCK_WAIT_MS = 15 * 1000;
const SQLITE_RECORD_LOCK_WAIT_MS = 750;
const VACUUM_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const VACUUM_LOCK_WAIT_MS = 30 * 1000;
const VACUUM_METADATA_KEY = 'last_vacuum_at';
const SQLITE_OPERATION_LOCK_RETRY_MS = 50;
const SQLITE_BUSY_RETRY_DELAYS_MS = [100, 300, 700];
const DATABASE_HEARTBEAT_BLOCKED_MESSAGE =
  'La conexión con la carpeta compartida de SQLite puede estar interrumpida. Se bloquean nuevas escrituras hasta recuperar el heartbeat.';

export interface PersistedStorageRecord {
  key: string;
  value: string;
}

export interface ConditionalPersistedStorageRecord extends PersistedStorageRecord {
  expectedUpdatedAt: string | null;
}

export interface SqliteTaskRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SqliteTaskRecordsSnapshot {
  status: DatabaseStatus;
  records: SqliteTaskRecord[];
}

export interface SqliteTaskRecordsFilter {
  mode?: 'all' | 'active' | 'historical';
}

export interface ConditionalSqliteTaskRecord {
  id: string;
  value: string;
  expectedUpdatedAt: string | null;
}

export interface ConditionalSqliteTaskSaveResult {
  ok: boolean;
  status: DatabaseStatus;
  currentUpdatedAt: string | null;
  message: string;
}

export interface SqliteComiteSessionRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SqliteComiteSessionRecordsSnapshot {
  status: DatabaseStatus;
  records: SqliteComiteSessionRecord[];
}

export interface ConditionalSqliteComiteSessionRecord {
  id: string;
  value: string;
  expectedUpdatedAt: string | null;
}

export type SqliteParitariaSessionRecord = SqliteComiteSessionRecord;

export interface SqliteParitariaSessionRecordsSnapshot {
  status: DatabaseStatus;
  records: SqliteParitariaSessionRecord[];
}

export type ConditionalSqliteParitariaSessionRecord = ConditionalSqliteComiteSessionRecord;

export type SqliteActaRecord = SqliteComiteSessionRecord;

export interface SqliteActaRecordsSnapshot {
  status: DatabaseStatus;
  records: SqliteActaRecord[];
}

export type ConditionalSqliteActaRecord = ConditionalSqliteComiteSessionRecord;

export type SqliteTeletrabajoRecord = SqliteComiteSessionRecord;

export interface SqliteTeletrabajoRecordsSnapshot {
  status: DatabaseStatus;
  records: SqliteTeletrabajoRecord[];
}

export type ConditionalSqliteTeletrabajoRecord = ConditionalSqliteComiteSessionRecord;

export interface SqliteEmployeeRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SqliteEmployeeRecordsSnapshot {
  status: DatabaseStatus;
  records: SqliteEmployeeRecord[];
}

export interface ConditionalSqliteEmployeeRecord {
  id: string;
  value: string;
  expectedValue: string | null;
}

export interface ConditionalSqliteEmployeeSaveResult {
  ok: boolean;
  status: DatabaseStatus;
  currentValue: string | null;
  message: string;
}

export interface ConditionalSqliteEmployeeBatchSaveResult {
  ok: boolean;
  status: DatabaseStatus;
  currentValue: string | null;
  message: string;
  saved: number;
}

export type {
  SqliteSorteosRecord,
  SqliteSorteosRecordsSnapshot,
  ConditionalSqliteSorteosSnapshot,
  ConditionalSqliteSorteosSaveResult,
} from './persistence/sorteosRepository.js';

export interface PersistedStorageRecordSnapshot extends PersistedStorageRecord {
  updatedAt: string;
}

export interface PersistedRecordsTokenSnapshot {
  status: DatabaseStatus;
  refreshToken: string | null;
  latestUpdatedAt: string | null;
  taskRecordsUpdatedAt: string | null;
  sorteosDrawsUpdatedAt: string | null;
  sorteosExclusionsUpdatedAt: string | null;
  directStoreUpdatedAt: Record<string, string | null>;
}

export interface PersistedRecordsSnapshot extends PersistedRecordsTokenSnapshot {
  records: PersistedStorageRecordSnapshot[];
}

export interface PersistedRecordSnapshot {
  status: DatabaseStatus;
  record: PersistedStorageRecordSnapshot | null;
}

export interface LocalStorageBackupPayload {
  records: PersistedStorageRecord[];
}

export interface LocalBackupEntry {
  id: string;
  fileName: string;
  kind: 'sqlite' | 'json';
  path: string;
  sizeBytes: number;
  createdAt: string;
  isLiveCopy: boolean;
}

export interface RestoreLocalBackupResult {
  ok: boolean;
  status: DatabaseStatus;
  message: string;
}

export interface ForceReleaseDatabaseLockResult {
  ok: boolean;
  status: DatabaseStatus;
  message: string;
}

export interface DatabaseLockInfo {
  ownerId: string;
  username: string;
  hostname: string;
  pid: number;
  createdAt: string;
  updatedAt: string;
}

export type RecordLockOwnerInfo = RecordLockModuleOwnerInfo;
export type RecordLockPayload = RecordLockModulePayload;
export type RecordLockResult = RecordLockModuleResult;

export interface DatabaseStatus {
  ready: boolean;
  engine: 'better-sqlite3';
  phase: 'prepared' | 'active' | 'fallback' | 'error' | 'locked';
  path: string;
  schemaVersion: number;
  isDefaultPath: boolean;
  lockPath: string;
  lock?: DatabaseLockInfo;
  message?: string;
}

const require = createRequire(import.meta.url);

const OWNER_ID_FILE_NAME = 'traccion-owner-id.json';

function getOwnerIdFilePath(): string {
  return path.join(app.getPath('userData'), OWNER_ID_FILE_NAME);
}

/**
 * Lee o crea un ownerId estable en userData. Reutilizarlo entre reinicios
 * permite limpiar los editing_locks propios al arrancar (crash recovery),
 * en lugar de esperar a que expiren por TTL (30s).
 */
async function resolveStableOwnerId(): Promise<string> {
  const filePath = getOwnerIdFilePath();
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof (parsed as { id?: unknown }).id === 'string') {
      return (parsed as { id: string }).id;
    }
  } catch {
    // Fichero no existe o corrupto — crear uno nuevo.
  }

  const newId = `${hostname()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await writeFile(filePath, JSON.stringify({ id: newId }), 'utf8');
  } catch {
    // Si no se puede escribir, el id volátil sigue siendo válido para esta sesión.
  }
  return newId;
}

// Se inicializa de forma síncrona con un valor temporal; se sobreescribe en
// initializeSqlitePersistence antes de abrir la base de datos.
let ownerId = `${hostname()}-${process.pid}-${Date.now().toString(36)}`;

let database: Database | null = null;
let status: DatabaseStatus | null = null;
let localBackupQueue: Promise<void> = Promise.resolve();
let localBackupTimer: ReturnType<typeof setTimeout> | null = null;
let pendingLocalBackupReason: string | null = null;
let activeDatabaseLock: { lockPath: string; lock: DatabaseLockInfo; heartbeat: ReturnType<typeof setInterval> } | null = null;
let databaseWriteBlockedByHeartbeat = false;
let heartbeatConsecutiveFailureCount = 0;
let notifyDatabaseConnectivityIssue: ((payload: DatabaseConnectivityIssuePayload) => void) | null = null;
// Flags para evitar el COUNT(*) de red en cada carga una vez confirmado que la migración ya se hizo.
let tasksMigrationDone = false;
let comiteSessionsMigrationDone = false;
let paritariaSessionsMigrationDone = false;
let actasMigrationDone = false;
let teletrabajoMigrationDone = false;
let employeesMigrationDone = false;
let configuracionMigrationDone = false;

export interface DatabaseConnectivityIssuePayload {
  blocked: boolean;
  message: string;
  failedHeartbeatCount: number;
  updatedAt: string;
}

function logSqliteMetric(message: string, data?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  if (data) {
    console.info(`[sqlite] ${message}`, data);
    return;
  }

  console.info(`[sqlite] ${message}`);
}

function largestPersistedRecordSizes(records: PersistedStorageRecordSnapshot[]): Array<{
  key: string;
  bytes: number;
}> {
  return records
    .map((record) => ({ key: record.key, bytes: Buffer.byteLength(record.value, 'utf8') }))
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, 10);
}

// --- Mantenimiento de la base: VACUUM ---------------------------------

export interface VacuumResult {
  ok: boolean;
  message: string;
  sizeBeforeBytes: number | null;
  sizeAfterBytes: number | null;
  durationMs: number | null;
}

/**
 * Ejecuta VACUUM sobre la base SQLite activa, reescribiendo el archivo
 * completo para liberar en disco el espacio de filas ya borradas (p. ej.
 * tras podar local_storage_backups o tras eliminaciones acumuladas).
 *
 * VACUUM exige exclusividad: usamos el mismo lock de fichero (mkdir-based)
 * que coordina el resto de operaciones SQLite entre los 2-3 equipos de la
 * red, con heartbeat porque puede tardar varios segundos en bases grandes.
 * Nunca se ejecuta dentro de una transacción explícita.
 */
async function vacuumDatabase(reason: string): Promise<VacuumResult> {
  const currentDatabase = database;
  const currentStatus = getSqliteStatus();
  if (!currentDatabase || !currentStatus.ready || currentStatus.phase !== 'active') {
    return {
      ok: false,
      message: 'La base de datos no está activa; no se ha podido compactar.',
      sizeBeforeBytes: null,
      sizeAfterBytes: null,
      durationMs: null,
    };
  }

  let vacuumLock: DatabaseLockInfo;
  try {
    vacuumLock = await acquireLock(currentStatus.path, VACUUM_LOCK_WAIT_MS);
  } catch (error) {
    if (isSqliteLockContentionError(error)) {
      return {
        ok: false,
        message: 'La base de datos está ocupada por otro equipo; inténtalo de nuevo en unos minutos.',
        sizeBeforeBytes: null,
        sizeAfterBytes: null,
        durationMs: null,
      };
    }
    throw error;
  }

  const vacuumLockPath = getLockPath(currentStatus.path);
  const vacuumLockHeartbeat = startDatabaseLockHeartbeat(vacuumLockPath, vacuumLock);

  try {
    const sizeBeforeBytes = (await stat(currentStatus.path).catch(() => null))?.size ?? null;
    const startedAt = Date.now();

    currentDatabase.exec('VACUUM');
    // ANALYZE es rápido y no exige exclusividad como VACUUM, pero lo
    // aprovechamos aquí porque ya tenemos el lock adquirido: actualiza las
    // estadísticas que usa el planificador de consultas SQLite, mejorando
    // el rendimiento de futuras consultas sin coste de coordinación extra.
    currentDatabase.exec('ANALYZE');

    const durationMs = Date.now() - startedAt;
    const sizeAfterBytes = (await stat(currentStatus.path).catch(() => null))?.size ?? null;
    const completedAt = new Date().toISOString();
    writeLastVacuumAt(currentDatabase, completedAt);

    console.info(`VACUUM + ANALYZE SQLite completado (${reason}) en ${durationMs} ms.`);
    return {
      ok: true,
      message: 'Base de datos compactada y optimizada correctamente.',
      sizeBeforeBytes,
      sizeAfterBytes,
      durationMs,
    };
  } catch (error) {
    console.warn('No se ha podido compactar la base de datos SQLite (VACUUM).', error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No se ha podido compactar la base de datos.',
      sizeBeforeBytes: null,
      sizeAfterBytes: null,
      durationMs: null,
    };
  } finally {
    clearInterval(vacuumLockHeartbeat);
    await releaseLock(vacuumLockPath, vacuumLock).catch((error: unknown) => {
      console.warn('No se ha podido liberar el bloqueo SQLite de compactado.', error);
    });
  }
}

/**
 * Lanza VACUUM en segundo plano si ha pasado más de VACUUM_INTERVAL_MS desde
 * el último (o si nunca se ha ejecutado). Pensado para llamarse al cerrar la
 * app, igual que el backup de shutdown: nunca interrumpe una sesión activa.
 */
async function runScheduledVacuumIfDue(): Promise<void> {
  const currentDatabase = database;
  const currentStatus = getSqliteStatus();
  if (!currentDatabase || !currentStatus.ready || currentStatus.phase !== 'active') {
    return;
  }

  const lastVacuumAt = readLastVacuumAt(currentDatabase);
  const lastVacuumTime = lastVacuumAt ? new Date(lastVacuumAt).getTime() : null;
  const isDue =
    lastVacuumTime === null || Number.isNaN(lastVacuumTime) || Date.now() - lastVacuumTime >= VACUUM_INTERVAL_MS;

  if (!isDue) {
    return;
  }

  await vacuumDatabase('scheduled');
}

export async function vacuumDatabaseNow(): Promise<VacuumResult> {
  return vacuumDatabase('manual');
}

export interface VacuumStatus {
  lastVacuumAt: string | null;
  currentSizeBytes: number | null;
  heaviestTables: TableSizeBreakdownEntry[];
}

export async function getVacuumStatus(): Promise<VacuumStatus> {
  const currentDatabase = database;
  const currentStatus = getSqliteStatus();
  const lastVacuumAt =
    currentDatabase && currentStatus.ready ? readLastVacuumAt(currentDatabase) : null;
  const currentSizeBytes = currentStatus.ready
    ? (await stat(currentStatus.path).catch(() => null))?.size ?? null
    : null;
  const heaviestTables =
    currentDatabase && currentStatus.ready ? computeHeaviestTables(currentDatabase) : [];

  return { lastVacuumAt, currentSizeBytes, heaviestTables };
}

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
    ownerId,
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

/**
 * Relee del disco el lock que está bloqueando la base activa, sin intentar
 * adquirirlo. A diferencia de `getSqliteStatus()`, que devuelve el `status`
 * cacheado en el último intento de arranque, esta función consulta el
 * fichero `.lockdir` en el momento de la llamada, para que la pantalla de
 * Ajustes pueda mostrar información actualizada (por ejemplo, la antigüedad
 * real del lock) mientras la app sigue en fase `locked`/`fallback`.
 */
export async function getCurrentDatabaseLockInfo(): Promise<DatabaseLockInfo | null> {
  const currentStatus = getSqliteStatus();
  return readLock(currentStatus.lockPath);
}

/**
 * Borra manualmente el lock de sesión SQLite de la carpeta compartida y
 * reintenta activar la base inmediatamente después.
 *
 * Esta es una acción explícita y destructiva pensada para el caso en que el
 * lock automático (TTL de 30s, ver `isLockStale`) no se ha podido limpiar
 * solo —por ejemplo, por un fallo de borrado en el recurso SMB— y se queda
 * bloqueando a todo el resto de usuarios indefinidamente. El frontend debe
 * pedir confirmación explícita antes de llamarla, ya que si el propietario
 * del lock sigue realmente trabajando, esto puede provocar una escritura
 * concurrente sin coordinación durante unos segundos.
 */
export async function forceReleaseDatabaseLock(): Promise<ForceReleaseDatabaseLockResult> {
  const currentStatus = getSqliteStatus();
  const lockPath = currentStatus.lockPath;
  const previousLock = await readLock(lockPath);

  if (previousLock) {
    await unlink(getLockInfoPath(lockPath)).catch((error: unknown) => {
      console.warn(`No se ha podido borrar manualmente el fichero del lock SQLite (${getLockInfoPath(lockPath)}).`, error);
    });
    await rmdir(lockPath).catch((error: unknown) => {
      console.warn(`No se ha podido borrar manualmente el directorio del lock SQLite (${lockPath}).`, error);
    });
  }

  const lockDescription = previousLock
    ? `${previousLock.username}@${previousLock.hostname} (PID ${previousLock.pid})`
    : null;

  if (database) {
    // La base ya estaba activa en este proceso: no hay que reconectar, solo
    // informar de que se ha limpiado un lock ajeno que pudiera estar
    // bloqueando a otros usuarios.
    const activeStatus = getSqliteStatus();
    return {
      ok: true,
      status: activeStatus,
      message: lockDescription
        ? `Lock de ${lockDescription} liberado manualmente. Tu conexión a SQLite no se ha visto afectada.`
        : 'No había ningún bloqueo activo que liberar. Tu conexión a SQLite no se ha visto afectada.',
    };
  }

  try {
    const configured = await getConfiguredDatabaseDirectory();
    const nextStatus = await activateDatabase(configured.directoryPath, configured.isDefaultPath, null);
    return {
      ok: true,
      status: nextStatus,
      message: lockDescription
        ? `Lock de ${lockDescription} liberado manualmente. Conexión a SQLite restablecida.`
        : 'No había ningún bloqueo activo que liberar; se ha reintentado la conexión y se ha restablecido correctamente.',
    };
  } catch (error) {
    const refreshedLock = await readLock(lockPath);
    status = {
      ...currentStatus,
      lock: refreshedLock ?? undefined,
      message: errorMessage(error),
    };
    return {
      ok: false,
      status,
      message: lockDescription
        ? `Lock de ${lockDescription} liberado manualmente, pero no se ha podido reconectar: ${errorMessage(error)}`
        : `No se ha podido reconectar con SQLite: ${errorMessage(error)}`,
    };
  }
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

async function acquireLock(databasePath: string, waitMs = SQLITE_ASYNC_OPERATION_LOCK_WAIT_MS): Promise<DatabaseLockInfo> {
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

export function setDatabaseConnectivityIssueNotifier(
  notifier: ((payload: DatabaseConnectivityIssuePayload) => void) | null,
): void {
  notifyDatabaseConnectivityIssue = notifier;
}

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

function assertDatabaseWritesAllowed(): void {
  if (!databaseWriteBlockedByHeartbeat) {
    return;
  }

  throw new Error(`Escritura bloqueada: ${DATABASE_HEARTBEAT_BLOCKED_MESSAGE}`);
}

function isDatabaseWriteBlockedByHeartbeat(): boolean {
  return databaseWriteBlockedByHeartbeat;
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

function startDatabaseLockHeartbeat(lockPath: string, lock: DatabaseLockInfo): ReturnType<typeof setInterval> {
  return setInterval(() => {
    heartbeatDatabaseLock(lockPath, lock)
      .then(() => markHeartbeatRecovered())
      .catch((error: unknown) => markHeartbeatFailure(error));
  }, LOCK_HEARTBEAT_MS);
}

async function releaseLock(lockPath: string, lock: DatabaseLockInfo): Promise<void> {
  const currentLock = await readLock(lockPath);
  if (currentLock?.ownerId !== lock.ownerId) {
    return;
  }

  await unlink(getLockInfoPath(lockPath)).catch(() => undefined);
  await rmdir(lockPath).catch(() => undefined);
}

async function releaseActiveSessionLock(): Promise<void> {
  const sessionLock = activeDatabaseLock;
  if (!sessionLock) {
    return;
  }

  activeDatabaseLock = null;
  clearInterval(sessionLock.heartbeat);
  await releaseLock(sessionLock.lockPath, sessionLock.lock).catch((error: unknown) => {
    console.warn('No se ha podido liberar el bloqueo SQLite de sesión.', error);
  });
}

async function pruneEmergencyDatabaseBackups(databasePath: string, retentionCount = 1): Promise<void> {
  const directory = path.dirname(databasePath);
  const prefix = `${path.basename(databasePath)}.backup-`;
  const entries = await readdir(directory).catch(() => []);
  const backups = entries
    .filter((entry) => entry.startsWith(prefix))
    .sort()
    .reverse();

  await Promise.all(
    backups.slice(retentionCount).map((entry) =>
      unlink(path.join(directory, entry)).catch(() => undefined),
    ),
  );
}

async function backupExistingDatabase(databasePath: string): Promise<void> {
  try {
    await stat(databasePath);
  } catch {
    return;
  }

  await pruneEmergencyDatabaseBackups(databasePath, 1);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    await copyFile(databasePath, `${databasePath}.backup-${timestamp}`);
    await pruneEmergencyDatabaseBackups(databasePath, 1);
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code === 'ENOSPC') {
      console.warn('No hay espacio para crear la copia preventiva SQLite. Se continúa sin bloquear el guardado.', error);
      await pruneEmergencyDatabaseBackups(databasePath, 1);
      return;
    }

    throw error;
  }
}

async function ensureDirectoryIsUsable(directoryPath: string): Promise<void> {
  await mkdir(directoryPath, { recursive: true });
  await access(directoryPath, constants.R_OK | constants.W_OK);
  const probePath = path.join(directoryPath, `.traccion-write-test-${process.pid}-${Date.now()}`);
  await writeFile(probePath, 'ok', { encoding: 'utf8', flag: 'wx' });
  await unlink(probePath);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function openDatabase(databasePath: string): Database {
  const BetterSqlite3 = require('better-sqlite3') as DatabaseConstructor;
  const db = new BetterSqlite3(databasePath);
  db.pragma(`busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
  // En carpetas SMB/WAL se han observado corrupciones con varias instancias.
  // La concurrencia se coordina con un lock corto por operación, así que usamos
  // rollback journal clásico, más compatible con red que WAL/-shm.
  db.pragma('journal_mode = DELETE');
  // NORMAL es suficiente con journal_mode=DELETE y 2-3 usuarios: solo se
  // perdería una transacción en un apagado abrupto justo en el fsync, algo
  // improbable en uso normal. FULL hacía un fsync de red en cada escritura,
  // añadiendo 50-500 ms de latencia SMB por operación.
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Protección contra downgrade: si la base tiene un schema más nuevo que esta
  // versión del ejecutable, rechazar la apertura con un mensaje claro. Abrir una
  // base con schema superior podría ignorar tablas o columnas nuevas y corromper datos.
  const existingVersion = readCurrentSchemaVersion(db);
  if (existingVersion > CURRENT_SCHEMA_VERSION) {
    db.close();
    throw new Error(
      `La base de datos tiene schema v${existingVersion} pero esta versión de TrAccion solo soporta hasta v${CURRENT_SCHEMA_VERSION}. ` +
      `Actualiza TrAccion antes de continuar.`,
    );
  }

  applyMigrations(db);
  pruneLocalStorageBackups(db);
  return db;
}

function closeDatabase(): void {
  if (database) {
    database.close();
    database = null;
  }
  tasksMigrationDone = false;
  employeesMigrationDone = false;
  sorteosModule.resetMigrationState();
  comiteSessionsMigrationDone = false;
  paritariaSessionsMigrationDone = false;
  actasMigrationDone = false;
  teletrabajoMigrationDone = false;
}

async function closeDatabaseAndReleaseLock(): Promise<void> {
  if (database) {
    database.close();
    database = null;
  }
  tasksMigrationDone = false;
  employeesMigrationDone = false;
  sorteosModule.resetMigrationState();
  comiteSessionsMigrationDone = false;
  paritariaSessionsMigrationDone = false;
  actasMigrationDone = false;
  teletrabajoMigrationDone = false;

  await releaseActiveSessionLock();
}

async function prepareDatabaseAtPath(
  databasePath: string,
  sourceDatabasePath: string | null,
): Promise<void> {
  const targetExists = await fileExists(databasePath);
  if (targetExists) {
    return;
  }

  if (
    sourceDatabasePath &&
    sourceDatabasePath !== databasePath &&
    (await fileExists(sourceDatabasePath))
  ) {
    await copyFile(sourceDatabasePath, databasePath);
  }
}

async function activateDatabase(
  directoryPath: string,
  isDefaultPath: boolean,
  sourceDatabasePath: string | null,
): Promise<DatabaseStatus> {
  const databasePath = getDatabasePathForDirectory(directoryPath);
  const lockPath = getLockPath(databasePath);
  await ensureDirectoryIsUsable(directoryPath);

  // Bloqueo temporal solo para la fase delicada de arranque: creación inicial,
  // copia desde origen y migraciones. No se mantiene como lock de sesión porque
  // bloquearía al segundo usuario. La confiabilidad multiusuario se apoya en un
  // único lock corto por operación crítica SQLite, compartido también por backups.
  const startupLock = await acquireStartupLock(databasePath);
  const startupLockHeartbeat = startDatabaseLockHeartbeat(lockPath, startupLock);

  try {
    await prepareDatabaseAtPath(databasePath, sourceDatabasePath);
    const db = openDatabase(databasePath);
    // Limpiar los editing_locks que este proceso dejó sin liberar en un reinicio
    // o crash anterior. Al tener ownerId estable, podemos eliminarlos activamente
    // sin esperar al TTL de 30s.
    try {
      db.prepare('DELETE FROM editing_locks WHERE owner_id = ?').run(ownerId);
    } catch {
      // No bloquear el arranque si la tabla aún no existe (base nueva).
    }
    database = db;
    status = {
      ready: true,
      engine: 'better-sqlite3',
      phase: 'active',
      path: databasePath,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      isDefaultPath,
      lockPath,
    };
    clearInterval(startupLockHeartbeat);
    await releaseLock(lockPath, startupLock);
    return status;
  } catch (error) {
    clearInterval(startupLockHeartbeat);
    await releaseLock(lockPath, startupLock);
    throw error;
  }
}

export async function initializeSqlitePersistence(): Promise<DatabaseStatus> {
  if (status) {
    return status;
  }

  // Resolver el ownerId estable antes de cualquier operación con la base.
  // Esto permite limpiar los editing_locks propios de sesiones anteriores.
  ownerId = await resolveStableOwnerId();

  const configured = await getConfiguredDatabaseDirectory();
  const databasePath = getDatabasePathForDirectory(configured.directoryPath);
  const lockPath = getLockPath(databasePath);

  try {
    return await activateDatabase(configured.directoryPath, configured.isDefaultPath, null);
  } catch (error) {
    const currentLock = await readLock(lockPath);
    status = {
      ready: false,
      engine: 'better-sqlite3',
      phase: isSqliteCorruptionError(error)
        ? 'error'
        : error instanceof Error && error.message.startsWith('Base ocupada')
          ? 'locked'
          : 'fallback',
      path: databasePath,
      schemaVersion: 0,
      isDefaultPath: configured.isDefaultPath,
      lockPath,
      lock: currentLock ?? undefined,
      message: isSqliteCorruptionError(error)
        ? `Base de datos SQLite dañada: ${error instanceof Error ? error.message : 'error desconocido'}. Restaura una copia de seguridad antes de seguir trabajando.`
        : error instanceof Error
          ? error.message
          : 'SQLite no está disponible; se mantiene localStorage.',
    };
  }

  return getSqliteStatus();
}

function requireDatabase(): Database {
  if (!database) {
    throw new Error('SQLite no está inicializado.');
  }

  return database;
}

function isSqliteCorruptionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('database disk image is malformed') ||
    message.includes('database corruption') ||
    message.includes('file is not a database')
  );
}

function isSqliteLockContentionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('base ocupada') || message.includes('bloqueo temporal');
}

function isSqliteBusyOrLockedError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') {
      return true;
    }
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('database is locked') || message.includes('database table is locked');
}

function markDatabaseAsCorrupted(error: unknown): DatabaseStatus {
  const previousStatus = getSqliteStatus();
  const message =
    error instanceof Error
      ? `Base de datos SQLite dañada: ${error.message}. Restaura una copia de seguridad antes de seguir trabajando.`
      : 'Base de datos SQLite dañada. Restaura una copia de seguridad antes de seguir trabajando.';

  try {
    closeDatabase();
  } catch {
    database = null;
  }

  status = {
    ...previousStatus,
    ready: false,
    phase: 'error',
    message,
  };

  return status;
}

async function safeDatabaseOperation<T>(
  operation: () => T,
  fallback: (status: DatabaseStatus, message: string) => T,
): Promise<T> {
  const currentStatus = getSqliteStatus();

  for (let attempt = 0; attempt <= SQLITE_BUSY_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await withDatabaseOperationLock(currentStatus.path, async () => operation());
    } catch (error) {
      if (isSqliteCorruptionError(error)) {
        const nextStatus = markDatabaseAsCorrupted(error);
        return fallback(nextStatus, nextStatus.message ?? 'Base de datos SQLite dañada.');
      }

      const isLastAttempt = attempt === SQLITE_BUSY_RETRY_DELAYS_MS.length;
      if (!isSqliteBusyOrLockedError(error) || isLastAttempt) {
        throw error;
      }

      const delayMs = SQLITE_BUSY_RETRY_DELAYS_MS[attempt];
      console.warn(
        `[sqlite] Operación ocupada (intento ${attempt + 1}/${SQLITE_BUSY_RETRY_DELAYS_MS.length + 1}), reintentando en ${delayMs} ms.`,
      );
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }

  // Inalcanzable: el bucle siempre retorna o lanza en la última iteración.
  throw new Error('safeDatabaseOperation: estado inesperado.');
}

export function getSqliteStatus(): DatabaseStatus {
  const fallbackPath = getDatabasePathForDirectory(getDefaultDatabaseDirectory());

  if (status?.ready && status.phase === 'active' && databaseWriteBlockedByHeartbeat) {
    return {
      ...status,
      message: DATABASE_HEARTBEAT_BLOCKED_MESSAGE,
    };
  }

  return (
    status ?? {
      ready: false,
      engine: 'better-sqlite3',
      phase: 'prepared',
      path: fallbackPath,
      schemaVersion: 0,
      isDefaultPath: true,
      lockPath: getLockPath(fallbackPath),
    }
  );
}

interface PersistedRecordRow {
  key: string;
  value_json: string;
  updated_at: string;
}

interface MetadataRow {
  value: string;
}

interface UpdatedAtRow {
  updated_at: string;
}

interface TaskRecordRow {
  id: string;
  value_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface EmployeeRecordRow {
  id: string;
  value_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface CountRow {
  count: number;
}

function isPersistedRecordRow(value: unknown): value is PersistedRecordRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PersistedRecordRow>;
  return (
    typeof candidate.key === 'string' &&
    typeof candidate.value_json === 'string' &&
    typeof candidate.updated_at === 'string'
  );
}

function isTaskRecordRow(value: unknown): value is TaskRecordRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TaskRecordRow>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.value_json === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string' &&
    (candidate.deleted_at === null || typeof candidate.deleted_at === 'string')
  );
}

function isEmployeeRecordRow(value: unknown): value is EmployeeRecordRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<EmployeeRecordRow>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.value_json === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string' &&
    (candidate.deleted_at === null || typeof candidate.deleted_at === 'string')
  );
}

function isCountRow(value: unknown): value is CountRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CountRow>;
  return typeof candidate.count === 'number';
}

function isJsonObjectWithStringId(value: unknown): value is { id: string; createdAt?: unknown; updatedAt?: unknown; deletedAt?: unknown } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { id?: unknown };
  return typeof candidate.id === 'string' && candidate.id.trim().length > 0;
}

function isMetadataRow(value: unknown): value is MetadataRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MetadataRow>;
  return typeof candidate.value === 'string';
}

function isUpdatedAtRow(value: unknown): value is UpdatedAtRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<UpdatedAtRow>;
  return typeof candidate.updated_at === 'string';
}

function readPersistedRecordByKey(
  db: Database,
  key: string,
): PersistedStorageRecordSnapshot | null {
  const row = db
    .prepare('SELECT key, value_json, updated_at FROM persisted_records WHERE key = ?')
    .get(key);

  return isPersistedRecordRow(row)
    ? { key: row.key, value: row.value_json, updatedAt: row.updated_at }
    : null;
}

function readAllPersistedRecords(db: Database): PersistedStorageRecordSnapshot[] {
  return db
    .prepare('SELECT key, value_json, updated_at FROM persisted_records ORDER BY key')
    .all()
    .filter(isPersistedRecordRow)
    .map((row) => ({
      key: row.key,
      value: row.value_json,
      updatedAt: row.updated_at,
    }));
}

function enqueueLocalBackup(reason: string): void {
  pendingLocalBackupReason = pendingLocalBackupReason ? `${pendingLocalBackupReason}, ${reason}` : reason;

  if (localBackupTimer) {
    clearTimeout(localBackupTimer);
  }

  localBackupTimer = setTimeout(() => {
    const reasonToWrite = pendingLocalBackupReason ?? reason;
    pendingLocalBackupReason = null;
    localBackupTimer = null;

    localBackupQueue = localBackupQueue
      .then(() => writeLocalBackupArtifacts(reasonToWrite))
      .catch((error: unknown) => {
        console.warn('No se ha podido actualizar la copia local de respaldo SQLite.', error);
      });
  }, LOCAL_LIVE_BACKUP_DEBOUNCE_MS);
}

async function writeLocalBackupArtifacts(reason: string): Promise<void> {
  const currentDatabase = database;
  const currentStatus = getSqliteStatus();
  if (!currentDatabase || !currentStatus.ready || currentStatus.phase !== 'active') {
    return;
  }

  const backupDirectory = getLocalBackupDirectory();
  await mkdir(backupDirectory, { recursive: true });

  let backupLock: DatabaseLockInfo;
  try {
    backupLock = await acquireLock(currentStatus.path);
  } catch (error) {
    if (isSqliteLockContentionError(error)) {
      console.info('Copia local SQLite omitida: base compartida ocupada temporalmente.');
      return;
    }
    throw error;
  }

  const backupLockPath = getLockPath(currentStatus.path);
  const backupLockHeartbeat = startDatabaseLockHeartbeat(backupLockPath, backupLock);

  try {
    const now = new Date().toISOString();
    const backupTimestamp = backupTimestampForFileName();
    const records = readAllPersistedRecords(currentDatabase);
    const payload = {
      createdAt: now,
      sourceDatabasePath: currentStatus.path,
      reason,
      recordCount: records.length,
      records,
    };
    const serializedPayload = JSON.stringify(payload, null, 2);

    const shouldRotateBackup = await shouldCreateRotatedLocalBackup(reason);

    await writeFile(getLocalBackupJsonPath(), serializedPayload, 'utf8');
    if (shouldRotateBackup) {
      await writeFile(getRotatedLocalBackupJsonPath(backupTimestamp), serializedPayload, 'utf8');
    }
    await pruneRotatedLocalBackups('json');

    try {
      await copyFile(currentStatus.path, getLocalBackupDatabasePath());
      if (shouldRotateBackup) {
        await copyFile(currentStatus.path, getRotatedLocalBackupDatabasePath(backupTimestamp));
      }
      await pruneRotatedLocalBackups('sqlite');
    } catch (error) {
      console.warn('No se ha podido copiar la base SQLite activa al respaldo local.', error);
    }

    try {
      await writeSharedSqliteBackup(currentStatus.path, backupTimestamp);
    } catch (error) {
      console.warn('No se ha podido crear la copia SQLite en la carpeta compartida.', error);
    }

    try {
      const dailyBackupPreferences = await readDatabasePreferences();
      await writeDailyLocalBackupFromModule(currentStatus.path, dailyBackupPreferences, getDailyLocalBackupWeekdayName);
    } catch (error) {
      console.warn('No se ha podido crear la copia diaria local SQLite.', error);
    }

    // Copia opcional en carpeta secundaria configurada por el usuario (p.ej. red o USB).
    try {
      const secondaryDir = (await readDatabasePreferences()).secondaryBackupDirectoryPath;
      if (secondaryDir) {
        await mkdir(secondaryDir, { recursive: true });
        await writeFile(
          path.join(secondaryDir, LOCAL_BACKUP_JSON_FILE_NAME),
          serializedPayload,
          'utf8',
        );
        if (shouldRotateBackup) {
          await writeFile(
            path.join(secondaryDir, `traccion-local-backup-${backupTimestamp}.json`),
            serializedPayload,
            'utf8',
          );
        }
        await copyFile(
          currentStatus.path,
          path.join(secondaryDir, LOCAL_BACKUP_DATABASE_FILE_NAME),
        );
        if (shouldRotateBackup) {
          await copyFile(
            currentStatus.path,
            path.join(secondaryDir, `traccion-local-backup-${backupTimestamp}.sqlite`),
          );
        }
      }
    } catch (error) {
      console.warn('No se ha podido crear la copia de respaldo secundaria.', error);
    }
  } finally {
    clearInterval(backupLockHeartbeat);
    await releaseLock(backupLockPath, backupLock).catch((error: unknown) => {
      console.warn('No se ha podido liberar el bloqueo SQLite de respaldo local.', error);
    });
  }
}

async function flushPendingLocalBackup(): Promise<void> {
  const reasonToWrite = pendingLocalBackupReason;

  if (localBackupTimer) {
    clearTimeout(localBackupTimer);
    localBackupTimer = null;
  }

  pendingLocalBackupReason = null;
  await localBackupQueue;

  if (reasonToWrite) {
    await writeLocalBackupArtifacts(reasonToWrite);
  }

  await localBackupQueue;
}

async function writeShutdownLocalBackupArtifacts(): Promise<void> {
  const currentDatabase = database;
  const currentStatus = getSqliteStatus();
  if (!currentDatabase || !currentStatus.ready || currentStatus.phase !== 'active') {
    return;
  }

  const backupDirectory = getLocalShutdownBackupDirectory();
  await mkdir(backupDirectory, { recursive: true });

  let backupLock: DatabaseLockInfo;
  try {
    backupLock = await acquireLock(currentStatus.path);
  } catch (error) {
    if (isSqliteLockContentionError(error)) {
      console.info('Copia local SQLite omitida: base compartida ocupada temporalmente.');
      return;
    }
    throw error;
  }

  const backupLockPath = getLockPath(currentStatus.path);
  const backupLockHeartbeat = startDatabaseLockHeartbeat(backupLockPath, backupLock);

  try {
    const now = new Date().toISOString();
    const backupTimestamp = backupTimestampForFileName();
    const records = readAllPersistedRecords(currentDatabase);
    const payload = {
      createdAt: now,
      sourceDatabasePath: currentStatus.path,
      reason: 'shutdown',
      recordCount: records.length,
      records,
    };
    const serializedPayload = JSON.stringify(payload, null, 2);

    await writeFile(getShutdownLocalBackupJsonPath(backupTimestamp), serializedPayload, 'utf8');
    await pruneShutdownLocalBackups('json');

    try {
      await copyFile(currentStatus.path, getShutdownLocalBackupDatabasePath(backupTimestamp));
      await pruneShutdownLocalBackups('sqlite');
    } catch (error) {
      console.warn('No se ha podido crear la copia local de cierre SQLite.', error);
    }

    try {
      await writeSharedSqliteBackup(currentStatus.path, backupTimestamp);
    } catch (error) {
      console.warn('No se ha podido crear la copia SQLite de cierre en la carpeta compartida.', error);
    }

    try {
      const dailyBackupPreferences = await readDatabasePreferences();
      await writeDailyLocalBackupFromModule(currentStatus.path, dailyBackupPreferences, getDailyLocalBackupWeekdayName);
    } catch (error) {
      console.warn('No se ha podido crear la copia diaria local SQLite de cierre.', error);
    }
  } finally {
    clearInterval(backupLockHeartbeat);
    await releaseLock(backupLockPath, backupLock).catch((error: unknown) => {
      console.warn('No se ha podido liberar el bloqueo SQLite de respaldo de cierre.', error);
    });
  }
}

export async function createShutdownLocalBackup(): Promise<void> {
  await flushPendingLocalBackup();
  await writeShutdownLocalBackupArtifacts();
}

export async function createManualLocalBackup(): Promise<void> {
  // Backup "de cierre de fase" a demanda: ignora el debounce de guardado y
  // siempre fuerza una copia rotada (writeLocalBackupArtifacts ya marca
  // como rotable cualquier reason que no empiece por "save:").
  await flushPendingLocalBackup();
  await writeLocalBackupArtifacts('manual-backup');
}

function updateRefreshMetadata(db: Database, updatedAt: string): void {
  const token = `${updatedAt}:${ownerId}`;
  db.prepare(
    `INSERT INTO app_metadata (key, value, updated_at)
     VALUES ('persisted_records_refresh_token', ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  ).run(token, updatedAt);
}

function readRefreshToken(db: Database): string | null {
  const row = db
    .prepare("SELECT value FROM app_metadata WHERE key = 'persisted_records_refresh_token'")
    .get();
  return isMetadataRow(row) ? row.value : null;
}

function readLastVacuumAt(db: Database): string | null {
  const row = db.prepare(`SELECT value FROM app_metadata WHERE key = '${VACUUM_METADATA_KEY}'`).get();
  return isMetadataRow(row) ? row.value : null;
}

function writeLastVacuumAt(db: Database, timestamp: string): void {
  db.prepare(
    `INSERT INTO app_metadata (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  ).run(VACUUM_METADATA_KEY, timestamp, timestamp);
}

export async function savePersistedRecord(record: PersistedStorageRecord): Promise<DatabaseStatus> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase === 'locked' || databaseWriteBlockedByHeartbeat) {
        return currentStatus;
      }

      assertDatabaseWritesAllowed();

      const now = new Date().toISOString();
      const db = requireDatabase();
      db.transaction(() => {
        db.prepare(
          `INSERT INTO persisted_records (key, value_json, source, created_at, updated_at)
             VALUES (?, ?, 'sqlite-primary', ?, ?)
             ON CONFLICT(key) DO UPDATE SET
               value_json = excluded.value_json,
               source = excluded.source,
               updated_at = excluded.updated_at`,
        ).run(record.key, record.value, now, now);
        updateRefreshMetadata(db, now);
      })();
      enqueueLocalBackup(`save:${record.key}`);

      return currentStatus;
    },
    (nextStatus) => nextStatus,
  );
}

export interface ConditionalPersistedRecordSaveResult {
  ok: boolean;
  status: DatabaseStatus;
  currentUpdatedAt: string | null;
  message: string;
}

export async function savePersistedRecordIfUnchanged(
  record: ConditionalPersistedStorageRecord,
): Promise<ConditionalPersistedRecordSaveResult> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active' || databaseWriteBlockedByHeartbeat) {
        return {
          ok: false,
          status: currentStatus,
          currentUpdatedAt: null,
          message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
        };
      }

      assertDatabaseWritesAllowed();

      const db = requireDatabase();
      const result = db.transaction((): ConditionalPersistedRecordSaveResult => {
        const row = db
          .prepare('SELECT updated_at FROM persisted_records WHERE key = ?')
          .get(record.key);
        const currentUpdatedAt = isUpdatedAtRow(row) ? row.updated_at : null;

        if (currentUpdatedAt !== record.expectedUpdatedAt) {
          return {
            ok: false,
            status: currentStatus,
            currentUpdatedAt,
            message:
              'Los datos compartidos han cambiado mientras guardabas. Recarga antes de continuar para no pisar cambios de otro usuario.',
          };
        }

        const now = new Date().toISOString();

        if (currentUpdatedAt === null) {
          const insertResult = db
            .prepare(
              `INSERT OR IGNORE INTO persisted_records (key, value_json, source, created_at, updated_at)
               VALUES (?, ?, 'sqlite-primary', ?, ?)`,
            )
            .run(record.key, record.value, now, now);

          if (insertResult.changes !== 1) {
            const latest = db
              .prepare('SELECT updated_at FROM persisted_records WHERE key = ?')
              .get(record.key);
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
              message:
                'Los datos compartidos han cambiado mientras guardabas. Recarga antes de continuar para no pisar cambios de otro usuario.',
            };
          }
        } else {
          const updateResult = db
            .prepare(
              `UPDATE persisted_records
               SET value_json = ?, source = 'sqlite-primary', updated_at = ?
               WHERE key = ? AND updated_at = ?`,
            )
            .run(record.value, now, record.key, currentUpdatedAt);

          if (updateResult.changes !== 1) {
            const latest = db
              .prepare('SELECT updated_at FROM persisted_records WHERE key = ?')
              .get(record.key);
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
              message:
                'Los datos compartidos han cambiado mientras guardabas. Recarga antes de continuar para no pisar cambios de otro usuario.',
            };
          }
        }

        updateRefreshMetadata(db, now);

        return {
          ok: true,
          status: currentStatus,
          currentUpdatedAt: now,
          message: 'Guardado confirmado en SQLite compartido.',
        };
      })();

      if (result.ok) {
        enqueueLocalBackup(`save:${record.key}`);
      }

      return result;
    },
    (nextStatus, message) => ({
      ok: false,
      status: nextStatus,
      currentUpdatedAt: null,
      message,
    }),
  );
}

function mapTaskRecordRow(row: TaskRecordRow): SqliteTaskRecord {
  return {
    id: row.id,
    value: row.value_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function readTaskRecords(db: Database, filter: SqliteTaskRecordsFilter = {}): SqliteTaskRecord[] {
  const mode = filter.mode ?? 'all';
  const whereClause =
    mode === 'active'
      ? "WHERE deleted_at IS NULL AND COALESCE(json_extract(value_json, '$.closedAt'), '') = '' AND json_extract(value_json, '$.estado') <> 'cerrada'"
      : mode === 'historical'
        ? "WHERE deleted_at IS NULL AND (COALESCE(json_extract(value_json, '$.closedAt'), '') <> '' OR json_extract(value_json, '$.estado') = 'cerrada')"
        : '';

  return db
    .prepare(`SELECT id, value_json, created_at, updated_at, deleted_at FROM task_records ${whereClause} ORDER BY created_at, id`)
    .all()
    .filter(isTaskRecordRow)
    .map(mapTaskRecordRow);
}

function maybeMigrateTasksFromPersistedRecord(db: Database): void {
  if (tasksMigrationDone) {
    return;
  }

  const taskCountRow = db.prepare('SELECT COUNT(*) AS count FROM task_records').get();
  const taskCount = isCountRow(taskCountRow) ? taskCountRow.count : 0;
  if (taskCount > 0) {
    tasksMigrationDone = true;
    return;
  }

  const legacyRecord = readPersistedRecordByKey(db, 'traccion.v1.tareas.tasks');
  if (!legacyRecord) {
    tasksMigrationDone = true;
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(legacyRecord.value);
  } catch {
    tasksMigrationDone = true;
    return;
  }

  if (!Array.isArray(parsed)) {
    tasksMigrationDone = true;
    return;
  }

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO task_records (id, value_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?)`,
  );

  for (const item of parsed) {
    if (!isJsonObjectWithStringId(item)) {
      continue;
    }

    const createdAt = typeof item.createdAt === 'string' ? item.createdAt : now;
    const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : createdAt;
    const deletedAt = typeof item.deletedAt === 'string' ? item.deletedAt : null;
    insert.run(item.id, JSON.stringify(item), createdAt, updatedAt, deletedAt);
  }

  tasksMigrationDone = true;
}

function readComiteSessionRecords(db: Database): SqliteComiteSessionRecord[] {
  return readActiveJsonRecords(db, 'comite_session_records');
}

function maybeMigrateComiteSessionsFromPersistedRecord(db: Database): void {
  comiteSessionsMigrationDone = maybeMigrateJsonArrayRecordsFromPersistedRecord(db, {
    tableName: 'comite_session_records',
    legacyKey: 'traccion.v1.comite.sessions',
    migrationDone: comiteSessionsMigrationDone,
  });
}

export async function loadComiteSessionRecordsSnapshot(): Promise<SqliteComiteSessionRecordsSnapshot> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active') {
        return { status: currentStatus, records: [] };
      }

      const db = requireDatabase();
      db.transaction(() => maybeMigrateComiteSessionsFromPersistedRecord(db))();
      return { status: currentStatus, records: readComiteSessionRecords(db) };
    },
    (nextStatus) => ({ status: nextStatus, records: [] }),
  );
}

function readParitariaSessionRecords(db: Database): SqliteParitariaSessionRecord[] {
  return readActiveJsonRecords(db, 'paritaria_session_records');
}

function maybeMigrateParitariaSessionsFromPersistedRecord(db: Database): void {
  paritariaSessionsMigrationDone = maybeMigrateJsonArrayRecordsFromPersistedRecord(db, {
    tableName: 'paritaria_session_records',
    legacyKey: 'traccion.v1.paritaria.sessions',
    migrationDone: paritariaSessionsMigrationDone,
  });
}

export async function loadParitariaSessionRecordsSnapshot(): Promise<SqliteParitariaSessionRecordsSnapshot> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active') {
        return { status: currentStatus, records: [] };
      }

      const db = requireDatabase();
      db.transaction(() => maybeMigrateParitariaSessionsFromPersistedRecord(db))();
      return { status: currentStatus, records: readParitariaSessionRecords(db) };
    },
    (nextStatus) => ({ status: nextStatus, records: [] }),
  );
}

function readActaRecords(db: Database): SqliteActaRecord[] {
  return readActiveJsonRecords(db, 'acta_records');
}

function maybeMigrateActasFromPersistedRecord(db: Database): void {
  actasMigrationDone = maybeMigrateJsonArrayRecordsFromPersistedRecord(db, {
    tableName: 'acta_records',
    legacyKey: 'traccion.v1.actas.records',
    migrationDone: actasMigrationDone,
  });
}

export async function loadActaRecordsSnapshot(): Promise<SqliteActaRecordsSnapshot> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active') {
        return { status: currentStatus, records: [] };
      }

      const db = requireDatabase();
      db.transaction(() => maybeMigrateActasFromPersistedRecord(db))();
      return { status: currentStatus, records: readActaRecords(db) };
    },
    (nextStatus) => ({ status: nextStatus, records: [] }),
  );
}

export async function saveComiteSessionRecordIfUnchanged(
  record: ConditionalSqliteComiteSessionRecord,
): Promise<ConditionalSqliteTaskSaveResult> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active' || databaseWriteBlockedByHeartbeat) {
        return {
          ok: false,
          status: currentStatus,
          currentUpdatedAt: null,
          message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
        };
      }

      assertDatabaseWritesAllowed();

      const db = requireDatabase();
      const result = db.transaction((): ConditionalSqliteTaskSaveResult => {
        maybeMigrateComiteSessionsFromPersistedRecord(db);
        const row = db.prepare('SELECT updated_at FROM comite_session_records WHERE id = ?').get(record.id);
        const currentUpdatedAt = isUpdatedAtRow(row) ? row.updated_at : null;

        if (currentUpdatedAt !== record.expectedUpdatedAt) {
          return {
            ok: false,
            status: currentStatus,
            currentUpdatedAt,
            message:
              'La sesión ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
          };
        }

        const now = new Date().toISOString();
        let parsed: unknown;
        try {
          parsed = JSON.parse(record.value);
        } catch {
          parsed = null;
        }
        const deletedAt =
          parsed && typeof parsed === 'object' && typeof (parsed as { deletedAt?: unknown }).deletedAt === 'string'
            ? (parsed as { deletedAt: string }).deletedAt
            : null;
        const createdAt =
          parsed && typeof parsed === 'object' && typeof (parsed as { createdAt?: unknown }).createdAt === 'string'
            ? (parsed as { createdAt: string }).createdAt
            : now;
        const updatedAt =
          parsed && typeof parsed === 'object' && typeof (parsed as { updatedAt?: unknown }).updatedAt === 'string'
            ? (parsed as { updatedAt: string }).updatedAt
            : now;

        if (currentUpdatedAt === null) {
          const insertResult = db
            .prepare(
              `INSERT OR IGNORE INTO comite_session_records (id, value_json, created_at, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(record.id, record.value, createdAt, updatedAt, deletedAt);

          if (insertResult.changes !== 1) {
            const latest = db.prepare('SELECT updated_at FROM comite_session_records WHERE id = ?').get(record.id);
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
              message: 'La sesión ya existe en la base compartida. Recarga antes de continuar.',
            };
          }
        } else {
          const updateResult = db
            .prepare(
              `UPDATE comite_session_records
               SET value_json = ?, updated_at = ?, deleted_at = ?
               WHERE id = ? AND updated_at = ?`,
            )
            .run(record.value, updatedAt, deletedAt, record.id, currentUpdatedAt);

          if (updateResult.changes !== 1) {
            const latest = db.prepare('SELECT updated_at FROM comite_session_records WHERE id = ?').get(record.id);
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
              message:
                'La sesión ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
            };
          }
        }

        updateRefreshMetadata(db, updatedAt);

        return {
          ok: true,
          status: currentStatus,
          currentUpdatedAt: updatedAt,
          message: 'Sesión de comité guardada en SQLite.',
        };
      })();

      if (result.ok) {
        enqueueLocalBackup('save:comite_session_records');
      }

      return result;
    },
    (nextStatus, message) => ({
      ok: false,
      status: nextStatus,
      currentUpdatedAt: null,
      message,
    }),
  );
}

export async function saveParitariaSessionRecordIfUnchanged(
  record: ConditionalSqliteParitariaSessionRecord,
): Promise<ConditionalSqliteTaskSaveResult> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active' || databaseWriteBlockedByHeartbeat) {
        return {
          ok: false,
          status: currentStatus,
          currentUpdatedAt: null,
          message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
        };
      }

      assertDatabaseWritesAllowed();

      const db = requireDatabase();
      const result = db.transaction((): ConditionalSqliteTaskSaveResult => {
        maybeMigrateParitariaSessionsFromPersistedRecord(db);
        const row = db.prepare('SELECT updated_at FROM paritaria_session_records WHERE id = ?').get(record.id);
        const currentUpdatedAt = isUpdatedAtRow(row) ? row.updated_at : null;

        if (currentUpdatedAt !== record.expectedUpdatedAt) {
          return {
            ok: false,
            status: currentStatus,
            currentUpdatedAt,
            message:
              'La sesión ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
          };
        }

        const now = new Date().toISOString();
        let parsed: unknown;
        try {
          parsed = JSON.parse(record.value);
        } catch {
          parsed = null;
        }
        const deletedAt =
          parsed && typeof parsed === 'object' && typeof (parsed as { deletedAt?: unknown }).deletedAt === 'string'
            ? (parsed as { deletedAt: string }).deletedAt
            : null;
        const createdAt =
          parsed && typeof parsed === 'object' && typeof (parsed as { createdAt?: unknown }).createdAt === 'string'
            ? (parsed as { createdAt: string }).createdAt
            : now;
        const updatedAt =
          parsed && typeof parsed === 'object' && typeof (parsed as { updatedAt?: unknown }).updatedAt === 'string'
            ? (parsed as { updatedAt: string }).updatedAt
            : now;

        if (currentUpdatedAt === null) {
          const insertResult = db
            .prepare(
              `INSERT OR IGNORE INTO paritaria_session_records (id, value_json, created_at, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(record.id, record.value, createdAt, updatedAt, deletedAt);

          if (insertResult.changes !== 1) {
            const latest = db.prepare('SELECT updated_at FROM paritaria_session_records WHERE id = ?').get(record.id);
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
              message: 'La sesión ya existe en la base compartida. Recarga antes de continuar.',
            };
          }
        } else {
          const updateResult = db
            .prepare(
              `UPDATE paritaria_session_records
               SET value_json = ?, updated_at = ?, deleted_at = ?
               WHERE id = ? AND updated_at = ?`,
            )
            .run(record.value, updatedAt, deletedAt, record.id, currentUpdatedAt);

          if (updateResult.changes !== 1) {
            const latest = db.prepare('SELECT updated_at FROM paritaria_session_records WHERE id = ?').get(record.id);
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
              message:
                'La sesión ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
            };
          }
        }

        updateRefreshMetadata(db, updatedAt);

        return {
          ok: true,
          status: currentStatus,
          currentUpdatedAt: updatedAt,
          message: 'Sesión de paritaria guardada en SQLite.',
        };
      })();

      if (result.ok) {
        enqueueLocalBackup('save:paritaria_session_records');
      }

      return result;
    },
    (nextStatus, message) => ({
      ok: false,
      status: nextStatus,
      currentUpdatedAt: null,
      message,
    }),
  );
}

function readTeletrabajoRecords(db: Database): SqliteTeletrabajoRecord[] {
  return readActiveJsonRecords(db, 'teletrabajo_solicitud_records');
}

function maybeMigrateTeletrabajoFromPersistedRecord(db: Database): void {
  teletrabajoMigrationDone = maybeMigrateJsonArrayRecordsFromPersistedRecord(db, {
    tableName: 'teletrabajo_solicitud_records',
    legacyKey: 'traccion.v1.teletrabajo.solicitudes',
    migrationDone: teletrabajoMigrationDone,
  });
}

export async function loadTeletrabajoRecordsSnapshot(): Promise<SqliteTeletrabajoRecordsSnapshot> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active') {
        return { status: currentStatus, records: [] };
      }

      const db = requireDatabase();
      db.transaction(() => maybeMigrateTeletrabajoFromPersistedRecord(db))();
      return { status: currentStatus, records: readTeletrabajoRecords(db) };
    },
    (nextStatus) => ({ status: nextStatus, records: [] }),
  );
}

function saveTeletrabajoRecordInTransaction(
  db: Database,
  record: ConditionalSqliteTeletrabajoRecord,
  currentStatus: DatabaseStatus,
): ConditionalSqliteTaskSaveResult {
  const row = db.prepare('SELECT updated_at FROM teletrabajo_solicitud_records WHERE id = ?').get(record.id);
  const currentUpdatedAt = isUpdatedAtRow(row) ? row.updated_at : null;

  if (currentUpdatedAt !== record.expectedUpdatedAt) {
    return {
      ok: false,
      status: currentStatus,
      currentUpdatedAt,
      message: 'La solicitud ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
    };
  }

  const now = new Date().toISOString();
  let parsed: unknown;
  try {
    parsed = JSON.parse(record.value);
  } catch {
    parsed = null;
  }
  const deletedAt =
    parsed && typeof parsed === 'object' && typeof (parsed as { deletedAt?: unknown }).deletedAt === 'string'
      ? (parsed as { deletedAt: string }).deletedAt
      : null;
  const createdAt =
    parsed && typeof parsed === 'object' && typeof (parsed as { createdAt?: unknown }).createdAt === 'string'
      ? (parsed as { createdAt: string }).createdAt
      : now;
  const updatedAt =
    parsed && typeof parsed === 'object' && typeof (parsed as { updatedAt?: unknown }).updatedAt === 'string'
      ? (parsed as { updatedAt: string }).updatedAt
      : now;

  if (currentUpdatedAt === null) {
    const insertResult = db
      .prepare(
        `INSERT OR IGNORE INTO teletrabajo_solicitud_records (id, value_json, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(record.id, record.value, createdAt, updatedAt, deletedAt);

    if (insertResult.changes !== 1) {
      const latest = db.prepare('SELECT updated_at FROM teletrabajo_solicitud_records WHERE id = ?').get(record.id);
      return {
        ok: false,
        status: currentStatus,
        currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
        message: 'La solicitud ya existe en la base compartida. Recarga antes de continuar.',
      };
    }
  } else {
    const updateResult = db
      .prepare(
        `UPDATE teletrabajo_solicitud_records
         SET value_json = ?, updated_at = ?, deleted_at = ?
         WHERE id = ? AND updated_at = ?`,
      )
      .run(record.value, updatedAt, deletedAt, record.id, currentUpdatedAt);

    if (updateResult.changes !== 1) {
      const latest = db.prepare('SELECT updated_at FROM teletrabajo_solicitud_records WHERE id = ?').get(record.id);
      return {
        ok: false,
        status: currentStatus,
        currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
        message: 'La solicitud ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
      };
    }
  }

  updateRefreshMetadata(db, updatedAt);

  return {
    ok: true,
    status: currentStatus,
    currentUpdatedAt: updatedAt,
    message: 'Solicitud de Teletrabajo guardada en SQLite.',
  };
}

class TeletrabajoBatchSaveError extends Error {
  constructor(
    public readonly recordId: string,
    public readonly saveResult: ConditionalSqliteTaskSaveResult,
  ) {
    super(saveResult.message);
  }
}

export async function saveTeletrabajoRecordIfUnchanged(
  record: ConditionalSqliteTeletrabajoRecord,
): Promise<ConditionalSqliteTaskSaveResult> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active' || databaseWriteBlockedByHeartbeat) {
        return {
          ok: false,
          status: currentStatus,
          currentUpdatedAt: null,
          message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
        };
      }

      assertDatabaseWritesAllowed();

      const db = requireDatabase();
      const result = db.transaction((): ConditionalSqliteTaskSaveResult => {
        maybeMigrateTeletrabajoFromPersistedRecord(db);
        return saveTeletrabajoRecordInTransaction(db, record, currentStatus);
      })();

      if (result.ok) {
        enqueueLocalBackup('save:teletrabajo_solicitud_records');
      }

      return result;
    },
    (nextStatus, message) => ({
      ok: false,
      status: nextStatus,
      currentUpdatedAt: null,
      message,
    }),
  );
}

export interface TeletrabajoBatchSaveResult {
  ok: boolean;
  status: DatabaseStatus;
  results: ConditionalSqliteTaskSaveResult[];
  failedRecordId?: string;
  message: string;
}

/**
 * Guarda varias solicitudes de Teletrabajo en una sola transacción SQLite.
 * Atómico: si cualquier registro falla (conflicto de concurrencia u otro
 * motivo), ninguno se aplica. Pensado para la confirmación de importación
 * de histórico, que antes guardaba fila a fila con un await secuencial por
 * registro (N round-trips IPC en vez de 1).
 */
export async function saveTeletrabajoRecordsIfUnchanged(
  records: ConditionalSqliteTeletrabajoRecord[],
): Promise<TeletrabajoBatchSaveResult> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active' || databaseWriteBlockedByHeartbeat) {
        return {
          ok: false,
          status: currentStatus,
          results: [],
          message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
        };
      }

      if (records.length === 0) {
        return { ok: true, status: currentStatus, results: [], message: 'Nada que guardar.' };
      }

      assertDatabaseWritesAllowed();

      const db = requireDatabase();
      try {
        const results = db.transaction((): ConditionalSqliteTaskSaveResult[] => {
          maybeMigrateTeletrabajoFromPersistedRecord(db);
          return records.map((record) => {
            const saveResult = saveTeletrabajoRecordInTransaction(db, record, currentStatus);
            if (!saveResult.ok) {
              throw new TeletrabajoBatchSaveError(record.id, saveResult);
            }
            return saveResult;
          });
        })();

        enqueueLocalBackup('save:teletrabajo_solicitud_records');
        return {
          ok: true,
          status: currentStatus,
          results,
          message: `${records.length} solicitudes de Teletrabajo guardadas en SQLite.`,
        };
      } catch (error) {
        if (error instanceof TeletrabajoBatchSaveError) {
          return {
            ok: false,
            status: currentStatus,
            results: [error.saveResult],
            failedRecordId: error.recordId,
            message: error.saveResult.message,
          };
        }
        throw error;
      }
    },
    (nextStatus, message) => ({
      ok: false,
      status: nextStatus,
      results: [],
      message,
    }),
  );
}

function mapEmployeeRecordRow(row: EmployeeRecordRow): SqliteEmployeeRecord {
  return {
    id: row.id,
    value: row.value_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function isJsonObjectWithEmpleado(value: unknown): value is { empleado: string; deletedAt?: unknown } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { empleado?: unknown };
  return typeof candidate.empleado === 'string' && candidate.empleado.trim().length > 0;
}

function maybeMigrateEmployeesFromPersistedRecord(db: Database): void {
  if (employeesMigrationDone) {
    return;
  }

  const employeeCountRow = db.prepare('SELECT COUNT(*) AS count FROM employee_records').get();
  const employeeCount = isCountRow(employeeCountRow) ? employeeCountRow.count : 0;
  if (employeeCount > 0) {
    employeesMigrationDone = true;
    return;
  }

  const legacyRecord = readPersistedRecordByKey(db, 'traccion.v1.plantilla.employees');
  if (!legacyRecord) {
    employeesMigrationDone = true;
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(legacyRecord.value);
  } catch {
    employeesMigrationDone = true;
    return;
  }

  if (!Array.isArray(parsed)) {
    employeesMigrationDone = true;
    return;
  }

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO employee_records (id, value_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?)`,
  );

  for (const item of parsed) {
    if (!isJsonObjectWithEmpleado(item)) {
      continue;
    }

    const deletedAt = typeof item.deletedAt === 'string' ? item.deletedAt : null;
    insert.run(item.empleado, JSON.stringify(item), now, now, deletedAt);
  }

  employeesMigrationDone = true;
}

function readEmployeeRecords(db: Database): SqliteEmployeeRecord[] {
  return db
    .prepare('SELECT id, value_json, created_at, updated_at, deleted_at FROM employee_records ORDER BY id')
    .all()
    .filter(isEmployeeRecordRow)
    .map(mapEmployeeRecordRow);
}

export async function saveActaRecordIfUnchanged(
  record: ConditionalSqliteActaRecord,
): Promise<ConditionalSqliteTaskSaveResult> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active' || databaseWriteBlockedByHeartbeat) {
        return {
          ok: false,
          status: currentStatus,
          currentUpdatedAt: null,
          message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
        };
      }

      assertDatabaseWritesAllowed();

      const db = requireDatabase();
      const result = db.transaction((): ConditionalSqliteTaskSaveResult => {
        maybeMigrateActasFromPersistedRecord(db);
        const row = db.prepare('SELECT updated_at FROM acta_records WHERE id = ?').get(record.id);
        const currentUpdatedAt = isUpdatedAtRow(row) ? row.updated_at : null;

        if (currentUpdatedAt !== record.expectedUpdatedAt) {
          return {
            ok: false,
            status: currentStatus,
            currentUpdatedAt,
            message: 'El acta ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
          };
        }

        const now = new Date().toISOString();
        let parsed: unknown;
        try {
          parsed = JSON.parse(record.value);
        } catch {
          parsed = null;
        }
        const deletedAt =
          parsed && typeof parsed === 'object' && typeof (parsed as { deletedAt?: unknown }).deletedAt === 'string'
            ? (parsed as { deletedAt: string }).deletedAt
            : null;
        const createdAt =
          parsed && typeof parsed === 'object' && typeof (parsed as { createdAt?: unknown }).createdAt === 'string'
            ? (parsed as { createdAt: string }).createdAt
            : now;
        const updatedAt =
          parsed && typeof parsed === 'object' && typeof (parsed as { updatedAt?: unknown }).updatedAt === 'string'
            ? (parsed as { updatedAt: string }).updatedAt
            : now;

        if (currentUpdatedAt === null) {
          const insertResult = db
            .prepare(
              `INSERT OR IGNORE INTO acta_records (id, value_json, created_at, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(record.id, record.value, createdAt, updatedAt, deletedAt);

          if (insertResult.changes !== 1) {
            const latest = db.prepare('SELECT updated_at FROM acta_records WHERE id = ?').get(record.id);
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
              message: 'El acta ya existe en la base compartida. Recarga antes de continuar.',
            };
          }
        } else {
          const updateResult = db
            .prepare(
              `UPDATE acta_records
               SET value_json = ?, updated_at = ?, deleted_at = ?
               WHERE id = ? AND updated_at = ?`,
            )
            .run(record.value, updatedAt, deletedAt, record.id, currentUpdatedAt);

          if (updateResult.changes !== 1) {
            const latest = db.prepare('SELECT updated_at FROM acta_records WHERE id = ?').get(record.id);
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
              message: 'El acta ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
            };
          }
        }

        updateRefreshMetadata(db, updatedAt);

        return {
          ok: true,
          status: currentStatus,
          currentUpdatedAt: updatedAt,
          message: 'Acta guardada en SQLite.',
        };
      })();

      if (result.ok) {
        enqueueLocalBackup('save:acta_records');
      }

      return result;
    },
    (nextStatus, message) => ({
      ok: false,
      status: nextStatus,
      currentUpdatedAt: null,
      message,
    }),
  );
}

export async function loadEmployeeRecordsSnapshot(): Promise<SqliteEmployeeRecordsSnapshot> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active') {
        return { status: currentStatus, records: [] };
      }

      const db = requireDatabase();
      db.transaction(() => maybeMigrateEmployeesFromPersistedRecord(db))();
      return { status: currentStatus, records: readEmployeeRecords(db) };
    },
    (nextStatus) => ({ status: nextStatus, records: [] }),
  );
}

export async function saveEmployeeRecordIfUnchanged(
  record: ConditionalSqliteEmployeeRecord,
): Promise<ConditionalSqliteEmployeeSaveResult> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active' || databaseWriteBlockedByHeartbeat) {
        return {
          ok: false,
          status: currentStatus,
          currentValue: null,
          message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
        };
      }

      assertDatabaseWritesAllowed();

      const db = requireDatabase();
      const result = db.transaction((): ConditionalSqliteEmployeeSaveResult => {
        maybeMigrateEmployeesFromPersistedRecord(db);
        const row = db.prepare('SELECT value_json FROM employee_records WHERE id = ?').get(record.id);
        const currentValue = row && typeof row === 'object' && typeof (row as { value_json?: unknown }).value_json === 'string'
          ? (row as { value_json: string }).value_json
          : null;

        if (currentValue !== record.expectedValue) {
          return {
            ok: false,
            status: currentStatus,
            currentValue,
            message:
              'Esta persona ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
          };
        }

        const now = new Date().toISOString();
        let parsed: unknown;
        try {
          parsed = JSON.parse(record.value);
        } catch {
          parsed = null;
        }
        const deletedAt =
          parsed && typeof parsed === 'object' && typeof (parsed as { deletedAt?: unknown }).deletedAt === 'string'
            ? (parsed as { deletedAt: string }).deletedAt
            : null;

        if (currentValue === null) {
          const insertResult = db
            .prepare(
              `INSERT OR IGNORE INTO employee_records (id, value_json, created_at, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(record.id, record.value, now, now, deletedAt);

          if (insertResult.changes !== 1) {
            const latest = db.prepare('SELECT value_json FROM employee_records WHERE id = ?').get(record.id);
            return {
              ok: false,
              status: currentStatus,
              currentValue: latest && typeof latest === 'object' && typeof (latest as { value_json?: unknown }).value_json === 'string'
                ? (latest as { value_json: string }).value_json
                : null,
              message: 'La persona ya existe en la base compartida. Recarga antes de continuar.',
            };
          }
        } else {
          const updateResult = db
            .prepare(
              `UPDATE employee_records
               SET value_json = ?, updated_at = ?, deleted_at = ?
               WHERE id = ? AND value_json = ?`,
            )
            .run(record.value, now, deletedAt, record.id, currentValue);

          if (updateResult.changes !== 1) {
            const latest = db.prepare('SELECT value_json FROM employee_records WHERE id = ?').get(record.id);
            return {
              ok: false,
              status: currentStatus,
              currentValue: latest && typeof latest === 'object' && typeof (latest as { value_json?: unknown }).value_json === 'string'
                ? (latest as { value_json: string }).value_json
                : null,
              message:
                'Esta persona ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
            };
          }
        }

        updateRefreshMetadata(db, now);

        return {
          ok: true,
          status: currentStatus,
          currentValue: record.value,
          message: 'Persona guardada en SQLite.',
        };
      })();

      if (result.ok) {
        enqueueLocalBackup('save:employee_records');
      }

      return result;
    },
    (nextStatus, message) => ({
      ok: false,
      status: nextStatus,
      currentValue: null,
      message,
    }),
  );
}

export async function saveEmployeeRecordsIfUnchanged(
  records: ConditionalSqliteEmployeeRecord[],
): Promise<ConditionalSqliteEmployeeBatchSaveResult> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active' || databaseWriteBlockedByHeartbeat) {
        return {
          ok: false,
          status: currentStatus,
          currentValue: null,
          message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
          saved: 0,
        };
      }

      assertDatabaseWritesAllowed();

      const db = requireDatabase();
      const result = db.transaction((): ConditionalSqliteEmployeeBatchSaveResult => {
        maybeMigrateEmployeesFromPersistedRecord(db);
        const selectCurrent = db.prepare('SELECT value_json FROM employee_records WHERE id = ?');
        const insertRecord = db.prepare(
          `INSERT OR IGNORE INTO employee_records (id, value_json, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?)`,
        );
        const updateRecord = db.prepare(
          `UPDATE employee_records
           SET value_json = ?, updated_at = ?, deleted_at = ?
           WHERE id = ? AND value_json = ?`,
        );

        const now = new Date().toISOString();
        let saved = 0;

        for (const record of records) {
          const row = selectCurrent.get(record.id);
          const currentValue = row && typeof row === 'object' && typeof (row as { value_json?: unknown }).value_json === 'string'
            ? (row as { value_json: string }).value_json
            : null;

          if (currentValue !== record.expectedValue) {
            return {
              ok: false,
              status: currentStatus,
              currentValue,
              message:
                'La plantilla ha sido modificada por otro usuario durante la importación. Recarga antes de volver a importar.',
              saved: 0,
            };
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(record.value);
          } catch {
            parsed = null;
          }
          const deletedAt =
            parsed && typeof parsed === 'object' && typeof (parsed as { deletedAt?: unknown }).deletedAt === 'string'
              ? (parsed as { deletedAt: string }).deletedAt
              : null;

          if (currentValue === null) {
            const insertResult = insertRecord.run(record.id, record.value, now, now, deletedAt);
            if (insertResult.changes !== 1) {
              const latest = selectCurrent.get(record.id);
              return {
                ok: false,
                status: currentStatus,
                currentValue: latest && typeof latest === 'object' && typeof (latest as { value_json?: unknown }).value_json === 'string'
                  ? (latest as { value_json: string }).value_json
                  : null,
                message: 'La persona ya existe en la base compartida. Recarga antes de volver a importar.',
                saved: 0,
              };
            }
          } else {
            const updateResult = updateRecord.run(record.value, now, deletedAt, record.id, currentValue);
            if (updateResult.changes !== 1) {
              const latest = selectCurrent.get(record.id);
              return {
                ok: false,
                status: currentStatus,
                currentValue: latest && typeof latest === 'object' && typeof (latest as { value_json?: unknown }).value_json === 'string'
                  ? (latest as { value_json: string }).value_json
                  : null,
                message:
                  'La plantilla ha sido modificada por otro usuario durante la importación. Recarga antes de volver a importar.',
                saved: 0,
              };
            }
          }

          saved += 1;
        }

        updateRefreshMetadata(db, now);

        return {
          ok: true,
          status: currentStatus,
          currentValue: null,
          message: `${saved} personas importadas en SQLite.`,
          saved,
        };
      })();

      if (result.ok && result.saved > 0) {
        enqueueLocalBackup('batch-save:employee_records');
      }

      return result;
    },
    (nextStatus, message) => ({
      ok: false,
      status: nextStatus,
      currentValue: null,
      message,
      saved: 0,
    }),
  );
}

export async function loadTaskRecordsSnapshot(filter: SqliteTaskRecordsFilter = {}): Promise<SqliteTaskRecordsSnapshot> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active') {
        return { status: currentStatus, records: [] };
      }

      const db = requireDatabase();
      db.transaction(() => maybeMigrateTasksFromPersistedRecord(db))();
      return { status: currentStatus, records: readTaskRecords(db, filter) };
    },
    (nextStatus) => ({ status: nextStatus, records: [] }),
  );
}

export async function saveTaskRecordIfUnchanged(
  record: ConditionalSqliteTaskRecord,
): Promise<ConditionalSqliteTaskSaveResult> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active' || databaseWriteBlockedByHeartbeat) {
        return {
          ok: false,
          status: currentStatus,
          currentUpdatedAt: null,
          message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
        };
      }

      assertDatabaseWritesAllowed();

      const db = requireDatabase();
      const result = db.transaction((): ConditionalSqliteTaskSaveResult => {
        maybeMigrateTasksFromPersistedRecord(db);
        const row = db.prepare('SELECT updated_at FROM task_records WHERE id = ?').get(record.id);
        const currentUpdatedAt = isUpdatedAtRow(row) ? row.updated_at : null;

        if (currentUpdatedAt !== record.expectedUpdatedAt) {
          return {
            ok: false,
            status: currentStatus,
            currentUpdatedAt,
            message:
              'La tarea ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
          };
        }

        const now = new Date().toISOString();
        let parsed: unknown;
        try {
          parsed = JSON.parse(record.value);
        } catch {
          parsed = null;
        }
        const deletedAt =
          parsed && typeof parsed === 'object' && typeof (parsed as { deletedAt?: unknown }).deletedAt === 'string'
            ? (parsed as { deletedAt: string }).deletedAt
            : null;
        const createdAt =
          parsed && typeof parsed === 'object' && typeof (parsed as { createdAt?: unknown }).createdAt === 'string'
            ? (parsed as { createdAt: string }).createdAt
            : now;
        const updatedAt =
          parsed && typeof parsed === 'object' && typeof (parsed as { updatedAt?: unknown }).updatedAt === 'string'
            ? (parsed as { updatedAt: string }).updatedAt
            : now;

        if (currentUpdatedAt === null) {
          const insertResult = db
            .prepare(
              `INSERT OR IGNORE INTO task_records (id, value_json, created_at, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(record.id, record.value, createdAt, updatedAt, deletedAt);

          if (insertResult.changes !== 1) {
            const latest = db.prepare('SELECT updated_at FROM task_records WHERE id = ?').get(record.id);
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
              message:
                'La tarea ya existe en la base compartida. Recarga antes de continuar.',
            };
          }
        } else {
          const updateResult = db
            .prepare(
              `UPDATE task_records
               SET value_json = ?, updated_at = ?, deleted_at = ?
               WHERE id = ? AND updated_at = ?`,
            )
            .run(record.value, updatedAt, deletedAt, record.id, currentUpdatedAt);

          if (updateResult.changes !== 1) {
            const latest = db.prepare('SELECT updated_at FROM task_records WHERE id = ?').get(record.id);
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
              message:
                'La tarea ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
            };
          }
        }

        updateRefreshMetadata(db, updatedAt);

        return {
          ok: true,
          status: currentStatus,
          currentUpdatedAt: updatedAt,
          message: 'Tarea guardada en SQLite.',
        };
      })();

      if (result.ok) {
        enqueueLocalBackup('save:task_records');
      }

      return result;
    },
    (nextStatus, message) => ({
      ok: false,
      status: nextStatus,
      currentUpdatedAt: null,
      message,
    }),
  );
}

const DIRECT_STORE_UPDATED_AT_TABLES: Record<string, string> = {
  plantilla: 'employee_records',
  teletrabajo: 'teletrabajo_solicitud_records',
  actas: 'acta_records',
  'comite-sesiones': 'comite_session_records',
  'paritaria-sesiones': 'paritaria_session_records',
  tareas: 'task_records',
  sorteos: 'sorteos_draw_records',
};

function getJsonRecordTableUpdatedAt(db: Database, tableName: string): string | null {
  const row = db.prepare(`SELECT MAX(updated_at) AS updated_at FROM ${tableName}`).get();
  return isUpdatedAtRow(row) ? row.updated_at : null;
}

function getDirectStoreUpdatedAtSnapshot(db: Database): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(DIRECT_STORE_UPDATED_AT_TABLES).map(([storeId, tableName]) => [
      storeId,
      getJsonRecordTableUpdatedAt(db, tableName),
    ]),
  );
}

function getTaskRecordsUpdatedAt(db: Database): string | null {
  const row = db.prepare('SELECT MAX(updated_at) AS updated_at FROM task_records').get();
  return isUpdatedAtRow(row) ? row.updated_at : null;
}

export async function migrateLocalStorageSnapshot(payload: LocalStorageBackupPayload): Promise<DatabaseStatus> {
  const currentStatus = getSqliteStatus();
  if (!currentStatus.ready || currentStatus.phase === 'locked' || databaseWriteBlockedByHeartbeat) {
    return currentStatus;
  }

  assertDatabaseWritesAllowed();
  return withDatabaseOperationLock(currentStatus.path, async () => {
    const db = requireDatabase();
    const now = new Date().toISOString();
    const records = payload.records.filter(
      (record): record is PersistedStorageRecord =>
        typeof record.key === 'string' && typeof record.value === 'string',
    );

    const migrateSnapshotTransaction = db.transaction(() => {
      db.prepare('INSERT INTO local_storage_backups (created_at, payload_json) VALUES (?, ?)')
        .run(now, JSON.stringify({ records }));
      pruneLocalStorageBackups(db);

      const upsert = db.prepare(
        `INSERT INTO persisted_records (key, value_json, source, created_at, updated_at)
         VALUES (?, ?, 'sqlite-primary', ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           source = excluded.source,
           updated_at = excluded.updated_at`,
      );

      for (const record of records) {
        upsert.run(record.key, record.value, now, now);
      }

      if (records.length > 0) {
        updateRefreshMetadata(db, now);
      }
    });

    migrateSnapshotTransaction();

    if (records.length > 0) {
      enqueueLocalBackup('migrate-local-storage-snapshot');
    }

    return currentStatus;
  });
}

export async function createLocalStorageBackup(payload: LocalStorageBackupPayload): Promise<DatabaseStatus> {
  return safeDatabaseOperation(
    () => {
      assertDatabaseWritesAllowed();
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase === 'locked') {
        return currentStatus;
      }

      const records = payload.records.filter(
        (record): record is PersistedStorageRecord =>
          typeof record.key === 'string' && typeof record.value === 'string',
      );
      const db = requireDatabase();
      const createBackupTransaction = db.transaction(() => {
        db.prepare('INSERT INTO local_storage_backups (created_at, payload_json) VALUES (?, ?)')
          .run(new Date().toISOString(), JSON.stringify({ records }));
        pruneLocalStorageBackups(db);
      });
      createBackupTransaction();
      enqueueLocalBackup('local-storage-backup');

      return currentStatus;
    },
    (nextStatus) => nextStatus,
  );
}

export async function listLocalBackups(): Promise<LocalBackupEntry[]> {
  await pruneRotatedLocalBackups('json');
  await pruneRotatedLocalBackups('sqlite');
  await pruneShutdownLocalBackups('json');
  await pruneShutdownLocalBackups('sqlite');

  const readBackupEntries = async (
    backupDirectory: string,
    fileNamePredicate: (fileName: string) => boolean,
    idPrefix = '',
  ): Promise<LocalBackupEntry[]> => {
    const entries = await readdir(backupDirectory).catch(() => []);
    const backups = await Promise.all(
      entries
        .filter(fileNamePredicate)
        .map(async (fileName): Promise<LocalBackupEntry | null> => {
          const kind = localBackupKindFromFileName(fileName);
          if (!kind) {
            return null;
          }

          const filePath = path.join(backupDirectory, fileName);
          const fileStat = await stat(filePath).catch(() => null);
          if (!fileStat?.isFile()) {
            return null;
          }

          return {
            id: `${idPrefix}${fileName}`,
            fileName,
            kind,
            path: filePath,
            sizeBytes: fileStat.size,
            createdAt: fileStat.mtime.toISOString(),
            isLiveCopy:
              !idPrefix &&
              (fileName === LOCAL_BACKUP_DATABASE_FILE_NAME || fileName === LOCAL_BACKUP_JSON_FILE_NAME),
          };
        }),
    );

    return backups.filter((entry): entry is LocalBackupEntry => Boolean(entry));
  };

  const [localBackups, shutdownBackups] = await Promise.all([
    readBackupEntries(getLocalBackupDirectory(), isLocalBackupFileName),
    readBackupEntries(getLocalShutdownBackupDirectory(), isShutdownBackupFileName, `${LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME}/`),
  ]);

  return [...localBackups, ...shutdownBackups]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function parseLocalBackupJson(raw: string): PersistedStorageRecord[] {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    return [];
  }

  const records = (parsed as Partial<LocalStorageBackupPayload>).records;
  if (!Array.isArray(records)) {
    return [];
  }

  return records.filter(
    (record): record is PersistedStorageRecord =>
      Boolean(record) &&
      typeof (record as Partial<PersistedStorageRecord>).key === 'string' &&
      typeof (record as Partial<PersistedStorageRecord>).value === 'string',
  );
}

function resolveLocalBackupReference(fileName: string): { safeFileName: string; backupPath: string } | null {
  return resolveLocalBackupReferenceFromModule(
    fileName,
    getLocalBackupDirectory(),
    getLocalShutdownBackupDirectory(),
  );
}

export async function restoreLocalBackup(fileName: string): Promise<RestoreLocalBackupResult> {
  const currentStatus = getSqliteStatus();
  const backupReference = resolveLocalBackupReference(fileName);

  if (!backupReference) {
    return { ok: false, status: currentStatus, message: 'Copia de respaldo no válida.' };
  }

  const { safeFileName, backupPath } = backupReference;
  const kind = localBackupKindFromFileName(safeFileName);
  if (!kind) {
    return { ok: false, status: currentStatus, message: 'Copia de respaldo no válida.' };
  }

  const backupStat = await stat(backupPath).catch(() => null);
  if (!backupStat?.isFile()) {
    return { ok: false, status: currentStatus, message: 'La copia de respaldo no existe.' };
  }

  if (kind === 'json') {
    const records = parseLocalBackupJson(await readFile(backupPath, 'utf8'));
    if (records.length === 0) {
      return { ok: false, status: currentStatus, message: 'El respaldo JSON no contiene registros recuperables.' };
    }

    if (currentStatus.ready && currentStatus.phase === 'active') {
      enqueueLocalBackup(`pre-restore:${safeFileName}`);
    }

    const nextStatus = await migrateLocalStorageSnapshot({ records });
    return {
      ok: nextStatus.ready && nextStatus.phase === 'active',
      status: nextStatus,
      message:
        nextStatus.ready && nextStatus.phase === 'active'
          ? 'Copia JSON restaurada. Reinicia o recarga la app para aplicar la caché recuperada.'
          : (nextStatus.message ?? 'No se ha podido restaurar el respaldo JSON.'),
    };
  }

  const configuredDirectory = await getConfiguredDatabaseDirectory();
  const targetDatabasePath = getDatabasePathForDirectory(configuredDirectory.directoryPath);

  try {
    await mkdir(path.dirname(targetDatabasePath), { recursive: true });

    await withDatabaseOperationLock(targetDatabasePath, async () => {
      if (currentStatus.ready) {
        await backupExistingDatabase(currentStatus.path);
      } else {
        await copyFile(targetDatabasePath, `${targetDatabasePath}.backup-${backupTimestampForFileName()}`).catch(
          () => undefined,
        );
      }

      await closeDatabaseAndReleaseLock();
      await unlink(`${targetDatabasePath}-wal`).catch(() => undefined);
      await unlink(`${targetDatabasePath}-shm`).catch(() => undefined);
      await copyFile(backupPath, targetDatabasePath);
    });

    const nextStatus = await activateDatabase(
      configuredDirectory.directoryPath,
      configuredDirectory.isDefaultPath,
      null,
    );
    enqueueLocalBackup(`restore:${safeFileName}`);

    return {
      ok: nextStatus.ready && nextStatus.phase === 'active',
      status: nextStatus,
      message: 'Copia SQLite restaurada. Reinicia o recarga la app para aplicar los datos recuperados.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se ha podido restaurar el respaldo SQLite.';
    return { ok: false, status: getSqliteStatus(), message };
  }
}

export async function getPersistedRecordSnapshot(key: string): Promise<PersistedRecordSnapshot> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase === 'locked') {
        return { status: currentStatus, record: null };
      }

      const db = requireDatabase();
      return { status: currentStatus, record: readPersistedRecordByKey(db, key) };
    },
    (nextStatus) => ({ status: nextStatus, record: null }),
  );
}

export async function loadPersistedRecordsSnapshot(): Promise<PersistedRecordsSnapshot> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase === 'locked') {
        return {
          status: currentStatus,
          records: [],
          refreshToken: null,
          latestUpdatedAt: null,
          taskRecordsUpdatedAt: null,
          sorteosDrawsUpdatedAt: null,
          sorteosExclusionsUpdatedAt: null,
          directStoreUpdatedAt: {},
        };
      }

      const db = requireDatabase();
      const startedAt = Date.now();
      const records = readAllPersistedRecords(db);
      const latestUpdatedAt = records.reduce<string | null>((latest, record) => {
        if (!latest) {
          return record.updatedAt;
        }

        return Date.parse(record.updatedAt) > Date.parse(latest) ? record.updatedAt : latest;
      }, null);

      logSqliteMetric('loadPersistedRecordsSnapshot', {
        records: records.length,
        elapsedMs: Date.now() - startedAt,
        largestKeys: largestPersistedRecordSizes(records),
      });

      return {
        status: currentStatus,
        records,
        refreshToken: readRefreshToken(db),
        latestUpdatedAt,
        taskRecordsUpdatedAt: getTaskRecordsUpdatedAt(db),
        sorteosDrawsUpdatedAt: getSorteosCollectionUpdatedAt(db, 'sorteos_draw_records'),
        sorteosExclusionsUpdatedAt: getSorteosCollectionUpdatedAt(db, 'sorteos_exclusion_records'),
        directStoreUpdatedAt: getDirectStoreUpdatedAtSnapshot(db),
      };
    },
    (nextStatus) => ({
      status: nextStatus,
      records: [],
      refreshToken: null,
      latestUpdatedAt: null,
      taskRecordsUpdatedAt: null,
      sorteosDrawsUpdatedAt: null,
      sorteosExclusionsUpdatedAt: null,
      directStoreUpdatedAt: {},
    }),
  );
}

export async function getPersistedRecordsTokenSnapshot(): Promise<PersistedRecordsTokenSnapshot> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase === 'locked') {
        return {
          status: currentStatus,
          refreshToken: null,
          latestUpdatedAt: null,
          taskRecordsUpdatedAt: null,
          sorteosDrawsUpdatedAt: null,
          sorteosExclusionsUpdatedAt: null,
          directStoreUpdatedAt: {},
        };
      }

      const db = requireDatabase();
      const latestRow = db
        .prepare('SELECT updated_at FROM persisted_records ORDER BY updated_at DESC LIMIT 1')
        .get();
      const latestUpdatedAt =
        latestRow &&
        typeof latestRow === 'object' &&
        typeof (latestRow as { updated_at?: unknown }).updated_at === 'string'
          ? (latestRow as { updated_at: string }).updated_at
          : null;

      return {
        status: currentStatus,
        refreshToken: readRefreshToken(db),
        latestUpdatedAt,
        taskRecordsUpdatedAt: getTaskRecordsUpdatedAt(db),
        sorteosDrawsUpdatedAt: getSorteosCollectionUpdatedAt(db, 'sorteos_draw_records'),
        sorteosExclusionsUpdatedAt: getSorteosCollectionUpdatedAt(db, 'sorteos_exclusion_records'),
        directStoreUpdatedAt: getDirectStoreUpdatedAtSnapshot(db),
      };
    },
    (nextStatus) => ({
      status: nextStatus,
      refreshToken: null,
      latestUpdatedAt: null,
      taskRecordsUpdatedAt: null,
      sorteosDrawsUpdatedAt: null,
      sorteosExclusionsUpdatedAt: null,
      directStoreUpdatedAt: {},
    }),
  );
}

type JsonRecordSaveResult = SimpleJsonSaveResult;

function createJsonModuleRepository(
  tableName: string,
  legacyKey: string,
  moduleLabel: string,
  getMigrationDone: () => boolean,
  setMigrationDone: (value: boolean) => void,
) {
  return createSimpleJsonModuleRepository(
    {
      tableName,
      legacyKey,
      moduleLabel,
      getMigrationDone,
      setMigrationDone,
    },
    {
      safeDatabaseOperation,
      getSqliteStatus,
      requireDatabase,
      isUpdatedAtRow,
      updateRefreshMetadata,
      enqueueLocalBackup,
      assertDatabaseWritesAllowed,
      isDatabaseWriteBlockedByHeartbeat,
    },
  );
}

const sorteosModule = createSorteosRepository({
  safeDatabaseOperation,
  getSqliteStatus,
  requireDatabase,
  readPersistedRecordByKey,
  isJsonObjectWithStringId,
  isCountRow,
  updateRefreshMetadata,
  enqueueLocalBackup,
  assertDatabaseWritesAllowed,
  isDatabaseWriteBlockedByHeartbeat,
});
const { loadSorteosRecordsSnapshot, saveSorteosSnapshotIfUnchanged } = sorteosModule;
export { loadSorteosRecordsSnapshot, saveSorteosSnapshotIfUnchanged };

const vinculogramaModule = createVinculogramaRepository(createJsonModuleRepository);
const { loadVinculogramaRecordsSnapshot, saveVinculogramaRecordIfUnchanged } = vinculogramaModule;
export { loadVinculogramaRecordsSnapshot, saveVinculogramaRecordIfUnchanged };

const licenciaSinSueldoModule = createLicenciaSinSueldoRepository(createJsonModuleRepository);
const { loadLicenciaSinSueldoRecordsSnapshot, saveLicenciaSinSueldoRecordIfUnchanged } = licenciaSinSueldoModule;
export { loadLicenciaSinSueldoRecordsSnapshot, saveLicenciaSinSueldoRecordIfUnchanged };

const criteriosRrllModule = createCriteriosRrllRepository(createJsonModuleRepository);
const {
  loadCriteriosRrllRecordsSnapshot,
  saveCriteriosRrllRecordIfUnchanged,
  saveCriteriosRrllRecordsIfUnchanged,
} = criteriosRrllModule;
export {
  loadCriteriosRrllRecordsSnapshot,
  saveCriteriosRrllRecordIfUnchanged,
  saveCriteriosRrllRecordsIfUnchanged,
};

const actaTypesModule = createActaTypesRepository(createJsonModuleRepository);
const { loadActaTypeRecordsSnapshot, saveActaTypeRecordIfUnchanged, saveActaTypeRecordsIfUnchanged } =
  actaTypesModule;
export { loadActaTypeRecordsSnapshot, saveActaTypeRecordIfUnchanged, saveActaTypeRecordsIfUnchanged };

const ticketRestauranteCalendarsModule = createTicketRestauranteCalendarsRepository(createJsonModuleRepository);
const {
  loadTicketRestauranteCalendarRecordsSnapshot,
  saveTicketRestauranteCalendarRecordIfUnchanged,
  saveTicketRestauranteCalendarRecordsIfUnchanged,
} = ticketRestauranteCalendarsModule;
export {
  loadTicketRestauranteCalendarRecordsSnapshot,
  saveTicketRestauranteCalendarRecordIfUnchanged,
  saveTicketRestauranteCalendarRecordsIfUnchanged,
};

const ticketRestaurantePeopleModule = createTicketRestaurantePeopleRepository(createJsonModuleRepository);
const {
  loadTicketRestaurantePersonRecordsSnapshot,
  saveTicketRestaurantePersonRecordIfUnchanged,
  saveTicketRestaurantePersonRecordsIfUnchanged,
} = ticketRestaurantePeopleModule;
export {
  loadTicketRestaurantePersonRecordsSnapshot,
  saveTicketRestaurantePersonRecordIfUnchanged,
  saveTicketRestaurantePersonRecordsIfUnchanged,
};

const ticketRestauranteAbsencesModule = createTicketRestauranteAbsencesRepository(createJsonModuleRepository);
const {
  loadTicketRestauranteAbsenceRecordsSnapshot,
  saveTicketRestauranteAbsenceRecordIfUnchanged,
  saveTicketRestauranteAbsenceRecordsIfUnchanged,
} = ticketRestauranteAbsencesModule;
export {
  loadTicketRestauranteAbsenceRecordsSnapshot,
  saveTicketRestauranteAbsenceRecordIfUnchanged,
  saveTicketRestauranteAbsenceRecordsIfUnchanged,
};

const ticketRestauranteConfigModule = createTicketRestauranteConfigRepository(createJsonModuleRepository);
const {
  loadTicketRestauranteConfigRecordsSnapshot,
  saveTicketRestauranteConfigRecordIfUnchanged,
} = ticketRestauranteConfigModule;
export { loadTicketRestauranteConfigRecordsSnapshot, saveTicketRestauranteConfigRecordIfUnchanged };

const ticketRestauranteManutencionesModule = createTicketRestauranteManutencionesRepository(
  createJsonModuleRepository,
);
const {
  loadTicketRestauranteManutencionRecordsSnapshot,
  saveTicketRestauranteManutencionRecordIfUnchanged,
  saveTicketRestauranteManutencionRecordsIfUnchanged,
} = ticketRestauranteManutencionesModule;
export {
  loadTicketRestauranteManutencionRecordsSnapshot,
  saveTicketRestauranteManutencionRecordIfUnchanged,
  saveTicketRestauranteManutencionRecordsIfUnchanged,
};

const especialesRecipientModule = createEspecialesRecipientRepository(createJsonModuleRepository);
const {
  loadEspecialesRecipientRecordsSnapshot,
  saveEspecialesRecipientRecordIfUnchanged,
} = especialesRecipientModule;
export { loadEspecialesRecipientRecordsSnapshot, saveEspecialesRecipientRecordIfUnchanged };

const teletrabajoPuestosModule = createTeletrabajoPuestosRepository(createJsonModuleRepository);
const {
  loadTeletrabajoPuestoRecordsSnapshot,
  saveTeletrabajoPuestoRecordIfUnchanged,
} = teletrabajoPuestosModule;
export { loadTeletrabajoPuestoRecordsSnapshot, saveTeletrabajoPuestoRecordIfUnchanged };

const teletrabajoGruposCoberturaModule = createTeletrabajoGruposCoberturaRepository(createJsonModuleRepository);
const {
  loadTeletrabajoGrupoCoberturaRecordsSnapshot,
  saveTeletrabajoGrupoCoberturaRecordIfUnchanged,
} = teletrabajoGruposCoberturaModule;
export { loadTeletrabajoGrupoCoberturaRecordsSnapshot, saveTeletrabajoGrupoCoberturaRecordIfUnchanged };

const jobPositionTranslationsModule = createJobPositionTranslationsRepository(createJsonModuleRepository);
const {
  loadJobPositionTranslationRecordsSnapshot,
  saveJobPositionTranslationRecordIfUnchanged,
} = jobPositionTranslationsModule;
export { loadJobPositionTranslationRecordsSnapshot, saveJobPositionTranslationRecordIfUnchanged };

const presupuestosModule = createPresupuestosRepository({
  createJsonModuleRepository,
  getSqliteStatus: () => getSqliteStatus(),
  isDatabaseWriteBlockedByHeartbeat,
  assertDatabaseWritesAllowed,
  requireDatabase,
  updateRefreshMetadata,
  enqueueLocalBackup,
  safeDatabaseOperation,
});
const { loadPresupuestosRecordsSnapshot, savePresupuestosSnapshotIfUnchanged } = presupuestosModule;
export { loadPresupuestosRecordsSnapshot, savePresupuestosSnapshotIfUnchanged };

function maybeMigrateConfiguracionFromPersistedRecord(db: Database): void {
  if (configuracionMigrationDone) {
    return;
  }

  const row = db.prepare('SELECT value_json, updated_at FROM persisted_records WHERE key = ?').get('traccion.v1.configuracion');
  if (!isConfiguracionStateRow(row)) {
    configuracionMigrationDone = true;
    return;
  }

  const now = row.updated_at || new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO configuracion_state (id, value_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, NULL)`,
  ).run(CONFIGURACION_STATE_ID, row.value_json, now, now);
  configuracionMigrationDone = true;
}

export async function loadConfiguracionSnapshot(): Promise<{
  status: DatabaseStatus;
  value: string | null;
  updatedAt: string | null;
}> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active') {
        return { status: currentStatus, value: null, updatedAt: null };
      }

      const db = requireDatabase();
      db.transaction(() => maybeMigrateConfiguracionFromPersistedRecord(db))();
      const row = db.prepare('SELECT value_json, updated_at FROM configuracion_state WHERE id = ? AND deleted_at IS NULL').get(CONFIGURACION_STATE_ID);
      if (!isConfiguracionStateRow(row)) {
        return { status: currentStatus, value: null, updatedAt: null };
      }
      return { status: currentStatus, value: row.value_json, updatedAt: row.updated_at };
    },
    (nextStatus) => ({ status: nextStatus, value: null, updatedAt: null }),
  );
}

export async function saveConfiguracionIfUnchanged(record: {
  value: string;
  expectedUpdatedAt: string | null;
}): Promise<JsonRecordSaveResult> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active' || isDatabaseWriteBlockedByHeartbeat()) {
        return {
          ok: false,
          status: currentStatus,
          currentUpdatedAt: null,
          message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
        };
      }

      assertDatabaseWritesAllowed();
      const db = requireDatabase();
      return db.transaction((): JsonRecordSaveResult => {
        maybeMigrateConfiguracionFromPersistedRecord(db);
        const row = db.prepare('SELECT updated_at FROM configuracion_state WHERE id = ?').get(CONFIGURACION_STATE_ID);
        const currentUpdatedAt = isUpdatedAtRow(row) ? row.updated_at : null;
        if (currentUpdatedAt !== record.expectedUpdatedAt) {
          return {
            ok: false,
            status: currentStatus,
            currentUpdatedAt,
            message: 'Configuración ha sido modificada por otro usuario. Recarga antes de guardar.',
          };
        }

        const updatedAt = new Date().toISOString();
        db.prepare(
          `INSERT INTO configuracion_state (id, value_json, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             value_json = excluded.value_json,
             updated_at = excluded.updated_at,
             deleted_at = NULL`,
        ).run(CONFIGURACION_STATE_ID, record.value, updatedAt, updatedAt);
        updateRefreshMetadata(db, updatedAt);
        enqueueLocalBackup('save:configuracion');
        return {
          ok: true,
          status: currentStatus,
          currentUpdatedAt: updatedAt,
          message: 'Configuración guardada en SQLite.',
        };
      })();
    },
    (nextStatus, message) => ({
      ok: false,
      status: nextStatus,
      currentUpdatedAt: null,
      message,
    }),
  );
}

export async function getSqliteSyncTokensSnapshot(): Promise<PersistedRecordsTokenSnapshot> {
  return getPersistedRecordsTokenSnapshot();
}

function currentOwnerName(): string {
  try {
    return userInfo().username || 'desconocido';
  } catch {
    return 'desconocido';
  }
}

function currentOwnerContext(): OwnerContext {
  return { ownerId, ownerName: currentOwnerName(), hostname: hostname() };
}

function ensureRecordLockDatabase(): Database | null {
  const currentStatus = getSqliteStatus();
  if (!currentStatus.ready || currentStatus.phase === 'locked') {
    return null;
  }

  return requireDatabase();
}

export async function acquireRecordLock(payload: RecordLockPayload): Promise<RecordLockResult> {
  if (!validateRecordLockPayload(payload)) {
    return buildRecordLockError('Identificador de bloqueo inválido.');
  }

  const currentStatus = getSqliteStatus();
  return withDatabaseOperationLock(currentStatus.path, async () => {
    try {
      const db = ensureRecordLockDatabase();
      if (!db) {
        return buildRecordLockError('SQLite no está disponible para coordinar bloqueos.');
      }

      return acquireRecordLockInTransaction(db, payload, currentOwnerContext());
    } catch (error) {
      return buildRecordLockError(
        error instanceof Error ? error.message : 'No se ha podido adquirir el bloqueo del registro.',
      );
    }
  }, SQLITE_RECORD_LOCK_WAIT_MS);
}

export async function heartbeatRecordLock(payload: RecordLockPayload): Promise<RecordLockResult> {
  if (!validateRecordLockPayload(payload)) {
    return buildRecordLockError('Identificador de bloqueo inválido.');
  }

  const currentStatus = getSqliteStatus();
  return withDatabaseOperationLock(currentStatus.path, async () => {
    try {
      const db = ensureRecordLockDatabase();
      if (!db) {
        return buildRecordLockError('SQLite no está disponible para renovar bloqueos.');
      }

      return heartbeatRecordLockInTransaction(db, payload, currentOwnerContext());
    } catch (error) {
      return buildRecordLockError(
        error instanceof Error ? error.message : 'No se ha podido renovar el bloqueo del registro.',
      );
    }
  }, SQLITE_RECORD_LOCK_WAIT_MS);
}

export async function releaseRecordLock(payload: RecordLockPayload): Promise<RecordLockResult> {
  if (!validateRecordLockPayload(payload)) {
    return buildRecordLockError('Identificador de bloqueo inválido.');
  }

  const currentStatus = getSqliteStatus();
  return withDatabaseOperationLock(currentStatus.path, async () => {
    try {
      const db = ensureRecordLockDatabase();
      if (!db) {
        return buildRecordLockError('SQLite no está disponible para liberar bloqueos.');
      }

      return releaseRecordLockInTransaction(db, payload, currentOwnerContext());
    } catch (error) {
      return buildRecordLockError(
        error instanceof Error ? error.message : 'No se ha podido liberar el bloqueo del registro.',
      );
    }
  }, SQLITE_RECORD_LOCK_WAIT_MS);
}

export async function getRecordLock(payload: RecordLockPayload): Promise<RecordLockResult> {
  if (!validateRecordLockPayload(payload)) {
    return buildRecordLockError('Identificador de bloqueo inválido.');
  }

  const currentStatus = getSqliteStatus();
  return withDatabaseOperationLock(currentStatus.path, async () => {
    try {
      const db = ensureRecordLockDatabase();
      if (!db) {
        return buildRecordLockError('SQLite no está disponible para consultar bloqueos.');
      }

      return getRecordLockInTransaction(db, payload, currentOwnerContext(), new Date().toISOString());
    } catch (error) {
      return buildRecordLockError(
        error instanceof Error ? error.message : 'No se ha podido consultar el bloqueo del registro.',
      );
    }
  }, SQLITE_RECORD_LOCK_WAIT_MS);
}

export async function changeSqliteDirectory(directoryPath: string): Promise<DatabaseStatus> {
  const previousStatus = getSqliteStatus();
  const previousDatabasePath = database ? previousStatus.path : null;
  const normalizedDirectoryPath = path.resolve(directoryPath);
  const nextDatabasePath = getDatabasePathForDirectory(normalizedDirectoryPath);

  if (previousStatus.ready && previousStatus.path === nextDatabasePath) {
    return previousStatus;
  }

  try {
    if (database) {
      await withDatabaseOperationLock(previousStatus.path, async () => {
        await backupExistingDatabase(previousStatus.path);
      });
    }

    await closeDatabaseAndReleaseLock();

    try {
      const nextStatus = await activateDatabase(
        normalizedDirectoryPath,
        false,
        previousDatabasePath,
      );
      await writeDatabasePreferences({
        ...(await readDatabasePreferences()),
        customDirectoryPath: normalizedDirectoryPath,
      });
      return nextStatus;
    } catch (changeError) {
      if (previousStatus.ready) {
        try {
          const restoredDirectory = path.dirname(previousStatus.path);
          const restoredStatus = await activateDatabase(
            restoredDirectory,
            previousStatus.isDefaultPath,
            null,
          );
          status = { ...restoredStatus, message: errorMessage(changeError) };
          return status;
        } catch {
          status = {
            ...previousStatus,
            ready: false,
            phase: 'fallback',
            message: errorMessage(changeError),
          };
          return status;
        }
      }

      throw changeError;
    }
  } catch (error) {
    status = { ...previousStatus, message: errorMessage(error) };
    return status;
  }
}

export async function resetSqliteDirectory(): Promise<DatabaseStatus> {
  const previousStatus = getSqliteStatus();
  const previousDatabasePath = database ? previousStatus.path : null;
  const defaultDirectory = getDefaultDatabaseDirectory();

  try {
    if (database) {
      await withDatabaseOperationLock(previousStatus.path, async () => {
        await backupExistingDatabase(previousStatus.path);
      });
    }
    await closeDatabaseAndReleaseLock();
    const nextStatus = await activateDatabase(defaultDirectory, true, previousDatabasePath);
    await writeDatabasePreferences({
      ...(await readDatabasePreferences()),
      customDirectoryPath: null,
    });
    return nextStatus;
  } catch (error) {
    try {
      if (previousStatus.ready) {
        const restoredStatus = await activateDatabase(
          path.dirname(previousStatus.path),
          previousStatus.isDefaultPath,
          null,
        );
        status = { ...restoredStatus, message: errorMessage(error) };
        return status;
      }
    } catch {
      // Mantener el fallback existente.
    }
    status = { ...previousStatus, message: errorMessage(error) };
    return status;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se ha podido cambiar la ruta SQLite.';
}

export async function closeSqlitePersistence(): Promise<void> {
  await runScheduledVacuumIfDue();
  await createShutdownLocalBackup();
  await closeDatabaseAndReleaseLock();
}

export async function getSecondaryBackupDirectory(): Promise<string | null> {
  const preferences = await readDatabasePreferences();
  return preferences.secondaryBackupDirectoryPath;
}

export async function setSecondaryBackupDirectory(directoryPath: string): Promise<void> {
  const preferences = await readDatabasePreferences();
  await writeDatabasePreferences({
    ...preferences,
    secondaryBackupDirectoryPath: path.resolve(directoryPath),
  });
}

export async function clearSecondaryBackupDirectory(): Promise<void> {
  const preferences = await readDatabasePreferences();
  await writeDatabasePreferences({
    ...preferences,
    secondaryBackupDirectoryPath: null,
  });
}

export async function getUpdatesDirectory(): Promise<string | null> {
  const preferences = await readDatabasePreferences();
  return preferences.updatesDirectoryPath;
}

export async function setUpdatesDirectory(directoryPath: string): Promise<void> {
  const preferences = await readDatabasePreferences();
  await writeDatabasePreferences({
    ...preferences,
    updatesDirectoryPath: path.resolve(directoryPath),
  });
}

export async function clearUpdatesDirectory(): Promise<void> {
  const preferences = await readDatabasePreferences();
  await writeDatabasePreferences({
    ...preferences,
    updatesDirectoryPath: null,
  });
}

export interface DailyLocalBackupSettings {
  enabled: boolean;
  retentionDays: number;
  directoryPath: string | null;
}

export async function getDailyLocalBackupSettings(): Promise<DailyLocalBackupSettings> {
  const preferences = await readDatabasePreferences();
  return {
    enabled: preferences.dailyLocalBackupEnabled,
    retentionDays: preferences.dailyLocalBackupRetentionDays,
    directoryPath: preferences.dailyLocalBackupDirectoryPath,
  };
}

export async function setDailyLocalBackupEnabled(enabled: boolean): Promise<void> {
  const preferences = await readDatabasePreferences();
  await writeDatabasePreferences({ ...preferences, dailyLocalBackupEnabled: enabled });
}

export async function setDailyLocalBackupRetentionDays(retentionDays: number): Promise<void> {
  const preferences = await readDatabasePreferences();
  const normalized = Math.min(
    DAILY_LOCAL_BACKUP_MAX_RETENTION_DAYS,
    Math.max(DAILY_LOCAL_BACKUP_MIN_RETENTION_DAYS, Math.round(retentionDays)),
  );
  await writeDatabasePreferences({ ...preferences, dailyLocalBackupRetentionDays: normalized });
}

export async function setDailyLocalBackupDirectory(directoryPath: string): Promise<void> {
  const preferences = await readDatabasePreferences();
  await writeDatabasePreferences({
    ...preferences,
    dailyLocalBackupDirectoryPath: path.resolve(directoryPath),
  });
}

export async function clearDailyLocalBackupDirectory(): Promise<void> {
  const preferences = await readDatabasePreferences();
  await writeDatabasePreferences({ ...preferences, dailyLocalBackupDirectoryPath: null });
}

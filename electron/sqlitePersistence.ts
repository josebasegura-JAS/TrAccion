import { app } from 'electron';
import { constants, copyFile, mkdir, readFile, readdir, rmdir, stat, unlink, writeFile, access } from 'node:fs/promises';
import { hostname, userInfo } from 'node:os';
import path from 'node:path';
import type { Database } from 'better-sqlite3';
import {
  createSimpleJsonModuleRepository,
  type SimpleJsonSaveResult,
} from './persistence/simpleJsonModuleRepository.js';
import { pruneLocalStorageBackups } from './persistence/maintenanceQueries.js';
import {
  CONFIGURACION_STATE_ID,
  CURRENT_SCHEMA_VERSION,
  isConfiguracionStateRow,
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
  getConfiguredDatabaseDirectory,
  getDatabasePathForDirectory,
  getDefaultDatabaseDirectory,
  readDatabasePreferences,
  writeDatabasePreferences,
  DAILY_LOCAL_BACKUP_MAX_RETENTION_DAYS,
  DAILY_LOCAL_BACKUP_MIN_RETENTION_DAYS,
} from './persistence/databasePreferences.js';
import { createEmployeeRepository } from './persistence/employeeRepository.js';
import { createSorteosRepository, getSorteosCollectionUpdatedAt } from './persistence/sorteosRepository.js';
import { createTaskRepository } from './persistence/taskRepository.js';
import { createSesionesRepository } from './persistence/sesionesRepository.js';
import { createTeletrabajoRepository } from './persistence/teletrabajoRepository.js';
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
import {
  getVacuumStatus as getVacuumStatusFromModule,
  runScheduledVacuumIfDue as runScheduledVacuumIfDueFromModule,
  vacuumDatabase as vacuumDatabaseFromModule,
  type VacuumMaintenanceDependencies,
  type VacuumResult,
  type VacuumStatus,
} from './persistence/vacuumMaintenance.js';
import {
  createLocalBackupService,
  type LocalBackupService,
  type LocalBackupServiceDependencies,
} from './persistence/localBackupService.js';
import {
  createDatabaseLockManager,
  DATABASE_HEARTBEAT_BLOCKED_MESSAGE,
  type DatabaseLockManager,
} from './persistence/databaseLockManager.js';
import { openSqliteDatabase } from './persistence/sqliteConnection.js';

const SQLITE_BUSY_TIMEOUT_MS = 15_000;
const SQLITE_RECORD_LOCK_WAIT_MS = 750;
const SQLITE_BUSY_RETRY_DELAYS_MS = [100, 300, 700];

export interface PersistedStorageRecord {
  key: string;
  value: string;
}

export interface ConditionalPersistedStorageRecord extends PersistedStorageRecord {
  expectedUpdatedAt: string | null;
}

export type {
  SqliteTaskRecord,
  SqliteTaskRecordsSnapshot,
  SqliteTaskRecordsFilter,
  ConditionalSqliteTaskRecord,
} from './persistence/taskRepository.js';

export interface ConditionalSqliteTaskSaveResult {
  ok: boolean;
  status: DatabaseStatus;
  currentUpdatedAt: string | null;
  message: string;
}

export type {
  SqliteComiteSessionRecord,
  SqliteComiteSessionRecordsSnapshot,
  ConditionalSqliteComiteSessionRecord,
  SqliteParitariaSessionRecord,
  SqliteParitariaSessionRecordsSnapshot,
  ConditionalSqliteParitariaSessionRecord,
  SqliteActaRecord,
  SqliteActaRecordsSnapshot,
  ConditionalSqliteActaRecord,
} from './persistence/sesionesRepository.js';

export type {
  SqliteTeletrabajoRecord,
  SqliteTeletrabajoRecordsSnapshot,
  ConditionalSqliteTeletrabajoRecord,
  TeletrabajoBatchSaveResult,
} from './persistence/teletrabajoRepository.js';

export type {
  SqliteEmployeeRecord,
  SqliteEmployeeRecordsSnapshot,
  ConditionalSqliteEmployeeRecord,
  ConditionalSqliteEmployeeSaveResult,
  ConditionalSqliteEmployeeBatchSaveResult,
} from './persistence/employeeRepository.js';

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
// Flags para evitar el COUNT(*) de red en cada carga una vez confirmado que la migración ya se hizo.
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

export type { VacuumResult, VacuumStatus } from './persistence/vacuumMaintenance.js';

async function runScheduledVacuumIfDue(): Promise<void> {
  await runScheduledVacuumIfDueFromModule(createVacuumMaintenanceDependencies());
}

export async function vacuumDatabaseNow(): Promise<VacuumResult> {
  return vacuumDatabaseFromModule(createVacuumMaintenanceDependencies(), 'manual');
}

export async function getVacuumStatus(): Promise<VacuumStatus> {
  return getVacuumStatusFromModule(createVacuumMaintenanceDependencies());
}

function createVacuumMaintenanceDependencies(): VacuumMaintenanceDependencies {
  return {
    getDatabase: () => database,
    getStatus: getSqliteStatus,
    acquireLock,
    releaseLock,
    getLockPath,
    startDatabaseLockHeartbeat,
    isLockContentionError: isSqliteLockContentionError,
  };
}

// --- Copias de respaldo locales ---------------------------------------
// A diferencia de las dependencias de VACUUM (sin estado), el servicio de
// copias locales mantiene una cola y un temporizador de debounce internos,
// así que se instancia una única vez y se reutiliza en todas las llamadas.

let localBackupServiceInstance: LocalBackupService | null = null;

function createLocalBackupServiceDependencies(): LocalBackupServiceDependencies {
  return {
    getDatabase: () => database,
    getStatus: getSqliteStatus,
    acquireLock,
    releaseLock,
    getLockPath,
    startDatabaseLockHeartbeat,
    isLockContentionError: isSqliteLockContentionError,
    readAllPersistedRecords,
    migrateLocalStorageSnapshot,
    withDatabaseOperationLock,
    backupExistingDatabase,
    closeDatabaseAndReleaseLock,
    activateDatabase,
  };
}

function getLocalBackupService(): LocalBackupService {
  if (!localBackupServiceInstance) {
    localBackupServiceInstance = createLocalBackupService(createLocalBackupServiceDependencies());
  }
  return localBackupServiceInstance;
}

// --- Bloqueo de la base compartida (SMB) ------------------------------
// El mecanismo del lock (ficheros .lockdir, caducidad, heartbeat, aviso de
// conectividad) vive en databaseLockManager.ts. Aquí solo se instancia una
// vez (mantiene contadores de heartbeat y el notifier como estado interno)
// y se exponen wrappers finos con los mismos nombres que antes, para no
// tener que tocar cada punto de la base que ya los usa.

let lockManagerInstance: DatabaseLockManager | null = null;

function getLockManager(): DatabaseLockManager {
  if (!lockManagerInstance) {
    lockManagerInstance = createDatabaseLockManager({ getOwnerId: () => ownerId });
  }
  return lockManagerInstance;
}

function getLockPath(databasePath: string): string {
  return getLockManager().getLockPath(databasePath);
}

function getLockInfoPath(lockPath: string): string {
  return getLockManager().getLockInfoPath(lockPath);
}

function readLock(lockPath: string): Promise<DatabaseLockInfo | null> {
  return getLockManager().readLock(lockPath);
}

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

function withDatabaseOperationLock<T>(
  databasePath: string,
  operation: () => Promise<T>,
  waitMs?: number,
): Promise<T> {
  return getLockManager().withDatabaseOperationLock(databasePath, operation, waitMs);
}

function acquireLock(databasePath: string, waitMs?: number): Promise<DatabaseLockInfo> {
  return getLockManager().acquireLock(databasePath, waitMs);
}

function acquireStartupLock(databasePath: string): Promise<DatabaseLockInfo> {
  return getLockManager().acquireStartupLock(databasePath);
}

export function setDatabaseConnectivityIssueNotifier(
  notifier: ((payload: DatabaseConnectivityIssuePayload) => void) | null,
): void {
  getLockManager().setConnectivityIssueNotifier(notifier);
}

function assertDatabaseWritesAllowed(): void {
  getLockManager().assertDatabaseWritesAllowed();
}

function isDatabaseWriteBlockedByHeartbeat(): boolean {
  return getLockManager().isDatabaseWriteBlockedByHeartbeat();
}

function startDatabaseLockHeartbeat(lockPath: string, lock: DatabaseLockInfo): ReturnType<typeof setInterval> {
  return getLockManager().startDatabaseLockHeartbeat(lockPath, lock);
}

function releaseLock(lockPath: string, lock: DatabaseLockInfo): Promise<void> {
  return getLockManager().releaseLock(lockPath, lock);
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
  return openSqliteDatabase(databasePath, { busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS });
}

function closeDatabase(): void {
  if (database) {
    database.close();
    database = null;
  }
  taskModule.resetMigrationState();
  employeeModule.resetMigrationState();
  sorteosModule.resetMigrationState();
  sesionesModule.resetMigrationState();
  teletrabajoModule.resetMigrationState();
}

async function closeDatabaseAndReleaseLock(): Promise<void> {
  if (database) {
    database.close();
    database = null;
  }
  taskModule.resetMigrationState();
  employeeModule.resetMigrationState();
  sorteosModule.resetMigrationState();
  sesionesModule.resetMigrationState();
  teletrabajoModule.resetMigrationState();
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

  if (status?.ready && status.phase === 'active' && isDatabaseWriteBlockedByHeartbeat()) {
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
  getLocalBackupService().enqueueLocalBackup(reason);
}

export async function createShutdownLocalBackup(): Promise<void> {
  await getLocalBackupService().createShutdownLocalBackup();
}

export async function createManualLocalBackup(): Promise<void> {
  await getLocalBackupService().createManualLocalBackup();
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

export async function savePersistedRecord(record: PersistedStorageRecord): Promise<DatabaseStatus> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase === 'locked' || isDatabaseWriteBlockedByHeartbeat()) {
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
  if (!currentStatus.ready || currentStatus.phase === 'locked' || isDatabaseWriteBlockedByHeartbeat()) {
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
  return getLocalBackupService().listLocalBackups();
}

export async function restoreLocalBackup(fileName: string): Promise<RestoreLocalBackupResult> {
  return getLocalBackupService().restoreLocalBackup(fileName);
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

const teletrabajoModule = createTeletrabajoRepository({
  safeDatabaseOperation,
  getSqliteStatus,
  requireDatabase,
  isUpdatedAtRow,
  updateRefreshMetadata,
  enqueueLocalBackup,
  assertDatabaseWritesAllowed,
  isDatabaseWriteBlockedByHeartbeat,
});
const { loadTeletrabajoRecordsSnapshot, saveTeletrabajoRecordIfUnchanged, saveTeletrabajoRecordsIfUnchanged } =
  teletrabajoModule;
export { loadTeletrabajoRecordsSnapshot, saveTeletrabajoRecordIfUnchanged, saveTeletrabajoRecordsIfUnchanged };

const sesionesModule = createSesionesRepository({
  safeDatabaseOperation,
  getSqliteStatus,
  requireDatabase,
  isUpdatedAtRow,
  updateRefreshMetadata,
  enqueueLocalBackup,
  assertDatabaseWritesAllowed,
  isDatabaseWriteBlockedByHeartbeat,
});
const {
  loadComiteSessionRecordsSnapshot,
  saveComiteSessionRecordIfUnchanged,
  loadParitariaSessionRecordsSnapshot,
  saveParitariaSessionRecordIfUnchanged,
  loadActaRecordsSnapshot,
  saveActaRecordIfUnchanged,
} = sesionesModule;
export {
  loadComiteSessionRecordsSnapshot,
  saveComiteSessionRecordIfUnchanged,
  loadParitariaSessionRecordsSnapshot,
  saveParitariaSessionRecordIfUnchanged,
  loadActaRecordsSnapshot,
  saveActaRecordIfUnchanged,
};

const taskModule = createTaskRepository({
  safeDatabaseOperation,
  getSqliteStatus,
  requireDatabase,
  readPersistedRecordByKey,
  isJsonObjectWithStringId,
  isCountRow,
  isUpdatedAtRow,
  updateRefreshMetadata,
  enqueueLocalBackup,
  assertDatabaseWritesAllowed,
  isDatabaseWriteBlockedByHeartbeat,
});
const { loadTaskRecordsSnapshot, saveTaskRecordIfUnchanged } = taskModule;
export { loadTaskRecordsSnapshot, saveTaskRecordIfUnchanged };

const employeeModule = createEmployeeRepository({
  safeDatabaseOperation,
  getSqliteStatus,
  requireDatabase,
  readPersistedRecordByKey,
  isCountRow,
  updateRefreshMetadata,
  enqueueLocalBackup,
  assertDatabaseWritesAllowed,
  isDatabaseWriteBlockedByHeartbeat,
});
const { loadEmployeeRecordsSnapshot, saveEmployeeRecordIfUnchanged, saveEmployeeRecordsIfUnchanged } = employeeModule;
export { loadEmployeeRecordsSnapshot, saveEmployeeRecordIfUnchanged, saveEmployeeRecordsIfUnchanged };

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

import { stat } from 'node:fs/promises';
import path from 'node:path';
import {
  createVolatileOwnerId,
  resolveStableOwnerId,
} from './persistence/stableOwnerIdentity.js';
import type { Database } from 'better-sqlite3';
import {
  createSimpleJsonModuleRepository,
} from './persistence/simpleJsonModuleRepository.js';
import { pruneLocalStorageBackups } from './persistence/maintenanceQueries.js';
import {
  CURRENT_SCHEMA_VERSION,
  readCurrentSchemaVersion,
} from './persistence/schemaMigrations.js';
import {
  type RecordLockOwnerInfo as RecordLockModuleOwnerInfo,
  type RecordLockPayload as RecordLockModulePayload,
  type RecordLockResult as RecordLockModuleResult,
} from './persistence/recordLocks.js';
import {
  createRecordLockService,
  type RecordLockService,
} from './persistence/recordLockService.js';
import {
  getConfiguredDatabaseDirectory,
  getDatabasePathForDirectory,
  getDefaultDatabaseDirectory,
  readDatabasePreferences,
  writeDatabasePreferences,
} from './persistence/databasePreferences.js';
import { createEmployeeRepository } from './persistence/employeeRepository.js';
import { createSorteosRepository } from './persistence/sorteosRepository.js';
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
import { createLoteriaRepository } from './persistence/loteriaRepository.js';
import { createConfiguracionRepository } from './persistence/configuracionRepository.js';
import {
  getVacuumStatus as getVacuumStatusFromModule,
  vacuumDatabase as vacuumDatabaseFromModule,
  type VacuumMaintenanceDependencies,
  type VacuumResult,
  type VacuumStatus,
} from './persistence/vacuumMaintenance.js';
import {
  runDataIntegrityAudit as runDataIntegrityAuditFromModule,
  type DataIntegrityAuditDependencies,
  type DataIntegrityReport,
} from './persistence/dataIntegrityAudit.js';
import {
  createLocalBackupService,
  type LocalBackupService,
  type LocalBackupServiceDependencies,
} from './persistence/localBackupService.js';
import { DATABASE_HEARTBEAT_BLOCKED_MESSAGE } from './persistence/databaseLockManager.js';
import {
  createSqliteLockLifecycle,
  type DatabaseConnectivityIssuePayload,
  type DatabaseLockInfo,
} from './persistence/sqliteLockLifecycle.js';
import { readDatabaseIdentity } from './persistence/databaseIdentity.js';
import { activateSqliteDatabase } from './persistence/databaseActivation.js';
import { backupExistingDatabase } from './persistence/emergencyDatabaseBackup.js';
import { forceReleaseDatabaseLockWithRecovery } from './persistence/databaseLockRecovery.js';
import {
  createPersistedRecordsRepository,
  type ConditionalPersistedRecordSaveResult,
  type ConditionalPersistedStorageRecord,
  type LocalStorageBackupPayload,
  type PersistedRecordSnapshot,
  type PersistedRecordsSnapshot,
  type PersistedRecordsTokenSnapshot,
  type PersistedStorageRecord,
  type PersistedStorageRecordSnapshot,
} from './persistence/persistedRecordsRepository.js';
import {
  SQLITE_BUSY_RETRY_DELAYS_MS,
  isSqliteBusyOrLockedError,
  isSqliteCorruptionError,
  isSqliteLockContentionError,
} from './persistence/sqliteOperationGuard.js';
import {
  isCountRow,
  isJsonObjectWithStringId,
  isUpdatedAtRow,
  readAllPersistedRecords,
  readPersistedRecordByKey,
} from './persistence/sqlitePersistenceHelpers.js';

export {
  clearDailyLocalBackupDirectory,
  clearSecondaryBackupDirectory,
  clearUpdatesDirectory,
  getDailyLocalBackupSettings,
  getSecondaryBackupDirectory,
  getUpdatesDirectory,
  setDailyLocalBackupDirectory,
  setDailyLocalBackupEnabled,
  setDailyLocalBackupRetentionDays,
  setSecondaryBackupDirectory,
  setUpdatesDirectory,
} from './persistence/runtimePreferences.js';
export type { DailyLocalBackupSettings } from './persistence/runtimePreferences.js';

const SQLITE_BUSY_TIMEOUT_MS = 15_000;

export type {
  ConditionalPersistedRecordSaveResult,
  ConditionalPersistedStorageRecord,
  LocalStorageBackupPayload,
  PersistedRecordSnapshot,
  PersistedRecordsSnapshot,
  PersistedRecordsTokenSnapshot,
  PersistedStorageRecord,
  PersistedStorageRecordSnapshot,
};

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


export interface AtomicSessionWorkflowRecord {
  id: string;
  value: string;
  expectedUpdatedAt: string | null;
}

export interface AtomicSessionWorkflowActa {
  id: string;
  value: string;
  sourceSessionId: string;
}

export interface AtomicSessionWorkflowPayload {
  module: 'comite' | 'paritaria';
  session: AtomicSessionWorkflowRecord;
  tasks: AtomicSessionWorkflowRecord[];
  acta?: AtomicSessionWorkflowActa | null;
}

export interface AtomicSessionWorkflowResult {
  ok: boolean;
  status: DatabaseStatus;
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
  applicationId?: string;
  databaseUuid?: string;
  databaseCreatedAt?: string;
  environment?: string;
}

export interface DatabaseHealthCheckResult {
  ok: boolean;
  status: DatabaseStatus;
  checkedAt: string;
  message: string;
}

let ownerId = createVolatileOwnerId();

let database: Database | null = null;
let status: DatabaseStatus | null = null;

export type { DatabaseConnectivityIssuePayload, DatabaseLockInfo } from './persistence/sqliteLockLifecycle.js';

// --- Mantenimiento de la base: VACUUM ---------------------------------

export type { VacuumResult, VacuumStatus } from './persistence/vacuumMaintenance.js';

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

// --- Diagnóstico de integridad de datos (solo lectura) -----------------

export type { DataIntegrityReport } from './persistence/dataIntegrityAudit.js';

export async function runDataIntegrityAuditNow(): Promise<DataIntegrityReport> {
  return runDataIntegrityAuditFromModule(createDataIntegrityAuditDependencies());
}

function createDataIntegrityAuditDependencies(): DataIntegrityAuditDependencies {
  return {
    getDatabase: () => database,
    getStatus: getSqliteStatus,
    listLocalBackups: () => listLocalBackups(),
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
    migrateLocalStorageSnapshot,
    readAllPersistedRecords,
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
// La fachada singleton de lock/heartbeat vive en sqliteLockLifecycle.ts.
// Aquí se mantienen únicamente las operaciones que dependen del estado vivo
// de sqlitePersistence (p. ej. liberación manual + reactivación de la base).

const sqliteLockLifecycle = createSqliteLockLifecycle(() => ownerId);

const {
  acquireLock,
  acquireStartupLock,
  assertDatabaseWritesAllowed,
  getLockInfoPath,
  getLockPath,
  isDatabaseWriteBlockedByHeartbeat,
  readLock,
  releaseLock,
  startDatabaseLockHeartbeat,
  withDatabaseOperationLock,
} = sqliteLockLifecycle;

export function setDatabaseConnectivityIssueNotifier(
  notifier: ((payload: DatabaseConnectivityIssuePayload) => void) | null,
): void {
  sqliteLockLifecycle.setConnectivityIssueNotifier(notifier);
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
  return forceReleaseDatabaseLockWithRecovery({
    getStatus: getSqliteStatus,
    readLock,
    getLockInfoPath,
    isDatabaseActive: () => database !== null,
    getConfiguredDirectory: getConfiguredDatabaseDirectory,
    activateDatabase,
    setStatus: (nextStatus) => {
      status = nextStatus;
    },
    errorMessage,
  });
}

function resetRepositoryMigrationState(): void {
  taskModule.resetMigrationState();
  employeeModule.resetMigrationState();
  sorteosModule.resetMigrationState();
  sesionesModule.resetMigrationState();
  teletrabajoModule.resetMigrationState();
}

function closeDatabase(): void {
  if (database) {
    database.close();
    database = null;
  }
  resetRepositoryMigrationState();
}

async function closeDatabaseAndReleaseLock(): Promise<void> {
  closeDatabase();
}

async function activateDatabase(
  directoryPath: string,
  isDefaultPath: boolean,
  sourceDatabasePath: string | null,
): Promise<DatabaseStatus> {
  const activated = await activateSqliteDatabase(
    directoryPath,
    isDefaultPath,
    sourceDatabasePath,
    {
      ownerId,
      busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS,
      getLockPath,
      acquireStartupLock,
      startDatabaseLockHeartbeat,
      releaseLock,
    },
  );
  database = activated.database;
  status = activated.status;
  return status;
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
          : 'SQLite no está disponible. La edición permanece bloqueada hasta recuperar la base de datos compartida.',
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

export async function checkSqliteHealth(): Promise<DatabaseHealthCheckResult> {
  const currentStatus = getSqliteStatus();
  const checkedAt = new Date().toISOString();

  if (!currentStatus.ready || currentStatus.phase !== 'active' || currentStatus.isDefaultPath) {
    return {
      ok: false,
      status: currentStatus,
      checkedAt,
      message:
        currentStatus.message ??
        (currentStatus.isDefaultPath
          ? 'No hay una base SQLite compartida activa.'
          : 'SQLite no está activa.'),
    };
  }

  try {
    const databaseStats = await stat(currentStatus.path);
    if (!databaseStats.isFile()) {
      throw new Error('La ruta configurada ya no apunta a un fichero SQLite.');
    }

    const db = requireDatabase();
    db.prepare('SELECT 1 AS ok').get();
    const schemaVersion = readCurrentSchemaVersion(db);
    if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `Schema SQLite inesperado: v${schemaVersion}; se esperaba v${CURRENT_SCHEMA_VERSION}.`,
      );
    }

    const identity = readDatabaseIdentity(db);
    if (!identity || !currentStatus.databaseUuid || identity.databaseUuid !== currentStatus.databaseUuid) {
      throw new Error('La identidad de la base SQLite ha cambiado durante la sesión.');
    }
    if (identity.applicationId !== currentStatus.applicationId || identity.environment !== currentStatus.environment) {
      throw new Error('Los metadatos de la base SQLite ya no coinciden con la base validada al iniciar.');
    }

    return {
      ok: true,
      status: getSqliteStatus(),
      checkedAt,
      message: 'Conexión con la base compartida verificada.',
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? `No se puede verificar la base SQLite compartida: ${error.message}`
        : 'No se puede verificar la base SQLite compartida.';
    return {
      ok: false,
      status: getSqliteStatus(),
      checkedAt,
      message,
    };
  }
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

function enqueueLocalBackup(reason: string): void {
  getLocalBackupService().enqueueLocalBackup(reason);
}

export async function createShutdownLocalBackup() {
  return getLocalBackupService().createShutdownLocalBackup();
}

export async function createManualLocalBackup(): Promise<void> {
  await getLocalBackupService().createManualLocalBackup();
}

function getTaskRecordsUpdatedAt(db: Database): string | null {
  const row = db.prepare('SELECT MAX(updated_at) AS updated_at FROM task_records').get();
  return isUpdatedAtRow(row) ? row.updated_at : null;
}

const persistedRecordsModule = createPersistedRecordsRepository({
  ownerId: () => ownerId,
  getSqliteStatus,
  requireDatabase,
  safeDatabaseOperation,
  isDatabaseWriteBlockedByHeartbeat,
  assertDatabaseWritesAllowed,
  withDatabaseOperationLock,
  enqueueLocalBackup,
  getTaskRecordsUpdatedAt,
});

const {
  updateRefreshMetadata,
  savePersistedRecord,
  savePersistedRecordIfUnchanged,
  migrateLocalStorageSnapshot,
  getPersistedRecordSnapshot,
  loadPersistedRecordsHydrationSnapshot,
  loadPersistedRecordsSnapshot,
  getPersistedRecordsTokenSnapshot,
} = persistedRecordsModule;

export {
  savePersistedRecord,
  savePersistedRecordIfUnchanged,
  migrateLocalStorageSnapshot,
  getPersistedRecordSnapshot,
  loadPersistedRecordsHydrationSnapshot,
  loadPersistedRecordsSnapshot,
  getPersistedRecordsTokenSnapshot,
};

export async function createLocalStorageBackup(
  payload: LocalStorageBackupPayload,
): Promise<DatabaseStatus> {
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
        db.prepare(
          'INSERT INTO local_storage_backups (created_at, payload_json) VALUES (?, ?)',
        ).run(new Date().toISOString(), JSON.stringify({ records }));
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
const {
  loadTeletrabajoRecordsSnapshot,
  saveTeletrabajoRecordIfUnchanged,
  saveTeletrabajoRecordsIfUnchanged,
} = teletrabajoModule;
export {
  loadTeletrabajoRecordsSnapshot,
  saveTeletrabajoRecordIfUnchanged,
  saveTeletrabajoRecordsIfUnchanged,
};

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


export async function closeSessionWorkflowAtomically(
  payload: AtomicSessionWorkflowPayload,
): Promise<AtomicSessionWorkflowResult> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (
        !currentStatus.ready ||
        currentStatus.phase !== 'active' ||
        isDatabaseWriteBlockedByHeartbeat()
      ) {
        return {
          ok: false,
          status: currentStatus,
          message:
            currentStatus.message ??
            'SQLite no está activo. No se puede cerrar la sesión de forma segura.',
        };
      }

      assertDatabaseWritesAllowed();
      const db = requireDatabase();
      const sessionTable =
        payload.module === 'comite' ? 'comite_session_records' : 'paritaria_session_records';

      const result = db.transaction((): AtomicSessionWorkflowResult => {
        const readUpdatedAt = (tableName: string, id: string): string | null => {
          const row = db
            .prepare(`SELECT updated_at FROM ${tableName} WHERE id = ? AND deleted_at IS NULL`)
            .get(id);
          return isUpdatedAtRow(row) ? row.updated_at : null;
        };

        const currentSessionUpdatedAt = readUpdatedAt(sessionTable, payload.session.id);
        if (currentSessionUpdatedAt !== payload.session.expectedUpdatedAt) {
          return {
            ok: false,
            status: currentStatus,
            message:
              'La sesión ha sido modificada por otro usuario. Recarga antes de cerrarla.',
          };
        }

        for (const task of payload.tasks) {
          const currentTaskUpdatedAt = readUpdatedAt('task_records', task.id);
          if (currentTaskUpdatedAt !== task.expectedUpdatedAt) {
            return {
              ok: false,
              status: currentStatus,
              message:
                'Una de las tareas tratadas ha sido modificada por otro usuario. Recarga antes de cerrar la sesión.',
            };
          }
        }

        if (payload.acta) {
          const existingRows = db
            .prepare('SELECT value_json FROM acta_records WHERE deleted_at IS NULL')
            .all() as Array<{ value_json?: unknown }>;
          const existingActa = existingRows.some((row) => {
            if (typeof row.value_json !== 'string') {
              return false;
            }
            try {
              const parsed = JSON.parse(row.value_json) as { sourceSessionId?: unknown };
              return parsed.sourceSessionId === payload.acta?.sourceSessionId;
            } catch {
              return false;
            }
          });
          if (existingActa) {
            return {
              ok: false,
              status: currentStatus,
              message:
                'Ya existe un acta vinculada a esta sesión. Recarga antes de continuar.',
            };
          }
        }

        const parseRecordMeta = (value: string) => {
          let parsed: Record<string, unknown> = {};
          try {
            const candidate = JSON.parse(value);
            if (candidate && typeof candidate === 'object') {
              parsed = candidate as Record<string, unknown>;
            }
          } catch {
            // La validación funcional se realiza en renderer/store; aquí solo protegemos atomicidad.
          }
          const now = new Date().toISOString();
          return {
            createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : now,
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : now,
            deletedAt: typeof parsed.deletedAt === 'string' ? parsed.deletedAt : null,
          };
        };

        const updateExisting = (
          tableName: string,
          record: AtomicSessionWorkflowRecord,
        ): void => {
          const meta = parseRecordMeta(record.value);
          const updateResult = db
            .prepare(
              `UPDATE ${tableName}
               SET value_json = ?, updated_at = ?, deleted_at = ?
               WHERE id = ? AND updated_at = ?`,
            )
            .run(
              record.value,
              meta.updatedAt,
              meta.deletedAt,
              record.id,
              record.expectedUpdatedAt,
            );
          if (updateResult.changes !== 1) {
            throw new Error('Conflicto de concurrencia durante el cierre de la sesión.');
          }
        };

        updateExisting(sessionTable, payload.session);
        for (const task of payload.tasks) {
          updateExisting('task_records', task);
        }

        if (payload.acta) {
          const meta = parseRecordMeta(payload.acta.value);
          const insertResult = db
            .prepare(
              `INSERT INTO acta_records (id, value_json, created_at, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(
              payload.acta.id,
              payload.acta.value,
              meta.createdAt,
              meta.updatedAt,
              meta.deletedAt,
            );
          if (insertResult.changes !== 1) {
            throw new Error('No se ha podido crear el acta asociada.');
          }
        }

        const refreshUpdatedAt = new Date().toISOString();
        updateRefreshMetadata(db, refreshUpdatedAt);
        return {
          ok: true,
          status: currentStatus,
          message: 'Sesión, tareas y acta actualizadas de forma atómica.',
        };
      })();

      if (result.ok) {
        enqueueLocalBackup(`close:${payload.module}_session_workflow`);
      }
      return result;
    },
    (nextStatus, message) => ({
      ok: false,
      status: nextStatus,
      message,
    }),
  );
}

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
const {
  loadEmployeeRecordsSnapshot,
  saveEmployeeRecordIfUnchanged,
  saveEmployeeRecordsIfUnchanged,
} = employeeModule;
export {
  loadEmployeeRecordsSnapshot,
  saveEmployeeRecordIfUnchanged,
  saveEmployeeRecordsIfUnchanged,
};

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
const { loadLicenciaSinSueldoRecordsSnapshot, saveLicenciaSinSueldoRecordIfUnchanged } =
  licenciaSinSueldoModule;
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
const {
  loadActaTypeRecordsSnapshot,
  saveActaTypeRecordIfUnchanged,
  saveActaTypeRecordsIfUnchanged,
} = actaTypesModule;
export {
  loadActaTypeRecordsSnapshot,
  saveActaTypeRecordIfUnchanged,
  saveActaTypeRecordsIfUnchanged,
};

const ticketRestauranteCalendarsModule = createTicketRestauranteCalendarsRepository(
  createJsonModuleRepository,
);
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

const ticketRestaurantePeopleModule = createTicketRestaurantePeopleRepository(
  createJsonModuleRepository,
);
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

const ticketRestauranteAbsencesModule = createTicketRestauranteAbsencesRepository(
  createJsonModuleRepository,
);
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

const ticketRestauranteConfigModule = createTicketRestauranteConfigRepository(
  createJsonModuleRepository,
);
const { loadTicketRestauranteConfigRecordsSnapshot, saveTicketRestauranteConfigRecordIfUnchanged } =
  ticketRestauranteConfigModule;
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
const { loadEspecialesRecipientRecordsSnapshot, saveEspecialesRecipientRecordIfUnchanged } =
  especialesRecipientModule;
export { loadEspecialesRecipientRecordsSnapshot, saveEspecialesRecipientRecordIfUnchanged };

const teletrabajoPuestosModule = createTeletrabajoPuestosRepository(createJsonModuleRepository);
const { loadTeletrabajoPuestoRecordsSnapshot, saveTeletrabajoPuestoRecordIfUnchanged } =
  teletrabajoPuestosModule;
export { loadTeletrabajoPuestoRecordsSnapshot, saveTeletrabajoPuestoRecordIfUnchanged };

const teletrabajoGruposCoberturaModule = createTeletrabajoGruposCoberturaRepository(
  createJsonModuleRepository,
);
const {
  loadTeletrabajoGrupoCoberturaRecordsSnapshot,
  saveTeletrabajoGrupoCoberturaRecordIfUnchanged,
} = teletrabajoGruposCoberturaModule;
export {
  loadTeletrabajoGrupoCoberturaRecordsSnapshot,
  saveTeletrabajoGrupoCoberturaRecordIfUnchanged,
};

const jobPositionTranslationsModule = createJobPositionTranslationsRepository(
  createJsonModuleRepository,
);
const { loadJobPositionTranslationRecordsSnapshot, saveJobPositionTranslationRecordIfUnchanged } =
  jobPositionTranslationsModule;
export { loadJobPositionTranslationRecordsSnapshot, saveJobPositionTranslationRecordIfUnchanged };

const loteriaModule = createLoteriaRepository({
  safeDatabaseOperation,
  getSqliteStatus,
  requireDatabase,
  updateRefreshMetadata,
  enqueueLocalBackup,
  assertDatabaseWritesAllowed,
  isDatabaseWriteBlockedByHeartbeat,
});
const { loadSnapshot: loadLoteriaRecordsSnapshot, saveSnapshotIfUnchanged: saveLoteriaSnapshotIfUnchanged } = loteriaModule;
export { loadLoteriaRecordsSnapshot, saveLoteriaSnapshotIfUnchanged };

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

const configuracionModule = createConfiguracionRepository({
  safeDatabaseOperation,
  getSqliteStatus,
  requireDatabase,
  isUpdatedAtRow,
  updateRefreshMetadata,
  enqueueLocalBackup,
  assertDatabaseWritesAllowed,
  isDatabaseWriteBlockedByHeartbeat,
});
const { loadConfiguracionSnapshot, saveConfiguracionIfUnchanged } = configuracionModule;
export { loadConfiguracionSnapshot, saveConfiguracionIfUnchanged };

export async function getSqliteSyncTokensSnapshot(): Promise<PersistedRecordsTokenSnapshot> {
  return getPersistedRecordsTokenSnapshot();
}

function getRecordLockService(): RecordLockService {
  return createRecordLockService({
    getSqliteStatus,
    requireDatabase,
    withDatabaseOperationLock,
    getOwnerId: () => ownerId,
    getDatabasePath: () => getSqliteStatus().path,
  });
}

export async function acquireRecordLock(payload: RecordLockPayload): Promise<RecordLockResult> {
  return getRecordLockService().acquireRecordLock(payload);
}

export async function heartbeatRecordLock(payload: RecordLockPayload): Promise<RecordLockResult> {
  return getRecordLockService().heartbeatRecordLock(payload);
}

export async function releaseRecordLock(payload: RecordLockPayload): Promise<RecordLockResult> {
  return getRecordLockService().releaseRecordLock(payload);
}

export async function getRecordLock(payload: RecordLockPayload): Promise<RecordLockResult> {
  return getRecordLockService().getRecordLock(payload);
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
        expectedDatabaseUuid: nextStatus.databaseUuid ?? null,
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
  const defaultDirectory = getDefaultDatabaseDirectory();
  const fallbackPath = getDatabasePathForDirectory(defaultDirectory);

  try {
    if (database) {
      await withDatabaseOperationLock(previousStatus.path, async () => {
        await backupExistingDatabase(previousStatus.path);
      });
    }

    await closeDatabaseAndReleaseLock();
    await writeDatabasePreferences({
      ...(await readDatabasePreferences()),
      customDirectoryPath: null,
    });

    status = {
      ready: false,
      engine: 'better-sqlite3',
      phase: 'fallback',
      path: fallbackPath,
      schemaVersion: 0,
      isDefaultPath: true,
      lockPath: getLockPath(fallbackPath),
      message:
        'Se ha quitado la ruta de base de datos compartida. TrAcción queda en modo consulta hasta seleccionar en Ajustes la carpeta que contiene traccion.sqlite.',
    };
    return status;
  } catch (error) {
    // Si no se ha podido completar el cambio, intentar recuperar la base compartida
    // previa para no dejar la sesión en un estado peor.
    try {
      if (previousStatus.ready && !previousStatus.isDefaultPath) {
        const restoredStatus = await activateDatabase(
          path.dirname(previousStatus.path),
          false,
          null,
        );
        status = { ...restoredStatus, message: errorMessage(error) };
        return status;
      }
    } catch {
      // Mantener el estado de error existente.
    }
    status = { ...previousStatus, ready: false, phase: 'fallback', message: errorMessage(error) };
    return status;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se ha podido cambiar la ruta SQLite.';
}

export interface ShutdownPerformanceMetrics {
  totalMs: number;
  vacuumMs: number;
  shutdownBackupMs: number;
  closeDatabaseMs: number;
  shutdownBackupPrepareMs: number;
  shutdownBackupJsonMs: number;
  shutdownBackupLocalSqliteMs: number;
  shutdownBackupSharedSqliteMs: number;
  shutdownBackupDailySqliteMs: number;
}

export async function closeSqlitePersistence(): Promise<ShutdownPerformanceMetrics> {
  const totalStartedAt = Date.now();

  // El VACUUM programado no forma parte del camino crítico de cierre.
  // El mantenimiento sigue disponible manualmente desde Ajustes.
  const vacuumMs = 0;

  const backupStartedAt = Date.now();
  const shutdownBackup = await createShutdownLocalBackup();
  const shutdownBackupMs = Date.now() - backupStartedAt;

  const closeStartedAt = Date.now();
  await closeDatabaseAndReleaseLock();
  const closeDatabaseMs = Date.now() - closeStartedAt;

  return {
    totalMs: Date.now() - totalStartedAt,
    vacuumMs,
    shutdownBackupMs,
    closeDatabaseMs,
    shutdownBackupPrepareMs: shutdownBackup.prepareMs,
    shutdownBackupJsonMs: shutdownBackup.jsonMs,
    shutdownBackupLocalSqliteMs: shutdownBackup.localSqliteMs,
    shutdownBackupSharedSqliteMs: shutdownBackup.sharedSqliteMs,
    shutdownBackupDailySqliteMs: shutdownBackup.dailySqliteMs,
  };
}

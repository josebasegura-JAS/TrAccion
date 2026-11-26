import { backupsAreSettled, isBackupSnapshot, UNKNOWN_BACKUP_STATE } from './sqliteEngineSafety.js';
import type { SafeRestartBackupSnapshot } from './safeRestartPolicy.js';
import * as legacy from './sqlitePersistence.js';
import type { DatabaseStatus, DatabaseConnectivityIssuePayload } from './sqlitePersistence.js';
import type { SqliteEngineOperationName } from './sqliteEngineOperations.js';
import type { startIsolatedTestEngine } from './sqliteEngineWorkerClient.js';
import * as legacyBatch from './persistence/taskBatchPersistence.js';
import * as legacyCalendar from './persistence/ticketRestauranteAtomicCalendarRemoval.js';
import * as legacyPeople from './persistence/ticketRestauranteAtomicPeopleImport.js';
import { getTraccionEnvironment } from './persistence/traccionEnvironment.js';
import { getPersistenceUserDataPath } from './persistence/persistenceRuntime.js';
import path from 'node:path';

export type * from './sqlitePersistence.js';

// Una vez seleccionado el motor remoto no existe fallback a SQLite local.
let isolatedSelection: boolean | undefined;
export function isIsolatedEngineEnabled(): boolean {
  isolatedSelection ??= process.env.TRACCION_SQLITE_ENGINE_EXPERIMENT === '1';
  return isolatedSelection;
}

let engine: Promise<ReturnType<typeof startIsolatedTestEngine>> | undefined;
let latestStatus: DatabaseStatus | undefined;
let notifier: ((payload: DatabaseConnectivityIssuePayload) => void) | null = null;
let serial: Promise<unknown> = Promise.resolve();
let closing = false;
let unavailable = false;
let recovering = false;
let recoveryAttempted = false;
let uncertainOperation = false;
let latestBackups: SafeRestartBackupSnapshot | undefined;
let pendingRemoteOperations = 0;
let currentInstance: ReturnType<typeof startIsolatedTestEngine> | undefined;

function getEngine() {
  engine ??= import('./sqliteEngineWorkerClient.js').then(({ startIsolatedTestEngine }) => {
    const instance = startIsolatedTestEngine(getPersistenceUserDataPath(), (status) => { latestStatus = status; }, (payload) => notifier?.(payload), getTraccionEnvironment(), (snapshot) => {
      latestBackups = isBackupSnapshot(snapshot) ? snapshot : undefined;
    });
    currentInstance = instance;
    void instance.exited.then(() => {
      unavailable = true;
      if (!instance.exitedWhileIdle() || !backupsAreSettled(latestBackups)) uncertainOperation = true;
      notifier?.({ blocked: true, message: 'El proceso SQLite ha terminado; edición suspendida.', failedHeartbeatCount: 0, updatedAt: new Date().toISOString() });
    });
    return instance;
  });
  return engine;
}

function remote<T>(operation: (instance: ReturnType<typeof startIsolatedTestEngine>) => Promise<T>): Promise<T> {
  if (closing || unavailable || recovering) return Promise.reject(new Error('Motor SQLite aislado no disponible.'));
  pendingRemoteOperations += 1;
  const result = serial.then(async () => {
    if (unavailable) throw new Error('Motor SQLite aislado no disponible.');
    try {
      const instance = await getEngine();
      return await operation(instance);
    } catch (error) {
      const instance = await engine?.catch(() => undefined);
      if (!instance || instance.getState() !== 'idle') {
        unavailable = true;
        uncertainOperation = true;
      }
      throw error;
    }
  });
  const settled = result.finally(() => { pendingRemoteOperations -= 1; });
  serial = settled.catch(() => undefined);
  return settled;
}

function route<K extends SqliteEngineOperationName>(name: K) {
  return (...args: Parameters<(typeof legacy)[K]>): Promise<Awaited<ReturnType<(typeof legacy)[K]>>> => {
    if (isIsolatedEngineEnabled()) return remote((instance) => instance.call(name, ...args));
    const handler = legacy[name] as unknown as (...values: Parameters<(typeof legacy)[K]>) => ReturnType<(typeof legacy)[K]>;
    // El camino histórico conserva exactamente el retorno del servicio original.
    return handler(...args) as Promise<Awaited<ReturnType<(typeof legacy)[K]>>>;
  };
}

export function getSqliteStatus(): DatabaseStatus {
  if (!isIsolatedEngineEnabled()) return legacy.getSqliteStatus();
  if (latestStatus && !unavailable && !closing && !recovering) return latestStatus;
  const fallbackPath = path.join(getPersistenceUserDataPath(), 'data', 'traccion.sqlite');
  return {
    ready: false, engine: 'better-sqlite3', phase: 'locked',
    path: latestStatus?.path ?? fallbackPath, schemaVersion: latestStatus?.schemaVersion ?? 0,
    isDefaultPath: latestStatus?.isDefaultPath ?? true, lockPath: latestStatus?.lockPath ?? fallbackPath + '.lockdir',
    message: 'Motor SQLite aislado no disponible; edición suspendida.',
  };
}

export function setDatabaseConnectivityIssueNotifier(next: typeof notifier): void {
  if (!isIsolatedEngineEnabled()) { legacy.setDatabaseConnectivityIssueNotifier(next); return; }
  notifier = next;
}

export function getSqliteRestartBackupSnapshot(): ReturnType<typeof legacy.getSqliteRestartBackupSnapshot> {
  if (!isIsolatedEngineEnabled()) return legacy.getSqliteRestartBackupSnapshot();
  // Un snapshot solo autoriza si no hay peticiones nuevas/encoladas. Una
  // revisión pendiente impide autorización hasta recibir un estado posterior.
  if (closing || recovering || uncertainOperation || pendingRemoteOperations !== 0 ||
      !currentInstance || (currentInstance.getState() !== 'idle' && !currentInstance.exitedWhileIdle()) ||
      !latestBackups) return { ...UNKNOWN_BACKUP_STATE };
  return { ...latestBackups };
}

export async function closeSqlitePersistence(): Promise<legacy.ShutdownPerformanceMetrics> {
  if (!isIsolatedEngineEnabled()) return legacy.closeSqlitePersistence();
  if (closing || recovering) throw new Error('Cierre SQLite ya en curso o recuperación pendiente.');
  closing = true;
  try {
    await serial;
    const instance = await engine?.catch(() => undefined);
    // Salir de la aplicación es distinto de afirmar que hubo cierre limpio.
    // Si el propietario ya terminó no podemos interrumpir ninguna E/S suya.
    // No abrir otro motor solo para cerrar; conservar el diario de incidencias.
    if (instance?.hasExited()) {
      return { totalMs: 0, vacuumMs: 0, shutdownBackupMs: 0, closeDatabaseMs: 0,
        shutdownBackupPrepareMs: 0, shutdownBackupJsonMs: 0, shutdownBackupLocalSqliteMs: 0,
        shutdownBackupSharedSqliteMs: 0, shutdownBackupDailySqliteMs: 0,
        engineExitedUncleanly: true,
        engineExitSafeForRestart: !uncertainOperation && instance.exitedWhileIdle() && backupsAreSettled(latestBackups) };
    }
    if (!engine) {
      return { totalMs: 0, vacuumMs: 0, shutdownBackupMs: 0, closeDatabaseMs: 0,
        shutdownBackupPrepareMs: 0, shutdownBackupJsonMs: 0, shutdownBackupLocalSqliteMs: 0,
        shutdownBackupSharedSqliteMs: 0, shutdownBackupDailySqliteMs: 0 };
    }
    if (!instance || uncertainOperation) throw new Error('Cierre SQLite no confirmado: propietario activo con resultado incierto.');
    return await instance.close();
  } catch (error) {
    // Permitir volver a solicitar cierre si posteriormente se confirma exit.
    // No reactivar edición después de un cierre fallido.
    unavailable = true;
    closing = false;
    throw error;
  }
}

export function saveTaskRecordsAtomically(...args: Parameters<typeof legacyBatch.saveTaskRecordsAtomically>): ReturnType<typeof legacyBatch.saveTaskRecordsAtomically> {
  if (!isIsolatedEngineEnabled()) return legacyBatch.saveTaskRecordsAtomically(args[0], () => legacy.enqueueLocalBackup('save:tasks-atomic-batch'));
  return remote((instance) => instance.callExtra('saveTaskRecordsAtomically', [args[0]])) as ReturnType<typeof legacyBatch.saveTaskRecordsAtomically>;
}
export function removeTicketRestauranteCalendarWithPeopleAtomically(...args: Parameters<typeof legacyCalendar.removeTicketRestauranteCalendarWithPeopleAtomically>): ReturnType<typeof legacyCalendar.removeTicketRestauranteCalendarWithPeopleAtomically> {
  if (!isIsolatedEngineEnabled()) return legacyCalendar.removeTicketRestauranteCalendarWithPeopleAtomically(args[0], args[1], () => legacy.enqueueLocalBackup('save:ticket-calendar-atomic'));
  return remote((instance) => instance.callExtra('removeTicketRestauranteCalendarWithPeopleAtomically', [args[1]])) as ReturnType<typeof legacyCalendar.removeTicketRestauranteCalendarWithPeopleAtomically>;
}
export function importTicketRestaurantePeopleAtomically(...args: Parameters<typeof legacyPeople.importTicketRestaurantePeopleAtomically>): ReturnType<typeof legacyPeople.importTicketRestaurantePeopleAtomically> {
  if (!isIsolatedEngineEnabled()) return legacyPeople.importTicketRestaurantePeopleAtomically(args[0], args[1], () => legacy.enqueueLocalBackup('save:ticket-people-atomic'));
  return remote((instance) => instance.callExtra('importTicketRestaurantePeopleAtomically', [args[1]])) as ReturnType<typeof legacyPeople.importTicketRestaurantePeopleAtomically>;
}

export const clearDailyLocalBackupDirectory = route('clearDailyLocalBackupDirectory');
export const clearSecondaryBackupDirectory = route('clearSecondaryBackupDirectory');
export const clearUpdatesDirectory = route('clearUpdatesDirectory');
export const getDailyLocalBackupSettings = route('getDailyLocalBackupSettings');
export const getSecondaryBackupDirectory = route('getSecondaryBackupDirectory');
export const getUpdatesDirectory = route('getUpdatesDirectory');
export const setDailyLocalBackupDirectory = route('setDailyLocalBackupDirectory');
export const setDailyLocalBackupEnabled = route('setDailyLocalBackupEnabled');
export const setDailyLocalBackupRetentionDays = route('setDailyLocalBackupRetentionDays');
export const setSecondaryBackupDirectory = route('setSecondaryBackupDirectory');
export const setUpdatesDirectory = route('setUpdatesDirectory');
export const savePersistedRecord = route('savePersistedRecord');
export const savePersistedRecordIfUnchanged = route('savePersistedRecordIfUnchanged');
export const savePersistedRecordsIfUnchanged = route('savePersistedRecordsIfUnchanged');
export const migrateLocalStorageSnapshot = route('migrateLocalStorageSnapshot');
export const getPersistedRecordSnapshot = route('getPersistedRecordSnapshot');
export const loadPersistedRecordsHydrationSnapshot = route('loadPersistedRecordsHydrationSnapshot');
export const loadPersistedRecordsSnapshot = route('loadPersistedRecordsSnapshot');
export const getPersistedRecordsTokenSnapshot = route('getPersistedRecordsTokenSnapshot');
export const loadTeletrabajoRecordsSnapshot = route('loadTeletrabajoRecordsSnapshot');
export const saveTeletrabajoRecordIfUnchanged = route('saveTeletrabajoRecordIfUnchanged');
export const saveTeletrabajoRecordsIfUnchanged = route('saveTeletrabajoRecordsIfUnchanged');
export const loadComiteSessionRecordsSnapshot = route('loadComiteSessionRecordsSnapshot');
export const saveComiteSessionRecordIfUnchanged = route('saveComiteSessionRecordIfUnchanged');
export const loadParitariaSessionRecordsSnapshot = route('loadParitariaSessionRecordsSnapshot');
export const saveParitariaSessionRecordIfUnchanged = route('saveParitariaSessionRecordIfUnchanged');
export const loadActaRecordsSnapshot = route('loadActaRecordsSnapshot');
export const saveActaRecordIfUnchanged = route('saveActaRecordIfUnchanged');
export const loadTaskRecordsSnapshot = route('loadTaskRecordsSnapshot');
export const saveTaskRecordIfUnchanged = route('saveTaskRecordIfUnchanged');
export const loadEmployeeRecordsSnapshot = route('loadEmployeeRecordsSnapshot');
export const saveEmployeeRecordIfUnchanged = route('saveEmployeeRecordIfUnchanged');
export const saveEmployeeRecordsIfUnchanged = route('saveEmployeeRecordsIfUnchanged');
export const loadSorteosRecordsSnapshot = route('loadSorteosRecordsSnapshot');
export const saveSorteosSnapshotIfUnchanged = route('saveSorteosSnapshotIfUnchanged');
export const loadVinculogramaRecordsSnapshot = route('loadVinculogramaRecordsSnapshot');
export const saveVinculogramaRecordIfUnchanged = route('saveVinculogramaRecordIfUnchanged');
export const loadLicenciaSinSueldoRecordsSnapshot = route('loadLicenciaSinSueldoRecordsSnapshot');
export const saveLicenciaSinSueldoRecordIfUnchanged = route('saveLicenciaSinSueldoRecordIfUnchanged');
export const loadCriteriosRrllRecordsSnapshot = route('loadCriteriosRrllRecordsSnapshot');
export const saveCriteriosRrllRecordIfUnchanged = route('saveCriteriosRrllRecordIfUnchanged');
export const saveCriteriosRrllRecordsIfUnchanged = route('saveCriteriosRrllRecordsIfUnchanged');
export const loadActaTypeRecordsSnapshot = route('loadActaTypeRecordsSnapshot');
export const saveActaTypeRecordIfUnchanged = route('saveActaTypeRecordIfUnchanged');
export const saveActaTypeRecordsIfUnchanged = route('saveActaTypeRecordsIfUnchanged');
export const loadTicketRestauranteCalendarRecordsSnapshot = route('loadTicketRestauranteCalendarRecordsSnapshot');
export const saveTicketRestauranteCalendarRecordIfUnchanged = route('saveTicketRestauranteCalendarRecordIfUnchanged');
export const saveTicketRestauranteCalendarRecordsIfUnchanged = route('saveTicketRestauranteCalendarRecordsIfUnchanged');
export const loadTicketRestaurantePersonRecordsSnapshot = route('loadTicketRestaurantePersonRecordsSnapshot');
export const saveTicketRestaurantePersonRecordIfUnchanged = route('saveTicketRestaurantePersonRecordIfUnchanged');
export const saveTicketRestaurantePersonRecordsIfUnchanged = route('saveTicketRestaurantePersonRecordsIfUnchanged');
export const loadTicketRestauranteAbsenceRecordsSnapshot = route('loadTicketRestauranteAbsenceRecordsSnapshot');
export const saveTicketRestauranteAbsenceRecordIfUnchanged = route('saveTicketRestauranteAbsenceRecordIfUnchanged');
export const saveTicketRestauranteAbsenceRecordsIfUnchanged = route('saveTicketRestauranteAbsenceRecordsIfUnchanged');
export const loadTicketRestauranteConfigRecordsSnapshot = route('loadTicketRestauranteConfigRecordsSnapshot');
export const saveTicketRestauranteConfigRecordIfUnchanged = route('saveTicketRestauranteConfigRecordIfUnchanged');
export const loadTicketRestauranteManutencionRecordsSnapshot = route('loadTicketRestauranteManutencionRecordsSnapshot');
export const saveTicketRestauranteManutencionRecordIfUnchanged = route('saveTicketRestauranteManutencionRecordIfUnchanged');
export const saveTicketRestauranteManutencionRecordsIfUnchanged = route('saveTicketRestauranteManutencionRecordsIfUnchanged');
export const loadEspecialesRecipientRecordsSnapshot = route('loadEspecialesRecipientRecordsSnapshot');
export const saveEspecialesRecipientRecordIfUnchanged = route('saveEspecialesRecipientRecordIfUnchanged');
export const loadTeletrabajoPuestoRecordsSnapshot = route('loadTeletrabajoPuestoRecordsSnapshot');
export const saveTeletrabajoPuestoRecordIfUnchanged = route('saveTeletrabajoPuestoRecordIfUnchanged');
export const loadTeletrabajoGrupoCoberturaRecordsSnapshot = route('loadTeletrabajoGrupoCoberturaRecordsSnapshot');
export const saveTeletrabajoGrupoCoberturaRecordIfUnchanged = route('saveTeletrabajoGrupoCoberturaRecordIfUnchanged');
export const loadJobPositionTranslationRecordsSnapshot = route('loadJobPositionTranslationRecordsSnapshot');
export const saveJobPositionTranslationRecordIfUnchanged = route('saveJobPositionTranslationRecordIfUnchanged');
export const loadLoteriaRecordsSnapshot = route('loadLoteriaRecordsSnapshot');
export const saveLoteriaSnapshotIfUnchanged = route('saveLoteriaSnapshotIfUnchanged');
export const loadPresupuestosRecordsSnapshot = route('loadPresupuestosRecordsSnapshot');
export const savePresupuestosSnapshotIfUnchanged = route('savePresupuestosSnapshotIfUnchanged');
export const loadConfiguracionSnapshot = route('loadConfiguracionSnapshot');
export const saveConfiguracionIfUnchanged = route('saveConfiguracionIfUnchanged');
export const vacuumDatabaseNow = route('vacuumDatabaseNow');
export const getVacuumStatus = route('getVacuumStatus');
export const runDataIntegrityAuditNow = route('runDataIntegrityAuditNow');
export const getCurrentDatabaseLockInfo = route('getCurrentDatabaseLockInfo');
export const forceReleaseDatabaseLock = route('forceReleaseDatabaseLock');
export const initializeSqlitePersistence = route('initializeSqlitePersistence');
export async function checkSqliteHealth(): Promise<legacy.DatabaseHealthCheckResult> {
  if (!isIsolatedEngineEnabled()) return legacy.checkSqliteHealth();
  if (!unavailable && !recovering) return remote(instance => instance.call('checkSqliteHealth'));
  const failure = (): legacy.DatabaseHealthCheckResult => ({
    ok: false, status: getSqliteStatus(), checkedAt: new Date().toISOString(),
    message: 'Motor SQLite suspendido. No repitas guardados inciertos; comprueba la incidencia.',
  });
  if (closing || recovering || recoveryAttempted || uncertainOperation || !latestStatus?.ready || !backupsAreSettled(latestBackups)) return failure();
  recovering = true;
  try {
    await serial;
    const previous = latestStatus;
    const old = await engine?.catch(() => undefined);
    if (closing || uncertainOperation || !old?.exitedWhileIdle() || !previous?.ready || !backupsAreSettled(latestBackups)) return failure();
    recoveryAttempted = true;
    // Exclusivamente tras exit confirmado y sin operación incierta.
    // No reenviar ninguna petición del propietario anterior.
    engine = undefined;
    latestBackups = undefined;
    const next = await getEngine();
    const recovered = await next.callExtra('recoverAfterIdleExit', [previous]) as DatabaseStatus;
    if (!recovered.ready || recovered.phase !== 'active' || recovered.databaseUuid !== previous.databaseUuid ||
        recovered.applicationId !== previous.applicationId || recovered.environment !== previous.environment ||
        recovered.schemaVersion !== previous.schemaVersion || recovered.path !== previous.path ||
        next.getState() !== 'idle' || closing) return failure();
    latestStatus = recovered;
    unavailable = false;
    notifier?.({ blocked: false, message: 'Motor SQLite recuperado y base verificada.', failedHeartbeatCount: 0, updatedAt: new Date().toISOString() });
    return { ok: true, status: recovered, checkedAt: new Date().toISOString(), message: 'Motor SQLite recuperado y base verificada.' };
  } catch (error) {
    console.warn('[sqlite-engine] Recuperación supervisada no confirmada.', error);
    return failure();
  } finally {
    recovering = false;
  }
}
export const createShutdownLocalBackup = route('createShutdownLocalBackup');
export const createManualLocalBackup = route('createManualLocalBackup');
export const createLocalStorageBackup = route('createLocalStorageBackup');
export const listLocalBackups = route('listLocalBackups');
export const restoreLocalBackup = route('restoreLocalBackup');
export const closeSessionWorkflowAtomically = route('closeSessionWorkflowAtomically');
export const importSessionHistoryAtomically = route('importSessionHistoryAtomically');
export const closeCoordinationWorkflowAtomically = route('closeCoordinationWorkflowAtomically');
export const createCoordinationTaskAtomically = route('createCoordinationTaskAtomically');
export const getSqliteSyncTokensSnapshot = route('getSqliteSyncTokensSnapshot');
export const acquireRecordLock = route('acquireRecordLock');
export const heartbeatRecordLock = route('heartbeatRecordLock');
export const releaseRecordLock = route('releaseRecordLock');
export const getRecordLock = route('getRecordLock');
export const listOtherTaskLocks = route('listOtherTaskLocks');
export const changeSqliteDirectory = route('changeSqliteDirectory');
export const resetSqliteDirectory = route('resetSqliteDirectory');

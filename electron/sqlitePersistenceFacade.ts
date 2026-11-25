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
export function isIsolatedEngineEnabled(): boolean {
  return getTraccionEnvironment() === 'test' && process.env.TRACCION_SQLITE_ENGINE_EXPERIMENT === '1';
}

let engine: Promise<ReturnType<typeof startIsolatedTestEngine>> | undefined;
let latestStatus: DatabaseStatus | undefined;
let notifier: ((payload: DatabaseConnectivityIssuePayload) => void) | null = null;
let serial: Promise<unknown> = Promise.resolve();
let closing = false;
let unavailable = false;

function getEngine() {
  engine ??= import('./sqliteEngineWorkerClient.js').then(({ startIsolatedTestEngine }) => {
    const instance = startIsolatedTestEngine(getPersistenceUserDataPath(), (status) => { latestStatus = status; }, (payload) => notifier?.(payload));
    void instance.exited.then(() => { unavailable = true; });
    return instance;
  });
  return engine;
}

function remote<T>(operation: (instance: ReturnType<typeof startIsolatedTestEngine>) => Promise<T>): Promise<T> {
  if (closing || unavailable) return Promise.reject(new Error('Motor SQLite aislado no disponible.'));
  const result = serial.then(async () => {
    if (unavailable) throw new Error('Motor SQLite aislado no disponible.');
    try {
      const instance = await getEngine();
      return await operation(instance);
    } catch (error) {
      const instance = await engine?.catch(() => undefined);
      if (!instance || instance.getState() !== 'idle') unavailable = true;
      throw error;
    }
  });
  serial = result.catch(() => undefined);
  return result;
}

function route<K extends SqliteEngineOperationName>(name: K) {
  return (...args: Parameters<(typeof legacy)[K]>): Promise<Awaited<ReturnType<(typeof legacy)[K]>>> => {
    if (isIsolatedEngineEnabled()) return remote((instance) => instance.call(name, ...args));
    const handler = legacy[name] as unknown as (...values: Parameters<(typeof legacy)[K]>) => ReturnType<(typeof legacy)[K]>;
    return Promise.resolve(handler(...args));
  };
}

export function getSqliteStatus(): DatabaseStatus {
  if (!isIsolatedEngineEnabled()) return legacy.getSqliteStatus();
  if (latestStatus && !unavailable && !closing) return latestStatus;
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
  // No autorizar reinicio automático hasta integrar la reconciliación remota.
  return { activeBackupOperations: 1, queuedBackupOperations: 0, pendingBackupRevisions: 0 };
}

export async function closeSqlitePersistence(): Promise<legacy.ShutdownPerformanceMetrics> {
  if (!isIsolatedEngineEnabled()) return legacy.closeSqlitePersistence();
  closing = true;
  await serial;
  if (unavailable) throw new Error('Cierre SQLite no confirmado: operación anterior incierta.');
  return (await getEngine()).close();
}

export function saveTaskRecordsAtomically(...args: Parameters<typeof legacyBatch.saveTaskRecordsAtomically>): ReturnType<typeof legacyBatch.saveTaskRecordsAtomically> {
  if (!isIsolatedEngineEnabled()) return legacyBatch.saveTaskRecordsAtomically(...args);
  return remote((instance) => instance.callExtra('saveTaskRecordsAtomically', args)) as ReturnType<typeof legacyBatch.saveTaskRecordsAtomically>;
}
export function removeTicketRestauranteCalendarWithPeopleAtomically(...args: Parameters<typeof legacyCalendar.removeTicketRestauranteCalendarWithPeopleAtomically>): ReturnType<typeof legacyCalendar.removeTicketRestauranteCalendarWithPeopleAtomically> {
  if (!isIsolatedEngineEnabled()) return legacyCalendar.removeTicketRestauranteCalendarWithPeopleAtomically(...args);
  return remote((instance) => instance.callExtra('removeTicketRestauranteCalendarWithPeopleAtomically', [args[1]])) as ReturnType<typeof legacyCalendar.removeTicketRestauranteCalendarWithPeopleAtomically>;
}
export function importTicketRestaurantePeopleAtomically(...args: Parameters<typeof legacyPeople.importTicketRestaurantePeopleAtomically>): ReturnType<typeof legacyPeople.importTicketRestaurantePeopleAtomically> {
  if (!isIsolatedEngineEnabled()) return legacyPeople.importTicketRestaurantePeopleAtomically(...args);
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
export const checkSqliteHealth = route('checkSqliteHealth');
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
